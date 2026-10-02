import type { MetadataRoute } from "next";
import { plans } from "@/repositories/plans";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3017";
  const published = await plans.list({ pageSize: 100 }, true);
  return [
    "",
    "/plans",
    "/products",
    "/menu",
    "/about",
    "/faq",
    "/contact",
    ...published.items.map((plan) => `/plans/${plan.slug}`),
  ].map((path) => ({ url: `${base}${path}` }));
}
