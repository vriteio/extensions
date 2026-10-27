import type { AndesineClient } from "@andesine/sdk";
import * as z from "zod";
import { createCustomHostname, deleteCustomHostname, getCustomHostname } from "../cloudflare";
import type { Env } from "../env";
import { MAX_DOMAINS } from "../../shared/constants";
import { BadRequestError, parseInput } from "../errors";
import { getRegistry } from "../registry";
import { getServedDomains, getSiteOrigins, getSiteURL, type Site, type SiteDomain } from "../site";
import { getLiveBuildID, requestBuild, type SiteRef } from "../site-builds";
import { getHostKey, type HostEntry } from "../../shared/storage";
import type { SiteStore } from "../store";

interface DomainContext {
  env: Env;
  client: AndesineClient;
  store: SiteStore;
  site: Site;
  ref: SiteRef;
  /** The workspace's plan has custom domains. */
  customDomains: boolean;
}

const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/,
    "Use a domain name, e.g. docs.example.com"
  );

/**
 * Saves the domains and keeps the key's origins, the host map, and the site URL in step with
 * them and with the plan: without custom domains, they stop serving but stay listed.
 */
const saveDomains = async (context: DomainContext, domains: SiteDomain[]): Promise<Site> => {
  const { env, client, store, site, ref, customDomains } = context;
  const updated = {
    ...site,
    domains,
    customDomainsServed: customDomains,
    updatedAt: new Date().toISOString()
  };
  const wasServed = site.customDomainsServed ?? true;
  const isURLChanged = getSiteURL(env, site, wasServed) !== getSiteURL(env, updated, customDomains);
  const origins = getSiteOrigins(env, updated, customDomains);
  const served = new Set(getServedDomains(updated, customDomains).map(({ hostname }) => hostname));
  const entry: HostEntry = {
    siteID: site.id,
    buildID: (await getLiveBuildID(env, site.id)) ?? undefined
  };

  if (origins.join() !== getSiteOrigins(env, site, wasServed).join()) {
    await client.extensions.updateSelfPublishableKey({
      keyID: site.keyID,
      allowedOrigins: origins
    });
  }

  for (const { hostname } of domains) {
    if (served.has(hostname)) await env.HOSTS.put(getHostKey(hostname), JSON.stringify(entry));
    else await env.HOSTS.delete(getHostKey(hostname));
  }

  await store.setSite(updated);

  // Canonical URLs and the sitemap use the site URL.
  if (isURLChanged) await requestBuild(env, ref, "settings");

  return updated;
};
/**
 * Reads the state of pending domains from Cloudflare, and applies a plan change; an active
 * domain starts serving.
 */
const syncDomains = async (context: DomainContext): Promise<Site> => {
  const domains = context.site.domains ?? [];
  const pending = domains.filter(({ status }) => status === "pending");
  const isPlanChanged = (context.site.customDomainsServed ?? true) !== context.customDomains;

  if (!domains.length || (!pending.length && !isPlanChanged)) return context.site;

  const refreshed = await Promise.all(
    domains.map(async (domain) => {
      if (domain.status !== "pending") return domain;

      const state = await getCustomHostname(context.env, domain.customHostnameID);

      return { ...domain, status: state.status, records: state.records, errors: state.errors };
    })
  );

  return saveDomains(context, refreshed);
};
/** Custom domains of a site: add, remove, and the primary one. */
const handleDomainAction = async (
  context: DomainContext,
  action: string,
  body: { hostname?: unknown }
): Promise<Site | null> => {
  const { env, site, ref } = context;
  const domains = site.domains ?? [];

  const needsPro = action === "add-domain" || (action === "primary-domain" && body.hostname);

  if (needsPro && !context.customDomains) {
    throw new BadRequestError("Custom domains need the Pro plan");
  }

  const hostname = parseInput(hostnameSchema.nullable(), body.hostname ?? null);
  const domain = domains.find((item) => item.hostname === hostname);

  if (action === "add-domain") {
    const isSitesDomain =
      hostname?.endsWith(`.${env.SITES_DOMAIN}`) || hostname === env.SITES_DOMAIN;

    if (!hostname || isSitesDomain) {
      throw new BadRequestError(`Use a domain outside ${env.SITES_DOMAIN}`);
    }

    if (domain) return site;

    if (domains.length >= MAX_DOMAINS) {
      throw new BadRequestError(`A site can have up to ${MAX_DOMAINS} domains`);
    }

    const isReserved = await getRegistry(env).reserve(hostname, ref);

    if (!isReserved) throw new BadRequestError("Another site uses this domain");

    try {
      const created = await createCustomHostname(env, hostname);

      await getRegistry(env).reserve(hostname, { ...ref, customHostnameID: created.id });
      const added: SiteDomain = {
        hostname,
        customHostnameID: created.id,
        ...created,
        primary: false
      };

      return saveDomains(context, [...domains, added]);
    } catch (error) {
      await getRegistry(env).release(hostname, ref);
      throw error;
    }
  }

  if (action === "remove-domain" && domain) {
    await deleteCustomHostname(env, domain.customHostnameID).catch(() => undefined);
    await env.HOSTS.delete(getHostKey(domain.hostname));
    await getRegistry(env).release(domain.hostname, ref);

    return saveDomains(
      context,
      domains.filter((item) => item !== domain)
    );
  }

  if (action === "primary-domain") {
    const isUsable = !domain || domain.status === "active";

    if (!isUsable) throw new BadRequestError("Only an active domain can be primary");

    return saveDomains(
      context,
      domains.map((item) => ({ ...item, primary: item.hostname === hostname }))
    );
  }

  return null;
};

export { handleDomainAction, syncDomains };
