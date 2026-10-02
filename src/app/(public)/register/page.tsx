"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="mx-auto max-w-md px-4 py-16"
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setPending(true);
        const response = await fetch("/api/v1/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password: data.get("password"), phone: data.get("phone") }),
        });
        const payload = await response.json();
        if (!payload.success) {
          setPending(false);
          setError(payload.error?.message || "Could not create the account.");
          return;
        }
        await signIn("credentials", { email: data.get("email"), password: data.get("password"), redirect: true, callbackUrl: "/account" });
      }}
    >
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Create your account</h1>
      <label className="mt-6 block text-sm">Name<input name="name" required className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      <label className="mt-3 block text-sm">Email<input name="email" type="email" required className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      <label className="mt-3 block text-sm">Phone<input name="phone" className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      <label className="mt-3 block text-sm">Password<input name="password" type="password" minLength={8} required className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <button className="mt-6 h-12 w-full rounded-full bg-primary text-primary-foreground" disabled={pending}>{pending ? "Creating…" : "Register"}</button>
    </form>
  );
}
