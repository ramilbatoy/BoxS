export type SnapshotInput = {
  plan: {
    id: string;
    name: string;
    slug: string;
    version: number;
    basePriceCents: number;
  };
  options: { id: string; label: string; priceDeltaCents: number }[];
  addons: { id: string; name: string; quantity: number; priceCents: number }[];
  products: { id: string; name: string; quantity: number }[];
  totals: {
    discountCents: number;
    taxCents: number;
    deliveryFeeCents: number;
    couponCents: number;
    totalCents: number;
  };
  customer: { name: string; email: string };
};

export function buildOrderSnapshot(input: SnapshotInput) {
  return {
    capturedAt: new Date().toISOString(),
    plan: { ...input.plan },
    options: input.options.map((option) => ({ ...option })),
    addons: input.addons.map((addon) => ({ ...addon })),
    products: input.products.map((product) => ({ ...product })),
    totals: { ...input.totals },
    customer: { ...input.customer },
  };
}
