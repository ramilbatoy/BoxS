# Admin guide

Sign in at `/login` with `admin@boxs.demo` / `DemoAdmin123!`, then open `/admin`.

The left menu (a horizontal scroller on a phone) follows the same idea as WordPress: each area is a list, a search box, and a form. You never edit JSON or database ids.

## Plans

**Plans → Add plan.**

- Name, address, description, and category.
- Subscription type (one-time program or a recurring interval you created under subscription types).
- Prices in pesos. Tax is a percent.
- Option groups such as Duration, Meals, or Serving. The extra price is in pesos. Put a day count only on the option that sets how long the subscription lasts.
- Rules for pause, skip, cancel, and plan changes, plus the cutoff in hours.
- A storefront badge, including Hidden.
- Save draft, or Publish. Publishing stores a version. Orders already placed keep their old total.

## Everything else

- **Products, categories, add-ons** — forms under the list. Product prices are in pesos. Pick a category from the menu.
- **Customers, orders, subscriptions** — search, open an order, and use the checkboxes for bulk confirm, deliver, publish, archive, or suspend.
- **Deliveries** — add a zone with a fee, a day, a window, a cutoff, and a daily maximum.
- **Coupons** — percent or a fixed peso amount, who it applies to, and an end date.
- **Pages, menus, FAQs** — storefront copy. The header and footer menus are edited as label and address rows.
- **Media** — upload an image with alt text. Files land in the media library.
- **Settings** — business name, currency, timezone, tax, and the wording next to each field. **System** holds feature switches such as coupons and delivery slots.
- **Users and roles** — create a person, pick a role, or build a role by ticking permissions.
- **Notifications** — turn each template channel on or off.
- **API** — create a key. Copy the secret when it appears. It is not shown again.
- **Audit logs** — who changed what, and when.
- **Reports** — Today, 7 days, 30 days, 90 days, or this year.

Search at the top of every admin page looks across customers, orders, subscriptions, plans, products, and coupons.

Export links on the main lists download CSV.
