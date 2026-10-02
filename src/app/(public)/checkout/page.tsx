import Link from "next/link";
import { notFound } from "next/navigation";
import { SubscribeWizard } from "@/components/store/subscribe-wizard";
import { quoteSubscription } from "@/modules/checkout/checkout-service";
import { billing } from "@/repositories/billing";
import { catalog } from "@/repositories/catalog";
import { plans } from "@/repositories/plans";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: slug } = await searchParams;
  if (!slug) {
    const page = await plans.list({ pageSize: 12 }, true);
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-[family-name:var(--font-display)] text-4xl">Checkout</h1>
        <p className="mt-2 text-muted-foreground">Pick a plan. The price updates as you choose duration, options, and delivery.</p>
        <ul className="mt-6 space-y-3">
          {page.items.map((plan) => (
            <li key={plan.id}>
              <Link href={`/checkout?plan=${plan.slug}`} className="flex items-center justify-between rounded-2xl bg-card px-4 py-4 ring-1 ring-foreground/10">
                <span className="font-medium">{plan.name}</span>
                <span className="text-sm text-muted-foreground">Continue</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const plan = await plans.bySlug(slug);
  if (!plan || plan.status !== "PUBLISHED") notFound();
  const [zones, addons] = await Promise.all([billing.zones(), catalog.addons({ pageSize: 20 })]);
  const optionIds = plan.groups.map((group) => group.options.find((option) => option.isDefault)?.id ?? group.options[0]?.id).filter((id): id is string => Boolean(id));
  const quoted = await quoteSubscription({ planId: plan.id, optionIds, zoneId: zones[0]?.id ?? null }).catch(() => null);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <SubscribeWizard
        plan={plan}
        initialQuote={quoted ? { price: quoted.price, equivalents: quoted.equivalents } : null}
        zones={zones.map((zone) => ({ id: zone.id, name: zone.name, city: zone.city, feeCents: zone.feeCents, schedules: zone.schedules }))}
        addons={addons.items}
      />
    </div>
  );
}
