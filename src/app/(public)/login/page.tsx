import Link from "next/link";
import { loginAction } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const nextValue = next?.startsWith("/") && !next.startsWith("//") ? next : "";
  return (
    <form action={loginAction} className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">Demo admin admin@boxs.demo / DemoAdmin123! · Customer paolo@boxs.demo / DemoCustomer123!</p>
      <input type="hidden" name="next" value={nextValue} />
      <label className="mt-6 block text-sm">Email<input name="email" type="email" required autoComplete="email" className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      <label className="mt-3 block text-sm">Password<input name="password" type="password" required autoComplete="current-password" className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      {error ? <p className="mt-3 text-sm text-destructive">Those details were not recognized.</p> : null}
      <button className="mt-6 h-12 w-full rounded-full bg-primary text-primary-foreground" type="submit">Sign in</button>
      <Link href="/register" className="mt-4 block text-sm underline">Create an account</Link>
    </form>
  );
}
