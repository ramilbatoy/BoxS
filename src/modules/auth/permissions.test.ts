import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("authorization", () => {
  it("allows a listed permission and a super admin", () => {
    expect(can(["orders.view"], "orders.view", "manager")).toBe(true);
    expect(can([], "settings.manage", "super-admin")).toBe(true);
  });

  it("denies a missing permission", () => {
    expect(can(["orders.view"], "payments.refund", "customer-support")).toBe(false);
  });
});
