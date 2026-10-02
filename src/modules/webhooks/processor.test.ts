import { describe, expect, it } from "vitest";
import { processWebhook, signWebhook } from "./processor";

describe("webhooks", () => {
  it("processes an event once and ignores the duplicate", async () => {
    const seen = new Set<string>();
    const store = {
      has(provider: string, eventId: string) {
        return seen.has(`${provider}:${eventId}`);
      },
      save(event: { provider: string; eventId: string }) {
        seen.add(`${event.provider}:${event.eventId}`);
      },
    };
    const body = JSON.stringify({ eventId: "evt_1", type: "payment.succeeded" });
    const secret = "test-secret";
    const input = {
      provider: "manual",
      eventId: "evt_1",
      type: "payment.succeeded",
      payload: { ok: true },
      signature: signWebhook(secret, body),
      secret,
    };
    const first = await processWebhook(store, input, body);
    const second = await processWebhook(store, input, body);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(seen.size).toBe(1);
  });

  it("rejects a bad signature", async () => {
    const result = await processWebhook(
      { has: () => false, save: () => undefined },
      {
        provider: "manual",
        eventId: "evt_2",
        type: "payment.failed",
        payload: {},
        signature: "nope",
        secret: "test-secret",
      },
      "{}",
    );
    expect(result.ok).toBe(false);
  });
});
