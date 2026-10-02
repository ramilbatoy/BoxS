"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Group = {
  name: string;
  key: string;
  helpText: string;
  required: boolean;
  options: { label: string; priceDeltaCents: number; durationDays: string; isDefault: boolean }[];
};

const emptyGroup = (): Group => ({
  name: "Duration",
  key: "duration",
  helpText: "How long this subscription stays active before renewal or completion.",
  required: true,
  options: [{ label: "7 days", priceDeltaCents: 0, durationDays: "7", isDefault: true }],
});

export function PlanBuilder({ id }: { id?: string }) {
  const router = useRouter();
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    categoryId: "",
    subscriptionTypeId: "",
    basePriceCents: 250000,
    deliveryFeeCents: 20000,
    discountCents: 0,
    taxRateBps: 0,
    featuredLabel: "NONE",
    seoTitle: "",
    seoDescription: "",
    allowPause: true,
    allowSkip: true,
    allowCancel: true,
    allowPlanChange: true,
    minCommitmentDays: 0,
    cancellationCutoffHours: 24,
    changeCutoffHours: 24,
    skipCutoffHours: 24,
    deliveryChangeCutoffHours: 24,
  });
  const [groups, setGroups] = useState<Group[]>([emptyGroup()]);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/subscription-types").then((response) => response.json()),
      fetch("/api/v1/categories?pageSize=50").then((response) => response.json()),
      id ? fetch(`/api/v1/plans/${id}`).then((response) => response.json()) : Promise.resolve(null),
    ]).then(([typePayload, categoryPayload, planPayload]) => {
      setTypes(typePayload.data ?? []);
      setCategories(categoryPayload.data?.items ?? []);
      if (!id && typePayload.data?.[0]) setForm((current) => ({ ...current, subscriptionTypeId: typePayload.data[0].id }));
      if (planPayload?.data) {
        const plan = planPayload.data;
        setForm({
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          categoryId: plan.categoryId ?? "",
          subscriptionTypeId: plan.subscriptionTypeId,
          basePriceCents: plan.basePriceCents,
          deliveryFeeCents: plan.deliveryFeeCents,
          discountCents: plan.discountCents,
          taxRateBps: plan.taxRateBps,
          featuredLabel: plan.featuredLabel,
          seoTitle: plan.seoTitle ?? "",
          seoDescription: plan.seoDescription ?? "",
          ...plan.rules,
        });
        setGroups(plan.groups.map((group: Group & { options: { durationDays: number | null; priceDeltaCents: number; label: string; isDefault: boolean }[] }) => ({
          name: group.name,
          key: group.key,
          helpText: group.helpText ?? "",
          required: group.required,
          options: group.options.map((option) => ({ label: option.label, priceDeltaCents: option.priceDeltaCents, durationDays: option.durationDays ? String(option.durationDays) : "", isDefault: option.isDefault })),
        })));
      }
    });
  }, [id]);

  async function save(publish: boolean) {
    const payload = {
      ...form,
      categoryId: form.categoryId || null,
      rules: {
        allowPause: form.allowPause,
        allowSkip: form.allowSkip,
        allowCancel: form.allowCancel,
        allowPlanChange: form.allowPlanChange,
        minCommitmentDays: Number(form.minCommitmentDays),
        cancellationCutoffHours: Number(form.cancellationCutoffHours),
        changeCutoffHours: Number(form.changeCutoffHours),
        skipCutoffHours: Number(form.skipCutoffHours),
        deliveryChangeCutoffHours: Number(form.deliveryChangeCutoffHours),
      },
      groups: groups.map((group) => ({
        ...group,
        options: group.options.map((option) => ({
          label: option.label,
          priceDeltaCents: Number(option.priceDeltaCents),
          durationDays: option.durationDays ? Number(option.durationDays) : null,
          isDefault: option.isDefault,
        })),
      })),
    };
    const response = await fetch(id ? `/api/v1/plans/${id}` : "/api/v1/plans", {
      method: id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!result.success) {
      toast.error(result.error?.message || "Could not save the plan.");
      return;
    }
    const planId = result.data.id as string;
    if (publish) {
      const published = await fetch(`/api/v1/plans/${planId}/publish`, { method: "POST" });
      const publishedBody = await published.json();
      if (!publishedBody.success) {
        toast.error(publishedBody.error?.message || "Saved, but not published.");
        return;
      }
    }
    toast.success(publish ? "Plan published." : "Draft saved.");
    router.push("/admin/plans");
    router.refresh();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-[family-name:var(--font-display)] text-4xl">{id ? "Edit plan" : "New plan"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Fill in the form and publish. Prices are in pesos. Existing orders keep the price they were charged.</p>
      <div className="mt-6 space-y-6">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-medium">Basic information</h2>
          <div className="mt-3 grid gap-3">
            <Field label="Plan name" hint="The name customers see."><input className="h-11 w-full rounded-xl border bg-white px-3" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="Slug" hint="Used in the web address, such as balanced-table."><input className="h-11 w-full rounded-xl border bg-white px-3" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></Field>
            <Field label="Description"><textarea className="min-h-24 w-full rounded-xl border bg-white px-3 py-2" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
            <Field label="Category"><select className="h-11 w-full rounded-xl border bg-white px-3" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">None</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
          </div>
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-medium">Subscription</h2>
          <Field label="Subscription type" hint="One-time programs and recurring billing are both types you can add.">
            <select className="h-11 w-full rounded-xl border bg-white px-3" value={form.subscriptionTypeId} onChange={(event) => setForm({ ...form, subscriptionTypeId: event.target.value })}>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
          </Field>
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-medium">Pricing</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Base price (₱)" hint="Starting price before options, delivery, tax, and coupons."><input className="h-11 w-full rounded-xl border bg-white px-3" type="number" min="0" step="0.01" value={form.basePriceCents / 100} onChange={(event) => setForm({ ...form, basePriceCents: Math.round(Number(event.target.value) * 100) })} /></Field>
            <Field label="Delivery fee (₱)" hint="Added by the shared pricing service. A zone can override this at checkout."><input className="h-11 w-full rounded-xl border bg-white px-3" type="number" min="0" step="0.01" value={form.deliveryFeeCents / 100} onChange={(event) => setForm({ ...form, deliveryFeeCents: Math.round(Number(event.target.value) * 100) })} /></Field>
            <Field label="Built-in discount (₱)" hint="Taken off before coupons."><input className="h-11 w-full rounded-xl border bg-white px-3" type="number" min="0" step="0.01" value={form.discountCents / 100} onChange={(event) => setForm({ ...form, discountCents: Math.round(Number(event.target.value) * 100) })} /></Field>
            <Field label="Tax (%)" hint="Applied to the price after the built-in discount. 12 means 12 percent."><input className="h-11 w-full rounded-xl border bg-white px-3" type="number" min="0" step="0.01" value={form.taxRateBps / 100} onChange={(event) => setForm({ ...form, taxRateBps: Math.round(Number(event.target.value) * 100) })} /></Field>
          </div>
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Options</h2>
            <button type="button" className="text-sm underline" onClick={() => setGroups([...groups, emptyGroup()])}>Add group</button>
          </div>
          {groups.map((group, groupIndex) => (
            <div key={groupIndex} className="mt-4 rounded-xl bg-[#f6f1e7] p-3">
              <input className="h-11 w-full rounded-xl border bg-white px-3" value={group.name} onChange={(event) => updateGroup(groupIndex, { name: event.target.value })} />
              <textarea className="mt-2 min-h-16 w-full rounded-xl border bg-white px-3 py-2" value={group.helpText} onChange={(event) => updateGroup(groupIndex, { helpText: event.target.value })} />
              {group.options.map((option, optionIndex) => (
                <div key={optionIndex} className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input className="h-11 w-full rounded-xl border bg-white px-3" placeholder="Label" value={option.label} onChange={(event) => updateOption(groupIndex, optionIndex, { label: event.target.value })} />
                  <input className="h-11 w-full rounded-xl border bg-white px-3" type="number" step="0.01" placeholder="Extra ₱" value={option.priceDeltaCents / 100} onChange={(event) => updateOption(groupIndex, optionIndex, { priceDeltaCents: Math.round(Number(event.target.value) * 100) })} />
                  <input className="h-11 w-full rounded-xl border bg-white px-3" placeholder="Days, if this sets duration" value={option.durationDays} onChange={(event) => updateOption(groupIndex, optionIndex, { durationDays: event.target.value })} />
                </div>
              ))}
              <button type="button" className="mt-2 text-sm underline" onClick={() => updateGroup(groupIndex, { options: [...group.options, { label: "New option", priceDeltaCents: 0, durationDays: "", isDefault: false }] })}>Add option</button>
            </div>
          ))}
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-medium">Rules</h2>
          <div className="mt-3 grid gap-2 text-sm">
            {([
              ["allowPause", "Customers can pause"],
              ["allowSkip", "Customers can skip a delivery"],
              ["allowCancel", "Customers can cancel"],
              ["allowPlanChange", "Customers can change plan"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />{label}</label>
            ))}
            <Field label="Cancellation cutoff (hours)" hint="Customers must cancel at least this many hours before delivery."><input className="h-11 w-full rounded-xl border bg-white px-3" type="number" value={form.cancellationCutoffHours} onChange={(event) => setForm({ ...form, cancellationCutoffHours: Number(event.target.value) })} /></Field>
          </div>
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <h2 className="font-medium">SEO</h2>
          <Field label="Meta title"><input className="h-11 w-full rounded-xl border bg-white px-3" value={form.seoTitle} onChange={(event) => setForm({ ...form, seoTitle: event.target.value })} /></Field>
          <Field label="Meta description"><textarea className="mt-2 min-h-20 w-full rounded-xl border bg-white px-3 py-2" value={form.seoDescription} onChange={(event) => setForm({ ...form, seoDescription: event.target.value })} /></Field>
          <Field label="Storefront label" hint="Hidden plans stay off the public site. Featured, Popular, Best value, New, and Limited appear as badges."><select className="h-11 w-full rounded-xl border bg-white px-3" value={form.featuredLabel} onChange={(event) => setForm({ ...form, featuredLabel: event.target.value })}>{[["NONE", "None"], ["FEATURED", "Featured"], ["POPULAR", "Popular"], ["BEST_VALUE", "Best value"], ["NEW", "New"], ["LIMITED", "Limited"], ["HIDDEN", "Hidden"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        </section>
        <div className="flex gap-3">
          <button className="h-12 rounded-full border px-5" type="button" onClick={() => save(false)}>Save draft</button>
          <button className="h-12 rounded-full bg-[#1f6b56] px-5 text-white" type="button" onClick={() => save(true)}>Publish</button>
        </div>
      </div>
    </div>
  );

  function updateGroup(index: number, patch: Partial<Group>) {
    setGroups(groups.map((group, groupIndex) => (groupIndex === index ? { ...group, ...patch } : group)));
  }
  function updateOption(groupIndex: number, optionIndex: number, patch: Partial<Group["options"][number]>) {
    updateGroup(groupIndex, {
      options: groups[groupIndex].options.map((option, index) => (index === optionIndex ? { ...option, ...patch } : option)),
    });
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
