import { billing } from "@/repositories/billing";
import { nextProgramDelivery } from "./next-delivery";

export async function materializeDueDeliveries(now = new Date()) {
  const programs = await billing.deliveryPrograms();
  let created = 0;
  for (const program of programs) {
    const next = nextProgramDelivery({
      status: program.status,
      deliveryDates: program.deliveryDates,
      remainingDeliveries: program.remainingDeliveries,
      intervalUnit: program.intervalUnit,
      intervalCount: program.intervalCount,
      periodStart: program.periodStart,
      now,
      deliveryDays: program.deliveryDays,
    });
    if (!next || !program.zoneId || !program.windowLabel) continue;
    const saved = await billing.createFollowUpDelivery({
      subscriptionId: program.id,
      customerId: program.customerId,
      currency: program.currency,
      deliveryDate: next,
      zoneId: program.zoneId,
      scheduleId: program.scheduleId,
      windowLabel: program.windowLabel,
      addressSnapshot: program.addressSnapshot,
    });
    if (saved.created) created += 1;
  }
  return { created };
}
