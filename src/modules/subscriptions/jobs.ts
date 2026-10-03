import { materializeDueDeliveries } from "@/modules/delivery/materialize";
import { billing } from "@/repositories/billing";
import { settleRenewal } from "./subscription-service";

export async function runDueRenewals(now = new Date()) {
  const due = await billing.dueRenewals(now);
  let renewed = 0;
  let pastDue = 0;
  for (const subscription of due) {
    try {
      const saved = await settleRenewal({ id: subscription.id, now });
      if (saved?.status === "PAST_DUE") pastDue += 1;
      else if (saved && saved.periodEnd !== subscription.periodEnd) renewed += 1;
    } catch (error) {
      console.error("Renewal failed", subscription.number, error instanceof Error ? error.message : "error");
    }
  }
  return { considered: due.length, renewed, pastDue };
}

export async function runSubscriptionMaintenance(now = new Date()) {
  const renewals = await runDueRenewals(now);
  const deliveries = await materializeDueDeliveries(now);
  return { renewals, deliveries };
}

export function startSubscriptionJobs() {
  const holder = globalThis as typeof globalThis & { __boxsSubscriptionJobs?: boolean };
  if (holder.__boxsSubscriptionJobs) return;
  holder.__boxsSubscriptionJobs = true;
  const tick = () => {
    void runSubscriptionMaintenance().catch((error) => {
      console.error("Subscription maintenance failed", error instanceof Error ? error.message : "error");
    });
  };
  setTimeout(tick, 15_000);
  setInterval(tick, 60_000);
}
