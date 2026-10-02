"use client";

import { useState } from "react";
import Link from "next/link";

type Hit = { id: string; name?: string; email?: string; number?: string; slug?: string; code?: string };

export function AdminSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Record<string, Hit[]>>({});

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setOpen(false);
      return;
    }
    const response = await fetch(`/api/v1/search?q=${encodeURIComponent(value)}`);
    const payload = await response.json();
    if (payload.success) {
      setResults(payload.data);
      setOpen(true);
    }
  }

  const groups = [
    ["customers", "Customers", () => "/admin/customers", (item: Hit) => `${item.name} · ${item.email}`],
    ["subscriptions", "Subscriptions", () => "/admin/subscriptions", (item: Hit) => item.number ?? ""],
    ["orders", "Orders", (item: Hit) => `/admin/orders/${item.id}`, (item: Hit) => item.number ?? ""],
    ["plans", "Plans", (item: Hit) => `/admin/plans/${item.id}`, (item: Hit) => item.name ?? ""],
    ["products", "Products", () => "/admin/products", (item: Hit) => item.name ?? ""],
    ["coupons", "Coupons", () => "/admin/coupons", (item: Hit) => `${item.code} · ${item.name}`],
  ] as const;

  return (
    <div className="relative mb-6">
      <input
        className="h-11 w-full rounded-xl border bg-white px-3"
        placeholder="Search customers, orders, plans…"
        value={query}
        onChange={(event) => search(event.target.value)}
      />
      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl bg-white p-3 shadow-lg ring-1 ring-black/10">
          {groups.map(([key, label, href, text]) => {
            const items = results[key] ?? [];
            if (!items.length) return null;
            return (
              <div key={key} className="mb-3 last:mb-0">
                <p className="text-xs uppercase text-muted-foreground">{label}</p>
                <ul className="mt-1">
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link href={href(item)} className="block rounded-lg px-2 py-2 text-sm hover:bg-[#f6f1e7]" onClick={() => setOpen(false)}>{text(item)}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {groups.every(([key]) => !(results[key] ?? []).length) ? <p className="text-sm text-muted-foreground">No matches.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
