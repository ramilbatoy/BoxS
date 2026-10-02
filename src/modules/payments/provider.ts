export type PaymentIntent = {
  amountCents: number;
  currency: string;
  customerId: string;
  orderNumber: string;
  description: string;
};

export type ProviderPayment = {
  provider: string;
  status: "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED" | "CANCELLED";
  externalId: string;
  amountCents: number;
  failureReason?: string;
};

export interface PaymentProvider {
  key: string;
  label: string;
  createPayment(intent: PaymentIntent): Promise<ProviderPayment>;
  authorizePayment(externalId: string, amountCents: number): Promise<ProviderPayment>;
  capturePayment(externalId: string, amountCents: number): Promise<ProviderPayment>;
  refundPayment(externalId: string, amountCents: number): Promise<ProviderPayment>;
  getPaymentStatus(externalId: string): Promise<ProviderPayment["status"]>;
  createRecurringPayment(intent: PaymentIntent): Promise<ProviderPayment>;
  cancelRecurringPayment(externalId: string): Promise<ProviderPayment>;
}

const registry = new Map<string, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider) {
  registry.set(provider.key, provider);
}

export function getPaymentProvider(key: string) {
  const provider = registry.get(key);
  if (!provider) {
    throw new Error(`Payment provider "${key}" is not registered.`);
  }
  return provider;
}

export function listPaymentProviders() {
  return [...registry.values()].map((provider) => ({ key: provider.key, label: provider.label }));
}
