export type SubscriptionRules = {
  allowPause: boolean;
  allowSkip: boolean;
  allowCancel: boolean;
  allowPlanChange: boolean;
  minCommitmentDays: number;
  cancellationCutoffHours: number;
  changeCutoffHours: number;
  skipCutoffHours: number;
  deliveryChangeCutoffHours: number;
};

export type PlanOptionDTO = {
  id: string;
  label: string;
  priceDeltaCents: number;
  durationDays: number | null;
  deliveryCount: number | null;
  intervalUnit: "DAY" | "WEEK" | "MONTH" | null;
  intervalCount: number | null;
  billingMode: "ONE_TIME" | "RECURRING" | null;
  sortOrder: number;
  isDefault: boolean;
};

export type PlanGroupDTO = {
  id: string;
  name: string;
  key: string;
  helpText: string | null;
  required: boolean;
  sortOrder: number;
  options: PlanOptionDTO[];
};

export type PlanItemDTO = {
  id: string;
  productId: string | null;
  addonId: string | null;
  name: string;
  quantity: number;
  included: boolean;
  unitPriceCents: number;
};

export type PlanVariantDTO = {
  id: string;
  name: string;
  optionIds: string[];
  priceOverrideCents: number | null;
  sortOrder: number;
};

export type PlanDTO = {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  featuredLabel: string;
  seoTitle: string | null;
  seoDescription: string | null;
  currency: string;
  basePriceCents: number;
  discountCents: number;
  taxRateBps: number;
  deliveryFeeCents: number;
  subscriptionTypeId: string;
  subscriptionTypeName: string;
  billingMode: "ONE_TIME" | "RECURRING";
  intervalUnit: "DAY" | "WEEK" | "MONTH";
  intervalCount: number;
  deliveryCount: number | null;
  rules: SubscriptionRules;
  startsAt: string | null;
  endsAt: string | null;
  currentVersion: number;
  subscriberCount: number;
  updatedAt: string;
  groups: PlanGroupDTO[];
  items: PlanItemDTO[];
  variants: PlanVariantDTO[];
};

export type PlanWrite = {
  name: string;
  slug?: string;
  description: string;
  categoryId?: string | null;
  imageUrl?: string | null;
  featuredLabel?: PlanDTO["featuredLabel"];
  seoTitle?: string | null;
  seoDescription?: string | null;
  currency?: string;
  basePriceCents: number;
  discountCents?: number;
  taxRateBps?: number;
  deliveryFeeCents?: number;
  subscriptionTypeId: string;
  rules?: Partial<SubscriptionRules>;
  startsAt?: string | null;
  endsAt?: string | null;
  groups?: Array<Omit<PlanGroupDTO, "id"> & { options: Array<Omit<PlanOptionDTO, "id">> }>;
  items?: Array<Omit<PlanItemDTO, "id" | "name" | "unitPriceCents">>;
  variants?: Array<Omit<PlanVariantDTO, "id">>;
};

export type ListQuery = {
  q?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  categoryId?: string;
  sort?: string;
};

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
