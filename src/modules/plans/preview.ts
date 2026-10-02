import { calculatePrice, equivalentPrices } from "@/modules/pricing/pricing-service";
import type { PlanDTO } from "@/types/domain";

export function previewPlan(plan: PlanDTO) {
  const selected = plan.groups
    .map((group) => group.options.find((option) => option.isDefault) ?? group.options[0])
    .filter((option) => option != null);
  const variantDeltaCents = selected.reduce((sum, option) => sum + option.priceDeltaCents, 0);
  const price = calculatePrice({
    basePriceCents: plan.basePriceCents,
    variantDeltaCents,
    deliveryFeeCents: plan.deliveryFeeCents,
    discountCents: plan.discountCents,
    taxRateBps: plan.taxRateBps,
  });
  const days =
    selected.find((option) => option.durationDays)?.durationDays ??
    (plan.intervalUnit === "WEEK" ? plan.intervalCount * 7 : plan.intervalUnit === "MONTH" ? plan.intervalCount * 30 : plan.intervalCount);
  return { price, selected, days, ...equivalentPrices(price.totalCents, Math.max(1, days)) };
}
