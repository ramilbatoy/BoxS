export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSubscriptionJobs } = await import("@/modules/subscriptions/jobs");
  startSubscriptionJobs();
}
