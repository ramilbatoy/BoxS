import Link from "next/link";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { formatMoney } from "@/lib/money";
import { system } from "@/repositories/system";

const ranges = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
  ["year", "This year"],
] as const;

function fromRange(range: string) {
  const now = new Date();
  if (range === "today") return new Date(now.toISOString().slice(0, 10));
  if (range === "7d") return new Date(now.getTime() - 7 * 864e5);
  if (range === "90d") return new Date(now.getTime() - 90 * 864e5);
  if (range === "year") return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getTime() - 30 * 864e5);
}

export async function Dashboard({ range = "30d" }: { range?: string }) {
  const data = await system.overview(fromRange(range), new Date());
  const average = data.orders ? Math.round(data.revenueCents / data.orders) : 0;
  const cards = [
    ["Revenue", formatMoney(data.revenueCents)],
    ["Active subscriptions", String(data.activeSubscriptions)],
    ["New subscriptions", String(data.newSubscriptions)],
    ["Orders", String(data.orders)],
    ["New customers", String(data.newCustomers)],
    ["Upcoming deliveries", String(data.upcomingDeliveries)],
    ["Failed payments", String(data.failedPayments)],
    ["Cancellations", String(data.cancellations)],
    ["Average order", formatMoney(average)],
  ];
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Figures come from recorded payments, orders, and subscriptions.</p>
      <div className="mt-4 flex gap-2 overflow-x-auto">
        {ranges.map(([key, label]) => (
          <Link key={key} href={`?range=${key}`} className={`shrink-0 rounded-full px-4 py-2 text-sm ${range === key ? "bg-[#1c1915] text-white" : "bg-white ring-1 ring-black/10"}`}>{label}</Link>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl">{value}</p>
          </article>
        ))}
      </div>
      <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-black/5">
        <h2 className="font-medium">Captured revenue</h2>
        <RevenueChart data={data.series} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-medium">Popular plans</h2>
          <ul className="mt-3 space-y-2 text-sm">{data.popularPlans.map((plan) => <li key={plan.name} className="flex justify-between"><span>{plan.name}</span><span>{plan.subscribers}</span></li>)}</ul>
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-medium">Recent orders</h2>
          <ul className="mt-3 space-y-2 text-sm">{data.recentOrders.map((order) => <li key={order.id} className="flex justify-between"><span>{order.number} · {order.customer}</span><span>{formatMoney(order.totalCents)}</span></li>)}</ul>
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5 lg:col-span-2">
          <h2 className="font-medium">Recent activity</h2>
          <ul className="mt-3 space-y-2 text-sm">{data.activity.map((item) => <li key={item.id}>{item.actor} · {item.action} · {item.label}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}
