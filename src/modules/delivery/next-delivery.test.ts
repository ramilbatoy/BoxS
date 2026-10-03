import { describe, expect, it } from "vitest";
import { nextProgramDelivery } from "./next-delivery";

const start = new Date("2026-10-01T00:00:00.000Z");

function input(overrides: Partial<Parameters<typeof nextProgramDelivery>[0]> = {}) {
  return {
    status: "ACTIVE",
    deliveryDates: [new Date("2026-10-01T00:00:00.000Z")],
    remainingDeliveries: 3,
    intervalUnit: "DAY" as const,
    intervalCount: 3,
    periodStart: start,
    now: new Date("2026-10-02T00:00:00.000Z"),
    deliveryDays: [1, 2, 3, 4, 5, 6],
    ...overrides,
  };
}

describe("next program delivery", () => {
  it("does not invent the first delivery", () => {
    expect(nextProgramDelivery(input({ deliveryDates: [] }))).toBeNull();
  });

  it("waits while a delivery is still ahead", () => {
    expect(nextProgramDelivery(input({ now: new Date("2026-09-30T00:00:00.000Z") }))).toBeNull();
  });

  it("materializes only the next date after the schedule advances", () => {
    const next = nextProgramDelivery(input());
    expect(next?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });

  it("stops once every delivery in the program exists", () => {
    expect(
      nextProgramDelivery(
        input({
          deliveryDates: [
            new Date("2026-10-01T00:00:00.000Z"),
            new Date("2026-10-02T00:00:00.000Z"),
            new Date("2026-10-03T00:00:00.000Z"),
          ],
          now: new Date("2026-10-04T00:00:00.000Z"),
        }),
      ),
    ).toBeNull();
  });

  it("does not schedule a delivery while the subscription is paused", () => {
    expect(nextProgramDelivery(input({ status: "PAUSED" }))).toBeNull();
  });
});
