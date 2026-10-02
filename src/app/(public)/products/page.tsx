import { formatMoney } from "@/lib/money";
import { catalog } from "@/repositories/catalog";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const page = await catalog.products({ pageSize: 40 });
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Products</h1>
      <p className="mt-2 text-muted-foreground">Anything an administrator adds can show up here: meals, credits, or services.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {page.items.map((product) => (
          <article key={product.id} className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
            <p className="text-xs uppercase tracking-wide text-primary">{product.kind}</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl">{product.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>
            <p className="mt-4">{formatMoney(product.basePriceCents)} · {product.categoryName}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
