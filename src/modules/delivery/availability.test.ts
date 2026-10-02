import { describe, expect, it } from "vitest";
import { isDeliveryDateAvailable } from "./availability";

const window = {
  dayOfWeek: 1,
  windowStart: "06:00",
  windowEnd: "09:00",
  cutoffTime: "20:00",
  maxOrders: 40,
  booked: 0,
};

describe("delivery availability", () => {
  it("accepts a Monday delivery before the previous-day cutoff", () => {
    const result = isDeliveryDateAvailable(
      new Date("2026-10-05T00:00:00.000Z"),
      window,
      new Date("2026-10-04T10:00:00.000Z"),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a delivery after the cutoff", () => {
    const result = isDeliveryDateAvailable(
      new Date("2026-10-05T00:00:00.000Z"),
      window,
      new Date("2026-10-04T21:00:00.000Z"),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a full window", () => {
    const result = isDeliveryDateAvailable(
      new Date("2026-10-05T00:00:00.000Z"),
      { ...window, booked: 40 },
      new Date("2026-10-03T00:00:00.000Z"),
    );
    expect(result.ok).toBe(false);
  });
});
