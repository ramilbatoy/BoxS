import { Prisma, type OrderStatus, type PaymentStatus, type SubscriptionStatus } from "@/generated/prisma/client";
import { prisma } from "@/database/client";
import type { PriceBreakdown } from "@/modules/pricing/pricing-service";
import type { SubscriptionRules } from "@/modules/subscriptions/engine";
import type { ListQuery, Page } from "@/types/domain";
import { iso, like, paging } from "./helpers";

const subscriptionInclude = {
  customer: { include: { user: true } },
  plan: true,
  address: true,
  items: true,
  events: { orderBy: { createdAt: "desc" as const }, take: 30 },
} satisfies Prisma.SubscriptionInclude;

const orderInclude = {
  customer: { include: { user: true } },
  items: true,
  snapshot: true,
  payments: true,
  delivery: { include: { zone: true } },
  subscription: true,
} satisfies Prisma.OrderInclude;

export type SubscriptionDTO = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  userId: string;
  planId: string;
  planName: string;
  status: string;
  billingMode: "ONE_TIME" | "RECURRING";
  intervalUnit: "DAY" | "WEEK" | "MONTH";
  intervalCount: number;
  currency: string;
  priceCents: number;
  creditCents: number;
  periodStart: string;
  periodEnd: string;
  nextBillingAt: string | null;
  nextDeliveryAt: string | null;
  remainingDeliveries: number | null;
  addressId: string | null;
  addressLabel: string | null;
  rules: SubscriptionRules;
  startedAt: string;
  items: { id: string; kind: string; name: string; quantity: number; unitPriceCents: number }[];
  events: { id: string; type: string; message: string; createdAt: string }[];
};

export type OrderDTO = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  status: string;
  currency: string;
  subtotalCents: number;
  variantCents: number;
  addonCents: number;
  discountCents: number;
  couponCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  couponCode: string | null;
  notes: string | null;
  placedAt: string;
  subscriptionId: string | null;
  subscriptionNumber: string | null;
  address: unknown;
  items: { name: string; quantity: number; unitPriceCents: number; totalCents: number }[];
  payments: { id: string; provider: string; status: string; amountCents: number; externalId: string | null }[];
  delivery: { date: string; windowLabel: string; zoneName: string; status: string } | null;
  snapshot: unknown;
};

function mapSubscription(row: Prisma.SubscriptionGetPayload<{ include: typeof subscriptionInclude }>): SubscriptionDTO {
  return {
    id: row.id,
    number: row.number,
    customerId: row.customerId,
    customerName: row.customer.user.name,
    customerEmail: row.customer.user.email,
    userId: row.customer.userId,
    planId: row.planId,
    planName: row.plan.name,
    status: row.status,
    billingMode: row.billingMode,
    intervalUnit: row.intervalUnit,
    intervalCount: row.intervalCount,
    currency: row.currency,
    priceCents: row.priceCents,
    creditCents: row.creditCents,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    nextBillingAt: iso(row.nextBillingAt),
    nextDeliveryAt: iso(row.nextDeliveryAt),
    remainingDeliveries: row.remainingDeliveries,
    addressId: row.addressId,
    addressLabel: row.address ? `${row.address.line1}, ${row.address.city}` : null,
    rules: row.rules as SubscriptionRules,
    startedAt: row.createdAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
    events: row.events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

function mapOrder(row: Prisma.OrderGetPayload<{ include: typeof orderInclude }>): OrderDTO {
  return {
    id: row.id,
    number: row.number,
    customerId: row.customerId,
    customerName: row.customer.user.name,
    status: row.status,
    currency: row.currency,
    subtotalCents: row.subtotalCents,
    variantCents: row.variantCents,
    addonCents: row.addonCents,
    discountCents: row.discountCents,
    couponCents: row.couponCents,
    taxCents: row.taxCents,
    deliveryFeeCents: row.deliveryFeeCents,
    totalCents: row.totalCents,
    couponCode: row.couponCode,
    notes: row.notes,
    placedAt: row.placedAt.toISOString(),
    subscriptionId: row.subscriptionId,
    subscriptionNumber: row.subscription?.number ?? null,
    address: row.addressSnapshot,
    items: row.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.totalCents,
    })),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amountCents: payment.amountCents,
      externalId: payment.externalId,
    })),
    delivery: row.delivery
      ? {
          date: row.delivery.deliveryDate.toISOString(),
          windowLabel: row.delivery.windowLabel,
          zoneName: row.delivery.zone.name,
          status: row.delivery.status,
        }
      : null,
    snapshot: row.snapshot?.payload ?? null,
  };
}

async function nextNumber(tx: Prisma.TransactionClient, key: string, prefix: string) {
  const current = await tx.setting.findUnique({ where: { key } });
  const value = Number(current?.value ?? "10000") + 1;
  await tx.setting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, group: "system", label: key, helpText: "Internal sequence", value: String(value) },
  });
  return `${prefix}-${value}`;
}

export const billing = {
  async customerByUser(userId: string) {
    return prisma.customerProfile.findUnique({ where: { userId }, include: { user: true, addresses: true, paymentMethods: true } });
  },
  async customers(query: ListQuery = {}) {
    const page = paging(query);
    const where: Prisma.CustomerProfileWhereInput = like(query.q)
      ? { user: { OR: [{ name: like(query.q) }, { email: like(query.q) }] } }
      : {};
    const [rows, total] = await Promise.all([
      prisma.customerProfile.findMany({
        where,
        include: { user: true, _count: { select: { subscriptions: true, orders: true } } },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      prisma.customerProfile.count({ where }),
    ]);
    return {
      ...page,
      total,
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        name: row.user.name,
        email: row.user.email,
        phone: row.user.phone,
        status: row.user.status,
        subscriptionCount: row._count.subscriptions,
        orderCount: row._count.orders,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },
  async addresses(customerId: string) {
    const rows = await prisma.address.findMany({ where: { customerId, deletedAt: null }, orderBy: { isDefault: "desc" } });
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), deletedAt: iso(row.deletedAt) }));
  },
  async saveAddress(customerId: string, input: {
    label: string; line1: string; line2?: string; city: string; region: string; postalCode: string; zoneId?: string | null; isDefault?: boolean;
  }, id?: string) {
    if (input.isDefault) {
      await prisma.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    const data = {
      customerId,
      label: input.label,
      line1: input.line1,
      line2: input.line2 || null,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      zoneId: input.zoneId || null,
      isDefault: input.isDefault ?? false,
    };
    const row = id ? await prisma.address.update({ where: { id }, data }) : await prisma.address.create({ data });
    return row;
  },
  async removeAddress(id: string) {
    await prisma.address.update({ where: { id }, data: { deletedAt: new Date() } });
  },
  async subscriptions(query: ListQuery & { customerId?: string; userId?: string } = {}): Promise<Page<SubscriptionDTO>> {
    const page = paging(query);
    const where: Prisma.SubscriptionWhereInput = {
      ...(query.status ? { status: query.status as SubscriptionStatus } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.userId ? { customer: { userId: query.userId } } : {}),
      ...(like(query.q) ? { OR: [{ number: like(query.q) }, { plan: { name: like(query.q) } }, { customer: { user: { name: like(query.q) } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.subscription.findMany({ where, include: subscriptionInclude, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take }),
      prisma.subscription.count({ where }),
    ]);
    return { ...page, total, items: rows.map(mapSubscription) };
  },
  async subscription(id: string) {
    const row = await prisma.subscription.findUnique({ where: { id }, include: subscriptionInclude });
    return row ? mapSubscription(row) : null;
  },
  async orders(query: ListQuery & { customerId?: string } = {}): Promise<Page<OrderDTO>> {
    const page = paging(query);
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status as OrderStatus } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(like(query.q) ? { OR: [{ number: like(query.q) }, { customer: { user: { name: like(query.q) } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.order.findMany({ where, include: orderInclude, orderBy: { placedAt: "desc" }, skip: page.skip, take: page.take }),
      prisma.order.count({ where }),
    ]);
    return { ...page, total, items: rows.map(mapOrder) };
  },
  async order(id: string) {
    const row = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    return row ? mapOrder(row) : null;
  },
  async orderByIdempotency(key: string) {
    const row = await prisma.order.findUnique({ where: { idempotencyKey: key }, include: orderInclude });
    return row ? mapOrder(row) : null;
  },
  async setOrderStatus(ids: string[], status: OrderStatus) {
    await prisma.order.updateMany({ where: { id: { in: ids } }, data: { status } });
    await prisma.deliveryAssignment.updateMany({ where: { orderId: { in: ids } }, data: { status } });
    return ids.length;
  },
  async payments(query: ListQuery = {}) {
    const page = paging(query);
    const where: Prisma.PaymentWhereInput = query.status ? { status: query.status as PaymentStatus } : {};
    const [rows, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: { customer: { include: { user: true } }, order: true },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      prisma.payment.count({ where }),
    ]);
    return {
      ...page,
      total,
      items: rows.map((row) => ({
        id: row.id,
        customerName: row.customer.user.name,
        orderNumber: row.order?.number ?? null,
        provider: row.provider,
        status: row.status,
        amountCents: row.amountCents,
        currency: row.currency,
        externalId: row.externalId,
        subscriptionId: row.subscriptionId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  },
  async payment(id: string) {
    return prisma.payment.findUnique({ where: { id } });
  },
  async markPayment(id: string, status: PaymentStatus, amountCents: number, type: string) {
    await prisma.payment.update({ where: { id }, data: { status, amountCents } });
    await prisma.paymentTransaction.create({ data: { paymentId: id, type, amountCents, status } });
  },
  async zones() {
    return prisma.deliveryZone.findMany({ include: { schedules: { orderBy: { dayOfWeek: "asc" } } }, orderBy: { name: "asc" } });
  },
  async saveZone(input: { name: string; city: string; region: string; feeCents: number; active?: boolean; notes?: string }, id?: string) {
    const data = { name: input.name, city: input.city, region: input.region, feeCents: input.feeCents, active: input.active ?? true, notes: input.notes || null };
    return id ? prisma.deliveryZone.update({ where: { id }, data }) : prisma.deliveryZone.create({ data });
  },
  async saveSchedule(input: { zoneId: string; dayOfWeek: number; windowStart: string; windowEnd: string; cutoffTime: string; maxOrders: number; active?: boolean }, id?: string) {
    const data = { ...input, active: input.active ?? true };
    return id ? prisma.deliverySchedule.update({ where: { id }, data }) : prisma.deliverySchedule.create({ data });
  },
  async booked(scheduleId: string, deliveryDate: Date) {
    const start = new Date(deliveryDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return prisma.deliveryAssignment.count({ where: { scheduleId, deliveryDate: { gte: start, lt: end }, status: { notIn: ["CANCELLED", "REFUNDED"] } } });
  },
  async deliveries(query: ListQuery = {}) {
    const page = paging(query);
    const where: Prisma.DeliveryAssignmentWhereInput = query.status ? { status: query.status as OrderStatus } : {};
    const [rows, total] = await Promise.all([
      prisma.deliveryAssignment.findMany({
        where,
        include: { order: true, zone: true },
        orderBy: { deliveryDate: "asc" },
        skip: page.skip,
        take: page.take,
      }),
      prisma.deliveryAssignment.count({ where }),
    ]);
    return {
      ...page,
      total,
      items: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.order.number,
        zoneName: row.zone.name,
        deliveryDate: row.deliveryDate.toISOString(),
        windowLabel: row.windowLabel,
        status: row.status,
      })),
    };
  },
  async coupons(query: ListQuery = {}) {
    const page = paging(query);
    const where: Prisma.CouponWhereInput = { deletedAt: null, ...(like(query.q) ? { OR: [{ code: like(query.q) }, { name: like(query.q) }] } : {}) };
    const [rows, total] = await Promise.all([
      prisma.coupon.findMany({ where, include: { _count: { select: { redemptions: true } } }, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take }),
      prisma.coupon.count({ where }),
    ]);
    return {
      ...page,
      total,
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        type: row.type,
        value: row.value,
        scope: row.scope,
        planId: row.planId,
        categoryId: row.categoryId,
        minSubtotalCents: row.minSubtotalCents,
        maxUses: row.maxUses,
        perCustomerLimit: row.perCustomerLimit,
        startsAt: iso(row.startsAt),
        endsAt: iso(row.endsAt),
        active: row.active,
        automatic: row.automatic,
        redemptions: row._count.redemptions,
      })),
    };
  },
  async couponByCode(code: string) {
    return prisma.coupon.findFirst({ where: { code: code.toUpperCase(), deletedAt: null } });
  },
  async couponUsage(couponId: string, customerId: string) {
    const [totalRedemptions, customerRedemptions] = await Promise.all([
      prisma.couponRedemption.count({ where: { couponId } }),
      prisma.couponRedemption.count({ where: { couponId, customerId } }),
    ]);
    return { totalRedemptions, customerRedemptions };
  },
  async saveCoupon(input: {
    code: string; name: string; description: string; type: "PERCENT" | "FIXED"; value: number; scope?: string;
    planId?: string | null; categoryId?: string | null; minSubtotalCents?: number; maxUses?: number | null;
    perCustomerLimit?: number; startsAt?: string | null; endsAt?: string | null; active?: boolean; automatic?: boolean;
  }, id?: string) {
    const data = {
      code: input.code.toUpperCase(),
      name: input.name,
      description: input.description,
      type: input.type,
      value: input.value,
      scope: (input.scope ?? "ALL") as "ALL",
      planId: input.planId || null,
      categoryId: input.categoryId || null,
      minSubtotalCents: input.minSubtotalCents ?? 0,
      maxUses: input.maxUses ?? null,
      perCustomerLimit: input.perCustomerLimit ?? 1,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      active: input.active ?? true,
      automatic: input.automatic ?? false,
    };
    return id ? prisma.coupon.update({ where: { id }, data }) : prisma.coupon.create({ data });
  },
  async customerOrderCount(customerId: string) {
    return prisma.order.count({ where: { customerId } });
  },
  async persistCheckout(input: {
    idempotencyKey?: string | null;
    customerId: string;
    userId: string;
    planId: string;
    planVersion: number;
    planName: string;
    currency: string;
    billingMode: "ONE_TIME" | "RECURRING";
    intervalUnit: "DAY" | "WEEK" | "MONTH";
    intervalCount: number;
    remainingDeliveries: number | null;
    rules: SubscriptionRules;
    quote: PriceBreakdown;
    couponId?: string | null;
    couponCode?: string | null;
    addressId: string;
    addressSnapshot: unknown;
    zoneId: string;
    scheduleId?: string | null;
    deliveryDate: string;
    windowLabel: string;
    items: { kind: string; refId?: string; name: string; quantity: number; unitPriceCents: number }[];
    snapshot: unknown;
    payment: { provider: string; status: PaymentStatus; externalId: string; amountCents: number };
    activate: boolean;
  }) {
    return prisma.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        const existing = await tx.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderInclude });
        if (existing) return { duplicate: true as const, order: mapOrder(existing), subscriptionId: existing.subscriptionId };
      }
      const version = await tx.planVersion.findFirst({ where: { planId: input.planId, version: input.planVersion } });
      const now = new Date();
      const periodEnd = new Date(now);
      if (input.intervalUnit === "DAY") periodEnd.setUTCDate(periodEnd.getUTCDate() + input.intervalCount);
      if (input.intervalUnit === "WEEK") periodEnd.setUTCDate(periodEnd.getUTCDate() + input.intervalCount * 7);
      if (input.intervalUnit === "MONTH") periodEnd.setUTCMonth(periodEnd.getUTCMonth() + input.intervalCount);
      const subscriptionNumber = await nextNumber(tx, "sequence.subscription", "SB");
      const orderNumber = await nextNumber(tx, "sequence.order", "BX");
      const status: SubscriptionStatus = input.activate ? "ACTIVE" : "PENDING";
      const subscription = await tx.subscription.create({
        data: {
          number: subscriptionNumber,
          customerId: input.customerId,
          planId: input.planId,
          planVersionId: version?.id,
          status,
          billingMode: input.billingMode,
          intervalUnit: input.intervalUnit,
          intervalCount: input.intervalCount,
          currency: input.currency,
          priceCents: input.quote.totalCents,
          periodStart: now,
          periodEnd,
          nextBillingAt: input.billingMode === "RECURRING" ? periodEnd : null,
          nextDeliveryAt: new Date(input.deliveryDate),
          remainingDeliveries: input.remainingDeliveries,
          addressId: input.addressId,
          rules: input.rules as unknown as Prisma.InputJsonValue,
          priceSnapshot: input.quote as unknown as Prisma.InputJsonValue,
          items: {
            create: input.items.map((item) => ({
              kind: item.kind,
              refId: item.refId,
              name: item.name,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
            })),
          },
          events: {
            create: [
              { type: "SUBSCRIPTION_CREATED", message: "Subscription created" },
              { type: input.payment.status === "CAPTURED" ? "PAYMENT_SUCCESSFUL" : "PAYMENT_PENDING", message: `Payment ${input.payment.status.toLowerCase()} via ${input.payment.provider}` },
            ],
          },
        },
      });
      const order = await tx.order.create({
        data: {
          number: orderNumber,
          customerId: input.customerId,
          subscriptionId: subscription.id,
          status: input.activate ? "CONFIRMED" : "PENDING",
          currency: input.currency,
          subtotalCents: input.quote.baseCents,
          variantCents: input.quote.variantCents,
          addonCents: input.quote.addonCents,
          discountCents: input.quote.discountCents,
          couponCents: input.quote.couponCents,
          taxCents: input.quote.taxCents,
          deliveryFeeCents: input.quote.deliveryFeeCents,
          totalCents: input.quote.totalCents,
          couponCode: input.couponCode,
          addressSnapshot: input.addressSnapshot as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
          items: {
            create: input.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              totalCents: item.unitPriceCents * item.quantity,
            })),
          },
          snapshot: { create: { payload: input.snapshot as Prisma.InputJsonValue } },
          payments: {
            create: {
              customerId: input.customerId,
              subscriptionId: subscription.id,
              provider: input.payment.provider,
              status: input.payment.status,
              amountCents: input.payment.amountCents,
              currency: input.currency,
              externalId: input.payment.externalId,
              transactions: { create: { type: "capture", amountCents: input.payment.amountCents, status: input.payment.status } },
            },
          },
          delivery: {
            create: {
              zoneId: input.zoneId,
              scheduleId: input.scheduleId,
              deliveryDate: new Date(input.deliveryDate),
              windowLabel: input.windowLabel,
              status: input.activate ? "CONFIRMED" : "PENDING",
            },
          },
        },
      });
      if (input.couponId) {
        await tx.couponRedemption.create({
          data: { couponId: input.couponId, customerId: input.customerId, orderId: order.id, amountCents: input.quote.couponCents },
        });
      }
      await tx.notification.create({
        data: {
          userId: input.userId,
          channel: "IN_APP",
          templateKey: "subscription.created",
          title: "Subscription confirmed",
          body: `${input.planName} is ${status.toLowerCase()}. Order ${orderNumber} totals ready for fulfillment.`,
        },
      });
      return { duplicate: false as const, orderId: order.id, subscriptionId: subscription.id, orderNumber, subscriptionNumber };
    });
  },
  async applySubscription(id: string, data: Prisma.SubscriptionUpdateInput, event: { type: string; message: string; actorId?: string; payload?: unknown }) {
    await prisma.$transaction([
      prisma.subscription.update({ where: { id }, data }),
      prisma.subscriptionEvent.create({
        data: {
          subscriptionId: id,
          type: event.type,
          message: event.message,
          actorId: event.actorId,
          payload: event.payload as Prisma.InputJsonValue,
        },
      }),
    ]);
    return this.subscription(id);
  },
};
