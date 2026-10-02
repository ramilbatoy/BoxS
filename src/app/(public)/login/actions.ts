"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { system } from "@/repositories/system";

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "");
  if (!next.startsWith("/") || next.startsWith("//")) return "";
  return next;
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const requested = safeNext(formData.get("next"));
  const user = await system.userByEmail(email);
  const home = user && user.role.slug !== "customer" ? "/admin" : "/account";
  const destination = requested || home;
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=1${requested ? `&next=${encodeURIComponent(requested)}` : ""}`);
    }
    throw error;
  }
  redirect(destination);
}
