import { addInterval, durationDays, type IntervalUnit } from "@/modules/subscriptions/engine";

export function nextProgramDelivery(input: {
  status: string;
  deliveryDates: Date[];
  remainingDeliveries: number | null;
  intervalUnit: IntervalUnit;
  intervalCount: number;
  periodStart: Date;
  now: Date;
  deliveryDays?: number[];
}) {
  if (input.status !== "ACTIVE") return null;
  if (input.deliveryDates.length === 0) return null;
  const dates = [...input.deliveryDates].sort((left, right) => left.getTime() - right.getTime());
  const inPeriod = dates.filter((date) => date.getTime() >= input.periodStart.getTime());
  if (input.remainingDeliveries != null && inPeriod.length >= input.remainingDeliveries) return null;
  if (dates.some((date) => date.getTime() > input.now.getTime())) return null;

  const latest = dates[dates.length - 1];
  const step =
    input.remainingDeliveries != null && input.remainingDeliveries > 1
      ? { unit: "DAY" as const, count: Math.max(1, Math.round(durationDays(input.intervalUnit, input.intervalCount) / input.remainingDeliveries)) }
      : { unit: input.intervalUnit, count: input.intervalCount };
  let next = addInterval(latest, step.unit, step.count);
  const days = (input.deliveryDays ?? []).filter((day) => day >= 0 && day <= 6);
  if (days.length > 0) {
    let guard = 0;
    while (!days.includes(next.getUTCDay()) && guard < 7) {
      next = addInterval(next, "DAY", 1);
      guard += 1;
    }
  }
  return next;
}
