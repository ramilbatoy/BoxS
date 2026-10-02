import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { system } from "@/repositories/system";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [menus, settings] = await Promise.all([system.menus(), system.settings()]);
  const businessName = settings.find((item) => item.key === "business.name")?.value || "BoxS";
  const header = menus.find((menu) => menu.key === "header")?.items ?? [];
  const footer = menus.find((menu) => menu.key === "footer")?.items ?? [];
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader items={header} businessName={businessName} />
      <main className="flex-1">{children}</main>
      <SiteFooter items={footer} businessName={businessName} />
    </div>
  );
}
