"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="mx-auto max-w-md px-4 py-16"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setPending(true);
        const result = await signIn("credentials", {
          email: data.get("email"),
          password: data.get("password"),
          redirect: false,
        });
        setPending(false);
        if (result?.error) {
          setError("Those details were not recognized.");
          return;
        }
        window.location.href = params.get("next") || "/account";
      }}
    >
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">Demo admin admin@boxs.demo / DemoAdmin123! · Customer paolo@boxs.demo / DemoCustomer123!</p>
      <label className="mt-6 block text-sm">Email<input name="email" type="email" required className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      <label className="mt-3 block text-sm">Password<input name="password" type="password" required className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <button className="mt-6 h-12 w-full rounded-full bg-primary text-primary-foreground" disabled={pending}>{pending ? "Checking…" : "Sign in"}</button>
      <Link href="/register" className="mt-4 block text-sm underline">Create an account</Link>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
