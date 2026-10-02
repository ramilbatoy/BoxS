"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import { ModuleForms } from "@/components/admin/module-forms";

const modules: Record<string, { title: string; path: string; columns: string[]; create?: boolean; hint?: string }> = {
  customers: { title: "Customers", path: "/api/v1/customers", columns: ["name", "email", "status", "subscriptionCount"] },
  subscriptions: { title: "Subscriptions", path: "/api/v1/subscriptions", columns: ["number", "customerName", "planName", "status", "priceCents"] },
  orders: { title: "Orders", path: "/api/v1/orders", columns: ["number", "customerName", "status", "totalCents"] },
  plans: { title: "Plans", path: "/api/v1/plans", columns: ["name", "categoryName", "basePriceCents", "status", "subscriberCount"], create: true },
  products: { title: "Products", path: "/api/v1/products", columns: ["name", "categoryName", "kind", "basePriceCents", "status"], create: true },
  categories: { title: "Categories", path: "/api/v1/categories", columns: ["name", "slug", "productCount", "status"], create: true },
  addons: { title: "Add-ons", path: "/api/v1/addons", columns: ["name", "priceCents", "status"], create: true },
  deliveries: { title: "Deliveries", path: "/api/v1/deliveries", columns: ["orderNumber", "zoneName", "windowLabel", "status"] },
  payments: { title: "Payments", path: "/api/v1/payments", columns: ["customerName", "provider", "status", "amountCents"] },
  coupons: { title: "Coupons", path: "/api/v1/coupons", columns: ["code", "name", "type", "value", "active"], create: true },
  content: { title: "Pages", path: "/api/v1/pages", columns: ["title", "slug", "status"] },
  faqs: { title: "Questions", path: "/api/v1/faqs", columns: ["question", "published"] },
  menus: { title: "Menus", path: "/api/v1/menus", columns: ["name", "key"] },
  media: { title: "Media", path: "/api/v1/media", columns: ["filename", "alt", "mime"] },
  users: { title: "Users", path: "/api/v1/users", columns: ["name", "email", "role", "status"], create: true },
  roles: { title: "Roles", path: "/api/v1/roles", columns: ["name", "slug", "userCount"] },
  permissions: { title: "Permissions", path: "/api/v1/permissions", columns: ["description", "key", "module"] },
  notifications: { title: "Notification templates", path: "/api/v1/notifications/templates", columns: ["name", "channel", "enabled"] },
  integrations: { title: "Webhooks", path: "/api/v1/webhooks", columns: ["provider", "type", "status"] },
  api: { title: "API keys", path: "/api/v1/api-keys", columns: ["name", "prefix", "revokedAt"] },
  settings: { title: "Settings", path: "/api/v1/settings", columns: ["group", "label", "value"] },
  system: { title: "System", path: "/api/v1/feature-flags", columns: ["key", "enabled", "description"] },
  audit: { title: "Audit logs", path: "/api/v1/audit-logs", columns: ["createdAt", "actorName", "action", "recordLabel"] },
};

const headings: Record<string, string> = {
  name: "Name",
  email: "Email",
  status: "Status",
  subscriptionCount: "Subscriptions",
  number: "Number",
  customerName: "Customer",
  planName: "Plan",
  priceCents: "Price",
  totalCents: "Total",
  categoryName: "Category",
  basePriceCents: "Price",
  subscriberCount: "Subscribers",
  kind: "Type",
  slug: "Address",
  productCount: "Items",
  amountCents: "Amount",
  provider: "Provider",
  code: "Code",
  type: "Type",
  value: "Value",
  active: "Active",
  orderNumber: "Order",
  zoneName: "Zone",
  windowLabel: "Window",
  title: "Title",
  filename: "File",
  alt: "Alt text",
  mime: "Type",
  role: "Role",
  userCount: "People",
  channel: "Channel",
  enabled: "On",
  prefix: "Starts with",
  revokedAt: "Revoked",
  group: "Group",
  label: "Setting",
  description: "What it allows",
  key: "Key",
  module: "Area",
  question: "Question",
  published: "Published",
  location: "Placement",
  createdAt: "When",
  actorName: "Who",
  action: "Action",
  recordLabel: "Record",
};

export function RecordBrowser({ module }: { module: string }) {
  const config = modules[module] ?? { title: module, path: `/api/v1/${module}`, columns: ["id"] };
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  async function load(q = query) {
    const response = await fetch(`${config.path}?q=${encodeURIComponent(q)}`);
    const payload = await response.json();
    if (!payload.success) {
      setError(payload.error?.message || "Could not load records.");
      setRows([]);
      return;
    }
    const data = payload.data;
    const items = Array.isArray(data) ? data : data?.items ?? [];
    setRows(items);
    setError("");
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${config.path}?q=`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.success) {
          setError(payload.error?.message || "Could not load records.");
          setRows([]);
          return;
        }
        const data = payload.data;
        setRows(Array.isArray(data) ? data : data?.items ?? []);
        setError("");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [module, config.path]);

  async function bulk(action: string) {
    const response = await fetch(`${config.path}/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: selected, action }),
    });
    const payload = await response.json();
    if (!payload.success) toast.error(payload.error?.message || "Bulk action failed.");
    else toast.success("Updated.");
    setSelected([]);
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl">{config.title}</h1>
          {config.hint ? <p className="text-sm text-muted-foreground">{config.hint}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {["customers", "orders", "subscriptions", "products", "plans"].includes(module) ? (
            <a className="text-sm underline" href={`/api/v1/exports/${module}`}>Export CSV</a>
          ) : null}
          {module === "plans" ? <Link href="/admin/plans/new" className="inline-flex h-11 items-center rounded-full bg-[#1f6b56] px-4 text-white">Add plan</Link> : null}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <input className="h-11 flex-1 rounded-xl border bg-white px-3" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="h-11 rounded-full bg-white px-4 ring-1 ring-black/10" onClick={() => load()}>Search</button>
      </div>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {selected.length > 0 && (module === "plans" || module === "orders" || module === "customers") ? (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {module === "plans" ? <button className="h-10 rounded-full bg-white px-4 ring-1 ring-black/10" onClick={() => bulk("publish")}>Publish</button> : null}
          {module === "plans" ? <button className="h-10 rounded-full bg-white px-4 ring-1 ring-black/10" onClick={() => bulk("archive")}>Archive</button> : null}
          {module === "orders" ? <button className="h-10 rounded-full bg-white px-4 ring-1 ring-black/10" onClick={() => bulk("confirm")}>Confirm</button> : null}
          {module === "orders" ? <button className="h-10 rounded-full bg-white px-4 ring-1 ring-black/10" onClick={() => bulk("delivered")}>Mark delivered</button> : null}
          {module === "customers" ? <button className="h-10 rounded-full bg-white px-4 ring-1 ring-black/10" onClick={() => bulk("suspend")}>Suspend</button> : null}
        </div>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-muted-foreground">
            <tr>{config.columns.map((column) => <th key={column} className="px-3 py-3">{headings[column] ?? column}</th>)}<th className="px-3 py-3">Select</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowId = module === "customers" ? String(row.userId ?? row.id) : String(row.id);
              return (
              <tr key={rowId} className="border-b last:border-0">
                {config.columns.map((column) => <td key={column} className="px-3 py-3">{format(row[column], column)}</td>)}
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selected.includes(rowId)} onChange={() => setSelected((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId])} />
                  {module === "plans" ? <Link className="ml-3 underline" href={`/admin/plans/${row.id}`}>Edit</Link> : null}
                  {module === "orders" ? <Link className="ml-3 underline" href={`/admin/orders/${row.id}`}>View</Link> : null}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && !error ? <p className="p-6 text-sm text-muted-foreground">Nothing here yet.</p> : null}
      </div>
      <ModuleForms module={module} onCreated={() => load()} />
    </div>
  );
}

function format(value: unknown, column: string) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && column.endsWith("Cents")) return formatMoney(value);
  if (column === "createdAt" || column === "revokedAt") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  }
  return String(value);
}
