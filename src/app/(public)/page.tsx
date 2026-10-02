import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { previewPlan } from "@/modules/plans/preview";
import { plans } from "@/repositories/plans";
import { catalog } from "@/repositories/catalog";
import { system } from "@/repositories/system";

export default async function HomePage() {
  const [planPage, categories, home] = await Promise.all([
    plans.list({ pageSize: 6 }, true),
    catalog.categories({ pageSize: 8 }),
    system.page("home"),
  ]);
  return (
    <div>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.2fr_0.8fr] md:py-20">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-primary">Davao City · Subscription platform</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl leading-[0.95] md:text-7xl">
            Subscriptions with room to change your mind.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            {home?.body || "Choose a plan, set the duration, and see the price update before you pay. Meals are the demo. Memberships and services use the same engine."}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/plans" className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-primary-foreground">Browse plans</Link>
            <Link href="/register" className="inline-flex h-12 items-center justify-center rounded-full border border-foreground/15 px-6">Create an account</Link>
          </div>
        </div>
        <div className="rounded-[2rem] bg-[#1c1915] p-6 text-[#f6f1e7]">
          <p className="text-sm text-[#f6f1e7]/70">This week in the demo kitchen</p>
          <ul className="mt-6 space-y-4">
            {planPage.items.slice(0, 3).map((plan) => {
              const preview = previewPlan(plan);
              return (
                <li key={plan.id} className="flex items-end justify-between gap-4 border-b border-white/10 pb-4">
                  <div>
                    <p className="font-[family-name:var(--font-display)] text-2xl">{plan.name}</p>
                    <p className="text-sm text-[#f6f1e7]/70">{preview.days} days · from {formatMoney(preview.dailyCents)} / day</p>
                  </div>
                  <p className="text-lg">{formatMoney(preview.price.totalCents)}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4">
        <div className="grid gap-4 md:grid-cols-3">
          {(home?.blocks ?? []).map((block) => (
            <article key={block.id} className="rounded-3xl bg-card p-6 ring-1 ring-foreground/10">
              <h2 className="font-[family-name:var(--font-display)] text-2xl">{block.title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{block.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="font-[family-name:var(--font-display)] text-3xl">Start from a goal</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {categories.items.map((category) => (
            <Link key={category.id} href={`/plans?category=${category.id}`} className="rounded-2xl bg-secondary p-4">
              <p className="font-medium">{category.name}</p>
              <p className="mt-2 text-xs text-muted-foreground">{category.productCount} items</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
