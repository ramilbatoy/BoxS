import { beforeEach, describe, expect, it, vi } from "vitest";

const session = { user: null as null | { id: string; role: string; permissions: string[] } };

vi.mock("@/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));
vi.mock("@/database/client", () => ({ prisma: {} }));

const OWN_ORDER = { id: "order-own", customerId: "customer-paolo", number: "BX-1" };
const OTHER_ORDER = { id: "order-other", customerId: "customer-liza", number: "BX-2" };
const OWN_SUBSCRIPTION = { id: "sub-own", userId: "user-paolo", number: "SB-1" };

vi.mock("@/repositories/billing", () => ({
  billing: {
    order: async (id: string) => (id === OWN_ORDER.id ? OWN_ORDER : id === OTHER_ORDER.id ? OTHER_ORDER : null),
    orders: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
    customers: async () => ({ items: [{ id: "customer-paolo", name: "Paolo" }], page: 1, pageSize: 20, total: 1 }),
    subscriptions: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
    subscription: async (id: string) => (id === OWN_SUBSCRIPTION.id ? OWN_SUBSCRIPTION : null),
    customerByUser: async (userId: string) => (userId === "user-paolo" ? { id: "customer-paolo" } : null),
    addresses: async () => [{ id: "address-own" }],
    coupons: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
    removeAddress: vi.fn(async () => undefined),
  },
}));

vi.mock("@/repositories/catalog", () => ({
  catalog: {
    subscriptionTypes: async () => [],
    products: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
  },
}));

vi.mock("@/repositories/plans", () => ({
  plans: { list: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }) },
}));

vi.mock("@/repositories/system", () => ({
  system: {
    search: async () => ({ customers: [{ id: "user-liza", name: "Liza", email: "liza@boxs.demo" }] }),
    settings: async () => [],
    flags: async () => [],
    roles: async () => [],
    permissions: async () => [],
  },
}));

const actOnSubscription = vi.fn(async () => ({ id: OWN_SUBSCRIPTION.id }));
vi.mock("@/modules/subscriptions/subscription-service", () => ({
  actOnSubscription: (...args: unknown[]) => actOnSubscription(...(args as [])),
  publishPlan: async () => null,
}));
vi.mock("@/modules/checkout/checkout-service", () => ({
  checkout: async () => ({}),
  quoteSubscription: async () => ({}),
}));

const { handleApi } = await import("./api");

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:3017/api/v1/${path}`, init);
}

async function call(method: string, path: string, body?: unknown) {
  const [pathname] = path.split("?");
  const init: RequestInit = body === undefined
    ? {}
    : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const response = await handleApi(method, request(path, init), pathname.split("/").filter(Boolean));
  return response;
}

function signInAs(role: "anonymous" | "customer" | "staff" | "superAdmin", permissions: string[] = []) {
  if (role === "anonymous") session.user = null;
  else if (role === "customer") session.user = { id: "user-paolo", role: "customer", permissions: [] };
  else if (role === "superAdmin") session.user = { id: "user-ava", role: "super-admin", permissions: [] };
  else session.user = { id: "user-staff", role: "manager", permissions };
}

beforeEach(() => {
  signInAs("anonymous");
  actOnSubscription.mockClear();
});

describe("GET /orders/:id", () => {
  it("rejects an anonymous caller", async () => {
    expect((await call("GET", `orders/${OWN_ORDER.id}`)).status).toBe(401);
  });

  it("rejects a customer reading another customer's order", async () => {
    signInAs("customer");
    expect((await call("GET", `orders/${OTHER_ORDER.id}`)).status).toBe(403);
  });

  it("allows a customer to read their own order", async () => {
    signInAs("customer");
    expect((await call("GET", `orders/${OWN_ORDER.id}`)).status).toBe(200);
  });

  it("allows staff with orders.view to read any order", async () => {
    signInAs("staff", ["orders.view"]);
    expect((await call("GET", `orders/${OTHER_ORDER.id}`)).status).toBe(200);
  });
});

describe("GET /exports/:kind", () => {
  it("rejects a customer", async () => {
    signInAs("customer");
    expect((await call("GET", "exports/customers")).status).toBe(403);
  });

  it("rejects staff holding a different view permission", async () => {
    signInAs("staff", ["orders.view"]);
    expect((await call("GET", "exports/customers")).status).toBe(403);
  });

  it("allows staff holding the matching view permission", async () => {
    signInAs("staff", ["customers.view"]);
    const response = await call("GET", "exports/customers");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv");
  });

  it("404s an unknown export kind instead of falling through to plans", async () => {
    signInAs("superAdmin");
    expect((await call("GET", "exports/secrets")).status).toBe(404);
  });
});

describe("GET /search", () => {
  it("rejects a customer", async () => {
    signInAs("customer");
    expect((await call("GET", "search?q=liza")).status).toBe(403);
  });

  it("allows staff with customers.view", async () => {
    signInAs("staff", ["customers.view"]);
    expect((await call("GET", "search?q=liza")).status).toBe(200);
  });
});

describe("POST /subscriptions/:id/actions", () => {
  it("lets the owner pause their own subscription", async () => {
    signInAs("customer");
    expect((await call("POST", `subscriptions/${OWN_SUBSCRIPTION.id}/actions`, { action: "pause" })).status).toBe(200);
    expect(actOnSubscription).toHaveBeenCalled();
  });

  it("stops the owner from renewing their own subscription", async () => {
    signInAs("customer");
    const response = await call("POST", `subscriptions/${OWN_SUBSCRIPTION.id}/actions`, { action: "renew" });
    expect(response.status).toBe(403);
    expect(actOnSubscription).not.toHaveBeenCalled();
  });

  it("lets staff with subscriptions.edit renew", async () => {
    signInAs("staff", ["subscriptions.edit"]);
    expect((await call("POST", `subscriptions/${OWN_SUBSCRIPTION.id}/actions`, { action: "renew" })).status).toBe(200);
  });
});

describe("DELETE /account/addresses/:id", () => {
  it("rejects an address the caller does not own", async () => {
    signInAs("customer");
    expect((await call("DELETE", "account/addresses/address-other")).status).toBe(403);
  });

  it("allows the caller's own address", async () => {
    signInAs("customer");
    expect((await call("DELETE", "account/addresses/address-own")).status).toBe(200);
  });
});

describe("admin-only reads are not public", () => {
  const paths = ["coupons", "settings", "feature-flags", "roles", "permissions", "subscription-types"];

  it.each(paths)("rejects an anonymous caller on /%s", async (path) => {
    expect((await call("GET", path)).status).toBe(401);
  });

  it.each(paths)("rejects a customer on /%s", async (path) => {
    signInAs("customer");
    expect((await call("GET", path)).status).toBe(403);
  });

  it.each(paths)("allows a super admin on /%s", async (path) => {
    signInAs("superAdmin");
    expect((await call("GET", path)).status).toBe(200);
  });
});
