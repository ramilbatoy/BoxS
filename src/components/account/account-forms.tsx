"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const field = "mt-1 h-12 w-full rounded-xl border bg-background px-3";

export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setPending(true);
        const response = await fetch("/api/v1/account", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: data.get("name"),
            phone: data.get("phone"),
            password: data.get("password") || undefined,
          }),
        });
        const payload = await response.json();
        setPending(false);
        if (!payload.success) {
          toast.error(payload.error?.message || "Could not update your account.");
          return;
        }
        toast.success("Account updated.");
        router.refresh();
      }}
    >
      <label className="block text-sm">Name<input name="name" defaultValue={name} className={field} required /></label>
      <label className="block text-sm">Phone<input name="phone" defaultValue={phone} className={field} /></label>
      <label className="block text-sm">New password<input name="password" type="password" minLength={8} placeholder="Leave blank to keep the current one" className={field} /></label>
      <button className="h-12 rounded-full bg-primary px-5 text-primary-foreground" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}

export function AddressForm() {
  const router = useRouter();
  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const response = await fetch("/api/v1/account/addresses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: data.get("label"),
            line1: data.get("line1"),
            city: data.get("city"),
            region: data.get("region"),
            postalCode: data.get("postalCode"),
          }),
        });
        const payload = await response.json();
        if (!payload.success) {
          toast.error(payload.error?.message || "Could not save the address.");
          return;
        }
        toast.success("Address saved.");
        event.currentTarget.reset();
        router.refresh();
      }}
    >
      <label className="block text-sm">Label<input name="label" defaultValue="Home" className={field} required /></label>
      <label className="block text-sm">Street<input name="line1" className={field} required /></label>
      <label className="block text-sm">City<input name="city" defaultValue="Davao City" className={field} required /></label>
      <label className="block text-sm">Region<input name="region" defaultValue="Davao del Sur" className={field} required /></label>
      <label className="block text-sm">Postal code<input name="postalCode" defaultValue="8000" className={field} required /></label>
      <button className="h-12 rounded-full bg-primary px-5 text-primary-foreground">Add address</button>
    </form>
  );
}
