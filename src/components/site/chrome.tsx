import Link from "next/link";
import { auth, signOut } from "@/auth";
import { HeaderDrawer } from "@/components/site/header-drawer";

export function SiteHeader({
  items,
  businessName,
}: {
  items: { label: string; href: string }[];
  businessName: string;
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-foreground/10 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="shrink-0">
            <img src="/logo_main.png" alt={businessName} className="h-14 w-14 object-contain lg:h-16 lg:w-16" />
          </Link>
          <nav className="hidden items-center gap-6 text-base font-semibold lg:flex">
            {items.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-primary">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden lg:block">
            <AuthLinks />
          </div>
          <HeaderDrawer items={items}>
            <AuthLinks stacked />
          </HeaderDrawer>
        </div>
      </header>
      <img src="/banner.jpg" alt="BoxS. Subscriptions with room to change your mind." className="block w-full" />
    </>
  );
}

async function AuthLinks({ stacked = false }: { stacked?: boolean }) {
  const session = await auth();
  if (!stacked) {
    if (!session?.user) {
      return (
        <div className="flex items-center gap-3 text-base font-semibold">
          <Link href="/login" className="rounded-full px-3 py-2">Sign in</Link>
          <Link href="/plans" className="rounded-full bg-primary px-4 py-2 text-primary-foreground">See plans</Link>
        </div>
      );
    }
    const admin = session.user.role !== "customer";
    return (
      <div className="flex items-center gap-3 text-base font-semibold">
        {admin ? <Link href="/admin" className="rounded-full px-3 py-2">Admin</Link> : null}
        <Link href="/account" className="rounded-full px-3 py-2">Account</Link>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
          <button className="rounded-full px-3 py-2" type="submit">Sign out</button>
        </form>
      </div>
    );
  }
  const itemClass = "py-3 text-left text-base font-semibold hover:text-primary";
  if (!session?.user) {
    return (
      <div className="flex flex-col">
        <Link href="/login" className={itemClass}>Sign in</Link>
        <Link href="/plans" className={itemClass}>See plans</Link>
      </div>
    );
  }
  const admin = session.user.role !== "customer";
  return (
    <div className="flex flex-col">
      {admin ? <Link href="/admin" className={itemClass}>Admin</Link> : null}
      <Link href="/account" className={itemClass}>Account</Link>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
        <button className={itemClass} type="submit">Sign out</button>
      </form>
    </div>
  );
}

export function SiteFooter({ items, businessName }: { items: { label: string; href: string }[]; businessName: string }) {
  return (
    <footer className="mt-16 border-t border-foreground/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{businessName} · Davao City · Prices in Philippine peso. Demo catalog.</p>
        <div className="flex gap-4">
          {items.map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
