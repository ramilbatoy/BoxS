import { system } from "@/repositories/system";

export const metadata = { title: "About" };

export default async function AboutPage() {
  const page = await system.page("about");
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-[family-name:var(--font-display)] text-5xl">{page?.title || "About"}</h1>
      <div className="mt-6 space-y-4 text-lg leading-8 whitespace-pre-wrap">{page?.body}</div>
    </article>
  );
}
