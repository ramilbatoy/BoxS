"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import type { AddonDTO } from "@/repositories/catalog";
import type { PlanDTO } from "@/types/domain";

type Zone = {
  id: string;
  name: string;
  city: string;
  feeCents: number;
  schedules: { id: string; dayOfWeek: number; windowStart: string; windowEnd: string; cutoffTime: string }[];
};

const steps = ["Goal", "Plan", "Duration", "Options", "Delivery", "Address", "Review", "Payment", "Done"];

export function SubscribeWizard({ plan, zones, addons }: { plan: PlanDTO; zones: Zone[]; addons: AddonDTO[] }) {
  const defaults = plan.groups.map((group) => group.options.find((option) => option.isDefault)?.id ?? group.options[0]?.id).filter((id): id is string => Boolean(id));
  const [step, setStep] = useState(0);
  const [optionIds, setOptionIds] = useState<string[]>(defaults);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [scheduleId, setScheduleId] = useState(zones[0]?.schedules[0]?.id ?? "");
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 3);
    return date.toISOString().slice(0, 10);
  });
  const [address, setAddress] = useState({ label: "Home", line1: "", city: "Davao City", region: "Davao del Sur", postalCode: "8000" });
  const [couponCode, setCouponCode] = useState("");
  const [provider, setProvider] = useState("manual");
  const [confirmation, setConfirmation] = useState<{ number?: string } | null>(null);
  const [pending, setPending] = useState(false);

  const zone = zones.find((item) => item.id === zoneId);
  const quote = useQuery({
    queryKey: ["quote", plan.id, optionIds, addonIds, zoneId, couponCode],
    queryFn: async () => {
      const response = await fetch("/api/v1/pricing/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: plan.id, optionIds, addonIds, zoneId, couponCode: couponCode || null }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message || "Could not price this plan.");
      return payload.data;
    },
  });

  const router = useRouter();
  const durationGroup = plan.groups.find((group) => group.key === "duration") ?? plan.groups[0];
  const otherGroups = plan.groups.filter((group) => group.id !== durationGroup?.id);
  const total = quote.data?.price?.totalCents as number | undefined;

  const summary = useMemo(() => quote.data?.price?.lines ?? [], [quote.data]);

  function choose(groupId: string, optionId: string) {
    const group = plan.groups.find((item) => item.id === groupId);
    if (!group) return;
    const remaining = optionIds.filter((id) => !group.options.some((option) => option.id === id));
    setOptionIds([...remaining, optionId]);
  }

  async function pay() {
    setPending(true);
    const response = await fetch("/api/v1/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        planId: plan.id,
        optionIds,
        addonIds,
        zoneId,
        scheduleId,
        deliveryDate: new Date(deliveryDate).toISOString(),
        address,
        couponCode: couponCode || null,
        paymentProvider: provider,
      }),
    });
    const payload = await response.json();
    setPending(false);
    if (response.status === 401) {
      router.push(`/login?next=/plans/${plan.slug}`);
      return;
    }
    if (!payload.success) {
      toast.error(payload.error?.message || "Checkout failed.");
      return;
    }
    setConfirmation({ number: payload.data.order?.number });
    setStep(8);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <ol className="flex gap-2 overflow-x-auto pb-2 text-xs">
          {steps.map((label, index) => (
            <li key={label} className={`shrink-0 rounded-full px-3 py-1 ${index === step ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{index + 1}. {label}</li>
          ))}
        </ol>
        <div className="mt-6 rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
          {step === 0 ? (
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-4xl">{plan.categoryName || "Subscription"}</h1>
              <p className="mt-3 text-muted-foreground">This goal comes from the catalog. Other businesses would show their own categories here.</p>
              <Link href="/plans" className="mt-4 inline-block text-sm underline">Choose a different goal</Link>
            </div>
          ) : null}
          {step === 1 ? (
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-4xl">{plan.name}</h1>
              <p className="mt-3 text-muted-foreground">{plan.description}</p>
              <p className="mt-4 text-sm">{plan.subscriptionTypeName}. Pause, skip, and cancellation follow the rules saved on this plan.</p>
            </div>
          ) : null}
          {step === 2 && durationGroup ? <OptionStep group={durationGroup} selected={optionIds} onChoose={choose} /> : null}
          {step === 3 ? (
            <div className="space-y-6">
              {otherGroups.map((group) => <OptionStep key={group.id} group={group} selected={optionIds} onChoose={choose} />)}
              <div>
                <h2 className="font-medium">Add-ons</h2>
                <div className="mt-3 space-y-2">
                  {addons.filter((addon) => addon.available).map((addon) => (
                    <label key={addon.id} className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3">
                      <span>{addon.name}</span>
                      <span className="flex items-center gap-3">{formatMoney(addon.priceCents)}<input type="checkbox" checked={addonIds.includes(addon.id)} onChange={() => setAddonIds((current) => current.includes(addon.id) ? current.filter((id) => id !== addon.id) : [...current, addon.id])} /></span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {step === 4 ? (
            <div className="space-y-4">
              <label className="block text-sm">Zone<select className="mt-1 h-12 w-full rounded-xl border bg-background px-3" value={zoneId} onChange={(event) => { setZoneId(event.target.value); const next = zones.find((item) => item.id === event.target.value); setScheduleId(next?.schedules[0]?.id ?? ""); }}>{zones.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatMoney(item.feeCents)}</option>)}</select></label>
              <label className="block text-sm">Window<select className="mt-1 h-12 w-full rounded-xl border bg-background px-3" value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}>{zone?.schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{dayName(schedule.dayOfWeek)} {schedule.windowStart}–{schedule.windowEnd}, cutoff {schedule.cutoffTime} previous day</option>)}</select></label>
              <label className="block text-sm">Date<input className="mt-1 h-12 w-full rounded-xl border bg-background px-3" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
            </div>
          ) : null}
          {step === 5 ? (
            <div className="grid gap-3">
              {["label", "line1", "city", "region", "postalCode"].map((field) => (
                <label key={field} className="text-sm capitalize">{field}
                  <input className="mt-1 h-12 w-full rounded-xl border bg-background px-3" value={address[field as keyof typeof address]} onChange={(event) => setAddress({ ...address, [field]: event.target.value })} />
                </label>
              ))}
            </div>
          ) : null}
          {step === 6 ? (
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-3xl">Review</h2>
              <label className="mt-4 block text-sm">Coupon
                <input className="mt-1 h-12 w-full rounded-xl border bg-background px-3" value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="WELCOME10" />
              </label>
              {quote.error ? <p className="mt-3 text-sm text-destructive">{quote.error.message}</p> : null}
            </div>
          ) : null}
          {step === 7 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">The demo card provider captures payment immediately and writes a real payment record. Cash on delivery leaves the payment pending.</p>
              {[["manual", "Demo card"], ["cod", "Cash on delivery"], ["bank_transfer", "Bank transfer"]].map(([value, label]) => (
                <label key={value} className="flex h-12 items-center gap-3 rounded-2xl bg-secondary px-4"><input type="radio" name="pay" checked={provider === value} onChange={() => setProvider(value)} />{label}</label>
              ))}
            </div>
          ) : null}
          {step === 8 ? (
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-4xl">You are in.</h2>
              <p className="mt-3">Order {confirmation?.number} is saved. Manage it from your account.</p>
              <Link href="/account" className="mt-6 inline-flex h-12 items-center rounded-full bg-primary px-5 text-primary-foreground">Go to account</Link>
            </div>
          ) : null}
          {step < 8 ? (
            <div className="mt-6 flex gap-3">
              {step > 0 ? <button className="h-12 rounded-full border px-5" type="button" onClick={() => setStep(step - 1)}>Back</button> : null}
              {step < 7 ? <button className="h-12 flex-1 rounded-full bg-primary text-primary-foreground" type="button" onClick={() => setStep(step + 1)}>Continue</button> : <button className="h-12 flex-1 rounded-full bg-primary text-primary-foreground disabled:opacity-60" type="button" disabled={pending || !address.line1} onClick={pay}>{pending ? "Saving…" : "Pay and subscribe"}</button>}
            </div>
          ) : null}
        </div>
      </div>
      <aside className="h-fit rounded-3xl bg-[#1c1915] p-5 text-[#f6f1e7] lg:sticky lg:top-24">
        <p className="text-sm text-[#f6f1e7]/70">Live total</p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-4xl">{total != null ? formatMoney(total, plan.currency) : "…"}</p>
        <ul className="mt-4 space-y-2 text-sm">
          {summary.map((line: { label: string; amountCents: number }) => (
            <li key={line.label} className="flex justify-between"><span>{line.label}</span><span>{formatMoney(line.amountCents, plan.currency)}</span></li>
          ))}
        </ul>
        {quote.data?.equivalents ? <p className="mt-4 text-xs text-[#f6f1e7]/70">About {formatMoney(quote.data.equivalents.dailyCents)} a day</p> : null}
      </aside>
    </div>
  );
}

function OptionStep({ group, selected, onChoose }: { group: PlanDTO["groups"][number]; selected: string[]; onChoose: (groupId: string, optionId: string) => void }) {
  return (
    <fieldset>
      <legend className="font-medium">{group.name}</legend>
      <p className="mt-1 text-sm text-muted-foreground">{group.helpText}</p>
      <div className="mt-3 grid gap-2">
        {group.options.map((option) => (
          <label key={option.id} className="flex h-12 items-center justify-between rounded-2xl bg-secondary px-4">
            <span className="flex items-center gap-3"><input type="radio" name={group.id} checked={selected.includes(option.id)} onChange={() => onChoose(group.id, option.id)} />{option.label}</span>
            <span>{option.priceDeltaCents ? formatMoney(option.priceDeltaCents) : "Included"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function dayName(day: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] ?? "Day";
}
