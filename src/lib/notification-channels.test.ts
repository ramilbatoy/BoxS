import { describe, expect, it } from "vitest";
import { visibleNotificationChannels } from "./notification-channels";

describe("notification channels", () => {
  it("keeps in-app notices and hides email and SMS until a provider is set", () => {
    expect([...visibleNotificationChannels({})]).toEqual(["IN_APP"]);
    expect([...visibleNotificationChannels({ EMAIL_PROVIDER: "console", SMS_PROVIDER: "console" })]).toEqual(["IN_APP"]);
    const configured = visibleNotificationChannels({ EMAIL_PROVIDER: "smtp", SMS_PROVIDER: "" });
    expect(configured.has("IN_APP")).toBe(true);
    expect(configured.has("EMAIL")).toBe(true);
    expect(configured.has("SMS")).toBe(false);
  });
});
