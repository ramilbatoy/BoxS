export type DeliveryWindow = {
  dayOfWeek: number;
  windowStart: string;
  windowEnd: string;
  cutoffTime: string;
  maxOrders: number;
  booked: number;
};

function parseClock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isDeliveryDateAvailable(date: Date, window: DeliveryWindow, now: Date) {
  if (date.getUTCDay() !== window.dayOfWeek) {
    return { ok: false as const, code: "WRONG_DAY", message: "That date is not a delivery day for this zone." };
  }
  if (window.booked >= window.maxOrders) {
    return { ok: false as const, code: "ZONE_FULL", message: "This delivery window is fully booked." };
  }
  const cutoff = new Date(date.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - 1);
  const minutes = parseClock(window.cutoffTime);
  cutoff.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (now.getTime() > cutoff.getTime()) {
    return {
      ok: false as const,
      code: "DELIVERY_CUTOFF",
      message: `Orders for this window close at ${window.cutoffTime} the day before.`,
    };
  }
  return { ok: true as const, windowLabel: `${window.windowStart}–${window.windowEnd}` };
}
