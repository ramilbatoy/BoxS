import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookInput = {
  provider: string;
  eventId: string;
  type: string;
  payload: unknown;
  signature: string | null;
  secret: string;
};

export type WebhookStore = {
  has(provider: string, eventId: string): Promise<boolean> | boolean;
  save(event: { provider: string; eventId: string; type: string; payload: unknown }): Promise<void> | void;
};

export function signWebhook(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhookSignature(secret: string, body: string, signature: string | null) {
  if (!signature) return false;
  const expected = signWebhook(secret, body);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function processWebhook(store: WebhookStore, input: WebhookInput, rawBody: string) {
  if (!verifyWebhookSignature(input.secret, rawBody, input.signature)) {
    return { ok: false as const, code: "INVALID_SIGNATURE", duplicate: false };
  }
  if (await store.has(input.provider, input.eventId)) {
    return { ok: true as const, duplicate: true, type: input.type };
  }
  await store.save({
    provider: input.provider,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
  });
  return { ok: true as const, duplicate: false, type: input.type };
}
