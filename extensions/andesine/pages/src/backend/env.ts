import type { SiteRegistry } from "./registry";
import type { SiteBuilds } from "./site-builds";

/** Worker bindings: `wrangler.jsonc` vars and bindings, and `wrangler secret put` secrets. */
interface Env {
  /** The extension's private JWK (secret). */
  ANDESINE_EXTENSION_KEY: string;
  /** Trusted Andesine API URLs, separated by commas. */
  ANDESINE_INSTANCES: string;
  /** Signs the backend's storage records (secret). */
  STATE_SECRET: string;
  /** The domain of default site URLs, e.g. `andesine.page`. */
  SITES_DOMAIN: string;
  /** The host that custom domains point their CNAME to, e.g. `sites.andesine.page`. */
  SITES_FALLBACK_HOST: string;
  /** Development only: sites are `http://<subdomain>.<SITES_DOMAIN>:<port>`, served by `wrangler dev`. */
  SITES_DEV_PORT?: string;
  /**
   * Development only: builds go to this build server (`container/server.mjs` on the machine)
   * in place of the site's container, e.g. when the container can't reach a local instance.
   */
  LOCAL_BUILD_SERVER?: string;
  /** Edits custom hostnames on the sites zone only (secret). */
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ZONE_ID: string;
  /** One object reserves subdomains for all instances. */
  REGISTRY: DurableObjectNamespace<SiteRegistry>;
  /** One object per site builds it in its container. */
  BUILDS: DurableObjectNamespace<SiteBuilds>;
  /** Per site: `sites/<siteID>/files/<hash>`, `builds/<buildID>.json`, and `uploads/<file>`. */
  SITES: R2Bucket;
  /** `host:<hostname>` → the site and its live build (shared with the sites Worker). */
  HOSTS: KVNamespace;
}

export type { Env };
