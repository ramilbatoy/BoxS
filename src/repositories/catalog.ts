import { Prisma, type ProductKind, type RecordStatus } from "@/generated/prisma/client";
import { prisma } from "@/database/client";
import { slugify } from "@/lib/slug";
import type { ListQuery, Page } from "@/types/domain";
import { iso, like, paging, rethrow } from "./helpers";

export type CategoryDTO = {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  sortOrder: number;
  status: string;
  productCount: number;
};

export type ProductDTO = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
  description: string;
  kind: string;
  basePriceCents: number;
  imageUrl: string | null;
  status: string;
  available: boolean;
  variants: { id: string; name: string; sku: string; priceDeltaCents: number }[];
  updatedAt: string;
};

export type AddonDTO = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
  status: string;
  available: boolean;
};

const productInclude = { category: true, variants: true } satisfies Prisma.ProductInclude;

export const catalog = {
  async categories(query: ListQuery = {}): Promise<Page<CategoryDTO>> {
    const page = paging(query);
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status as RecordStatus } : {}),
      ...(like(query.q) ? { name: like(query.q) } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.category.findMany({
        where,
        include: { _count: { select: { products: true } } },
        orderBy: { sortOrder: "asc" },
        skip: page.skip,
        take: page.take,
      }),
      prisma.category.count({ where }),
    ]);
    return {
      ...page,
      total,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        parentId: row.parentId,
        sortOrder: row.sortOrder,
        status: row.status,
        productCount: row._count.products,
      })),
    };
  },
  async saveCategory(input: { name: string; description: string; slug?: string; sortOrder?: number; status?: string }, id?: string) {
    try {
      const data = {
        name: input.name,
        slug: input.slug || slugify(input.name),
        description: input.description,
        sortOrder: input.sortOrder ?? 0,
        status: (input.status ?? "ACTIVE") as RecordStatus,
      };
      const row = id
        ? await prisma.category.update({ where: { id }, data })
        : await prisma.category.create({ data });
      return row.id;
    } catch (error) {
      rethrow(error);
    }
  },
  async removeCategory(id: string) {
    await prisma.category.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  },
  async products(query: ListQuery = {}): Promise<Page<ProductDTO>> {
    const page = paging(query);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status as RecordStatus } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(like(query.q) ? { OR: [{ name: like(query.q) }, { description: like(query.q) }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.product.findMany({ where, include: productInclude, orderBy: { name: "asc" }, skip: page.skip, take: page.take }),
      prisma.product.count({ where }),
    ]);
    return { ...page, total, items: rows.map(mapProduct) };
  },
  async product(id: string) {
    const row = await prisma.product.findFirst({ where: { id, deletedAt: null }, include: productInclude });
    return row ? mapProduct(row) : null;
  },
  async saveProduct(
    input: {
      name: string;
      description: string;
      categoryId: string;
      kind?: string;
      basePriceCents: number;
      imageUrl?: string | null;
      slug?: string;
      status?: string;
      available?: boolean;
      variants?: { name: string; sku: string; priceDeltaCents: number }[];
    },
    id?: string,
  ) {
    try {
      const data = {
        name: input.name,
        slug: input.slug || slugify(input.name),
        description: input.description,
        categoryId: input.categoryId,
        kind: (input.kind ?? "PHYSICAL") as ProductKind,
        basePriceCents: input.basePriceCents,
        imageUrl: input.imageUrl || null,
        status: (input.status ?? "ACTIVE") as RecordStatus,
        available: input.available ?? true,
      };
      const saved = id
        ? await prisma.product.update({ where: { id }, data })
        : await prisma.product.create({ data });
      if (input.variants) {
        await prisma.productVariant.deleteMany({ where: { productId: saved.id } });
        if (input.variants.length) {
          await prisma.productVariant.createMany({
            data: input.variants.map((variant) => ({ ...variant, productId: saved.id })),
          });
        }
      }
      return this.product(saved.id);
    } catch (error) {
      rethrow(error);
    }
  },
  async removeProduct(id: string) {
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  },
  async addons(query: ListQuery = {}): Promise<Page<AddonDTO>> {
    const page = paging(query);
    const where: Prisma.AddonWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status as RecordStatus } : {}),
      ...(like(query.q) ? { name: like(query.q) } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.addon.findMany({ where, orderBy: { name: "asc" }, skip: page.skip, take: page.take }),
      prisma.addon.count({ where }),
    ]);
    return {
      ...page,
      total,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        priceCents: row.priceCents,
        imageUrl: row.imageUrl,
        status: row.status,
        available: row.available,
      })),
    };
  },
  async saveAddon(
    input: { name: string; description: string; priceCents: number; slug?: string; available?: boolean; status?: string },
    id?: string,
  ) {
    try {
      const data = {
        name: input.name,
        slug: input.slug || slugify(input.name),
        description: input.description,
        priceCents: input.priceCents,
        available: input.available ?? true,
        status: (input.status ?? "ACTIVE") as RecordStatus,
      };
      const row = id ? await prisma.addon.update({ where: { id }, data }) : await prisma.addon.create({ data });
      return row.id;
    } catch (error) {
      rethrow(error);
    }
  },
  async removeAddon(id: string) {
    await prisma.addon.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  },
  async subscriptionTypes() {
    const rows = await prisma.subscriptionType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      billingMode: row.billingMode,
      intervalUnit: row.intervalUnit,
      intervalCount: row.intervalCount,
      deliveryCount: row.deliveryCount,
    }));
  },
  async saveSubscriptionType(input: {
    name: string;
    description: string;
    billingMode: "ONE_TIME" | "RECURRING";
    intervalUnit: "DAY" | "WEEK" | "MONTH";
    intervalCount: number;
    deliveryCount?: number | null;
    slug?: string;
  }) {
    return prisma.subscriptionType.create({
      data: {
        name: input.name,
        slug: input.slug || slugify(input.name),
        description: input.description,
        billingMode: input.billingMode,
        intervalUnit: input.intervalUnit,
        intervalCount: input.intervalCount,
        deliveryCount: input.deliveryCount ?? null,
      },
    });
  },
};

function mapProduct(row: Prisma.ProductGetPayload<{ include: typeof productInclude }>): ProductDTO {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    name: row.name,
    slug: row.slug,
    description: row.description,
    kind: row.kind,
    basePriceCents: row.basePriceCents,
    imageUrl: row.imageUrl,
    status: row.status,
    available: row.available,
    variants: row.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      priceDeltaCents: variant.priceDeltaCents,
    })),
    updatedAt: iso(row.updatedAt) ?? "",
  };
}
