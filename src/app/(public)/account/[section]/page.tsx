import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AddressForm, ProfileForm } from "@/components/account/account-forms";
import { SubscriptionActions } from "@/components/account/subscription-actions";
import { formatMoney } from "@/lib/money";
import { billing } from "@/repositories/billing";

export default async function AccountSection({ params }: { params: Promise<{ section: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/account");
  const { section } = await params;
  const customer = await billing.customerByUser(session.user.id);
  const subscriptions = await billing.subscriptions({ userId: session.user.id, pageSize: 20 });
  const orders = customer ? await billing.orders({ customerId: customer.id, pageSize: 20 }) : { items: [] };
  const addresses = customer ? await billing.addresses(customer.id) : [];
  const titles: Record<string, string> = {
    profile: "Profile",
    subscriptions: "Subscriptions",
    orders: "Orders",
    addresses: "Addresses",
    payments: "Payments",
    settings: "Settings",
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/account" className="text-sm underline">Back to account</Link>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl">{titles[section] ?? section}</h1>
      {section === "subscriptions" ? (
        <div className="mt-6 space-y-4">
          {subscriptions.items.map((item) => (
            <article key={item.id} className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
              <p className="text-sm text-muted-foreground">{item.number} · {item.status}</p>
              <h2 className="font-[family-name:var(--font-display)] text-2xl">{item.planName}</h2>
              <p className="mt-1 text-sm">{formatMoney(item.priceCents)} · {item.remainingDeliveries ?? "Open"} deliveries left</p>
              <SubscriptionActions subscription={item} addresses={addresses.map((address) => ({ id: address.id, label: `${address.label}: ${address.line1}` }))} />
            </article>
          ))}
          {subscriptions.items.length === 0 ? <p className="text-muted-foreground">No subscriptions yet.</p> : null}
        </div>
      ) : null}
      {section === "orders" ? (
        <ul className="mt-6 space-y-3">
          {orders.items.map((item) => (
            <li key={item.id} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="font-medium">{item.number}</p>
              <p className="text-sm text-muted-foreground">{item.status} · {formatMoney(item.totalCents)}</p>
            </li>
          ))}
          {orders.items.length === 0 ? <li className="text-muted-foreground">No orders yet.</li> : null}
        </ul>
      ) : null}
      {section === "addresses" ? (
        <div>
          <ul className="mt-6 space-y-3">
            {addresses.map((item) => <li key={item.id} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">{item.label}: {item.line1}, {item.city} {item.postalCode}</li>)}
          </ul>
          <AddressForm />
        </div>
      ) : null}
      {section === "payments" ? (
        <ul className="mt-6 space-y-3">
          {orders.items.flatMap((order) => order.payments).map((payment) => (
            <li key={payment.id} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">{payment.provider} · {payment.status} · {formatMoney(payment.amountCents)}</li>
          ))}
        </ul>
      ) : null}
      {section === "settings" || section === "profile" ? (
        <ProfileForm name={session.user.name ?? ""} phone={customer?.user.phone ?? ""} />
      ) : null}
    </div>
  );
}
