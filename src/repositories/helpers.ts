import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import type { ListQuery } from "@/types/domain";

export function paging(query: ListQuery = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function like(q?: string) {
  const value = q?.trim();
  if (!value) return undefined;
  return { contains: value };
}

export function rethrow(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError("DUPLICATE", "A record with those details already exists.", 409);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    throw new AppError("NOT_FOUND", "That record could not be found.", 404);
  }
  throw error;
}

export function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
