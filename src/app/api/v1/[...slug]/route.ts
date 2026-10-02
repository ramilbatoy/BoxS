import { handleApi } from "@/server/api";

type Context = { params: Promise<{ slug: string[] }> };

async function run(method: string, request: Request, context: Context) {
  const { slug } = await context.params;
  return handleApi(method, request, slug);
}

export const GET = (request: Request, context: Context) => run("GET", request, context);
export const POST = (request: Request, context: Context) => run("POST", request, context);
export const PATCH = (request: Request, context: Context) => run("PATCH", request, context);
export const DELETE = (request: Request, context: Context) => run("DELETE", request, context);
