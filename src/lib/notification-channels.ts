const UNCONFIGURED = new Set(["", "console", "none", "off"]);

export function isNotificationProviderConfigured(value: string | undefined) {
  return !UNCONFIGURED.has((value ?? "").trim().toLowerCase());
}

export function visibleNotificationChannels(
  env: { NODE_ENV?: string; EMAIL_PROVIDER?: string; SMS_PROVIDER?: string } = process.env,
) {
  const channels = new Set<string>(["IN_APP"]);
  if (isNotificationProviderConfigured(env.EMAIL_PROVIDER)) channels.add("EMAIL");
  if (isNotificationProviderConfigured(env.SMS_PROVIDER)) channels.add("SMS");
  return channels;
}
