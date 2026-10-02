import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { can } from "@/modules/auth/permissions";
import { system } from "@/repositories/system";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.permissions, "media.edit", session.user.role)) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "You do not have permission to upload media." } }, { status: 403 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "Choose an image to upload." } }, { status: 400 });
  }
  if (!file.type.startsWith("image/") || file.size > 8_000_000) {
    return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "Use an image under 8 MB." } }, { status: 400 });
  }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const filename = `${Date.now()}-${safe}`;
  const directory = path.join(process.cwd(), "public", "uploads");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
  const media = await system.addMedia({
    filename,
    url: `/uploads/${filename}`,
    mime: file.type,
    size: file.size,
    alt: String(form.get("alt") ?? ""),
    caption: String(form.get("caption") ?? ""),
    createdById: session.user.id,
  });
  return NextResponse.json({ success: true, data: media }, { status: 201 });
}
