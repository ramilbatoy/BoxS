import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanWrite } from "@/types/domain";

const deleted: string[] = [];

const tx = {
  plan: { update: async () => ({ id: "plan-1" }), create: async () => ({ id: "plan-1" }) },
  planOptionGroup: { deleteMany: async () => void deleted.push("groups"), create: async () => ({}) },
  planItem: { deleteMany: async () => void deleted.push("items"), createMany: async () => ({}) },
  planVariant: { deleteMany: async () => void deleted.push("variants"), createMany: async () => ({}) },
};

vi.mock("@/database/client", () => ({
  prisma: {
    $transaction: async (run: (client: typeof tx) => Promise<string>) => run(tx),
    plan: { findFirst: async () => null },
  },
}));

const { plans } = await import("./plans");

const base: PlanWrite = {
  name: "Balanced Table",
  description: "A rotating set of rice bowls.",
  basePriceCents: 250000,
  subscriptionTypeId: "type-1",
};

beforeEach(() => {
  deleted.length = 0;
});

describe("plans.save child collections", () => {
  it("leaves items and variants alone when the payload omits them", async () => {
    // This is the exact shape the Plan Builder sends: basics, pricing, rules, and groups.
    await plans.save({ ...base, groups: [] }, "plan-1");
    expect(deleted).toEqual(["groups"]);
  });

  it("touches nothing when the payload carries no child collections at all", async () => {
    await plans.save(base, "plan-1");
    expect(deleted).toEqual([]);
  });

  it("replaces a collection the caller does send, including an explicit empty array", async () => {
    await plans.save({ ...base, items: [], variants: [] }, "plan-1");
    expect(deleted.sort()).toEqual(["items", "variants"]);
  });

  it("replaces every collection when all three are sent", async () => {
    await plans.save({ ...base, groups: [], items: [], variants: [] }, "plan-1");
    expect(deleted.sort()).toEqual(["groups", "items", "variants"]);
  });
});
