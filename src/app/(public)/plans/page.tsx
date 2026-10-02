import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { previewPlan } from "@/modules/plans/preview";
import { catalog } from "@/repositories/catalog";
import { plans } from "@/repositories/plans";

export const metadata = { title: "Plans" };

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const [page, categories] = await Promise.all([
    plans.list({ pageSize: 24, categoryId: category }, true),
    catalog.categories({ pageSize: 20 }),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl">Compare plans</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Prices include the default options and the plan delivery fee. Open a plan to change duration, servings, or visits and watch the total move.</p>
      <div className="mt-6 flex gap-2 overflow-x-auto">
        <Link href="/plans" className="rounded-full bg-secondary px-4 py-2 text-sm">All</Link>
        {categories.items.map((item) => (
          <Link key={item.id} href={`/plans?category=${item.id}`} className="shrink-0 rounded-full bg-secondary px-4 py-2 text-sm">{item.name}</Link>
        ))}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {page.items.map((plan) => {
          const preview = previewPlan(plan);
          return (
            <article key={plan.id} className="flex flex-col rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-[family-name:var(--font-display)] text-3xl leading-none">{plan.name}</h2>
                {plan.featuredLabel !== "NONE" ? <Badge>{plan.featuredLabel.replaceAll("_", " ")}</Badge> : null}
              </div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{plan.description}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted-foreground">From</dt><dd className="text-lg">{formatMoney(preview.price.totalCents)}</dd></div>
                <div><dt className="text-muted-foreground">Per day</dt><dd>{formatMoney(preview.dailyCents)}</dd></div>
                <div><dt className="text-muted-foreground">Per week</dt><dd>{formatMoney(preview.weeklyCents)}</dd></div>
                <div><dt className="text-muted-foreground">Monthly equivalent</dt><dd>{formatMoney(preview.monthlyCents)}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">{plan.subscriptionTypeName} · {preview.days} days · {plan.subscriberCount} subscribers</p>
              <Link href={`/plans/${plan.slug}`} className="mt-5 inline-flex h-12 items-center justify-center rounded-full bg-primary text-primary-foreground">Customize</Link>
            </article>
          );
        })}
      </div>
      {page.items.length === 0 ? <p className="mt-10 text-muted-foreground">No published plans in this category yet.</p> : null}
      {page.items.length > 0 ? (
        <div className="mt-10 overflow-x-auto rounded-3xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                {["Plan", "Price", "Per day", "Per week", "Monthly", "Duration", "Type"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {page.items.map((plan) => {
                const preview = previewPlan(plan);
                return (
                  <tr key={plan.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium"><Link href={`/plans/${plan.slug}`} className="underline">{plan.name}</Link></td>
                    <td className="px-4 py-3">{formatMoney(preview.price.totalCents)}</td>
                    <td className="px-4 py-3">{formatMoney(preview.dailyCents)}</td>
                    <td className="px-4 py-3">{formatMoney(preview.weeklyCents)}</td>
                    <td className="px-4 py-3">{formatMoney(preview.monthlyCents)}</td>
                    <td className="px-4 py-3">{preview.days} days</td>
                    <td className="px-4 py-3">{plan.subscriptionTypeName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
