import bcrypt from "bcryptjs";
import { prisma } from "../src/database/client";
import { PERMISSIONS, ROLE_PRESETS } from "../src/modules/auth/permissions";
import { checkout } from "../src/modules/checkout/checkout-service";

const demoPassword = "DemoAdmin123!";
const customerPassword = "DemoCustomer123!";

async function main() {
  const already = await prisma.user.findUnique({ where: { email: "admin@boxs.demo" } });
  if (already) {
    console.log("Demo data already exists.");
    return;
  }

  const permissionRows = [];
  for (const [key, description, module] of PERMISSIONS) {
    permissionRows.push(await prisma.permission.upsert({ where: { key }, update: { description, module }, create: { key, description, module } }));
  }
  const byKey = new Map(permissionRows.map((row) => [row.key, row.id]));
  const roles = new Map<string, string>();
  for (const [slug, preset] of Object.entries(ROLE_PRESETS)) {
    const role = await prisma.role.create({
      data: {
        slug,
        name: preset.name,
        description: preset.description,
        isSystem: true,
        permissions: { create: preset.permissions.map((key) => ({ permissionId: byKey.get(key)! })) },
      },
    });
    roles.set(slug, role.id);
  }

  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const customerHash = await bcrypt.hash(customerPassword, 12);
  await prisma.user.create({
    data: { name: "Ava Cruz", email: "admin@boxs.demo", passwordHash, roleId: roles.get("super-admin")!, phone: "+63 82 555 0101" },
  });
  await prisma.user.create({
    data: { name: "Marco Reyes", email: "manager@boxs.demo", passwordHash, roleId: roles.get("manager")! },
  });
  const liza = await prisma.user.create({
    data: { name: "Liza Tan", email: "liza@boxs.demo", passwordHash: customerHash, roleId: roles.get("customer")!, phone: "+63 917 555 0142", profile: { create: { marketingOptIn: true } } },
  });
  const paolo = await prisma.user.create({
    data: { name: "Paolo Gomez", email: "paolo@boxs.demo", passwordHash: customerHash, roleId: roles.get("customer")!, phone: "+63 918 555 0190", profile: { create: {} } },
  });

  const categories = await Promise.all(
    [
      ["Rice Bowls", "rice-bowls", "Composed meals built around rice, grains, and a chosen protein."],
      ["High Protein", "high-protein", "Plates for training days and higher protein targets."],
      ["Plant Plates", "plant-plates", "Vegetable-forward meals that still feel like dinner."],
      ["Memberships", "memberships", "Recurring access that is not a meal."],
      ["Home Services", "home-services", "Scheduled service visits."],
    ].map(([name, slug, description], index) =>
      prisma.category.create({ data: { name, slug, description, sortOrder: index, status: "ACTIVE" } }),
    ),
  );
  const [bowls, protein, plants, memberships, services] = categories;

  const products = [
    ["Garlic chicken bowl", "garlic-chicken-bowl", bowls.id, "MEAL", 18500, "Chicken adobo glaze, garlic rice, pickled greens."],
    ["Beef tapa bowl", "beef-tapa-bowl", bowls.id, "MEAL", 21000, "Sweet-savory tapa, egg, tomato, and rice."],
    ["Salmon grain bowl", "salmon-grain-bowl", bowls.id, "MEAL", 24000, "Seared salmon, brown rice, cucumber, and citrus."],
    ["Tofu adobo bowl", "tofu-adobo-bowl", plants.id, "MEAL", 17500, "Crisp tofu, adobo sauce, and greens."],
    ["Mushroom kaldereta", "mushroom-kaldereta", plants.id, "MEAL", 18000, "Mushroom stew with peppers and potato."],
    ["Chicken inasal plate", "chicken-inasal-plate", protein.id, "MEAL", 22000, "Grilled inasal, extra chicken, and salad."],
    ["Lean beef plate", "lean-beef-plate", protein.id, "MEAL", 24500, "Lean beef, rice, and a larger protein portion."],
    ["Prawn sinigang", "prawn-sinigang", protein.id, "MEAL", 23000, "Sour broth, prawns, and vegetables."],
    ["Family chicken tray", "family-chicken-tray", bowls.id, "MEAL", 68000, "A shared tray for four."],
    ["Veggie lumpia pack", "veggie-lumpia-pack", plants.id, "PHYSICAL", 12000, "Baked vegetable lumpia, six pieces."],
    ["Studio day credit", "studio-day-credit", memberships.id, "CREDIT", 35000, "One visit credit for a partner studio."],
    ["Home reset visit", "home-reset-visit", services.id, "SERVICE", 89000, "A two-hour reset of kitchen and living areas."],
  ] as const;
  for (const [name, slug, categoryId, kind, basePriceCents, description] of products) {
    await prisma.product.create({
      data: { name, slug, categoryId, kind, basePriceCents, description, status: "ACTIVE", available: true },
    });
  }
  const addons = await Promise.all(
    (
      [
        ["Extra protein", "extra-protein", 8000, "Add another portion of the plan protein."],
        ["Fresh juice", "fresh-juice", 4500, "Calamansi or ripe mango juice."],
        ["Cutlery set", "cutlery-set", 1500, "Compostable fork, spoon, and napkin."],
      ] as [string, string, number, string][]
    ).map(([name, slug, priceCents, description]) =>
      prisma.addon.create({ data: { name, slug, description, priceCents: Number(priceCents), status: "ACTIVE" } }),
    ),
  );

  const fixed = await prisma.subscriptionType.create({
    data: { name: "Fixed program", slug: "fixed-program", description: "A set number of days or deliveries, then it ends.", billingMode: "ONE_TIME", intervalUnit: "DAY", intervalCount: 7, deliveryCount: 7 },
  });
  const weekly = await prisma.subscriptionType.create({
    data: { name: "Weekly renewal", slug: "weekly-renewal", description: "Bills and renews every week until cancelled.", billingMode: "RECURRING", intervalUnit: "WEEK", intervalCount: 1 },
  });
  const monthly = await prisma.subscriptionType.create({
    data: { name: "Monthly renewal", slug: "monthly-renewal", description: "Bills and renews every month until cancelled.", billingMode: "RECURRING", intervalUnit: "MONTH", intervalCount: 1 },
  });

  async function plan(input: {
    name: string; slug: string; description: string; categoryId: string; basePriceCents: number; typeId: string; label?: "FEATURED" | "POPULAR" | "BEST_VALUE" | "NEW";
    groups: { name: string; key: string; help: string; options: { label: string; delta: number; days?: number; meals?: number; unit?: "DAY" | "WEEK" | "MONTH"; count?: number; mode?: "ONE_TIME" | "RECURRING"; isDefault?: boolean }[] }[];
  }) {
    const created = await prisma.plan.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        categoryId: input.categoryId,
        status: "DRAFT",
        featuredLabel: input.label ?? "NONE",
        currency: "PHP",
        basePriceCents: input.basePriceCents,
        deliveryFeeCents: 20000,
        subscriptionTypeId: input.typeId,
        seoTitle: input.name,
        seoDescription: input.description,
        groups: {
          create: input.groups.map((group, index) => ({
            name: group.name,
            key: group.key,
            helpText: group.help,
            sortOrder: index,
            options: {
              create: group.options.map((option, optionIndex) => ({
                label: option.label,
                priceDeltaCents: option.delta,
                durationDays: option.days,
                deliveryCount: option.meals,
                intervalUnit: option.unit,
                intervalCount: option.count,
                billingMode: option.mode,
                sortOrder: optionIndex,
                isDefault: option.isDefault ?? optionIndex === 0,
              })),
            },
          })),
        },
      },
    });
    const full = await prisma.plan.findUnique({ where: { id: created.id }, include: { groups: { include: { options: true } }, subscriptionType: true, category: true, items: true, variants: true, _count: { select: { subscriptions: true } } } });
    await prisma.planVersion.create({ data: { planId: created.id, version: 1, snapshot: { name: created.name, basePriceCents: created.basePriceCents } } });
    await prisma.plan.update({ where: { id: created.id }, data: { status: "PUBLISHED", currentVersion: 1 } });
    return full!;
  }

  const duration = (help: string) => ({
    name: "Duration",
    key: "duration",
    help,
    options: [
      { label: "3 days", delta: -80000, days: 3, meals: 3 },
      { label: "5 days", delta: -30000, days: 5, meals: 5 },
      { label: "7 days", delta: 0, days: 7, meals: 7, isDefault: true },
      { label: "14 days", delta: 90000, days: 14, meals: 14 },
      { label: "30 days", delta: 220000, days: 30, meals: 30 },
    ],
  });
  const balanced = await plan({
    name: "Balanced Table",
    slug: "balanced-table",
    description: "A rotating set of rice bowls and plates. Choose how many days, how many meals, and the serving size.",
    categoryId: bowls.id,
    basePriceCents: 250000,
    typeId: fixed.id,
    label: "POPULAR",
    groups: [
      duration("How long this program stays active before it completes."),
      { name: "Meals each day", key: "meals", help: "How many meals are included on each delivery day.", options: [{ label: "1 meal / day", delta: 0, isDefault: true }, { label: "2 meals / day", delta: 30000 }, { label: "3 meals / day", delta: 60000 }] },
      { name: "Serving", key: "serving", help: "Portion size for the included meals.", options: [{ label: "Regular", delta: 0, isDefault: true }, { label: "Large", delta: 15000 }] },
    ],
  });
  await plan({
    name: "High Protein Rotation",
    slug: "high-protein",
    description: "Higher-protein plates for training weeks. The duration and meals are configured here, not hard-coded in the storefront.",
    categoryId: protein.id,
    basePriceCents: 280000,
    typeId: fixed.id,
    label: "BEST_VALUE",
    groups: [duration("Program length."), { name: "Meals each day", key: "meals", help: "Meals delivered each day.", options: [{ label: "2 meals / day", delta: 0, isDefault: true }, { label: "3 meals / day", delta: 40000 }] }],
  });
  await plan({
    name: "Plant Forward",
    slug: "plant-forward",
    description: "Vegetable-forward meals with the same duration options as the other programs.",
    categoryId: plants.id,
    basePriceCents: 230000,
    typeId: fixed.id,
    label: "NEW",
    groups: [duration("Program length."), { name: "Serving", key: "serving", help: "Portion size.", options: [{ label: "Regular", delta: 0, isDefault: true }, { label: "Large", delta: 12000 }] }],
  });
  await plan({
    name: "Family Table",
    slug: "family-table",
    description: "Shared trays for a household. Delivery days follow the zone schedule.",
    categoryId: bowls.id,
    basePriceCents: 420000,
    typeId: weekly.id,
    label: "FEATURED",
    groups: [{ name: "Renewal", key: "renewal", help: "How often this household plan renews.", options: [{ label: "Every week", delta: 0, unit: "WEEK", count: 1, mode: "RECURRING", meals: 4, isDefault: true }, { label: "Every 4 weeks", delta: 60000, unit: "WEEK", count: 4, mode: "RECURRING", meals: 16 }] }],
  });
  await plan({
    name: "Studio Membership",
    slug: "studio-membership",
    description: "A monthly access membership. This is the same subscription engine, used for something other than meals.",
    categoryId: memberships.id,
    basePriceCents: 180000,
    typeId: monthly.id,
    groups: [{ name: "Access", key: "access", help: "What the membership includes each period.", options: [{ label: "8 visits", delta: 0, unit: "MONTH", count: 1, mode: "RECURRING", meals: 8, isDefault: true }, { label: "Unlimited", delta: 70000, unit: "MONTH", count: 1, mode: "RECURRING" }] }],
  });
  await plan({
    name: "Home Reset",
    slug: "home-reset",
    description: "A recurring cleaning visit. Zones, cutoff times, and fees still come from delivery settings.",
    categoryId: services.id,
    basePriceCents: 160000,
    typeId: weekly.id,
    groups: [{ name: "Visits", key: "visits", help: "How many visits are included.", options: [{ label: "1 visit / week", delta: 0, unit: "WEEK", count: 1, mode: "RECURRING", meals: 1, isDefault: true }, { label: "2 visits / week", delta: 90000, unit: "WEEK", count: 1, mode: "RECURRING", meals: 2 }] }],
  });

  const zone = await prisma.deliveryZone.create({
    data: {
      name: "Davao City",
      city: "Davao City",
      region: "Davao del Sur",
      feeCents: 20000,
      notes: "Demo zone. Monday to Saturday, morning window.",
      schedules: {
        create: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          dayOfWeek,
          windowStart: "06:00",
          windowEnd: "09:00",
          cutoffTime: "20:00",
          maxOrders: 40,
        })),
      },
    },
    include: { schedules: true },
  });

  await prisma.coupon.create({
    data: { code: "WELCOME10", name: "Welcome 10", description: "10% off for a new customer.", type: "PERCENT", value: 10, scope: "NEW_CUSTOMER", active: true, endsAt: new Date("2026-12-31T23:59:59.000Z") },
  });
  await prisma.coupon.create({
    data: { code: "DAVAO50", name: "Davao 50", description: "₱50 off any plan.", type: "FIXED", value: 5000, scope: "ALL", active: true },
  });
  await prisma.coupon.create({
    data: { code: "EXPIRED", name: "Old offer", description: "An expired coupon kept so the rule can be tested.", type: "PERCENT", value: 20, scope: "ALL", active: true, endsAt: new Date("2020-01-01T00:00:00.000Z") },
  });

  const settings = [
    ["business.name", "business", "Business name", "Shown in the header and emails.", "BoxS"],
    ["business.city", "business", "City", "The home city for this demo store.", "Davao City"],
    ["business.currency", "business", "Currency", "ISO currency code used for prices.", "PHP"],
    ["business.timezone", "business", "Timezone", "Used when showing delivery times.", "Asia/Manila"],
    ["tax.rate_bps", "tax", "Tax rate", "Basis points. 1000 means 10 percent.", "0"],
    ["subscription.default_cutoff_hours", "subscription", "Default change cutoff", "Hours before a delivery that changes must be made. Plans can override this.", "24"],
    ["seo.title", "seo", "Default title", "Used when a page does not set its own title.", "BoxS subscriptions"],
    ["seo.description", "seo", "Default description", "Used for pages without their own description.", "A flexible subscription platform for meals, memberships, and services."],
  ] as const;
  for (const [key, group, label, helpText, value] of settings) {
    await prisma.setting.create({ data: { key, group, label, helpText, value } });
  }
  await prisma.setting.create({ data: { key: "sequence.order", group: "system", label: "Order numbers", helpText: "Internal counter.", value: "10000" } });
  await prisma.setting.create({ data: { key: "sequence.subscription", group: "system", label: "Subscription numbers", helpText: "Internal counter.", value: "10000" } });

  for (const [key, enabled, description] of [
    ["ENABLE_COUPONS", true, "Allow coupon codes at checkout."],
    ["ENABLE_REVIEWS", false, "Reserved for a future reviews module."],
    ["ENABLE_DELIVERY_SLOTS", true, "Let customers pick a delivery window."],
    ["ENABLE_REFERRALS", false, "Reserved for a future referral module."],
    ["ENABLE_GIFT_CARDS", false, "Reserved for a future gift card module."],
    ["ENABLE_MONTHLY_SUBSCRIPTIONS", true, "Allow monthly renewal types."],
  ] as const) {
    await prisma.featureFlag.create({ data: { key, enabled, description } });
  }

  const templates = [
    ["welcome", "Welcome"],
    ["subscription.created", "Subscription created"],
    ["payment.successful", "Payment successful"],
    ["payment.failed", "Payment failed"],
    ["renewal.upcoming", "Upcoming renewal"],
    ["delivery.reminder", "Delivery reminder"],
    ["subscription.paused", "Subscription paused"],
    ["subscription.cancelled", "Subscription cancelled"],
  ];
  for (const [key, name] of templates) {
    for (const channel of ["IN_APP", "EMAIL"] as const) {
      await prisma.notificationTemplate.create({
        data: { key, channel, name, subject: name, body: `${name} for {{customer}}.`, enabled: channel === "IN_APP" },
      });
    }
  }

  const home = await prisma.page.create({
    data: {
      title: "Home",
      slug: "home",
      status: "ACTIVE",
      body: "BoxS runs subscriptions for meals, memberships, and services from one admin.",
      blocks: {
        create: [
          { title: "Plans that an admin can shape", body: "Duration, meals, servings, visits, and access levels are options on the plan. They are not separate websites.", sortOrder: 0 },
          { title: "One price, everywhere", body: "Storefront, checkout, renewals, and the plan builder all ask the same pricing service.", sortOrder: 1 },
          { title: "Davao is the demo, not the limit", body: "Seed data uses Philippine peso and a Davao City delivery zone so the first store feels real.", sortOrder: 2 },
        ],
      },
    },
  });
  await prisma.page.create({
    data: { title: "About", slug: "about", status: "ACTIVE", seoTitle: "About BoxS", body: "BoxS is a subscription platform. The demo catalog is a Davao kitchen plus a studio membership and a home service, so the model is not locked to meals.\n\nAdministrators publish plans, zones, coupons, and pages without a developer. Customers pause, skip, and change plans inside the rules those administrators set." },
  });
  await prisma.faq.createMany({
    data: [
      { question: "Can I pause a subscription?", answer: "Yes, when the plan allows it. The cutoff is a setting on the plan, not a fixed rule in the code.", sortOrder: 0 },
      { question: "What happens if a plan price changes?", answer: "New orders use the new price. Orders already placed keep the amount that was charged.", sortOrder: 1 },
      { question: "Is this only for meals?", answer: "No. Meals are the demo. The same plan builder can describe a membership or a service visit.", sortOrder: 2 },
    ],
  });
  const header = await prisma.menu.create({ data: { key: "header", name: "Header" } });
  const footer = await prisma.menu.create({ data: { key: "footer", name: "Footer" } });
  await prisma.menuItem.createMany({
    data: [
      { menuId: header.id, label: "Plans", href: "/plans", sortOrder: 0 },
      { menuId: header.id, label: "Menu", href: "/menu", sortOrder: 1 },
      { menuId: header.id, label: "Products", href: "/products", sortOrder: 2 },
      { menuId: header.id, label: "FAQ", href: "/faq", sortOrder: 3 },
      { menuId: footer.id, label: "About", href: "/about", sortOrder: 0 },
      { menuId: footer.id, label: "Contact", href: "/contact", sortOrder: 1 },
    ],
  });
  void home;
  void addons;
  void liza;

  const deliveryDate = new Date();
  deliveryDate.setUTCDate(deliveryDate.getUTCDate() + 3);
  while (deliveryDate.getUTCDay() === 0) deliveryDate.setUTCDate(deliveryDate.getUTCDate() + 1);
  deliveryDate.setUTCHours(0, 0, 0, 0);
  const durationGroup = balanced.groups.find((group) => group.key === "duration");
  const mealsGroup = balanced.groups.find((group) => group.key === "meals");
  const servingGroup = balanced.groups.find((group) => group.key === "serving");
  const optionIds = [durationGroup, mealsGroup, servingGroup]
    .map((group) => group?.options.find((option) => option.isDefault)?.id)
    .filter((value): value is string => Boolean(value));
  await checkout({
    userId: paolo.id,
    planId: balanced.id,
    optionIds,
    zoneId: zone.id,
    scheduleId: zone.schedules.find((schedule) => schedule.dayOfWeek === deliveryDate.getUTCDay())?.id,
    deliveryDate: deliveryDate.toISOString(),
    address: { label: "Home", line1: "14 Jacinto Street", city: "Davao City", region: "Davao del Sur", postalCode: "8000" },
    paymentProvider: "manual",
    couponCode: "WELCOME10",
  });

  console.log("Seeded BoxS demo data.");
  console.log("Admin: admin@boxs.demo / DemoAdmin123!");
  console.log("Customer: paolo@boxs.demo / DemoCustomer123!");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
