export const PERMISSIONS = [
  ["users.view", "View users", "users"],
  ["users.create", "Create users", "users"],
  ["users.edit", "Edit users", "users"],
  ["users.delete", "Delete users", "users"],
  ["plans.view", "View plans", "plans"],
  ["plans.create", "Create plans", "plans"],
  ["plans.edit", "Edit plans", "plans"],
  ["plans.delete", "Delete plans", "plans"],
  ["products.view", "View products", "products"],
  ["products.create", "Create products", "products"],
  ["products.edit", "Edit products", "products"],
  ["products.delete", "Delete products", "products"],
  ["orders.view", "View orders", "orders"],
  ["orders.edit", "Edit orders", "orders"],
  ["subscriptions.view", "View subscriptions", "subscriptions"],
  ["subscriptions.edit", "Edit subscriptions", "subscriptions"],
  ["payments.view", "View payments", "payments"],
  ["payments.refund", "Refund payments", "payments"],
  ["customers.view", "View customers", "customers"],
  ["customers.edit", "Edit customers", "customers"],
  ["deliveries.view", "View deliveries", "deliveries"],
  ["deliveries.edit", "Edit deliveries", "deliveries"],
  ["coupons.view", "View coupons", "coupons"],
  ["coupons.edit", "Edit coupons", "coupons"],
  ["content.view", "View content", "content"],
  ["content.edit", "Edit content", "content"],
  ["media.view", "View media", "media"],
  ["media.edit", "Edit media", "media"],
  ["reports.view", "View reports", "reports"],
  ["settings.manage", "Manage settings", "settings"],
  ["notifications.manage", "Manage notifications", "notifications"],
  ["audit.view", "View audit logs", "audit"],
  ["api.manage", "Manage API keys", "api"],
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number][0];

const ALL = PERMISSIONS.map(([key]) => key);

export const ROLE_PRESETS: Record<string, { name: string; description: string; permissions: PermissionKey[] }> = {
  "super-admin": {
    name: "Super Admin",
    description: "Full access to every module.",
    permissions: ALL,
  },
  admin: {
    name: "Admin",
    description: "Runs the business day to day.",
    permissions: ALL.filter((key) => key !== "users.delete"),
  },
  manager: {
    name: "Manager",
    description: "Manages plans, orders, and customers.",
    permissions: [
      "plans.view",
      "plans.create",
      "plans.edit",
      "products.view",
      "products.edit",
      "orders.view",
      "orders.edit",
      "subscriptions.view",
      "subscriptions.edit",
      "customers.view",
      "customers.edit",
      "deliveries.view",
      "coupons.view",
      "reports.view",
    ],
  },
  "customer-support": {
    name: "Customer Support",
    description: "Helps customers with subscriptions and orders.",
    permissions: [
      "customers.view",
      "customers.edit",
      "orders.view",
      "orders.edit",
      "subscriptions.view",
      "subscriptions.edit",
      "deliveries.view",
    ],
  },
  "content-manager": {
    name: "Content Manager",
    description: "Edits pages, menus, FAQs, and media.",
    permissions: ["content.view", "content.edit", "media.view", "media.edit"],
  },
  "delivery-manager": {
    name: "Delivery Manager",
    description: "Manages zones, windows, and delivery status.",
    permissions: ["deliveries.view", "deliveries.edit", "orders.view", "orders.edit"],
  },
  finance: {
    name: "Finance",
    description: "Reviews payments, refunds, and reports.",
    permissions: ["payments.view", "payments.refund", "reports.view", "orders.view", "subscriptions.view"],
  },
  customer: {
    name: "Customer",
    description: "Shops and manages a personal subscription.",
    permissions: [],
  },
};

export function can(permissions: string[] | undefined, key: string, role?: string) {
  if (role === "super-admin") return true;
  return Boolean(permissions?.includes(key));
}
