import { AppError } from "@/lib/errors";
import { billing, type SubscriptionDTO } from "@/repositories/billing";
import { plans } from "@/repositories/plans";
import { system } from "@/repositories/system";
import {
  cancelSubscription,
  changeAddress,
  changeDeliveryDate,
  changePlan,
  pauseSubscription,
  renewSubscription,
  resumeSubscription,
  skipDelivery,
  type SubscriptionState,
} from "./engine";
import { quoteSubscription } from "@/modules/checkout/checkout-service";
import { ensurePaymentProviders } from "@/modules/payments/builtin-providers";
import { getPaymentProvider } from "@/modules/payments/provider";

function toState(subscription: SubscriptionDTO): SubscriptionState {
  return {
    status: subscription.status as SubscriptionState["status"],
    billingMode: subscription.billingMode,
    intervalUnit: subscription.intervalUnit,
    intervalCount: subscription.intervalCount,
    priceCents: subscription.priceCents,
    creditCents: subscription.creditCents,
    periodStart: new Date(subscription.periodStart),
    periodEnd: new Date(subscription.periodEnd),
    nextBillingAt: subscription.nextBillingAt ? new Date(subscription.nextBillingAt) : null,
    nextDeliveryAt: subscription.nextDeliveryAt ? new Date(subscription.nextDeliveryAt) : null,
    remainingDeliveries: subscription.remainingDeliveries,
    rules: subscription.rules,
    startedAt: new Date(subscription.startedAt),
  };
}

export async function actOnSubscription(input: {
  id: string;
  action: string;
  actorId: string;
  reason?: string;
  planId?: string;
  optionIds?: string[];
  addressId?: string;
  deliveryDate?: string;
  paymentProvider?: string;
}) {
  const current = await billing.subscription(input.id);
  if (!current) throw new AppError("SUBSCRIPTION_NOT_FOUND", "That subscription could not be found.", 404);
  const now = new Date();
  const state = toState(current);
  if (input.action === "pause") return finish(current, pauseSubscription(state, now), input.actorId, { pausedAt: now });
  if (input.action === "resume") return finish(current, resumeSubscription(state, now), input.actorId, { pausedAt: null });
  if (input.action === "skip") return finish(current, skipDelivery(state, now), input.actorId);
  if (input.action === "cancel") {
    return finish(current, cancelSubscription(state, now, input.reason), input.actorId, { cancelledAt: now, cancelReason: input.reason ?? null });
  }
  if (input.action === "change_address") {
    if (!input.addressId) throw new AppError("ADDRESS_REQUIRED", "Choose an address.");
    const result = changeAddress(state);
    if (!result.ok) throw new AppError(result.code, result.message);
    const saved = await billing.applySubscription(current.id, { address: { connect: { id: input.addressId } } }, { type: result.event, message: result.message, actorId: input.actorId });
    await system.notify(current.userId, "subscription.address", "Address updated", "Your delivery address was changed.");
    return saved;
  }
  if (input.action === "change_delivery_date") {
    if (!input.deliveryDate) throw new AppError("INVALID_DATE", "Choose a delivery date.");
    return finish(current, changeDeliveryDate(state, new Date(input.deliveryDate), now), input.actorId);
  }
  if (input.action === "renew") {
    ensurePaymentProviders();
    const provider = getPaymentProvider(input.paymentProvider || "manual");
    const payment = await provider.createRecurringPayment({
      amountCents: current.priceCents,
      currency: current.currency,
      customerId: current.customerId,
      orderNumber: current.number,
      description: `Renewal ${current.planName}`,
    });
    const result = renewSubscription(state, now, payment.status === "CAPTURED");
    if (!result.ok) throw new AppError(result.code, result.message);
    return finish(current, result, input.actorId);
  }
  if (input.action === "change_plan") {
    if (!input.planId) throw new AppError("PLAN_NOT_FOUND", "Choose a plan.");
    const quoted = await quoteSubscription({ planId: input.planId, optionIds: input.optionIds ?? [], customerId: current.customerId });
    const result = changePlan(
      state,
      {
        priceCents: quoted.price.totalCents,
        billingMode: quoted.term.billingMode,
        intervalUnit: quoted.term.intervalUnit,
        intervalCount: quoted.term.intervalCount,
        remainingDeliveries: quoted.term.remainingDeliveries,
        rules: quoted.plan.rules,
      },
      now,
    );
    if (!result.ok) throw new AppError(result.code, result.message);
    if (result.data && result.data.additionalPaymentCents > 0) {
      ensurePaymentProviders();
      await getPaymentProvider(input.paymentProvider || "manual").createPayment({
        amountCents: result.data.additionalPaymentCents,
        currency: current.currency,
        customerId: current.customerId,
        orderNumber: current.number,
        description: `Plan change to ${quoted.plan.name}`,
      });
    }
    const saved = await billing.applySubscription(
      current.id,
      {
        plan: { connect: { id: quoted.plan.id } },
        status: result.state.status,
        billingMode: result.state.billingMode,
        intervalUnit: result.state.intervalUnit,
        intervalCount: result.state.intervalCount,
        priceCents: result.state.priceCents,
        creditCents: result.state.creditCents,
        periodStart: result.state.periodStart,
        periodEnd: result.state.periodEnd,
        nextBillingAt: result.state.nextBillingAt,
        remainingDeliveries: result.state.remainingDeliveries,
        rules: result.state.rules,
      },
      { type: result.event, message: result.message, actorId: input.actorId, payload: result.data },
    );
    await system.writeAudit({
      actorId: input.actorId,
      action: "plan_change",
      module: "subscriptions",
      recordId: current.id,
      recordLabel: current.number,
      oldValue: { plan: current.planName, priceCents: current.priceCents },
      newValue: { plan: quoted.plan.name, priceCents: result.state.priceCents, proration: result.data },
    });
    return saved;
  }
  throw new AppError("UNKNOWN_ACTION", "That subscription action is not available.");
}

async function finish(
  current: SubscriptionDTO,
  result: { ok: true; state: SubscriptionState; event: string; message: string; data?: unknown } | { ok: false; code: string; message: string },
  actorId: string,
  extra: Record<string, unknown> = {},
) {
  if (!result.ok) throw new AppError(result.code, result.message);
  const saved = await billing.applySubscription(
    current.id,
    {
      status: result.state.status,
      priceCents: result.state.priceCents,
      creditCents: result.state.creditCents,
      periodStart: result.state.periodStart,
      periodEnd: result.state.periodEnd,
      nextBillingAt: result.state.nextBillingAt,
      nextDeliveryAt: result.state.nextDeliveryAt,
      remainingDeliveries: result.state.remainingDeliveries,
      billingMode: result.state.billingMode,
      intervalUnit: result.state.intervalUnit,
      intervalCount: result.state.intervalCount,
      rules: result.state.rules,
      ...extra,
    },
    { type: result.event, message: result.message, actorId, payload: result.data },
  );
  await system.notify(current.userId, result.event.toLowerCase(), result.message, `${current.number}: ${result.message}.`);
  await system.writeAudit({ actorId, action: result.event, module: "subscriptions", recordId: current.id, recordLabel: current.number, newValue: { status: result.state.status } });
  return saved;
}

export async function publishPlan(id: string, actorId: string) {
  const before = await plans.get(id);
  const saved = await plans.publish(id, actorId);
  if (!saved || !before) throw new AppError("PLAN_NOT_FOUND", "The selected plan could not be found.", 404);
  await system.writeAudit({
    actorId,
    action: "publish",
    module: "plans",
    recordId: id,
    recordLabel: saved.name,
    oldValue: { priceCents: before.basePriceCents, status: before.status },
    newValue: { priceCents: saved.basePriceCents, status: saved.status, version: saved.currentVersion },
  });
  return saved;
}
