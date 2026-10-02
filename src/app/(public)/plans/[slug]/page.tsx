import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubscribeWizard } from "@/components/store/subscribe-wizard";
import { plans } from "@/repositories/plans";
import { billing } from "@/repositories/billing";
import { catalog } from "@/repositories/catalog";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const plan = await plans.bySlug((await params).slug);
  if (!plan) return { title: "Plan" };
  return {
    title: plan.seoTitle || plan.name,
    description: plan.seoDescription || plan.description,
    alternates: { canonical: `/plans/${plan.slug}` },
    openGraph: { title: plan.name, description: plan.description },
  };
}

export default async function PlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const plan = await plans.bySlug((await params).slug);
  if (!plan || plan.status !== "PUBLISHED" || plan.featuredLabel === "HIDDEN") notFound();
  const [zones, addons] = await Promise.all([billing.zones(), catalog.addons({ pageSize: 20 })]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: plan.name,
    description: plan.description,
    offers: { "@type": "Offer", priceCurrency: plan.currency, price: (plan.basePriceCents / 100).toFixed(2) },
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SubscribeWizard plan={plan} zones={zones.map((zone) => ({ id: zone.id, name: zone.name, city: zone.city, feeCents: zone.feeCents, schedules: zone.schedules }))} addons={addons.items} />
    </div>
  );
}
