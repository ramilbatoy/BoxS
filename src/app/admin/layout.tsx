import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can } from "@/modules/auth/permissions";
import { AdminSearch } from "@/components/admin/admin-search";

const links = [
  ["Dashboard", "/admin", "reports.view"],
  ["Customers", "/admin/customers", "customers.view"],
  ["Subscriptions", "/admin/subscriptions", "subscriptions.view"],
  ["Orders", "/admin/orders", "orders.view"],
  ["Plans", "/admin/plans", "plans.view"],
  ["Products", "/admin/products", "products.view"],
  ["Categories", "/admin/categories", "products.view"],
  ["Add-ons", "/admin/addons", "products.view"],
  ["Deliveries", "/admin/deliveries", "deliveries.view"],
  ["Payments", "/admin/payments", "payments.view"],
  ["Coupons", "/admin/coupons", "coupons.view"],
  ["Content", "/admin/content", "content.view"],
  ["Pages", "/admin/content", "content.view"],
  ["Menus", "/admin/menus", "content.view"],
  ["FAQs", "/admin/faqs", "content.view"],
  ["Media", "/admin/media", "media.view"],
  ["Reports", "/admin/reports", "reports.view"],
  ["Users", "/admin/users", "users.view"],
  ["Roles", "/admin/roles", "users.view"],
  ["Permissions", "/admin/permissions", "users.view"],
  ["Notifications", "/admin/notifications", "notifications.manage"],
  ["Integrations", "/admin/integrations", "api.manage"],
  ["Settings", "/admin/settings", "settings.manage"],
  ["Audit logs", "/admin/audit", "audit.view"],
  ["System", "/admin/system", "settings.manage"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/admin");
  if (session.user.role === "customer") redirect("/account");
  const visible = links.filter(([, , permission]) => can(session.user.permissions, permission, session.user.role));
  return (
    <div className="min-h-screen bg-[#f3eee4] md:grid md:grid-cols-[240px_1fr]">
      <aside className="bg-[#1c1915] text-[#f6f1e7] md:min-h-screen">
        <Link href="/admin" className="block px-4 py-5 font-[family-name:var(--font-display)] text-3xl">BoxS</Link>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-4 md:block md:space-y-1 md:px-3">
          {visible.map(([label, href]) => (
            <Link key={label} href={href} className="block shrink-0 rounded-lg px-3 py-2 text-sm hover:bg-white/10">{label}</Link>
          ))}
        </nav>
      </aside>
      <div className="px-4 py-6 md:px-8"><AdminSearch />{children}</div>
    </div>
  );
}
