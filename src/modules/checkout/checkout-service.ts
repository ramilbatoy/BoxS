import { AppError } from "@/lib/errors";
import { calculatePrice, equivalentPrices, type PriceBreakdown } from "@/modules/pricing/pricing-service";
import { evaluateCoupon } from "@/modules/coupons/coupon-service";
import { assertPlanSelection } from "@/modules/plans/selection";
import { isDeliveryDateAvailable } from "@/modules/delivery/availability";
import { ensurePaymentProviders } from "@/modules/payments/builtin-providers";
import { getPaymentProvider } from "@/modules/payments/provider";
import { buildOrderSnapshot } from "@/modules/orders/snapshot";
import { billing } from "@/repositories/billing";
import { plans } from "@/repositories/plans";
import { system } from "@/repositories/system";
import type { PlanDTO, PlanOptionDTO } from "@/types/domain";

function sameSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return right.every((item) => values.has(item));
}

export function resolveTerm(plan: PlanDTO, selected: PlanOptionDTO[]) {
  const duration = selected.find((option) => option.durationDays);
  const interval = selected.find((option) => option.intervalUnit && option.intervalCount);
  const billingMode = selected.find((option) => option.billingMode)?.billingMode ?? plan.billingMode;
  const remaining = selected.find((option) => option.deliveryCount)?.deliveryCount ?? plan.deliveryCount;
  if (duration?.durationDays) {
    return {
      billingMode,
      intervalUnit: "DAY" as const,
      intervalCount: duration.durationDays,
      remainingDeliveries: remaining ?? duration.durationDays,
      durationDays: duration.durationDays,
    };
  }
  const intervalUnit = interval?.intervalUnit ?? plan.intervalUnit;
  const intervalCount = interval?.intervalCount ?? plan.intervalCount;
  const durationDays = intervalUnit === "WEEK" ? intervalCount * 7 : intervalUnit === "MONTH" ? intervalCount * 30 : intervalCount;
  return { billingMode, intervalUnit, intervalCount, remainingDeliveries: remaining, durationDays };
}

export async function quoteSubscription(input: {
  planId?: string;
  slug?: string;
  optionIds: string[];
  addonIds?: string[];
  zoneId?: string | null;
  couponCode?: string | null;
  customerId?: string | null;
}) {
  const plan = input.planId ? await plans.get(input.planId) : input.slug ? await plans.bySlug(input.slug) : null;
  if (!plan || plan.status !== "PUBLISHED") {
    throw new AppError("PLAN_NOT_FOUND", "The selected plan could not be found.", 404);
  }
  if (plan.startsAt && new Date(plan.startsAt) > new Date()) {
    throw new AppError("PLAN_UNAVAILABLE", "This plan is not available yet.");
  }
  if (plan.endsAt && new Date(plan.endsAt) < new Date()) {
    throw new AppError("PLAN_UNAVAILABLE", "This plan is no longer available.");
  }
  const selection = assertPlanSelection(plan.groups, input.optionIds);
  if (!selection.ok) throw new AppError(selection.code, selection.message);
  const selected = plan.groups.flatMap((group) => group.options).filter((option) => input.optionIds.includes(option.id));
  const matched = plan.variants.find((variant) => sameSet(variant.optionIds, input.optionIds));
  const variantDeltaCents =
    matched?.priceOverrideCents != null
      ? matched.priceOverrideCents - plan.basePriceCents
      : selected.reduce((sum, option) => sum + option.priceDeltaCents, 0);
  const addons = input.addonIds?.length
    ? (await catalogAddons(input.addonIds))
    : [];
  const zones = await billing.zones();
  const zone = zones.find((item) => item.id === input.zoneId);
  const deliveryFeeCents = zone ? zone.feeCents : plan.deliveryFeeCents;
  let coupon: { type: "PERCENT" | "FIXED"; value: number } | null = null;
  let couponId: string | null = null;
  if (input.couponCode) {
    if (!(await system.flag("ENABLE_COUPONS"))) {
      throw new AppError("COUPONS_DISABLED", "Coupons are turned off.");
    }
    const record = await billing.couponByCode(input.couponCode);
    if (!record) throw new AppError("COUPON_NOT_FOUND", "That coupon code was not found.");
    const usage = await billing.couponUsage(record.id, input.customerId ?? "none");
    const priorOrders = input.customerId ? await billing.customerOrderCount(input.customerId) : 0;
    const subtotal = plan.basePriceCents + variantDeltaCents + addons.reduce((sum, addon) => sum + addon.priceCents, 0);
    const decision = evaluateCoupon(
      {
        code: record.code,
        type: record.type,
        value: record.value,
        scope: record.scope,
        planId: record.planId,
        categoryId: record.categoryId,
        minSubtotalCents: record.minSubtotalCents,
        maxUses: record.maxUses,
        perCustomerLimit: record.perCustomerLimit,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        active: record.active,
      },
      {
        now: new Date(),
        subtotalCents: subtotal,
        planId: plan.id,
        categoryId: plan.categoryId,
        totalRedemptions: usage.totalRedemptions,
        customerRedemptions: input.customerId ? usage.customerRedemptions : 0,
        isNewCustomer: priorOrders === 0,
        isFirstSubscription: priorOrders === 0,
      },
    );
    if (!decision.ok) throw new AppError(decision.code, decision.message);
    coupon = { type: record.type, value: record.value };
    couponId = record.id;
  }
  const price = calculatePrice({
    basePriceCents: plan.basePriceCents,
    variantDeltaCents,
    addonCents: addons.reduce((sum, addon) => sum + addon.priceCents, 0),
    deliveryFeeCents,
    taxRateBps: plan.taxRateBps,
    discountCents: plan.discountCents,
    coupon,
  });
  const term = resolveTerm(plan, selected);
  return {
    plan,
    selected,
    addons,
    price,
    equivalents: equivalentPrices(price.totalCents, term.durationDays),
    term,
    couponId,
    couponCode: input.couponCode?.toUpperCase() ?? null,
    zone,
  };
}

async function catalogAddons(ids: string[]) {
  const page = await import("@/repositories/catalog").then((mod) => mod.catalog.addons({ pageSize: 100 }));
  return page.items.filter((addon) => ids.includes(addon.id) && addon.available);
}

export async function checkout(input: {
  userId: string;
  planId: string;
  optionIds: string[];
  addonIds?: string[];
  zoneId: string;
  scheduleId?: string | null;
  deliveryDate: string;
  addressId?: string | null;
  address?: { label: string; line1: string; line2?: string; city: string; region: string; postalCode: string };
  couponCode?: string | null;
  paymentProvider: string;
  idempotencyKey?: string | null;
  notes?: string;
}) {
  if (input.idempotencyKey) {
    const existing = await billing.orderByIdempotency(input.idempotencyKey);
    if (existing) return { duplicate: true, order: existing };
  }
  const customer = await billing.customerByUser(input.userId);
  if (!customer) throw new AppError("INVALID_CUSTOMER", "Create a customer profile before checkout.", 404);
  const quoted = await quoteSubscription({
    planId: input.planId,
    optionIds: input.optionIds,
    addonIds: input.addonIds,
    zoneId: input.zoneId,
    couponCode: input.couponCode,
    customerId: customer.id,
  });
  const schedule = quoted.zone?.schedules.find((item) => item.id === input.scheduleId) ?? quoted.zone?.schedules.find((item) => item.dayOfWeek === new Date(input.deliveryDate).getUTCDay());
  if (!schedule) throw new AppError("DELIVERY_UNAVAILABLE", "Choose a delivery window for this address.");
  const booked = await billing.booked(schedule.id, new Date(input.deliveryDate));
  const available = isDeliveryDateAvailable(
    new Date(input.deliveryDate),
    {
      dayOfWeek: schedule.dayOfWeek,
      windowStart: schedule.windowStart,
      windowEnd: schedule.windowEnd,
      cutoffTime: schedule.cutoffTime,
      maxOrders: schedule.maxOrders,
      booked,
    },
    new Date(),
  );
  if (!available.ok) throw new AppError(available.code, available.message);
  const address = input.addressId
    ? await billing.addresses(customer.id).then((rows) => rows.find((row) => row.id === input.addressId))
    : input.address
      ? await billing.saveAddress(customer.id, { ...input.address, zoneId: input.zoneId, isDefault: true })
      : null;
  if (!address) throw new AppError("ADDRESS_REQUIRED", "Add a delivery address to continue.");
  ensurePaymentProviders();
  const provider = getPaymentProvider(input.paymentProvider);
  const payment = await provider.createPayment({
    amountCents: quoted.price.totalCents,
    currency: quoted.plan.currency,
    customerId: customer.id,
    orderNumber: "pending",
    description: quoted.plan.name,
  });
  const items = [
    { kind: "PLAN", refId: quoted.plan.id, name: quoted.plan.name, quantity: 1, unitPriceCents: quoted.price.baseCents },
    ...quoted.selected.filter((option) => option.priceDeltaCents !== 0).map((option) => ({
      kind: "OPTION",
      refId: option.id,
      name: option.label,
      quantity: 1,
      unitPriceCents: option.priceDeltaCents,
    })),
    ...quoted.addons.map((addon) => ({ kind: "ADDON", refId: addon.id, name: addon.name, quantity: 1, unitPriceCents: addon.priceCents })),
  ];
  const snapshot = buildOrderSnapshot({
    plan: {
      id: quoted.plan.id,
      name: quoted.plan.name,
      slug: quoted.plan.slug,
      version: quoted.plan.currentVersion,
      basePriceCents: quoted.plan.basePriceCents,
    },
    options: quoted.selected.map((option) => ({ id: option.id, label: option.label, priceDeltaCents: option.priceDeltaCents })),
    addons: quoted.addons.map((addon) => ({ id: addon.id, name: addon.name, quantity: 1, priceCents: addon.priceCents })),
    products: quoted.plan.items.filter((item) => item.included).map((item) => ({ id: item.productId ?? item.addonId ?? item.id, name: item.name, quantity: item.quantity })),
    totals: {
      discountCents: quoted.price.discountCents,
      taxCents: quoted.price.taxCents,
      deliveryFeeCents: quoted.price.deliveryFeeCents,
      couponCents: quoted.price.couponCents,
      totalCents: quoted.price.totalCents,
    },
    customer: { name: customer.user.name, email: customer.user.email },
  });
  const saved = await billing.persistCheckout({
    idempotencyKey: input.idempotencyKey,
    customerId: customer.id,
    userId: input.userId,
    planId: quoted.plan.id,
    planVersion: quoted.plan.currentVersion,
    planName: quoted.plan.name,
    currency: quoted.plan.currency,
    billingMode: quoted.term.billingMode,
    intervalUnit: quoted.term.intervalUnit,
    intervalCount: quoted.term.intervalCount,
    remainingDeliveries: quoted.term.remainingDeliveries,
    rules: quoted.plan.rules,
    quote: quoted.price,
    couponId: quoted.couponId,
    couponCode: quoted.couponCode,
    addressId: address.id,
    addressSnapshot: address,
    zoneId: input.zoneId,
    scheduleId: schedule.id,
    deliveryDate: input.deliveryDate,
    windowLabel: available.windowLabel,
    items,
    snapshot,
    payment: { provider: payment.provider, status: payment.status, externalId: payment.externalId, amountCents: payment.amountCents },
    activate: payment.status === "CAPTURED" || payment.provider === "cod",
  });
  await system.writeAudit({
    actorId: input.userId,
    action: "checkout",
    module: "orders",
    recordId: saved.duplicate ? saved.order.id : saved.orderId,
    recordLabel: saved.duplicate ? saved.order.number : saved.orderNumber,
    newValue: { totalCents: quoted.price.totalCents },
  });
  if (saved.duplicate) return { duplicate: true, order: saved.order, price: quoted.price };
  const order = await billing.order(saved.orderId);
  return { duplicate: false, order, subscriptionId: saved.subscriptionId, price: quoted.price as PriceBreakdown };
}
