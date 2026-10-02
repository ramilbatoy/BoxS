import { system } from "@/repositories/system";

export const metadata = { title: "FAQ" };

export default async function FaqPage() {
  const faqs = await system.faqs();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-[family-name:var(--font-display)] text-5xl">Questions</h1>
      <div className="mt-8 space-y-4">
        {faqs.filter((faq) => faq.published).map((faq) => (
          <details key={faq.id} className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10" open>
            <summary className="cursor-pointer font-medium">{faq.question}</summary>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
