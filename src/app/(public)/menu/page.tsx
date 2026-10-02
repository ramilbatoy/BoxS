import { formatMoney } from "@/lib/money";
import { catalog } from "@/repositories/catalog";

export const metadata = { title: "Menu" };

export default async function MenuPage() {
  const [products, categories] = await Promise.all([catalog.products({ pageSize: 50 }), catalog.categories({ pageSize: 20 })]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Menu</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Grouped by category. The same list is what the plan builder can include.</p>
      <div className="mt-8 space-y-8">
        {categories.items.map((category) => (
          <section key={category.id}>
            <h2 className="font-[family-name:var(--font-display)] text-2xl">{category.name}</h2>
            <ul className="mt-3 divide-y divide-foreground/10">
              {products.items.filter((product) => product.categoryId === category.id).map((product) => (
                <li key={product.id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">{product.description}</p>
                  </div>
                  <p className="shrink-0">{formatMoney(product.basePriceCents)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
