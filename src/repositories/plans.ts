import { FeaturedLabel, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/database/client";
import { slugify } from "@/lib/slug";
import { DEFAULT_RULES, type SubscriptionRules } from "@/modules/subscriptions/engine";
import type { ListQuery, Page, PlanDTO, PlanWrite, SubscriptionRules as Rules } from "@/types/domain";
import { asStringArray, iso, like, paging, rethrow } from "./helpers";

const include = {
  category: true,
  subscriptionType: true,
  groups: {
    orderBy: { sortOrder: "asc" as const },
    include: { options: { orderBy: { sortOrder: "asc" as const } } },
  },
  items: { include: { product: true, addon: true } },
  variants: { orderBy: { sortOrder: "asc" as const } },
  _count: { select: { subscriptions: true } },
} satisfies Prisma.PlanInclude;

type PlanRecord = Prisma.PlanGetPayload<{ include: typeof include }>;

export function rulesFrom(plan: {
  allowPause: boolean;
  allowSkip: boolean;
  allowCancel: boolean;
  allowPlanChange: boolean;
  minCommitmentDays: number;
  cancellationCutoffHours: number;
  changeCutoffHours: number;
  skipCutoffHours: number;
  deliveryChangeCutoffHours: number;
}): Rules {
  return {
    allowPause: plan.allowPause,
    allowSkip: plan.allowSkip,
    allowCancel: plan.allowCancel,
    allowPlanChange: plan.allowPlanChange,
    minCommitmentDays: plan.minCommitmentDays,
    cancellationCutoffHours: plan.cancellationCutoffHours,
    changeCutoffHours: plan.changeCutoffHours,
    skipCutoffHours: plan.skipCutoffHours,
    deliveryChangeCutoffHours: plan.deliveryChangeCutoffHours,
  };
}

export function mapPlan(plan: PlanRecord): PlanDTO {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    categoryId: plan.categoryId,
    categoryName: plan.category?.name ?? null,
    imageUrl: plan.imageUrl,
    status: plan.status,
    featuredLabel: plan.featuredLabel,
    seoTitle: plan.seoTitle,
    seoDescription: plan.seoDescription,
    currency: plan.currency,
    basePriceCents: plan.basePriceCents,
    discountCents: plan.discountCents,
    taxRateBps: plan.taxRateBps,
    deliveryFeeCents: plan.deliveryFeeCents,
    subscriptionTypeId: plan.subscriptionTypeId,
    subscriptionTypeName: plan.subscriptionType.name,
    billingMode: plan.subscriptionType.billingMode,
    intervalUnit: plan.subscriptionType.intervalUnit,
    intervalCount: plan.subscriptionType.intervalCount,
    deliveryCount: plan.subscriptionType.deliveryCount,
    rules: rulesFrom(plan),
    startsAt: iso(plan.startsAt),
    endsAt: iso(plan.endsAt),
    currentVersion: plan.currentVersion,
    subscriberCount: plan._count.subscriptions,
    updatedAt: plan.updatedAt.toISOString(),
    groups: plan.groups.map((group) => ({
      id: group.id,
      name: group.name,
      key: group.key,
      helpText: group.helpText,
      required: group.required,
      sortOrder: group.sortOrder,
      options: group.options.map((option) => ({
        id: option.id,
        label: option.label,
        priceDeltaCents: option.priceDeltaCents,
        durationDays: option.durationDays,
        deliveryCount: option.deliveryCount,
        intervalUnit: option.intervalUnit,
        intervalCount: option.intervalCount,
        billingMode: option.billingMode,
        sortOrder: option.sortOrder,
        isDefault: option.isDefault,
      })),
    })),
    items: plan.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      addonId: item.addonId,
      name: item.product?.name ?? item.addon?.name ?? "Included item",
      quantity: item.quantity,
      included: item.included,
      unitPriceCents: item.addon?.priceCents ?? item.product?.basePriceCents ?? 0,
    })),
    variants: plan.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      optionIds: asStringArray(variant.optionIds),
      priceOverrideCents: variant.priceOverrideCents,
      sortOrder: variant.sortOrder,
    })),
  };
}

function rulesData(rules?: Partial<SubscriptionRules>) {
  const merged = { ...DEFAULT_RULES, ...rules };
  return {
    allowPause: merged.allowPause,
    allowSkip: merged.allowSkip,
    allowCancel: merged.allowCancel,
    allowPlanChange: merged.allowPlanChange,
    minCommitmentDays: merged.minCommitmentDays,
    cancellationCutoffHours: merged.cancellationCutoffHours,
    changeCutoffHours: merged.changeCutoffHours,
    skipCutoffHours: merged.skipCutoffHours,
    deliveryChangeCutoffHours: merged.deliveryChangeCutoffHours,
  };
}

function childData(input: PlanWrite) {
  return {
    groups: {
      create: (input.groups ?? []).map((group, groupIndex) => ({
        name: group.name,
        key: group.key || slugify(group.name),
        helpText: group.helpText,
        required: group.required,
        sortOrder: group.sortOrder ?? groupIndex,
        options: {
          create: group.options.map((option, optionIndex) => ({
            label: option.label,
            priceDeltaCents: option.priceDeltaCents,
            durationDays: option.durationDays ?? null,
            deliveryCount: option.deliveryCount ?? null,
            intervalUnit: option.intervalUnit,
            intervalCount: option.intervalCount ?? null,
            billingMode: option.billingMode,
            sortOrder: option.sortOrder ?? optionIndex,
            isDefault: option.isDefault,
          })),
        },
      })),
    },
    items: {
      create: (input.items ?? []).map((item) => ({
        productId: item.productId,
        addonId: item.addonId,
        quantity: item.quantity,
        included: item.included,
      })),
    },
    variants: {
      create: (input.variants ?? []).map((variant, index) => ({
        name: variant.name,
        optionIds: variant.optionIds,
        priceOverrideCents: variant.priceOverrideCents,
        sortOrder: variant.sortOrder ?? index,
      })),
    },
  };
}

export function nextPublishedVersion(status: string, currentVersion: number) {
  if (status !== "PUBLISHED") return null;
  return currentVersion + 1;
}

export const plans = {
  async list(query: ListQuery = {}, publishedOnly = false): Promise<Page<PlanDTO>> {
    const page = paging(query);
    const where: Prisma.PlanWhereInput = {
      deletedAt: null,
      ...(publishedOnly ? { status: "PUBLISHED", featuredLabel: { not: "HIDDEN" } } : {}),
      ...(query.status && !publishedOnly ? { status: query.status as PlanDTO["status"] } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(like(query.q) ? { OR: [{ name: like(query.q) }, { description: like(query.q) }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.plan.findMany({ where, include, orderBy: { updatedAt: "desc" }, skip: page.skip, take: page.take }),
      prisma.plan.count({ where }),
    ]);
    return { items: rows.map(mapPlan), ...page, total };
  },
  async get(id: string) {
    const plan = await prisma.plan.findFirst({ where: { id, deletedAt: null }, include });
    return plan ? mapPlan(plan) : null;
  },
  async bySlug(slug: string) {
    const plan = await prisma.plan.findFirst({ where: { slug, deletedAt: null }, include });
    return plan ? mapPlan(plan) : null;
  },
  async save(input: PlanWrite, id?: string) {
    try {
      const prior = id
        ? await prisma.plan.findFirst({
            where: { id, deletedAt: null },
            select: { status: true, currentVersion: true },
          })
        : null;
      const data = {
        name: input.name,
        slug: input.slug || slugify(input.name),
        description: input.description,
        categoryId: input.categoryId || null,
        imageUrl: input.imageUrl || null,
        featuredLabel: (input.featuredLabel ?? "NONE") as FeaturedLabel,
        seoTitle: input.seoTitle || null,
        seoDescription: input.seoDescription || null,
        currency: input.currency || "PHP",
        basePriceCents: input.basePriceCents,
        discountCents: input.discountCents ?? 0,
        taxRateBps: input.taxRateBps ?? 0,
        deliveryFeeCents: input.deliveryFeeCents ?? 0,
        subscriptionTypeId: input.subscriptionTypeId,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        ...rulesData(input.rules),
      };
      // A child collection is replaced only when the caller sends it. An absent key leaves the
      // existing rows alone, so a partial update cannot silently drop a plan's items or variants.
      const replaceGroups = input.groups !== undefined;
      const replaceItems = input.items !== undefined;
      const replaceVariants = input.variants !== undefined;
      const plan = await prisma.$transaction(async (tx) => {
        const saved = id
          ? await tx.plan.update({ where: { id }, data })
          : await tx.plan.create({ data: { ...data, status: "DRAFT" } });
        if (id) {
          if (replaceGroups) await tx.planOptionGroup.deleteMany({ where: { planId: id } });
          if (replaceItems) await tx.planItem.deleteMany({ where: { planId: id } });
          if (replaceVariants) await tx.planVariant.deleteMany({ where: { planId: id } });
        }
        const children = childData(input);
        if (replaceGroups && children.groups.create.length) {
          for (const group of children.groups.create) {
            await tx.planOptionGroup.create({ data: { ...group, planId: saved.id } });
          }
        }
        if (replaceItems && children.items.create.length) {
          await tx.planItem.createMany({
            data: children.items.create.map((item) => ({ ...item, planId: saved.id })),
          });
        }
        if (replaceVariants && children.variants.create.length) {
          await tx.planVariant.createMany({
            data: children.variants.create.map((variant) => ({
              ...variant,
              optionIds: variant.optionIds as Prisma.InputJsonValue,
              planId: saved.id,
            })),
          });
        }
        return saved.id;
      });
      const saved = await this.get(plan);
      const version = saved && prior ? nextPublishedVersion(prior.status, prior.currentVersion) : null;
      if (!saved || version == null) return saved;
      await prisma.planVersion.create({
        data: {
          planId: saved.id,
          version,
          snapshot: { ...saved, currentVersion: version } as unknown as Prisma.InputJsonValue,
        },
      });
      await prisma.plan.update({ where: { id: saved.id }, data: { currentVersion: version } });
      return this.get(saved.id);
    } catch (error) {
      rethrow(error);
    }
  },
  async publish(id: string, actorId?: string) {
    const current = await this.get(id);
    if (!current) return null;
    const version = current.currentVersion + 1;
    await prisma.planVersion.create({
      data: {
        planId: id,
        version,
        snapshot: current as unknown as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });
    await prisma.plan.update({ where: { id }, data: { status: "PUBLISHED", currentVersion: version } });
    return this.get(id);
  },
  async setStatus(id: string, status: PlanDTO["status"]) {
    await prisma.plan.update({ where: { id }, data: { status } });
    return this.get(id);
  },
  async remove(id: string) {
    await prisma.plan.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  },
  async bulk(ids: string[], action: string, categoryId?: string) {
    if (action === "delete") {
      const result = await prisma.plan.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: new Date(), status: "ARCHIVED" },
      });
      return result.count;
    }
    if (action === "archive") {
      return (await prisma.plan.updateMany({ where: { id: { in: ids } }, data: { status: "ARCHIVED" } })).count;
    }
    if (action === "publish") {
      for (const id of ids) await this.publish(id);
      return ids.length;
    }
    if (action === "category" && categoryId) {
      return (await prisma.plan.updateMany({ where: { id: { in: ids } }, data: { categoryId } })).count;
    }
    if (action === "draft") {
      return (await prisma.plan.updateMany({ where: { id: { in: ids } }, data: { status: "DRAFT" } })).count;
    }
    return 0;
  },
};
