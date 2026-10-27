import { getContentType } from "../shared/content-types";
import {
  getFileKey,
  getHostKey,
  getManifestKey,
  type BuildManifest,
  type HostEntry
} from "../shared/storage";
import { getCacheControl, getFolderPath, resolveFile } from "./paths";

interface Env {
  /** The files and manifests of the sites' builds. */
  SITES: R2Bucket;
  /** `host:<hostname>` → the site and its live build. */
  HOSTS: KVNamespace;
}

const KV_CACHE_SECONDS = 60;
const MAX_MANIFESTS = 200;
// Files and manifests never change under their keys, so edge copies can stay a long time.
const EDGE_CACHE_CONTROL = "public, max-age=31536000, immutable";
// SVGs opened directly are documents; uploaded ones could run scripts on the site's origin.
const SVG_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
// Manifests stay in memory per isolate; builds change them only by changing the build ID.
const manifests = new Map<string, BuildManifest>();

const textResponse = (status: number, text: string): Response => {
  return new Response(text, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
};
/** A body from the edge cache, else from R2, which is then cached under the same URL. */
const readCached = async (
  cacheURL: string,
  key: string,
  env: Env,
  context: ExecutionContext
): Promise<Response | null> => {
  const cached = await caches.default.match(cacheURL);

  if (cached) return cached;

  const object = await env.SITES.get(key);

  if (!object) return null;

  const response = new Response(object.body, {
    headers: { "cache-control": EDGE_CACHE_CONTROL }
  });

  context.waitUntil(caches.default.put(cacheURL, response.clone()));

  return response;
};
const loadManifest = async (
  entry: Required<HostEntry>,
  origin: string,
  env: Env,
  context: ExecutionContext
): Promise<BuildManifest | null> => {
  const known = manifests.get(entry.buildID);

  if (known) return known;

  const key = getManifestKey(entry.siteID, entry.buildID);
  const response = await readCached(`${origin}/__andesine/${key}`, key, env, context);
  const manifest = response && ((await response.json()) as BuildManifest);

  if (!manifest) return null;
  if (manifests.size >= MAX_MANIFESTS) manifests.delete(manifests.keys().next().value!);

  manifests.set(entry.buildID, manifest);

  return manifest;
};
/** A file of the build; its hash is its ETag, so revalidation needs no read. */
const serveFile = async (
  request: Request,
  entry: Required<HostEntry>,
  path: string,
  hash: string,
  status: number,
  env: Env,
  context: ExecutionContext
): Promise<Response> => {
  const etag = `"${hash}"`;
  const headers = new Headers({
    "content-type": getContentType(path),
    "cache-control": getCacheControl(path),
    "etag": etag,
    "x-content-type-options": "nosniff"
  });

  if (path.endsWith(".html") || path.endsWith(".md")) headers.set("vary", "accept");
  if (path.endsWith(".svg")) headers.set("content-security-policy", SVG_POLICY);

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const key = getFileKey(entry.siteID, hash);
  const body = await readCached(
    `${new URL(request.url).origin}/__andesine/${key}`,
    key,
    env,
    context
  );

  if (!body) return textResponse(500, "A file of this site is missing.");

  return new Response(request.method === "HEAD" ? null : body.body, {
    status,
    headers
  });
};

/** Serves the live build of the site of the request's host name; sites have no server code. */
export default {
  async fetch(request, env, context): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse(405, "Method not allowed");
    }

    const entry = await env.HOSTS.get<HostEntry>(getHostKey(url.hostname), {
      type: "json",
      cacheTtl: KV_CACHE_SECONDS
    });

    if (!entry) return textResponse(404, "There is no site at this address.");
    if (!entry.buildID) {
      return textResponse(503, "This site is being built. Try again in a minute.");
    }

    const live = entry as Required<HostEntry>;
    const manifest = await loadManifest(live, url.origin, env, context);
    const wantsMarkdown = request.headers.get("accept")?.includes("text/markdown") ?? false;
    const file = resolveFile(url.pathname, wantsMarkdown);

    if (!manifest) return textResponse(500, "This site's build is missing.");
    if (!file) return textResponse(400, "Invalid path");

    const folder = getFolderPath(file.key);
    const redirect = folder && manifest.redirects?.[folder];
    const hash = manifest.files[file.key];
    const notFound = manifest.files["404.html"];

    if (redirect) {
      const location = new URL(redirect, `${url.origin}${folder}`);

      if (!location.search) location.search = url.search;

      return Response.redirect(location.href, 307);
    }

    if (hash && file.redirect) {
      return Response.redirect(`${url.origin}${file.redirect}${url.search}`, 308);
    }

    if (hash) return serveFile(request, live, file.key, hash, 200, env, context);
    if (notFound) return serveFile(request, live, "404.html", notFound, 404, env, context);

    return textResponse(404, "Not found");
  }
} satisfies ExportedHandler<Env>;
