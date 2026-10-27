import { ExtensionNotificationError, ExtensionSessionError } from "@andesine/sdk/extensions";
import type { Env } from "./env";
import { handleAndesineWebhook } from "./routes/andesine";
import { handleSetup, handleWebhook } from "./routes/github";
import { BadRequestError, handlePanelRequest } from "./routes/panel";

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
  const target = `${request.method} ${pathname}`;

  if (target === "GET /github/setup") return handleSetup(env, request);
  if (target === "POST /github/webhooks") return handleWebhook(env, request);
  if (target === "POST /andesine/webhooks") return handleAndesineWebhook(env, request);

  if (request.method === "POST" && pathname.startsWith(PANEL_PREFIX)) {
    return handlePanelRequest(env, request, pathname.slice(PANEL_PREFIX.length));
  }

  return new Response(null, { status: 404 });
};
const toErrorResponse = (error: unknown): Response => {
  const isRejected =
    error instanceof ExtensionSessionError || error instanceof ExtensionNotificationError;

  if (error instanceof BadRequestError) {
    return Response.json({ message: error.message }, { status: 400 });
  }

  if (isRejected) return new Response(null, { status: 401 });

  console.error(error);

  return Response.json({ message: "The GitHub Sync backend failed" }, { status: 500 });
};

export { RepositorySync } from "./repository-sync";
export default {
  async fetch(request, env): Promise<Response> {
    const isPanel = new URL(request.url).pathname.startsWith(PANEL_PREFIX);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const response = await Promise.resolve(route(env, request)).catch(toErrorResponse);

    if (!isPanel) return response;

    const withCORS = new Response(response.body, response);

    Object.entries(CORS_HEADERS).forEach(([name, value]) => withCORS.headers.set(name, value));

    return withCORS;
  }
} satisfies ExportedHandler<Env>;
