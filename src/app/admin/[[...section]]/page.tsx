import { Dashboard } from "@/components/admin/dashboard";
import { PlanBuilder } from "@/components/admin/plan-builder";
import { RecordBrowser } from "@/components/admin/record-browser";
import { OrderDetail } from "@/components/admin/order-detail";

export default async function AdminSection({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { section = [] } = await params;
  const { range } = await searchParams;
  const [root, id] = section;
  if (!root) return <Dashboard range={range} />;
  if (root === "plans" && (id === "new" || id)) return <PlanBuilder id={id === "new" ? undefined : id} />;
  if (root === "orders" && id && id !== "new") return <OrderDetail id={id} />;
  if (root === "reports") return <Dashboard range={range ?? "30d"} />;
  return <RecordBrowser module={root} />;
}
