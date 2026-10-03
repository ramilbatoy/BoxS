import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { toCsv, parseCsv } from "@/lib/csv";
import { can } from "@/modules/auth/permissions";
import { checkout, quoteSubscription } from "@/modules/checkout/checkout-service";
import { runSubscriptionMaintenance } from "@/modules/subscriptions/jobs";
import { actOnSubscription, publishPlan } from "@/modules/subscriptions/subscription-service";
import { processWebhook } from "@/modules/webhooks/processor";
import { billing } from "@/repositories/billing";
import { catalog } from "@/repositories/catalog";
import { plans } from "@/repositories/plans";
import { system } from "@/repositories/system";
import type { PlanWrite } from "@/types/domain";
import { pesosToCents } from "@/lib/money";

type SessionUser = { id: string; role: string; permissions: string[]; email?: string | null; name?: string | null };

const STAFF_ONLY_SUBSCRIPTION_ACTIONS = new Set(["renew"]);

const EXPORT_PERMISSIONS: Record<string, string> = {
  customers: "customers.view",
  orders: "orders.view",
  subscriptions: "subscriptions.view",
  products: "products.view",
  plans: "plans.view",
};

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

function fail(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, { status: 500 });
}

async function currentUser() {
  const session = await auth();
  return (session?.user as SessionUser | undefined) ?? null;
}

function requireUser(user: SessionUser | null): SessionUser {
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
  return user;
}

function requirePermission(user: SessionUser | null, key: string) {
  const current = requireUser(user);
  if (!can(current.permissions, key, current.role)) {
    throw new AppError("FORBIDDEN", "You do not have permission to do that.", 403);
  }
  return current;
}

function range(search: URLSearchParams) {
  const preset = search.get("range") ?? "30d";
  const now = new Date();
  const to = search.get("to") ? new Date(search.get("to")!) : now;
  if (preset === "today") return { from: new Date(now.toISOString().slice(0, 10)), to };
  if (preset === "7d") return { from: new Date(now.getTime() - 7 * 864e5), to };
  if (preset === "90d") return { from: new Date(now.getTime() - 90 * 864e5), to };
  if (preset === "year") return { from: new Date(now.getFullYear(), 0, 1), to };
  if (preset === "custom" && search.get("from")) return { from: new Date(search.get("from")!), to };
  return { from: new Date(now.getTime() - 30 * 864e5), to };
}

export async function handleApi(method: string, request: Request, slug: string[] = []) {
  try {
    const url = new URL(request.url);
    const user = await currentUser();
    const [resource, id, extra] = slug;
    const query = Object.fromEntries(url.searchParams.entries());
    const body = method === "GET" || method === "DELETE" ? {} : await request.json().catch(() => ({}));

    if (resource === "health") return ok({ ok: true });
    if (resource === "pricing" && id === "quote" && method === "POST") return ok(await quoteSubscription(body));
    if (resource === "plans" && method === "GET" && !id) return ok(await plans.list(query, query.published === "1"));
    if (resource === "plans" && id === "slug" && extra && method === "GET") {
      const plan = await plans.bySlug(extra);
      if (!plan) throw new AppError("PLAN_NOT_FOUND", "The selected plan could not be found.", 404);
      return ok(plan);
    }
    if (resource === "plans" && method === "POST" && !id) {
      requirePermission(user, "plans.create");
      return ok(await plans.save(body as PlanWrite), 201);
    }
    if (resource === "plans" && id === "bulk" && method === "POST") {
      requirePermission(user, "plans.edit");
      return ok({ count: await plans.bulk(body.ids ?? [], body.action, body.categoryId) });
    }
    if (resource === "plans" && id && extra === "publish" && method === "POST") {
      const actor = requirePermission(user, "plans.edit");
      return ok(await publishPlan(id, actor.id));
    }
    if (resource === "plans" && id && method === "GET") {
      const plan = await plans.get(id);
      if (!plan) throw new AppError("PLAN_NOT_FOUND", "The selected plan could not be found.", 404);
      return ok(plan);
    }
    if (resource === "plans" && id && method === "PATCH") {
      requirePermission(user, "plans.edit");
      return ok(await plans.save(body as PlanWrite, id));
    }
    if (resource === "plans" && id && method === "DELETE") {
      requirePermission(user, "plans.delete");
      await plans.remove(id);
      return ok({ deleted: true });
    }

    if (resource === "categories" && method === "GET") return ok(await catalog.categories(query));
    if (resource === "categories" && method === "POST") {
      requirePermission(user, "products.create");
      return ok(await catalog.saveCategory(body), 201);
    }
    if (resource === "categories" && id && method === "PATCH") {
      requirePermission(user, "products.edit");
      return ok(await catalog.saveCategory(body, id));
    }
    if (resource === "categories" && id && method === "DELETE") {
      requirePermission(user, "products.delete");
      await catalog.removeCategory(id);
      return ok({ deleted: true });
    }

    if (resource === "products" && method === "GET" && !id) return ok(await catalog.products(query));
    if (resource === "products" && id === "import" && method === "POST") {
      requirePermission(user, "products.create");
      const parsed = parseCsv(String(body.csv ?? ""));
      const errors: string[] = [];
      let created = 0;
      for (const entry of parsed) {
        if (!entry.row.name || !entry.row.categoryId || !entry.row.price) {
          errors.push(`Line ${entry.line}: name, categoryId, and price are required.`);
          continue;
        }
        await catalog.saveProduct({
          name: entry.row.name,
          description: entry.row.description || entry.row.name,
          categoryId: entry.row.categoryId,
          kind: entry.row.kind || "PHYSICAL",
          basePriceCents: pesosToCents(Number(entry.row.price)),
        });
        created += 1;
      }
      return ok({ created, errors });
    }
    if (resource === "products" && method === "POST") {
      requirePermission(user, "products.create");
      return ok(await catalog.saveProduct(body), 201);
    }
    if (resource === "products" && id && method === "GET") return ok(await catalog.product(id));
    if (resource === "products" && id && method === "PATCH") {
      requirePermission(user, "products.edit");
      return ok(await catalog.saveProduct(body, id));
    }
    if (resource === "products" && id && method === "DELETE") {
      requirePermission(user, "products.delete");
      await catalog.removeProduct(id);
      return ok({ deleted: true });
    }

    if (resource === "addons" && method === "GET") return ok(await catalog.addons(query));
    if (resource === "addons" && method === "POST") {
      requirePermission(user, "products.create");
      return ok(await catalog.saveAddon(body), 201);
    }
    if (resource === "addons" && id && method === "PATCH") {
      requirePermission(user, "products.edit");
      return ok(await catalog.saveAddon(body, id));
    }
    if (resource === "addons" && id && method === "DELETE") {
      requirePermission(user, "products.delete");
      await catalog.removeAddon(id);
      return ok({ deleted: true });
    }
    if (resource === "subscription-types" && method === "GET") {
      requirePermission(user, "plans.view");
      return ok(await catalog.subscriptionTypes());
    }
    if (resource === "subscription-types" && method === "POST") {
      requirePermission(user, "plans.create");
      return ok(await catalog.saveSubscriptionType(body), 201);
    }

    if (resource === "checkout" && method === "POST") {
      const actor = requireUser(user);
      return ok(await checkout({ ...body, userId: actor.id, idempotencyKey: request.headers.get("idempotency-key") }));
    }

    if (resource === "customers" && method === "GET" && !id) {
      requirePermission(user, "customers.view");
      return ok(await billing.customers(query));
    }
    if (resource === "customers" && id === "bulk" && method === "POST") {
      requirePermission(user, "customers.edit");
      for (const userId of body.ids ?? []) {
        await system.updateUser(userId, { status: body.action === "suspend" ? "SUSPENDED" : "ACTIVE" });
      }
      return ok({ count: (body.ids ?? []).length });
    }

    if (resource === "jobs" && id === "renewals" && method === "POST") {
      requirePermission(user, "subscriptions.edit");
      return ok(await runSubscriptionMaintenance());
    }
    if (resource === "subscriptions" && method === "GET" && !id) {
      const actor = requireUser(user);
      const scoped = can(actor.permissions, "subscriptions.view", actor.role) ? query : { ...query, userId: actor.id };
      return ok(await billing.subscriptions(scoped));
    }
    if (resource === "subscriptions" && id && extra === "actions" && method === "POST") {
      const actor = requireUser(user);
      const subscription = await billing.subscription(id);
      if (!subscription) throw new AppError("SUBSCRIPTION_NOT_FOUND", "That subscription could not be found.", 404);
      const staff = can(actor.permissions, "subscriptions.edit", actor.role);
      if (!staff && subscription.userId !== actor.id) throw new AppError("FORBIDDEN", "You do not have permission to do that.", 403);
      // Renewal moves the paid period forward and charges the provider, so it is a staff action.
      if (!staff && STAFF_ONLY_SUBSCRIPTION_ACTIONS.has(String(body.action))) {
        throw new AppError("FORBIDDEN", "You do not have permission to do that.", 403);
      }
      return ok(await actOnSubscription({ ...body, id, actorId: actor.id }));
    }
    if (resource === "subscriptions" && id && method === "GET") {
      const actor = requireUser(user);
      const subscription = await billing.subscription(id);
      if (!subscription) throw new AppError("SUBSCRIPTION_NOT_FOUND", "That subscription could not be found.", 404);
      if (subscription.userId !== actor.id && !can(actor.permissions, "subscriptions.view", actor.role)) {
        throw new AppError("FORBIDDEN", "You do not have permission to do that.", 403);
      }
      return ok(subscription);
    }

    if (resource === "orders" && method === "GET" && !id) {
      const actor = requireUser(user);
      if (can(actor.permissions, "orders.view", actor.role)) return ok(await billing.orders(query));
      const customer = await billing.customerByUser(actor.id);
      return ok(await billing.orders({ ...query, customerId: customer?.id }));
    }
    if (resource === "orders" && id === "bulk" && method === "POST") {
      requirePermission(user, "orders.edit");
      const status = body.action === "confirm" ? "CONFIRMED" : body.action === "delivered" ? "DELIVERED" : body.action === "preparing" ? "PREPARING" : "CANCELLED";
      return ok({ count: await billing.setOrderStatus(body.ids ?? [], status) });
    }
    if (resource === "orders" && id && method === "GET") {
      const actor = requireUser(user);
      const order = await billing.order(id);
      if (!order) throw new AppError("ORDER_NOT_FOUND", "That order could not be found.", 404);
      if (!can(actor.permissions, "orders.view", actor.role)) {
        const customer = await billing.customerByUser(actor.id);
        if (!customer || order.customerId !== customer.id) {
          throw new AppError("FORBIDDEN", "You do not have permission to do that.", 403);
        }
      }
      return ok(order);
    }
    if (resource === "orders" && id && method === "PATCH") {
      requirePermission(user, "orders.edit");
      await billing.setOrderStatus([id], body.status);
      return ok(await billing.order(id));
    }

    if (resource === "payments" && method === "GET") {
      requirePermission(user, "payments.view");
      return ok(await billing.payments(query));
    }
    if (resource === "payments" && id && extra === "refund" && method === "POST") {
      requirePermission(user, "payments.refund");
      const payment = await billing.payment(id);
      if (!payment) throw new AppError("PAYMENT_NOT_FOUND", "That payment could not be found.", 404);
      await billing.markPayment(id, "REFUNDED", body.amountCents ?? payment.amountCents, "refund");
      if (payment.orderId) await billing.setOrderStatus([payment.orderId], "REFUNDED");
      return ok({ refunded: true });
    }

    if (resource === "delivery" && id === "zones" && method === "GET") return ok(await billing.zones());
    if (resource === "delivery" && id === "zones" && method === "POST") {
      requirePermission(user, "deliveries.edit");
      return ok(await billing.saveZone(body), 201);
    }
    if (resource === "delivery" && id === "zones" && extra && method === "PATCH") {
      requirePermission(user, "deliveries.edit");
      return ok(await billing.saveZone(body, extra));
    }
    if (resource === "delivery" && id === "schedules" && method === "POST") {
      requirePermission(user, "deliveries.edit");
      return ok(await billing.saveSchedule(body), 201);
    }
    if (resource === "deliveries" && method === "GET") {
      requirePermission(user, "deliveries.view");
      return ok(await billing.deliveries(query));
    }

    if (resource === "coupons" && method === "GET") {
      requirePermission(user, "coupons.view");
      return ok(await billing.coupons(query));
    }
    if (resource === "coupons" && method === "POST") {
      requirePermission(user, "coupons.edit");
      return ok(await billing.saveCoupon(body), 201);
    }
    if (resource === "coupons" && id && method === "PATCH") {
      requirePermission(user, "coupons.edit");
      return ok(await billing.saveCoupon(body, id));
    }

    if (resource === "register" && method === "POST") {
      const limit = rateLimit(`register:${body.email}`, 5, 60_000);
      if (!limit.ok) throw new AppError("RATE_LIMITED", "Too many attempts. Try again in a minute.", 429);
      const role = await system.roleBySlug("customer");
      if (!role) throw new AppError("ROLE_MISSING", "Customer registration is not configured.", 500);
      if (!body.email || !body.password || String(body.password).length < 8) {
        throw new AppError("INVALID_INPUT", "Use a valid email and a password of at least 8 characters.");
      }
      const existing = await system.userByEmail(String(body.email).toLowerCase());
      if (existing) throw new AppError("EMAIL_IN_USE", "An account with that email already exists.", 409);
      const created = await system.createUser({
        name: body.name,
        email: body.email,
        phone: body.phone,
        passwordHash: await bcrypt.hash(body.password, 12),
        roleId: role.id,
        withProfile: true,
      });
      await system.notify(created.id, "welcome", "Welcome to BoxS", "Your account is ready. Browse plans whenever you are.");
      return ok({ id: created.id }, 201);
    }

    if (resource === "account" && method === "GET") {
      const actor = requireUser(user);
      const customer = await billing.customerByUser(actor.id);
      return ok({ user: actor, customer, notifications: await system.notifications(actor.id) });
    }
    if (resource === "account" && method === "PATCH") {
      const actor = requireUser(user);
      await system.updateUser(actor.id, { name: body.name, phone: body.phone });
      if (body.password) {
        if (String(body.password).length < 8) throw new AppError("INVALID_INPUT", "Password must be at least 8 characters.");
        await system.updateUser(actor.id, { passwordHash: await bcrypt.hash(body.password, 12) });
      }
      return ok({ updated: true });
    }
    if (resource === "account" && id === "addresses" && method === "GET") {
      const actor = requireUser(user);
      const customer = await billing.customerByUser(actor.id);
      if (!customer) throw new AppError("INVALID_CUSTOMER", "Customer profile not found.", 404);
      return ok(await billing.addresses(customer.id));
    }
    if (resource === "account" && id === "addresses" && method === "POST") {
      const actor = requireUser(user);
      const customer = await billing.customerByUser(actor.id);
      if (!customer) throw new AppError("INVALID_CUSTOMER", "Customer profile not found.", 404);
      return ok(await billing.saveAddress(customer.id, body), 201);
    }
    if (resource === "account" && id === "addresses" && extra && method === "DELETE") {
      const actor = requireUser(user);
      const customer = await billing.customerByUser(actor.id);
      if (!customer) throw new AppError("INVALID_CUSTOMER", "Customer profile not found.", 404);
      const owned = await billing.addresses(customer.id);
      if (!owned.some((address) => address.id === extra)) {
        throw new AppError("FORBIDDEN", "You do not have permission to do that.", 403);
      }
      await billing.removeAddress(extra);
      return ok({ deleted: true });
    }

    if (resource === "pages" && method === "GET") return ok(id ? await system.page(id) : await system.pages());
    if (resource === "pages" && method === "POST") {
      requirePermission(user, "content.edit");
      return ok(await system.savePage(body), 201);
    }
    if (resource === "pages" && id && method === "PATCH") {
      requirePermission(user, "content.edit");
      return ok(await system.savePage(body, id));
    }
    if (resource === "faqs" && method === "GET") return ok(await system.faqs());
    if (resource === "faqs" && method === "POST") {
      requirePermission(user, "content.edit");
      return ok(await system.saveFaq(body), 201);
    }
    if (resource === "faqs" && id && method === "PATCH") {
      requirePermission(user, "content.edit");
      return ok(await system.saveFaq(body, id));
    }
    if (resource === "faqs" && id && method === "DELETE") {
      requirePermission(user, "content.edit");
      await system.removeFaq(id);
      return ok({ deleted: true });
    }
    if (resource === "menus" && method === "GET") return ok(await system.menus());
    if (resource === "menus" && id && method === "PATCH") {
      requirePermission(user, "content.edit");
      await system.replaceMenuItems(id, body.items ?? []);
      return ok({ updated: true });
    }

    if (resource === "media" && method === "GET") return ok(await system.media(query));
    if (resource === "media" && method === "POST") {
      const actor = requirePermission(user, "media.edit");
      return ok(await system.addMedia({ ...body, createdById: actor.id }), 201);
    }
    if (resource === "media" && id && method === "DELETE") {
      requirePermission(user, "media.edit");
      await system.removeMedia(id);
      return ok({ deleted: true });
    }
    if (resource === "reports" && method === "GET") {
      requirePermission(user, "reports.view");
      const dates = range(url.searchParams);
      return ok(await system.overview(dates.from, dates.to));
    }
    if (resource === "search" && method === "GET") {
      requirePermission(user, "customers.view");
      return ok(await system.search(query.q ?? ""));
    }
    if (resource === "users" && method === "GET") {
      requirePermission(user, "users.view");
      return ok(await system.users(query));
    }
    if (resource === "users" && method === "POST") {
      requirePermission(user, "users.create");
      const created = await system.createUser({
        name: body.name,
        email: body.email,
        phone: body.phone,
        passwordHash: await bcrypt.hash(body.password || "ChangeMe123!", 12),
        roleId: body.roleId,
      });
      return ok({ id: created.id }, 201);
    }
    if (resource === "users" && id && method === "PATCH") {
      requirePermission(user, "users.edit");
      await system.updateUser(id, { name: body.name, status: body.status, role: body.roleId ? { connect: { id: body.roleId } } : undefined });
      return ok({ updated: true });
    }
    if (resource === "roles" && method === "GET") {
      requirePermission(user, "users.view");
      return ok(await system.roles());
    }
    if (resource === "roles" && method === "POST") {
      requirePermission(user, "users.create");
      return ok(await system.saveRole(body), 201);
    }
    if (resource === "roles" && id && method === "PATCH") {
      requirePermission(user, "users.edit");
      return ok(await system.saveRole(body, id));
    }
    if (resource === "permissions" && method === "GET") {
      requirePermission(user, "users.view");
      return ok(await system.permissions());
    }
    if (resource === "settings" && method === "GET") {
      requirePermission(user, "settings.manage");
      return ok(await system.settings());
    }
    if (resource === "settings" && method === "PATCH") {
      requirePermission(user, "settings.manage");
      await system.updateSettings(body.entries ?? []);
      return ok({ updated: true });
    }
    if (resource === "feature-flags" && method === "GET") {
      requirePermission(user, "settings.manage");
      return ok(await system.flags());
    }
    if (resource === "feature-flags" && method === "PATCH") {
      requirePermission(user, "settings.manage");
      await system.updateFlags(body.entries ?? []);
      return ok({ updated: true });
    }
    if (resource === "audit-logs" && method === "GET") {
      requirePermission(user, "audit.view");
      return ok(await system.audit(query));
    }
    if (resource === "notifications" && method === "GET" && !id) {
      const actor = requireUser(user);
      return ok(id ? await system.templates() : await system.notifications(actor.id));
    }
    if (resource === "notifications" && id === "templates" && method === "GET") {
      requirePermission(user, "notifications.manage");
      return ok(await system.templates());
    }
    if (resource === "notifications" && id === "templates" && method === "PATCH") {
      requirePermission(user, "notifications.manage");
      return ok(await system.setTemplate(body.id, body.enabled));
    }
    if (resource === "notifications" && id && method === "PATCH") {
      const actor = requireUser(user);
      await system.markNotification(id, actor.id);
      return ok({ read: true });
    }
    if (resource === "webhooks" && method === "GET") {
      requirePermission(user, "api.manage");
      return ok(await system.webhooks());
    }
    if (resource === "webhooks" && id && method === "POST") {
      const raw = JSON.stringify(body);
      const result = await processWebhook(
        { has: system.webhookExists, save: (event) => system.saveWebhook({ ...event, status: "PROCESSED" }) },
        {
          provider: id,
          eventId: String(body.eventId ?? ""),
          type: String(body.type ?? "unknown"),
          payload: body,
          signature: request.headers.get("x-webhook-signature"),
          secret: process.env.PAYMENT_SECRET || "",
        },
        raw,
      );
      if (!result.ok) throw new AppError(result.code, "Webhook signature could not be verified.", 401);
      return ok(result);
    }
    if (resource === "contact" && method === "POST") return ok(await system.contact(body), 201);
    if (resource === "exports" && id && method === "GET") {
      const permission = EXPORT_PERMISSIONS[id];
      if (!permission) throw new AppError("NOT_FOUND", "That API endpoint does not exist.", 404);
      requirePermission(user, permission);
      const rows =
        id === "customers" ? (await billing.customers({ pageSize: 100 })).items :
        id === "orders" ? (await billing.orders({ pageSize: 100 })).items :
        id === "subscriptions" ? (await billing.subscriptions({ pageSize: 100 })).items :
        id === "products" ? (await catalog.products({ pageSize: 100 })).items :
        (await plans.list({ pageSize: 100 })).items;
      return new NextResponse(toCsv(rows as Record<string, unknown>[]), {
        headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="${id}.csv"` },
      });
    }

    throw new AppError("NOT_FOUND", "That API endpoint does not exist.", 404);
  } catch (error) {
    return fail(error);
  }
}
