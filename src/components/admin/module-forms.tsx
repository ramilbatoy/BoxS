"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

async function postJson(path: string, body: unknown, method = "POST") {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!payload.success) throw new Error(payload.error?.message || "Could not save that.");
  return payload.data;
}

const field = "h-11 w-full rounded-xl border bg-white px-3";

export function ModuleForms({ module, onCreated }: { module: string; onCreated: () => void }) {
  if (module === "settings" || module === "system") return <SettingsForms onSaved={onCreated} flagsOnly={module === "system"} />;
  if (module === "roles") return <RoleForm onCreated={onCreated} />;
  if (module === "users") return <UserForm onCreated={onCreated} />;
  if (module === "deliveries") return <ZoneForm onCreated={onCreated} />;
  if (module === "media") return <MediaForm onCreated={onCreated} />;
  if (module === "content") return <PageForm onCreated={onCreated} />;
  if (module === "faqs") return <FaqForm onCreated={onCreated} />;
  if (module === "menus") return <MenuForm />;
  if (module === "notifications") return <TemplateToggles />;
  if (module === "api") return <ApiKeyForm onCreated={onCreated} />;
  if (["categories", "addons", "coupons", "products"].includes(module)) return <CatalogForm module={module} onCreated={onCreated} />;
  return null;
}

function CatalogForm({ module, onCreated }: { module: string; onCreated: () => void }) {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (module !== "products") return;
    fetch("/api/v1/categories?pageSize=50")
      .then((response) => response.json())
      .then((payload) => setCategories(payload.data?.items ?? []));
  }, [module]);

  return (
    <form
      className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const body =
          module === "coupons"
            ? {
                code: data.get("code"),
                name: data.get("name"),
                description: data.get("description") || "Created in admin",
                type: data.get("type") || "PERCENT",
                value: String(data.get("type")) === "FIXED" ? Math.round(Number(data.get("value") || 0) * 100) : Number(data.get("value") || 10),
                scope: data.get("scope") || "ALL",
                endsAt: data.get("endsAt") || null,
              }
            : module === "products"
              ? {
                  name: data.get("name"),
                  description: String(data.get("description") || "Added from admin"),
                  categoryId: data.get("categoryId"),
                  kind: data.get("kind") || "PHYSICAL",
                  basePriceCents: Math.round(Number(data.get("price") || 0) * 100),
                }
              : module === "addons"
                ? {
                    name: data.get("name"),
                    description: String(data.get("description") || "Added from admin"),
                    priceCents: Math.round(Number(data.get("price") || 0) * 100),
                  }
                : { name: data.get("name"), description: String(data.get("description") || "Added from admin") };
        try {
          await postJson(`/api/v1/${module}`, body);
          toast.success("Saved.");
          event.currentTarget.reset();
          onCreated();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save that.");
        }
      }}
    >
      <h2 className="font-medium">Add {module === "addons" ? "add-on" : module.slice(0, -1)}</h2>
      <div className="mt-3 grid gap-2">
        {module === "coupons" ? <input name="code" placeholder="Code, such as WELCOME10" className={field} required /> : null}
        <input name="name" placeholder="Name" className={field} required />
        <input name="description" placeholder="Short description" className={field} />
        {module === "products" ? (
          <>
            <select name="categoryId" className={field} required defaultValue="">
              <option value="" disabled>Choose a category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select name="kind" className={field} defaultValue="PHYSICAL">
              <option value="PHYSICAL">Physical product</option>
              <option value="MEAL">Meal</option>
              <option value="SERVICE">Service</option>
              <option value="DIGITAL">Digital</option>
              <option value="CREDIT">Credit</option>
            </select>
          </>
        ) : null}
        {module === "coupons" ? (
          <>
            <select name="type" className={field} defaultValue="PERCENT">
              <option value="PERCENT">Percent off</option>
              <option value="FIXED">Fixed amount in pesos</option>
            </select>
            <input name="value" placeholder="10 for 10%, or 50 for ₱50 off" className={field} />
            <select name="scope" className={field} defaultValue="ALL">
              <option value="ALL">Everyone</option>
              <option value="NEW_CUSTOMER">New customers</option>
              <option value="FIRST_SUBSCRIPTION">First subscription</option>
              <option value="PLAN">A specific plan</option>
              <option value="CATEGORY">A specific category</option>
            </select>
            <label className="text-xs text-muted-foreground">Expires<input name="endsAt" type="date" className={field} /></label>
          </>
        ) : null}
        {module === "products" || module === "addons" ? <input name="price" placeholder="Price in pesos" className={field} /> : null}
        <button className="h-11 rounded-full bg-[#1f6b56] text-white">Save</button>
      </div>
    </form>
  );
}

function UserForm({ onCreated }: { onCreated: () => void }) {
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/v1/roles").then((response) => response.json()).then((payload) => setRoles(payload.data ?? []));
  }, []);
  return (
    <form
      className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          await postJson("/api/v1/users", {
            name: data.get("name"),
            email: data.get("email"),
            password: data.get("password"),
            roleId: data.get("roleId"),
          });
          toast.success("User created.");
          event.currentTarget.reset();
          onCreated();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not create the user.");
        }
      }}
    >
      <h2 className="font-medium">Add user</h2>
      <p className="mt-1 text-xs text-muted-foreground">Staff accounts sign in with the same page as customers. The role decides what they can open.</p>
      <div className="mt-3 grid gap-2">
        <input name="name" placeholder="Name" className={field} required />
        <input name="email" type="email" placeholder="Email" className={field} required />
        <input name="password" type="password" placeholder="Temporary password" className={field} required minLength={8} />
        <select name="roleId" className={field} required defaultValue="">
          <option value="" disabled>Choose a role</option>
          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
        <button className="h-11 rounded-full bg-[#1f6b56] text-white">Create user</button>
      </div>
    </form>
  );
}

function RoleForm({ onCreated }: { onCreated: () => void }) {
  const [permissions, setPermissions] = useState<{ id: string; key: string; description: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/v1/permissions").then((response) => response.json()).then((payload) => setPermissions(payload.data ?? []));
  }, []);
  return (
    <form
      className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const name = String(data.get("name") || "");
        try {
          await postJson("/api/v1/roles", {
            name,
            slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
            description: String(data.get("description") || ""),
            permissionIds: selected,
          });
          toast.success("Role created.");
          setSelected([]);
          event.currentTarget.reset();
          onCreated();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not create the role.");
        }
      }}
    >
      <h2 className="font-medium">Custom role</h2>
      <p className="mt-1 text-xs text-muted-foreground">Tick what this role is allowed to do. Built-in roles stay in place.</p>
      <div className="mt-3 grid gap-2">
        <input name="name" placeholder="Role name" className={field} required />
        <input name="description" placeholder="What this role is for" className={field} />
        <div className="grid gap-1 sm:grid-cols-2">
          {permissions.map((permission) => (
            <label key={permission.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(permission.id)}
                onChange={() => setSelected((current) => current.includes(permission.id) ? current.filter((id) => id !== permission.id) : [...current, permission.id])}
              />
              <span>{permission.description}</span>
            </label>
          ))}
        </div>
        <button className="h-11 rounded-full bg-[#1f6b56] text-white">Save role</button>
      </div>
    </form>
  );
}

function ZoneForm({ onCreated }: { onCreated: () => void }) {
  return (
    <form
      className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          const zone = await postJson("/api/v1/delivery/zones", {
            name: data.get("name"),
            city: data.get("city"),
            region: data.get("region"),
            feeCents: Math.round(Number(data.get("fee") || 0) * 100),
            notes: data.get("notes"),
          });
          await postJson("/api/v1/delivery/schedules", {
            zoneId: zone.id,
            dayOfWeek: Number(data.get("day")),
            windowStart: data.get("start"),
            windowEnd: data.get("end"),
            cutoffTime: data.get("cutoff"),
            maxOrders: Number(data.get("max") || 40),
          });
          toast.success("Delivery zone saved.");
          event.currentTarget.reset();
          onCreated();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save the zone.");
        }
      }}
    >
      <h2 className="font-medium">Add a delivery zone</h2>
      <p className="mt-1 text-xs text-muted-foreground">Cutoff is the latest time a customer can still change that delivery. Example: Davao City, Monday, 6:00–9:00, cutoff 20:00 the day before.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input name="name" placeholder="Zone name" className={field} required />
        <input name="city" placeholder="City" className={field} required defaultValue="Davao City" />
        <input name="region" placeholder="Region" className={field} required defaultValue="Davao del Sur" />
        <input name="fee" placeholder="Fee in pesos" className={field} defaultValue="200" />
        <select name="day" className={field} defaultValue="1">
          {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}
        </select>
        <input name="start" placeholder="06:00" className={field} defaultValue="06:00" />
        <input name="end" placeholder="09:00" className={field} defaultValue="09:00" />
        <input name="cutoff" placeholder="20:00" className={field} defaultValue="20:00" />
        <input name="max" placeholder="Max orders" className={field} defaultValue="40" />
        <input name="notes" placeholder="Notes for the team" className={field} />
        <button className="h-11 rounded-full bg-[#1f6b56] text-white sm:col-span-2">Save zone</button>
      </div>
    </form>
  );
}

function PageForm({ onCreated }: { onCreated: () => void }) {
  return (
    <form
      className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          await postJson("/api/v1/pages", {
            title: data.get("title"),
            slug: data.get("slug"),
            body: data.get("body"),
            seoTitle: data.get("seoTitle"),
            seoDescription: data.get("seoDescription"),
          });
          toast.success("Page saved.");
          event.currentTarget.reset();
          onCreated();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save the page.");
        }
      }}
    >
      <h2 className="font-medium">Add a page</h2>
      <div className="mt-3 grid gap-2">
        <input name="title" placeholder="Title" className={field} required />
        <input name="slug" placeholder="Address, such as about" className={field} required />
        <textarea name="body" placeholder="Page text" className="min-h-28 rounded-xl border px-3 py-2" required />
        <input name="seoTitle" placeholder="Search title" className={field} />
        <input name="seoDescription" placeholder="Search description" className={field} />
        <button className="h-11 rounded-full bg-[#1f6b56] text-white">Save page</button>
      </div>
    </form>
  );
}

function FaqForm({ onCreated }: { onCreated: () => void }) {
  return (
    <form
      className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          await postJson("/api/v1/faqs", { question: data.get("question"), answer: data.get("answer") });
          toast.success("Question saved.");
          event.currentTarget.reset();
          onCreated();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save the question.");
        }
      }}
    >
      <h2 className="font-medium">Add a question</h2>
      <div className="mt-3 grid gap-2">
        <input name="question" placeholder="Question" className={field} required />
        <textarea name="answer" placeholder="Answer" className="min-h-24 rounded-xl border px-3 py-2" required />
        <button className="h-11 rounded-full bg-[#1f6b56] text-white">Save</button>
      </div>
    </form>
  );
}

function MenuForm() {
  const [menus, setMenus] = useState<{ id: string; name: string; key: string; items: { label: string; href: string }[] }[]>([]);
  const [menuId, setMenuId] = useState("");
  const [rows, setRows] = useState<{ label: string; href: string }[]>([{ label: "", href: "" }]);
  useEffect(() => {
    fetch("/api/v1/menus").then((response) => response.json()).then((payload) => {
      const list = payload.data ?? [];
      setMenus(list);
      if (list[0]) {
        setMenuId(list[0].id);
        setRows(list[0].items.length ? list[0].items.map((item: { label: string; href: string }) => ({ label: item.label, href: item.href })) : [{ label: "", href: "" }]);
      }
    });
  }, []);
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <h2 className="font-medium">Menu links</h2>
      <p className="mt-1 text-xs text-muted-foreground">These links appear in the storefront header or footer.</p>
      <select
        className={`${field} mt-3`}
        value={menuId}
        onChange={(event) => {
          const next = menus.find((menu) => menu.id === event.target.value);
          setMenuId(event.target.value);
          setRows(next?.items.length ? next.items.map((item) => ({ label: item.label, href: item.href })) : [{ label: "", href: "" }]);
        }}
      >
        {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name} ({menu.key})</option>)}
      </select>
      <div className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-2">
            <input className={field} placeholder="Label" value={row.label} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
            <input className={field} placeholder="/plans" value={row.href} onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, href: event.target.value } : item))} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="h-11 rounded-full bg-white px-4 ring-1 ring-black/10" onClick={() => setRows([...rows, { label: "", href: "" }])}>Add link</button>
        <button
          type="button"
          className="h-11 rounded-full bg-[#1f6b56] px-4 text-white"
          onClick={async () => {
            try {
              await postJson(`/api/v1/menus/${menuId}`, {
                items: rows.filter((row) => row.label && row.href).map((row, index) => ({ ...row, sortOrder: index })),
              }, "PATCH");
              toast.success("Menu updated.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not update the menu.");
            }
          }}
        >Save menu</button>
      </div>
    </div>
  );
}

function MediaForm({ onCreated }: { onCreated: () => void }) {
  const [pending, setPending] = useState(false);
  return (
    <form
      className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setPending(true);
        const response = await fetch("/api/v1/media/upload", { method: "POST", body: data });
        const payload = await response.json();
        setPending(false);
        if (!payload.success) {
          toast.error(payload.error?.message || "Upload failed.");
          return;
        }
        toast.success("Image added to the library.");
        event.currentTarget.reset();
        onCreated();
      }}
    >
      <h2 className="font-medium">Upload</h2>
      <p className="mt-1 text-xs text-muted-foreground">Images, logos, and banners. Alt text is what screen readers and search engines use.</p>
      <div className="mt-3 grid gap-2">
        <input name="file" type="file" accept="image/*" required className={field} />
        <input name="alt" placeholder="Alt text" className={field} />
        <input name="caption" placeholder="Caption" className={field} />
        <button className="h-11 rounded-full bg-[#1f6b56] text-white" disabled={pending}>{pending ? "Uploading…" : "Upload"}</button>
      </div>
    </form>
  );
}

function SettingsForms({ onSaved, flagsOnly }: { onSaved: () => void; flagsOnly?: boolean }) {
  const [settings, setSettings] = useState<{ key: string; group: string; label: string; helpText: string; value: string }[]>([]);
  const [flags, setFlags] = useState<{ key: string; description: string; enabled: boolean }[]>([]);
  useEffect(() => {
    Promise.all([
      fetch("/api/v1/settings").then((response) => response.json()),
      fetch("/api/v1/feature-flags").then((response) => response.json()),
    ]).then(([settingsPayload, flagsPayload]) => {
      setSettings((settingsPayload.data ?? []).filter((item: { group: string }) => item.group !== "system"));
      setFlags(flagsPayload.data ?? []);
    });
  }, []);
  return (
    <div className="mt-4 space-y-4">
      {flagsOnly ? null : (
        <form
          className="rounded-2xl bg-white p-4 ring-1 ring-black/5"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await postJson("/api/v1/settings", { entries: settings.map((item) => ({ key: item.key, value: item.value })) }, "PATCH");
              toast.success("Settings saved.");
              onSaved();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not save settings.");
            }
          }}
        >
          <h2 className="font-medium">Business settings</h2>
          <div className="mt-3 space-y-3">
            {settings.map((item) => (
              <label key={item.key} className="block text-sm">
                <span className="font-medium">{item.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.helpText}</span>
                <input className={`${field} mt-1`} value={item.value} onChange={(event) => setSettings(settings.map((row) => row.key === item.key ? { ...row, value: event.target.value } : row))} />
              </label>
            ))}
          </div>
          <button className="mt-4 h-11 rounded-full bg-[#1f6b56] px-5 text-white">Save settings</button>
        </form>
      )}
      <form
        className="rounded-2xl bg-white p-4 ring-1 ring-black/5"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await postJson("/api/v1/feature-flags", { entries: flags.map((flag) => ({ key: flag.key, enabled: flag.enabled })) }, "PATCH");
            toast.success("Features updated.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not update features.");
          }
        }}
      >
        <h2 className="font-medium">Features</h2>
        <p className="mt-1 text-xs text-muted-foreground">Turn a capability on or off without a code change.</p>
        <div className="mt-3 space-y-2">
          {flags.map((flag) => (
            <label key={flag.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={flag.enabled} onChange={(event) => setFlags(flags.map((row) => row.key === flag.key ? { ...row, enabled: event.target.checked } : row))} />
              <span><span className="font-medium">{flag.key}</span><span className="block text-xs text-muted-foreground">{flag.description}</span></span>
            </label>
          ))}
        </div>
        <button className="mt-4 h-11 rounded-full bg-[#1f6b56] px-5 text-white">Save features</button>
      </form>
    </div>
  );
}

function TemplateToggles() {
  const [templates, setTemplates] = useState<{ id: string; name: string; channel: string; enabled: boolean; key: string }[]>([]);
  useEffect(() => {
    fetch("/api/v1/notifications/templates").then((response) => response.json()).then((payload) => setTemplates(payload.data ?? []));
  }, []);
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <h2 className="font-medium">Channels</h2>
      <p className="mt-1 text-xs text-muted-foreground">Email, SMS, and push stay off until a provider is connected. In-app notices are stored for the customer.</p>
      <ul className="mt-3 space-y-2 text-sm">
        {templates.map((template) => (
          <li key={template.id} className="flex items-center justify-between gap-3">
            <span>{template.name} · {template.channel}</span>
            <button
              className="h-9 rounded-full bg-[#f6f1e7] px-3"
              onClick={async () => {
                const enabled = !template.enabled;
                try {
                  await postJson("/api/v1/notifications/templates", { id: template.id, enabled }, "PATCH");
                  setTemplates(templates.map((row) => row.id === template.id ? { ...row, enabled } : row));
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not update that notice.");
                }
              }}
            >{template.enabled ? "On" : "Off"}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ApiKeyForm({ onCreated }: { onCreated: () => void }) {
  const [secret, setSecret] = useState("");
  return (
    <form
      className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          const created = await postJson("/api/v1/api-keys", { name: data.get("name") });
          setSecret(created.secret);
          toast.success("Key created. Copy it now — it will not be shown again.");
          event.currentTarget.reset();
          onCreated();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not create a key.");
        }
      }}
    >
      <h2 className="font-medium">New API key</h2>
      <div className="mt-3 grid gap-2">
        <input name="name" placeholder="Name, such as Warehouse" className={field} required />
        <button className="h-11 rounded-full bg-[#1f6b56] text-white">Create key</button>
        {secret ? <p className="break-all rounded-xl bg-[#f6f1e7] p-3 text-sm">{secret}</p> : null}
      </div>
    </form>
  );
}
