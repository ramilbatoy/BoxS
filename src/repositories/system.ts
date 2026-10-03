import { createHash, randomBytes } from "node:crypto";
import { Prisma, type NotificationChannel, type RecordStatus } from "@/generated/prisma/client";
import { prisma } from "@/database/client";
import { visibleNotificationChannels } from "@/lib/notification-channels";
import type { ListQuery } from "@/types/domain";
import { iso, like, paging } from "./helpers";

export const system = {
  async settings() {
    return prisma.setting.findMany({ orderBy: [{ group: "asc" }, { key: "asc" }] });
  },
  async updateSettings(entries: { key: string; value: string }[]) {
    for (const entry of entries) {
      await prisma.setting.update({ where: { key: entry.key }, data: { value: entry.value } });
    }
  },
  async flags() {
    return prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  },
  async flag(key: string) {
    const flag = await prisma.featureFlag.findUnique({ where: { key } });
    return flag?.enabled ?? false;
  },
  async updateFlags(entries: { key: string; enabled: boolean }[]) {
    for (const entry of entries) {
      await prisma.featureFlag.update({ where: { key: entry.key }, data: { enabled: entry.enabled } });
    }
  },
  async audit(query: ListQuery = {}) {
    const page = paging(query);
    const where: Prisma.AuditLogWhereInput = like(query.q)
      ? { OR: [{ action: like(query.q) }, { module: like(query.q) }, { recordLabel: like(query.q) }] }
      : {};
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take }),
      prisma.auditLog.count({ where }),
    ]);
    return {
      ...page,
      total,
      items: rows.map((row) => ({
        id: row.id,
        actorName: row.actor?.name ?? "System",
        action: row.action,
        module: row.module,
        recordId: row.recordId,
        recordLabel: row.recordLabel,
        oldValue: row.oldValue,
        newValue: row.newValue,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },
  async writeAudit(input: { actorId?: string; action: string; module: string; recordId?: string; recordLabel?: string; oldValue?: unknown; newValue?: unknown; ip?: string }) {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        module: input.module,
        recordId: input.recordId,
        recordLabel: input.recordLabel,
        oldValue: input.oldValue as Prisma.InputJsonValue,
        newValue: input.newValue as Prisma.InputJsonValue,
        ip: input.ip,
      },
    });
  },
  async users(query: ListQuery = {}) {
    const page = paging(query);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(like(query.q) ? { OR: [{ name: like(query.q) }, { email: like(query.q) }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, include: { role: true }, orderBy: { name: "asc" }, skip: page.skip, take: page.take }),
      prisma.user.count({ where }),
    ]);
    return {
      ...page,
      total,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        role: row.role.name,
        roleId: row.roleId,
        roleSlug: row.role.slug,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },
  async userByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { role: { include: { permissions: { include: { permission: true } } } }, profile: true },
    });
  },
  async createUser(input: { name: string; email: string; phone?: string; passwordHash: string; roleId: string; withProfile?: boolean }) {
    return prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone,
        passwordHash: input.passwordHash,
        roleId: input.roleId,
        profile: input.withProfile ? { create: {} } : undefined,
      },
    });
  },
  async updateUser(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  },
  async roles() {
    const rows = await prisma.role.findMany({ include: { permissions: true, _count: { select: { users: true } } }, orderBy: { name: "asc" } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isSystem: row.isSystem,
      userCount: row._count.users,
      permissionIds: row.permissions.map((item) => item.permissionId),
    }));
  },
  async permissions() {
    return prisma.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] });
  },
  async saveRole(input: { name: string; description: string; slug: string; permissionIds: string[] }, id?: string) {
    if (id) {
      await prisma.rolePermission.deleteMany({ where: { roleId: id } });
      return prisma.role.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          permissions: { create: input.permissionIds.map((permissionId) => ({ permissionId })) },
        },
      });
    }
    return prisma.role.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        permissions: { create: input.permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
  },
  async roleBySlug(slug: string) {
    return prisma.role.findUnique({ where: { slug } });
  },
  async pages() {
    return prisma.page.findMany({ where: { deletedAt: null }, include: { blocks: { orderBy: { sortOrder: "asc" } } }, orderBy: { title: "asc" } });
  },
  async page(slug: string) {
    return prisma.page.findFirst({ where: { slug, deletedAt: null }, include: { blocks: { orderBy: { sortOrder: "asc" } } } });
  },
  async savePage(input: { title: string; slug: string; body: string; status?: string; seoTitle?: string; seoDescription?: string }, id?: string) {
    const data = {
      title: input.title,
      slug: input.slug,
      body: input.body,
      status: (input.status ?? "ACTIVE") as RecordStatus,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
    };
    return id ? prisma.page.update({ where: { id }, data }) : prisma.page.create({ data });
  },
  async faqs() {
    return prisma.faq.findMany({ orderBy: { sortOrder: "asc" } });
  },
  async saveFaq(input: { question: string; answer: string; sortOrder?: number; published?: boolean }, id?: string) {
    const data = { question: input.question, answer: input.answer, sortOrder: input.sortOrder ?? 0, published: input.published ?? true };
    return id ? prisma.faq.update({ where: { id }, data }) : prisma.faq.create({ data });
  },
  async removeFaq(id: string) {
    await prisma.faq.delete({ where: { id } });
  },
  async menus() {
    return prisma.menu.findMany({ include: { items: { orderBy: { sortOrder: "asc" } } } });
  },
  async replaceMenuItems(menuId: string, items: { label: string; href: string; sortOrder: number }[]) {
    await prisma.menuItem.deleteMany({ where: { menuId } });
    await prisma.menuItem.createMany({ data: items.map((item) => ({ ...item, menuId })) });
  },
  async media(query: ListQuery = {}) {
    const page = paging(query);
    const where: Prisma.MediaWhereInput = like(query.q) ? { OR: [{ filename: like(query.q) }, { alt: like(query.q) }] } : {};
    const [rows, total] = await Promise.all([
      prisma.media.findMany({ where, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take }),
      prisma.media.count({ where }),
    ]);
    return { ...page, total, items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  },
  async addMedia(input: { filename: string; url: string; mime: string; size: number; alt?: string; caption?: string; createdById?: string }) {
    return prisma.media.create({ data: input });
  },
  async removeMedia(id: string) {
    return prisma.media.delete({ where: { id } });
  },
  async notifications(userId: string) {
    const rows = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), readAt: iso(row.readAt) }));
  },
  async markNotification(id: string, userId: string) {
    await prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
  },
  async notify(userId: string, templateKey: string, title: string, body: string) {
    const allowed = visibleNotificationChannels();
    const templates = await prisma.notificationTemplate.findMany({ where: { key: templateKey } });
    const enabled = templates.filter((template) => template.enabled && allowed.has(template.channel));
    const channels: NotificationChannel[] = enabled.length ? enabled.map((template) => template.channel) : ["IN_APP"];
    for (const channel of channels) {
      await prisma.notification.create({ data: { userId, channel, templateKey, title, body } });
    }
  },
  async templates() {
    const allowed = visibleNotificationChannels();
    const rows = await prisma.notificationTemplate.findMany({ orderBy: [{ key: "asc" }, { channel: "asc" }] });
    return rows.filter((row) => allowed.has(row.channel));
  },
  async setTemplate(id: string, enabled: boolean) {
    return prisma.notificationTemplate.update({ where: { id }, data: { enabled } });
  },
  async search(q: string) {
    const term = like(q);
    if (!term) return { customers: [], orders: [], subscriptions: [], plans: [], products: [], coupons: [] };
    const [customers, orders, subscriptions, plans, products, coupons] = await Promise.all([
      prisma.user.findMany({ where: { deletedAt: null, OR: [{ name: term }, { email: term }] }, take: 5, select: { id: true, name: true, email: true } }),
      prisma.order.findMany({ where: { OR: [{ number: term }, { customer: { user: { name: term } } }] }, take: 5, select: { id: true, number: true } }),
      prisma.subscription.findMany({ where: { OR: [{ number: term }, { customer: { user: { name: term } } }] }, take: 5, select: { id: true, number: true } }),
      prisma.plan.findMany({ where: { deletedAt: null, name: term }, take: 5, select: { id: true, name: true, slug: true } }),
      prisma.product.findMany({ where: { deletedAt: null, name: term }, take: 5, select: { id: true, name: true } }),
      prisma.coupon.findMany({ where: { deletedAt: null, code: term }, take: 5, select: { id: true, code: true, name: true } }),
    ]);
    return { customers, orders, subscriptions, plans, products, coupons };
  },
  async overview(from: Date, to: Date) {
    const [revenue, active, created, orders, customers, failed, cancellations, upcoming, recentOrders, activity, payments] = await Promise.all([
      prisma.payment.aggregate({ _sum: { amountCents: true }, where: { status: "CAPTURED", createdAt: { gte: from, lte: to } } }),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.order.count({ where: { placedAt: { gte: from, lte: to } } }),
      prisma.user.count({ where: { createdAt: { gte: from, lte: to }, role: { slug: "customer" } } }),
      prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: from, lte: to } } }),
      prisma.subscription.count({ where: { status: "CANCELLED", cancelledAt: { gte: from, lte: to } } }),
      prisma.deliveryAssignment.count({ where: { deliveryDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 864e5) }, status: { notIn: ["CANCELLED", "DELIVERED", "REFUNDED"] } } }),
      prisma.order.findMany({ orderBy: { placedAt: "desc" }, take: 6, include: { customer: { include: { user: true } } } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { actor: true } }),
      prisma.payment.findMany({ where: { status: "CAPTURED", createdAt: { gte: from, lte: to } }, select: { amountCents: true, createdAt: true } }),
    ]);
    const popular = await prisma.subscription.groupBy({ by: ["planId"], _count: { _all: true }, orderBy: { _count: { planId: "desc" } }, take: 5 });
    const planNames = await prisma.plan.findMany({ where: { id: { in: popular.map((row) => row.planId) } }, select: { id: true, name: true } });
    const buckets = new Map<string, number>();
    for (const payment of payments) {
      const key = payment.createdAt.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + payment.amountCents);
    }
    return {
      revenueCents: revenue._sum.amountCents ?? 0,
      activeSubscriptions: active,
      newSubscriptions: created,
      orders,
      newCustomers: customers,
      failedPayments: failed,
      cancellations,
      upcomingDeliveries: upcoming,
      popularPlans: popular.map((row) => ({ name: planNames.find((plan) => plan.id === row.planId)?.name ?? "Plan", subscribers: row._count._all })),
      recentOrders: recentOrders.map((order) => ({ id: order.id, number: order.number, customer: order.customer.user.name, totalCents: order.totalCents, status: order.status, placedAt: order.placedAt.toISOString() })),
      activity: activity.map((item) => ({ id: item.id, actor: item.actor?.name ?? "System", action: item.action, label: item.recordLabel, createdAt: item.createdAt.toISOString() })),
      series: [...buckets.entries()].map(([date, amountCents]) => ({ date, amountCents })),
    };
  },
  async webhookExists(provider: string, eventId: string) {
    const row = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider, eventId } } });
    return Boolean(row);
  },
  async saveWebhook(input: { provider: string; eventId: string; type: string; payload: unknown; status: string }) {
    await prisma.webhookEvent.create({ data: { ...input, payload: input.payload as Prisma.InputJsonValue } });
  },
  async webhooks() {
    const rows = await prisma.webhookEvent.findMany({ orderBy: { processedAt: "desc" }, take: 50 });
    return rows.map((row) => ({ ...row, processedAt: row.processedAt.toISOString() }));
  },
  async apiKeys() {
    const rows = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map((row) => ({ id: row.id, name: row.name, prefix: row.prefix, lastUsedAt: iso(row.lastUsedAt), revokedAt: iso(row.revokedAt), createdAt: row.createdAt.toISOString() }));
  },
  async createApiKey(name: string, createdById?: string) {
    const secret = `bx_${randomBytes(24).toString("hex")}`;
    const prefix = secret.slice(0, 10);
    await prisma.apiKey.create({ data: { name, prefix, keyHash: createHash("sha256").update(secret).digest("hex"), createdById } });
    return { prefix, secret };
  },
  async revokeApiKey(id: string) {
    await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  },
  async contact(input: { name: string; email: string; phone?: string; message: string }) {
    return prisma.contactMessage.create({ data: input });
  },
  async contacts() {
    return prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  },
};
