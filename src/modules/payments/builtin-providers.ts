import { createHash, randomUUID } from "node:crypto";
import {
  registerPaymentProvider,
  type PaymentIntent,
  type PaymentProvider,
  type ProviderPayment,
} from "./provider";

function memoryProvider(key: string, label: string, initial: ProviderPayment["status"]): PaymentProvider {
  const payments = new Map<string, ProviderPayment>();
  const make = (intent: PaymentIntent, status: ProviderPayment["status"]): ProviderPayment => {
    const payment = {
      provider: key,
      status,
      externalId: `${key}_${randomUUID()}`,
      amountCents: intent.amountCents,
    };
    payments.set(payment.externalId, payment);
    return payment;
  };
  return {
    key,
    label,
    async createPayment(intent) {
      return make(intent, initial);
    },
    async authorizePayment(externalId, amountCents) {
      const current = payments.get(externalId) ?? {
        provider: key,
        status: "AUTHORIZED" as const,
        externalId,
        amountCents,
      };
      current.status = "AUTHORIZED";
      payments.set(externalId, current);
      return current;
    },
    async capturePayment(externalId, amountCents) {
      const current = payments.get(externalId) ?? {
        provider: key,
        status: "CAPTURED" as const,
        externalId,
        amountCents,
      };
      current.status = "CAPTURED";
      current.amountCents = amountCents;
      payments.set(externalId, current);
      return current;
    },
    async refundPayment(externalId, amountCents) {
      const current = payments.get(externalId) ?? {
        provider: key,
        status: "REFUNDED" as const,
        externalId,
        amountCents,
      };
      current.status = "REFUNDED";
      current.amountCents = amountCents;
      payments.set(externalId, current);
      return current;
    },
    async getPaymentStatus(externalId) {
      return payments.get(externalId)?.status ?? "FAILED";
    },
    async createRecurringPayment(intent) {
      return make(intent, initial);
    },
    async cancelRecurringPayment(externalId) {
      const current = payments.get(externalId) ?? {
        provider: key,
        status: "CANCELLED" as const,
        externalId,
        amountCents: 0,
      };
      current.status = "CANCELLED";
      payments.set(externalId, current);
      return current;
    },
  };
}

let registered = false;

export function ensurePaymentProviders() {
  if (registered) return;
  registerPaymentProvider(memoryProvider("manual", "Card (demo capture)", "CAPTURED"));
  registerPaymentProvider(memoryProvider("cod", "Cash on delivery", "PENDING"));
  registerPaymentProvider(memoryProvider("bank_transfer", "Bank transfer", "PENDING"));
  registered = true;
}

export function hashApiKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
