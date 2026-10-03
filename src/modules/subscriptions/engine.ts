export type SubscriptionStatus =
  | "PENDING"
  | "ACTIVE"
  | "PAUSED"
  | "PAST_DUE"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED"
  | "COMPLETED";

export type IntervalUnit = "DAY" | "WEEK" | "MONTH";
export type BillingMode = "ONE_TIME" | "RECURRING";

export type SubscriptionRules = {
  allowPause: boolean;
  allowSkip: boolean;
  allowCancel: boolean;
  allowPlanChange: boolean;
  minCommitmentDays: number;
  cancellationCutoffHours: number;
  changeCutoffHours: number;
  skipCutoffHours: number;
  deliveryChangeCutoffHours: number;
};

export const DEFAULT_RULES: SubscriptionRules = {
  allowPause: true,
  allowSkip: true,
  allowCancel: true,
  allowPlanChange: true,
  minCommitmentDays: 0,
  cancellationCutoffHours: 24,
  changeCutoffHours: 24,
  skipCutoffHours: 24,
  deliveryChangeCutoffHours: 24,
};

export type SubscriptionState = {
  status: SubscriptionStatus;
  billingMode: BillingMode;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  priceCents: number;
  creditCents: number;
  periodStart: Date;
  periodEnd: Date;
  nextBillingAt: Date | null;
  nextDeliveryAt: Date | null;
  remainingDeliveries: number | null;
  rules: SubscriptionRules;
  startedAt: Date;
  pausedAt: Date | null;
};

export type EngineResult<T> =
  | { ok: true; state: SubscriptionState; event: string; message: string; data?: T }
  | { ok: false; code: string; message: string };

export function addInterval(start: Date, unit: IntervalUnit, count: number) {
  const next = new Date(start.getTime());
  if (unit === "DAY") next.setUTCDate(next.getUTCDate() + count);
  if (unit === "WEEK") next.setUTCDate(next.getUTCDate() + count * 7);
  if (unit === "MONTH") next.setUTCMonth(next.getUTCMonth() + count);
  return next;
}

export function durationDays(unit: IntervalUnit, count: number) {
  if (unit === "DAY") return count;
  if (unit === "WEEK") return count * 7;
  return count * 30;
}

function hoursUntil(target: Date | null, now: Date) {
  if (!target) return Number.POSITIVE_INFINITY;
  return (target.getTime() - now.getTime()) / 36e5;
}

function commitmentEnds(state: SubscriptionState) {
  return new Date(state.startedAt.getTime() + state.rules.minCommitmentDays * 864e5);
}

export function pauseSubscription(state: SubscriptionState, now: Date): EngineResult<{ pausedAt: Date }> {
  if (!state.rules.allowPause) {
    return { ok: false, code: "PAUSE_NOT_ALLOWED", message: "This subscription cannot be paused." };
  }
  if (state.status !== "ACTIVE") {
    return { ok: false, code: "INVALID_STATUS", message: "Only an active subscription can be paused." };
  }
  return {
    ok: true,
    state: { ...state, status: "PAUSED", pausedAt: now },
    event: "SUBSCRIPTION_PAUSED",
    message: "Subscription paused",
    data: { pausedAt: now },
  };
}

export function resumeSubscription(state: SubscriptionState, now: Date): EngineResult<undefined> {
  if (state.status !== "PAUSED") {
    return { ok: false, code: "INVALID_STATUS", message: "Only a paused subscription can be resumed." };
  }
  const pausedMs = Math.max(0, now.getTime() - (state.pausedAt?.getTime() ?? now.getTime()));
  const periodEnd = new Date(state.periodEnd.getTime() + pausedMs);
  const nextDeliveryAt = state.nextDeliveryAt ? new Date(state.nextDeliveryAt.getTime() + pausedMs) : null;
  return {
    ok: true,
    state: {
      ...state,
      status: "ACTIVE",
      pausedAt: null,
      periodEnd,
      nextDeliveryAt,
      nextBillingAt: state.billingMode === "RECURRING" ? periodEnd : state.nextBillingAt,
    },
    event: "SUBSCRIPTION_RESUMED",
    message: "Subscription resumed",
  };
}

export function skipDelivery(state: SubscriptionState, now: Date): EngineResult<{ nextDeliveryAt: Date }> {
  if (!state.rules.allowSkip) {
    return { ok: false, code: "SKIP_NOT_ALLOWED", message: "Skipping a delivery is turned off for this plan." };
  }
  if (state.status !== "ACTIVE" || !state.nextDeliveryAt) {
    return { ok: false, code: "INVALID_STATUS", message: "There is no upcoming delivery to skip." };
  }
  if (hoursUntil(state.nextDeliveryAt, now) < state.rules.skipCutoffHours) {
    return {
      ok: false,
      code: "SKIP_CUTOFF",
      message: `Delivery changes must be made ${state.rules.skipCutoffHours} hours before delivery.`,
    };
  }
  const nextDeliveryAt = addInterval(state.nextDeliveryAt, "DAY", 1);
  return {
    ok: true,
    state: { ...state, nextDeliveryAt },
    event: "DELIVERY_SKIPPED",
    message: "Upcoming delivery skipped",
    data: { nextDeliveryAt },
  };
}

export function changeDeliveryDate(
  state: SubscriptionState,
  nextDeliveryAt: Date,
  now: Date,
): EngineResult<{ nextDeliveryAt: Date }> {
  if (state.status !== "ACTIVE" && state.status !== "PAUSED") {
    return { ok: false, code: "INVALID_STATUS", message: "This subscription cannot change delivery date." };
  }
  if (hoursUntil(state.nextDeliveryAt, now) < state.rules.deliveryChangeCutoffHours) {
    return {
      ok: false,
      code: "DELIVERY_CUTOFF",
      message: `Delivery changes must be made ${state.rules.deliveryChangeCutoffHours} hours before delivery.`,
    };
  }
  if (nextDeliveryAt.getTime() <= now.getTime()) {
    return { ok: false, code: "INVALID_DATE", message: "Choose a delivery date in the future." };
  }
  return {
    ok: true,
    state: { ...state, nextDeliveryAt },
    event: "DELIVERY_DATE_CHANGED",
    message: "Delivery date changed",
    data: { nextDeliveryAt },
  };
}

export function changeAddress(state: SubscriptionState): EngineResult<undefined> {
  if (state.status === "CANCELLED" || state.status === "EXPIRED" || state.status === "COMPLETED") {
    return { ok: false, code: "INVALID_STATUS", message: "This subscription can no longer change address." };
  }
  return {
    ok: true,
    state,
    event: "ADDRESS_CHANGED",
    message: "Delivery address changed",
  };
}

export function cancelSubscription(state: SubscriptionState, now: Date, reason?: string): EngineResult<{ reason?: string }> {
  if (!state.rules.allowCancel) {
    return { ok: false, code: "CANCEL_NOT_ALLOWED", message: "Cancellation is turned off for this plan." };
  }
  if (state.status === "CANCELLED" || state.status === "EXPIRED" || state.status === "COMPLETED") {
    return { ok: false, code: "INVALID_STATUS", message: "This subscription is already closed." };
  }
  if (now < commitmentEnds(state)) {
    return {
      ok: false,
      code: "MIN_COMMITMENT",
      message: `This subscription has a ${state.rules.minCommitmentDays}-day minimum commitment.`,
    };
  }
  if (state.nextDeliveryAt && hoursUntil(state.nextDeliveryAt, now) < state.rules.cancellationCutoffHours) {
    return {
      ok: false,
      code: "CANCEL_CUTOFF",
      message: `Cancel at least ${state.rules.cancellationCutoffHours} hours before the next delivery.`,
    };
  }
  return {
    ok: true,
    state: { ...state, status: "CANCELLED", nextBillingAt: null },
    event: "SUBSCRIPTION_CANCELLED",
    message: "Subscription cancelled",
    data: { reason },
  };
}

export type Proration = {
  creditCents: number;
  newValueCents: number;
  additionalPaymentCents: number;
  leftoverCreditCents: number;
  effectiveAt: Date;
  unusedRatio: number;
};

export function proratePlanChange(input: {
  currentPriceCents: number;
  newPriceCents: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): Proration {
  const total = input.periodEnd.getTime() - input.periodStart.getTime();
  const remaining = Math.max(0, input.periodEnd.getTime() - input.now.getTime());
  const unusedRatio = total <= 0 ? 0 : remaining / total;
  const creditCents = Math.round(input.currentPriceCents * unusedRatio);
  const newValueCents = input.newPriceCents;
  return {
    creditCents,
    newValueCents,
    additionalPaymentCents: Math.max(0, newValueCents - creditCents),
    leftoverCreditCents: Math.max(0, creditCents - newValueCents),
    effectiveAt: input.now,
    unusedRatio,
  };
}

export function changePlan(
  state: SubscriptionState,
  next: {
    priceCents: number;
    billingMode: BillingMode;
    intervalUnit: IntervalUnit;
    intervalCount: number;
    remainingDeliveries: number | null;
    rules: SubscriptionRules;
  },
  now: Date,
): EngineResult<Proration> {
  if (!state.rules.allowPlanChange) {
    return { ok: false, code: "PLAN_CHANGE_NOT_ALLOWED", message: "Plan changes are turned off for this subscription." };
  }
  if (state.status !== "ACTIVE" && state.status !== "PAUSED") {
    return { ok: false, code: "INVALID_STATUS", message: "Only an active or paused subscription can change plan." };
  }
  if (hoursUntil(state.nextDeliveryAt ?? state.periodEnd, now) < state.rules.changeCutoffHours) {
    return {
      ok: false,
      code: "CHANGE_CUTOFF",
      message: `Plan changes must be made ${state.rules.changeCutoffHours} hours in advance.`,
    };
  }
  const proration = proratePlanChange({
    currentPriceCents: state.priceCents,
    newPriceCents: next.priceCents,
    periodStart: state.periodStart,
    periodEnd: state.periodEnd,
    now,
  });
  const periodEnd = addInterval(now, next.intervalUnit, next.intervalCount);
  return {
    ok: true,
    state: {
      ...state,
      status: "ACTIVE",
      priceCents: next.priceCents,
      creditCents: state.creditCents + proration.leftoverCreditCents,
      billingMode: next.billingMode,
      intervalUnit: next.intervalUnit,
      intervalCount: next.intervalCount,
      remainingDeliveries: next.remainingDeliveries,
      rules: next.rules,
      periodStart: now,
      periodEnd,
      nextBillingAt: next.billingMode === "RECURRING" ? periodEnd : null,
    },
    event: "PLAN_CHANGED",
    message: "Plan changed",
    data: proration,
  };
}

export function renewalIsDue(state: SubscriptionState, now: Date) {
  if (state.billingMode !== "RECURRING") return false;
  if (state.status !== "ACTIVE" && state.status !== "PAST_DUE") return false;
  const dueAt = state.nextBillingAt ?? state.periodEnd;
  return dueAt.getTime() <= now.getTime();
}

export function renewSubscription(state: SubscriptionState, now: Date, paid: boolean): EngineResult<undefined> {
  if (state.billingMode !== "RECURRING") {
    return { ok: false, code: "NOT_RECURRING", message: "This subscription does not renew." };
  }
  if (state.status !== "ACTIVE" && state.status !== "PAST_DUE") {
    return { ok: false, code: "INVALID_STATUS", message: "This subscription cannot renew." };
  }
  if (!paid) {
    return {
      ok: true,
      state: { ...state, status: "PAST_DUE" },
      event: "PAYMENT_FAILED",
      message: "Renewal payment failed",
    };
  }
  if (!renewalIsDue(state, now)) {
    return { ok: false, code: "NOT_DUE", message: "This subscription is not due for renewal." };
  }
  const periodStart = state.periodEnd > now ? state.periodEnd : now;
  const periodEnd = addInterval(periodStart, state.intervalUnit, state.intervalCount);
  return {
    ok: true,
    state: {
      ...state,
      status: "ACTIVE",
      periodStart,
      periodEnd,
      nextBillingAt: periodEnd,
    },
    event: "SUBSCRIPTION_RENEWED",
    message: "Subscription renewed",
  };
}

export function completeIfFinished(state: SubscriptionState): SubscriptionState {
  if (state.billingMode === "ONE_TIME" && state.remainingDeliveries === 0) {
    return { ...state, status: "COMPLETED", nextBillingAt: null, nextDeliveryAt: null };
  }
  if (state.billingMode === "ONE_TIME" && state.periodEnd.getTime() < Date.now() && state.status === "ACTIVE") {
    return { ...state, status: "COMPLETED", nextBillingAt: null };
  }
  return state;
}
