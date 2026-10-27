import { ExtensionNotificationError, ExtensionSessionError } from "@andesine/sdk/extensions";
import type { Env } from "./env";
import { handleAndesineWebhook } from "./routes/andesine";
import { BadRequestError } from "./errors";
import { handlePanelRequest } from "./routes/panel";

const PANEL_PREFIX = "/panel/";
// The frontend calls the backend from the browser, so panel routes need CORS.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, content-type, andesine-extension, andesine-instance"
};

const route = (env: Env, request: Request): Promise<Response> | Response => {
  const { pathname } = new URL(request.url);

  if (request.method === "POST" && pathname === "/andesine/webhooks") {
    return handleAndesineWebhook(env, request);
  }

  if (request.method === "POST" && pathname.startsWith(PANEL_PREFIX)) {
    return handlePanelRequest(env, request, pathname.slice(PANEL_PREFIX.length));
  }

  return new Response(null, { status: 404 });
};
/** Rejections of the Andesine API (for example a missing permission) reach the panel. */
const toErrorResponse = (error: unknown): Response => {
  const status = (error as { status?: unknown } | null)?.status;
  const isAPIRejection = typeof status === "number" && status >= 400 && status < 500;
  const isRejected =
    error instanceof ExtensionSessionError || error instanceof ExtensionNotificationError;

  if (error instanceof BadRequestError) {
    return Response.json({ message: error.message }, { status: 400 });
  }

  if (isRejected) {
    console.warn(error.message);

    return Response.json({ message: `The session was refused (${error.code})` }, { status: 401 });
  }

  if (isAPIRejection) return Response.json({ message: (error as Error).message }, { status });

  console.error(error);

  return Response.json({ message: "The Pages backend failed" }, { status: 500 });
};

export { SiteRegistry } from "./registry";
export { SiteBuilds } from "./site-builds";
export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const response = await Promise.resolve(route(env, request)).catch(toErrorResponse);
    const withCORS = new Response(response.body, response);

    Object.entries(CORS_HEADERS).forEach(([name, value]) => withCORS.headers.set(name, value));

    return withCORS;
  }
} satisfies ExportedHandler<Env>;
