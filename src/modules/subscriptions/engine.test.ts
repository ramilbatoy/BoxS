import { describe, expect, it } from "vitest";
import {
  addInterval,
  cancelSubscription,
  changePlan,
  pauseSubscription,
  proratePlanChange,
  renewalIsDue,
  renewSubscription,
  resumeSubscription,
  skipDelivery,
  type SubscriptionState,
} from "./engine";

const rules = {
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

function state(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  const start = new Date("2026-10-01T00:00:00.000Z");
  return {
    status: "ACTIVE",
    billingMode: "ONE_TIME",
    intervalUnit: "DAY",
    intervalCount: 7,
    priceCents: 250_000,
    creditCents: 0,
    periodStart: start,
    periodEnd: addInterval(start, "DAY", 7),
    nextBillingAt: null,
    nextDeliveryAt: new Date("2026-10-05T00:00:00.000Z"),
    remainingDeliveries: 7,
    rules,
    startedAt: start,
    pausedAt: null,
    ...overrides,
  };
}

describe("subscription engine", () => {
  it("builds a 7-day and a 30-day period", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    expect(addInterval(start, "DAY", 7).toISOString()).toBe("2026-01-08T00:00:00.000Z");
    expect(addInterval(start, "DAY", 30).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("builds weekly and monthly recurring periods", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    expect(addInterval(start, "WEEK", 4).toISOString()).toBe("2026-01-29T00:00:00.000Z");
    expect(addInterval(start, "MONTH", 1).toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("pauses and resumes", () => {
    const paused = pauseSubscription(state(), new Date("2026-10-02T00:00:00.000Z"));
    expect(paused.ok && paused.state.status).toBe("PAUSED");
    if (!paused.ok) return;
    const resumed = resumeSubscription(paused.state, new Date("2026-10-03T00:00:00.000Z"));
    expect(resumed.ok && resumed.state.status).toBe("ACTIVE");
  });

  it("extends the term by the paused duration", () => {
    const current = state();
    const paused = pauseSubscription(current, new Date("2026-10-02T00:00:00.000Z"));
    expect(paused.ok && paused.state.periodEnd.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    if (!paused.ok) return;
    const resumed = resumeSubscription(paused.state, new Date("2026-10-05T00:00:00.000Z"));
    expect(resumed.ok && resumed.state.status).toBe("ACTIVE");
    if (!resumed.ok) return;
    expect(resumed.state.periodEnd.toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(resumed.state.nextDeliveryAt?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(resumed.state.pausedAt).toBeNull();
  });

  it("blocks pause when the plan rule disallows it", () => {
    const result = pauseSubscription(state({ rules: { ...rules, allowPause: false } }), new Date());
    expect(result.ok).toBe(false);
  });

  it("blocks a skip inside the cutoff window", () => {
    const result = skipDelivery(state(), new Date("2026-10-04T12:00:00.000Z"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SKIP_CUTOFF");
  });

  it("skips a delivery outside the cutoff", () => {
    const result = skipDelivery(state(), new Date("2026-10-02T00:00:00.000Z"));
    expect(result.ok).toBe(true);
  });

  it("blocks cancellation inside the cutoff", () => {
    const result = cancelSubscription(state(), new Date("2026-10-04T12:00:00.000Z"));
    expect(result.ok).toBe(false);
  });

  it("cancels when the cutoff and commitment allow it", () => {
    const result = cancelSubscription(
      state({ nextDeliveryAt: new Date("2026-10-20T00:00:00.000Z") }),
      new Date("2026-10-10T00:00:00.000Z"),
    );
    expect(result.ok && result.state.status).toBe("CANCELLED");
  });

  it("prorates a plan change without overwriting history", () => {
    const now = new Date("2026-10-02T00:00:00.000Z");
    const current = state();
    const result = changePlan(
      current,
      {
        priceCents: 280_000,
        billingMode: "ONE_TIME",
        intervalUnit: "DAY",
        intervalCount: 7,
        remainingDeliveries: 7,
        rules,
      },
      now,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.additionalPaymentCents).toBeGreaterThan(0);
    expect(current.priceCents).toBe(250_000);
    expect(result.state.priceCents).toBe(280_000);
    expect(result.event).toBe("PLAN_CHANGED");
  });

  it("calculates unused credit for a mid-period change", () => {
    const proration = proratePlanChange({
      currentPriceCents: 100_000,
      newPriceCents: 40_000,
      periodStart: new Date("2026-10-01T00:00:00.000Z"),
      periodEnd: new Date("2026-10-11T00:00:00.000Z"),
      now: new Date("2026-10-06T00:00:00.000Z"),
    });
    expect(proration.creditCents).toBe(50_000);
    expect(proration.additionalPaymentCents).toBe(0);
    expect(proration.leftoverCreditCents).toBe(10_000);
  });

  it("renews a monthly subscription only after payment", () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    const current = state({
      billingMode: "RECURRING",
      intervalUnit: "MONTH",
      intervalCount: 1,
      nextBillingAt: now,
      periodEnd: now,
    });
    const renewed = renewSubscription(current, now, true);
    expect(renewed.ok && renewed.event).toBe("SUBSCRIPTION_RENEWED");
    if (!renewed.ok) return;
    expect(renewed.state.periodEnd.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(renewalIsDue(renewed.state, now)).toBe(false);
    const repeated = renewSubscription(renewed.state, now, true);
    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(repeated.code).toBe("NOT_DUE");
    expect(current.periodEnd.toISOString()).toBe(now.toISOString());
  });

  it("does not add time when renewal payment fails, even if repeated", () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    const current = state({
      billingMode: "RECURRING",
      intervalUnit: "MONTH",
      intervalCount: 1,
      nextBillingAt: now,
      periodEnd: now,
    });
    const failed = renewSubscription(current, now, false);
    expect(failed.ok && failed.state.status).toBe("PAST_DUE");
    if (!failed.ok) return;
    expect(failed.state.periodEnd.toISOString()).toBe(now.toISOString());
    expect(failed.state.nextBillingAt?.toISOString()).toBe(now.toISOString());
    const again = renewSubscription(failed.state, now, false);
    expect(again.ok && again.state.status).toBe("PAST_DUE");
    if (!again.ok) return;
    expect(again.state.periodEnd.toISOString()).toBe(now.toISOString());
  });
});
