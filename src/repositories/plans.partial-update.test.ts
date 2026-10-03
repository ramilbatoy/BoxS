import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanWrite } from "@/types/domain";

const deleted: string[] = [];
const db = {
  prior: null as { status: string; currentVersion: number } | null,
  full: null as unknown,
  versions: [] as { version: number; snapshot: { currentVersion?: number; basePriceCents?: number; items?: unknown[] } }[],
  versionRewrites: 0,
  orderRewrites: 0,
};

const tx = {
  plan: { update: async () => ({ id: "plan-1" }), create: async () => ({ id: "plan-1" }) },
  planOptionGroup: { deleteMany: async () => void deleted.push("groups"), create: async () => ({}) },
  planItem: { deleteMany: async () => void deleted.push("items"), createMany: async () => ({}) },
  planVariant: { deleteMany: async () => void deleted.push("variants"), createMany: async () => ({}) },
};

vi.mock("@/database/client", () => ({
  prisma: {
    $transaction: async (run: (client: typeof tx) => Promise<string>) => run(tx),
    plan: {
      findFirst: async (args?: { select?: unknown }) => (args?.select ? db.prior : db.full),
      update: async () => ({ id: "plan-1" }),
    },
    planVersion: {
      create: async (args: { data: { version: number; snapshot: { currentVersion?: number; basePriceCents?: number; items?: unknown[] } } }) => {
        db.versions.push(args.data);
        return args.data;
      },
      update: async () => {
        db.versionRewrites += 1;
        throw new Error("historical plan version rewritten");
      },
    },
    order: {
      update: async () => {
        db.orderRewrites += 1;
        throw new Error("historical order rewritten");
      },
    },
    orderSnapshot: {
      update: async () => {
        db.orderRewrites += 1;
        throw new Error("historical order snapshot rewritten");
      },
    },
  },
}));

const { nextPublishedVersion, plans } = await import("./plans");

const base: PlanWrite = {
  name: "Balanced Table",
  description: "A rotating set of rice bowls.",
  basePriceCents: 250000,
  subscriptionTypeId: "type-1",
};

function publishedRow(basePriceCents = 250000) {
  return {
    id: "plan-1",
    name: "Balanced Table",
    slug: "balanced-table",
    description: "A rotating set of rice bowls.",
    categoryId: null,
    category: null,
    imageUrl: null,
    status: "PUBLISHED",
    featuredLabel: "NONE",
    seoTitle: null,
    seoDescription: null,
    currency: "PHP",
    basePriceCents,
    discountCents: 0,
    taxRateBps: 0,
    deliveryFeeCents: 0,
    subscriptionTypeId: "type-1",
    subscriptionType: { name: "Fixed", billingMode: "ONE_TIME", intervalUnit: "DAY", intervalCount: 7, deliveryCount: 7 },
    allowPause: true,
    allowSkip: true,
    allowCancel: true,
    allowPlanChange: true,
    minCommitmentDays: 0,
    cancellationCutoffHours: 24,
    changeCutoffHours: 24,
    skipCutoffHours: 24,
    deliveryChangeCutoffHours: 24,
    startsAt: null,
    endsAt: null,
    currentVersion: 1,
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    groups: [],
    items: [{ id: "item-1", productId: "prod-1", addonId: null, quantity: 1, included: true, product: { name: "Rice bowl", basePriceCents: 0 }, addon: null }],
    variants: [{ id: "var-1", name: "Regular", optionIds: [], priceOverrideCents: null, sortOrder: 0 }],
    _count: { subscriptions: 2 },
  };
}

beforeEach(() => {
  deleted.length = 0;
  db.prior = null;
  db.full = null;
  db.versions.length = 0;
  db.versionRewrites = 0;
  db.orderRewrites = 0;
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

describe("published plan versioning", () => {
  it("writes a new snapshot and leaves the previous one in place", async () => {
    expect(nextPublishedVersion("DRAFT", 0)).toBeNull();
    expect(nextPublishedVersion("PUBLISHED", 1)).toBe(2);
    db.prior = { status: "PUBLISHED", currentVersion: 1 };
    db.full = publishedRow(250000);
    await plans.save({ ...base, basePriceCents: 250000 }, "plan-1");
    expect(deleted).toEqual([]);
    expect(db.versions).toHaveLength(1);
    expect(db.versions[0]?.version).toBe(2);
    expect(db.versions[0]?.snapshot.currentVersion).toBe(2);
    expect(db.versions[0]?.snapshot.items).toHaveLength(1);
    const historical = db.versions[0]?.snapshot;
    db.full = publishedRow(280000);
    db.prior = { status: "PUBLISHED", currentVersion: 2 };
    await plans.save({ ...base, basePriceCents: 280000 }, "plan-1");
    expect(db.versions).toHaveLength(2);
    expect(db.versions[1]?.version).toBe(3);
    expect(db.versions[1]?.snapshot.basePriceCents).toBe(280000);
    expect(historical?.basePriceCents).toBe(250000);
    expect(db.versionRewrites).toBe(0);
    expect(db.orderRewrites).toBe(0);
  });

  it("does not version a draft save", async () => {
    db.prior = { status: "DRAFT", currentVersion: 0 };
    db.full = { ...publishedRow(), status: "DRAFT", currentVersion: 0 };
    await plans.save(base, "plan-1");
    expect(db.versions).toHaveLength(0);
    expect(deleted).toEqual([]);
  });
});
