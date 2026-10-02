"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";

type OrderView = {
  number: string;
  customerName: string;
  status: string;
  totalCents: number;
  items?: { name: string; quantity: number; totalCents: number }[];
  delivery?: { zoneName: string; windowLabel: string } | null;
};

export function OrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  useEffect(() => {
    fetch(`/api/v1/orders/${id}`).then((response) => response.json()).then((payload) => setOrder(payload.data));
  }, [id]);
  if (!order) return <p>Loading order…</p>;
  async function setStatus(status: string) {
    const response = await fetch(`/api/v1/orders/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    const payload = await response.json();
    if (!payload.success) toast.error(payload.error?.message || "Could not update the order.");
    else setOrder(payload.data);
  }
  return (
    <div className="max-w-3xl">
      <p className="text-sm text-muted-foreground">{order.number}</p>
      <h1 className="font-[family-name:var(--font-display)] text-4xl">{order.customerName}</h1>
      <p className="mt-2">Status: {order.status} · {formatMoney(order.totalCents)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].map((status) => (
          <button key={status} className="h-10 rounded-full bg-white px-3 text-sm ring-1 ring-black/10" onClick={() => setStatus(status)}>{status}</button>
        ))}
      </div>
      <ul className="mt-6 space-y-2 text-sm">
        {(order.items ?? []).map((item: { name: string; quantity: number; totalCents: number }) => (
          <li key={item.name} className="flex justify-between"><span>{item.quantity} × {item.name}</span><span>{formatMoney(item.totalCents)}</span></li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">Delivery {order.delivery ? `${order.delivery.zoneName} · ${order.delivery.windowLabel}` : "not assigned"}</p>
    </div>
  );
}
