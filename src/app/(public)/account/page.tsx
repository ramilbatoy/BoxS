import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { formatMoney } from "@/lib/money";
import { billing } from "@/repositories/billing";
import { system } from "@/repositories/system";
import { SubscriptionActions } from "@/components/account/subscription-actions";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/account");
  const customer = await billing.customerByUser(session.user.id);
  const [subscriptions, orders, notifications, addresses] = await Promise.all([
    billing.subscriptions({ userId: session.user.id, pageSize: 10 }),
    customer ? billing.orders({ customerId: customer.id, pageSize: 10 }) : Promise.resolve({ items: [] }),
    system.notifications(session.user.id),
    customer ? billing.addresses(customer.id) : Promise.resolve([]),
  ]);
  const current = subscriptions.items[0];
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Hello, {session.user.name?.split(" ")[0]}</h1>
      <div className="mt-6 flex gap-3 overflow-x-auto text-sm">
        <Link href="/account" className="rounded-full bg-primary px-4 py-2 text-primary-foreground">Overview</Link>
        <Link href="/account/subscriptions" className="rounded-full bg-secondary px-4 py-2">Subscriptions</Link>
        <Link href="/account/orders" className="rounded-full bg-secondary px-4 py-2">Orders</Link>
        <Link href="/account/addresses" className="rounded-full bg-secondary px-4 py-2">Addresses</Link>
        <Link href="/account/payments" className="rounded-full bg-secondary px-4 py-2">Payments</Link>
        <Link href="/account/settings" className="rounded-full bg-secondary px-4 py-2">Settings</Link>
      </div>
      {current ? (
        <section className="mt-8 rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">{current.number} · {current.status}</p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl">{current.planName}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div><dt className="text-muted-foreground">Next delivery</dt><dd>{current.nextDeliveryAt ? new Date(current.nextDeliveryAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) : "—"}</dd></div>
            <div><dt className="text-muted-foreground">Next payment</dt><dd>{current.nextBillingAt ? new Date(current.nextBillingAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) : "Not recurring"}</dd></div>
            <div><dt className="text-muted-foreground">Price</dt><dd>{formatMoney(current.priceCents)}</dd></div>
            <div><dt className="text-muted-foreground">Remaining</dt><dd>{current.remainingDeliveries ?? "Open"}</dd></div>
          </dl>
          <SubscriptionActions subscription={current} addresses={addresses.map((item) => ({ id: item.id, label: `${item.label}: ${item.line1}` }))} />
        </section>
      ) : <p className="mt-8">No subscription yet. <Link href="/plans" className="underline">Browse plans</Link>.</p>}
      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
          <h3 className="font-medium">Recent orders</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {orders.items.map((order) => <li key={order.id} className="flex justify-between"><span>{order.number}</span><span>{order.status} · {formatMoney(order.totalCents)}</span></li>)}
          </ul>
        </div>
        <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
          <h3 className="font-medium">Notifications</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {notifications.slice(0, 5).map((item) => <li key={item.id}><p className="font-medium">{item.title}</p><p className="text-muted-foreground">{item.body}</p></li>)}
            {notifications.length === 0 ? <li className="text-muted-foreground">Nothing new.</li> : null}
          </ul>
        </div>
      </section>
    </div>
  );
}
