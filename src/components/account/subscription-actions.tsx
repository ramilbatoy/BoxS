"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SubscriptionDTO } from "@/repositories/billing";

export function SubscriptionActions({ subscription, addresses }: { subscription: SubscriptionDTO; addresses: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [addressId, setAddressId] = useState(subscription.addressId ?? addresses[0]?.id ?? "");
  const [date, setDate] = useState("");

  async function act(action: string, extra: Record<string, string> = {}) {
    setPending(action);
    const response = await fetch(`/api/v1/subscriptions/${subscription.id}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const payload = await response.json();
    setPending("");
    if (!payload.success) {
      toast.error(payload.error?.message || "That change was not allowed.");
      return;
    }
    toast.success(payload.data?.events?.[0]?.message || "Updated.");
    router.refresh();
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap gap-2">
        {subscription.rules.allowPause && subscription.status === "ACTIVE" ? <button className="h-11 rounded-full bg-secondary px-4" disabled={!!pending} onClick={() => act("pause")}>Pause</button> : null}
        {subscription.status === "PAUSED" ? <button className="h-11 rounded-full bg-secondary px-4" disabled={!!pending} onClick={() => act("resume")}>Resume</button> : null}
        {subscription.rules.allowSkip ? <button className="h-11 rounded-full bg-secondary px-4" disabled={!!pending} onClick={() => act("skip")}>Skip delivery</button> : null}
        {subscription.rules.allowCancel ? <button className="h-11 rounded-full bg-secondary px-4" disabled={!!pending} onClick={() => { if (confirm("Cancel this subscription?")) act("cancel", { reason: "Customer requested" }); }}>Cancel</button> : null}
        <Link href="/plans" className="inline-flex h-11 items-center rounded-full bg-secondary px-4">Change plan</Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <select className="h-11 rounded-xl border bg-background px-3" value={addressId} onChange={(event) => setAddressId(event.target.value)}>
          {addresses.map((address) => <option key={address.id} value={address.id}>{address.label}</option>)}
        </select>
        <button className="h-11 rounded-full bg-primary px-4 text-primary-foreground" onClick={() => act("change_address", { addressId })}>Save address</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input type="date" className="h-11 rounded-xl border bg-background px-3" value={date} onChange={(event) => setDate(event.target.value)} />
        <button className="h-11 rounded-full bg-primary px-4 text-primary-foreground" onClick={() => act("change_delivery_date", { deliveryDate: new Date(date).toISOString() })}>Move delivery</button>
      </div>
    </div>
  );
}
