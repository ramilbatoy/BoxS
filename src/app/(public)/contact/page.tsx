"use client";

import { useState } from "react";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="mx-auto max-w-xl px-4 py-12"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const response = await fetch("/api/v1/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: data.get("name"), email: data.get("email"), phone: data.get("phone"), message: data.get("message") }),
        });
        const payload = await response.json();
        if (!payload.success) {
          setError(payload.error?.message || "Could not send that.");
          return;
        }
        setSent(true);
      }}
    >
      <h1 className="font-[family-name:var(--font-display)] text-5xl">Contact</h1>
      <p className="mt-2 text-muted-foreground">Messages are stored for the admin team. This demo does not send email.</p>
      {sent ? <p className="mt-6 rounded-2xl bg-secondary p-4">Message received. Someone can read it in the admin inbox.</p> : null}
      <label className="mt-6 block text-sm">Name<input name="name" required className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      <label className="mt-3 block text-sm">Email<input name="email" type="email" required className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      <label className="mt-3 block text-sm">Phone<input name="phone" className="mt-1 h-12 w-full rounded-xl border bg-background px-3" /></label>
      <label className="mt-3 block text-sm">Message<textarea name="message" required className="mt-1 min-h-32 w-full rounded-xl border bg-background px-3 py-2" /></label>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <button className="mt-6 h-12 rounded-full bg-primary px-6 text-primary-foreground">Send</button>
    </form>
  );
}
