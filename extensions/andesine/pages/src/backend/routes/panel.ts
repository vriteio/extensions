import * as z from "zod";
import { getBackend } from "../andesine";
import type { Env } from "../env";
import { NOTHING_PUBLISHED } from "../../shared/constants";
import { getHostKey, type HostEntry } from "../../shared/storage";
import { deleteCustomHostname } from "../cloudflare";
import { BadRequestError, parseInput } from "../errors";
import { getRegistry } from "../registry";
import {
  LATEST_TEMPLATE_VERSION,
  createConfigFile,
  createSiteConfig,
  getDefaultHost,
  getSiteURL,
  getUploadFiles,
  hasCustomDomains,
  showsPoweredBy,
  siteConfigSchema,
  subdomainSchema,
  type Site
} from "../site";
import {
  deleteSiteBuilds,
  getBuildStatus,
  hasPublishedContent,
  requestBuild,
  type SiteRef
} from "../site-builds";
import { MAX_SITES, createSiteStore } from "../store";
import { assertUploads, readUploads, removeUnusedUploads, saveUpload, toDataURL } from "../uploads";
import { getEntryPages } from "../entry-pages";
import { handleDomainAction, syncDomains } from "./domains";

interface PanelRequest {
  collectionID?: unknown;
  /** The open entry, whose site the summary finds when the collection has none. */
  entryID?: unknown;
  subdomain?: unknown;
  hostname?: unknown;
  channel?: unknown;
  config?: unknown;
  /** An uploaded image: its media type and base64 content. */
  type?: unknown;
  data?: unknown;
}

const MANAGE_ACTIONS = ["publishing:publish", "collection:update"] as const;

const json = (body: unknown, status = 200): Response => Response.json(body, { status });
const toSiteView = (env: Env, site: Site, customDomains: boolean) => ({
  id: site.id,
  collectionID: site.collectionID,
  subdomain: site.subdomain,
  domains: site.domains ?? [],
  channel: site.channel,
  templateVersion: site.templateVersion,
  config: site.config,
  url: getSiteURL(env, site, customDomains),
  createdAt: site.createdAt,
  updatedAt: site.updatedAt
});

/** The site whose live build has the entry's page, e.g. for an entry in a nested collection. */
const findEntrySite = async (env: Env, sites: Site[], entryID: string): Promise<Site | null> => {
  const found = await Promise.all(
    sites.map(async (site) => ((await getEntryPages(env, site.id)).pages[entryID] ? site : null))
  );

  return found.find(Boolean) ?? null;
};

/** Site changes need the member to publish and update the site's collection. */
const handlePanelRequest = async (
  env: Env,
  request: Request,
  action: string
): Promise<Response> => {
  const body = (await request.json().catch(() => ({}))) as PanelRequest;
  const collectionID = parseInput(z.string().min(1), body.collectionID);
  const session = await getBackend(env).verifySession(request.headers, {
    checks: [{ collectionID, actions: [...MANAGE_ACTIONS] }]
  });
  const canManage = session.checks[0]?.allowed ?? false;
  const installation = {
    instance: session.instance,
    extensionID: session.extensionID,
    collectionID
  };
  const store = createSiteStore(env, session.client, session.extensionID);
  // The summary lists the sites, to find the site of an entry in a nested collection too.
  const sites = action === "summary" ? await store.listSites() : null;
  const site = sites
    ? (sites.find((item) => item.collectionID === collectionID) ?? null)
    : await store.getSite(collectionID);
  const ref: SiteRef | null = site && { ...installation, siteID: site.id };
  const customDomains = hasCustomDomains(session.workspacePlan);
  const context = site && ref && { env, client: session.client, store, site, ref, customDomains };

  if (action === "summary") {
    const entryID = parseInput(z.string().startsWith("ent_").optional(), body.entryID);
    const found = site ?? (entryID ? await findEntrySite(env, sites!, entryID) : null);
    // A build needs published content; the page says so instead of a failed build.
    const [builds, published] = found
      ? await Promise.all([
          getBuildStatus(env, found.id),
          hasPublishedContent(session.client, found.collectionID, found.channel)
        ])
      : [null, false];

    return json({
      canManage,
      templates: { latest: LATEST_TEMPLATE_VERSION },
      site: found && toSiteView(env, found, customDomains),
      customDomains,
      builds,
      published
    });
  }

  if (action === "entry-pages") {
    return site ? json(await getEntryPages(env, site.id)) : json({ buildID: null, pages: {} });
  }

  if (action === "previews") {
    const uploads = site ? await readUploads(env, site.id, getUploadFiles(site.config)) : [];

    // Previews of the uploaded images by their config values, e.g. `upload:<file>`.
    return json(
      Object.fromEntries(uploads.map((upload) => [`upload:${upload.file}`, toDataURL(upload)]))
    );
  }

  // Any member who sees the site may check the domains that wait for DNS.
  if (action === "refresh-domains" && context) {
    return json({ site: toSiteView(env, await syncDomains(context), customDomains) });
  }

  if (!canManage) {
    return json({ message: "You need to be able to publish and update this collection" }, 403);
  }

  if (action === "create") {
    const subdomain = parseInput(subdomainSchema, body.subdomain);
    const channel = parseInput(z.string().trim().min(1).max(50), body.channel ?? "published");
    // Publishing is on, as the setup is available only then; a never published collection has no
    // published tree yet, so its first publish builds the site.
    const [collection, published, sites] = await Promise.all([
      session.client.collections.get({ collectionID }),
      hasPublishedContent(session.client, collectionID, channel),
      store.listSites()
    ]);
    const siteURL = getSiteURL(env, { subdomain }, false);
    // Host names have no port; the sites Worker looks up the request's host name.
    const defaultHost = getDefaultHost(env, { subdomain });
    const newRef: SiteRef = {
      ...installation,
      siteID: `site_${crypto.randomUUID().replace(/-/g, "")}`
    };

    if (site) return json({ message: "This collection already has a site" }, 409);

    if (sites.length >= MAX_SITES) {
      throw new BadRequestError(`A workspace can have up to ${MAX_SITES} sites`);
    }

    const isReserved = await getRegistry(env).reserve(defaultHost, newRef);

    if (!isReserved) return json({ message: "This subdomain is taken" }, 409);

    try {
      const key = await session.client.extensions.createSelfPublishableKey({
        name: `Site ${subdomain}.${env.SITES_DOMAIN}`,
        collectionIDs: [collectionID],
        allowedOrigins: [siteURL],
        answers: false
      });
      const now = new Date().toISOString();
      const created: Site = {
        id: newRef.siteID,
        collectionID,
        channel,
        subdomain,
        templateVersion: LATEST_TEMPLATE_VERSION,
        keyID: key.id,
        publicKey: key.value,
        config: createSiteConfig(collection.name),
        createdAt: now,
        updatedAt: now
      };

      await store.setSite(created).catch(async (error: unknown) => {
        await session.client.extensions.deleteSelfPublishableKey({ keyID: key.id });
        throw error;
      });

      await env.HOSTS.put(
        getHostKey(defaultHost),
        JSON.stringify({ siteID: created.id } satisfies HostEntry)
      );
      if (published) await requestBuild(env, newRef, "created");

      return json({ site: toSiteView(env, created, customDomains) });
    } catch (error) {
      await getRegistry(env).release(defaultHost, newRef);
      throw error;
    }
  }

  if (!context) return json({ message: "This collection has no site" }, 404);

  const updatedDomains = await handleDomainAction(context, action, body);

  if (updatedDomains) return json({ site: toSiteView(env, updatedDomains, customDomains) });

  if (action === "upload") {
    const upload = await saveUpload(env, site.id, body);

    return json({ value: `upload:${upload.file}`, preview: toDataURL(upload) });
  }

  if (action === "save") {
    const config = parseInput(siteConfigSchema, body.config);
    const uploads = getUploadFiles(config);

    await assertUploads(env, site.id, uploads);

    // AI answers are a permission of the key; the extension needs ai-answers for them.
    if (config.answers !== site.config.answers) {
      await session.client.extensions.updateSelfPublishableKey({
        keyID: site.keyID,
        answers: config.answers
      });
    }

    const updated = { ...site, config, updatedAt: new Date().toISOString() };

    await store.setSite(updated);
    await removeUnusedUploads(env, site.id, uploads);
    await requestBuild(env, ref, "settings");

    return json({ site: toSiteView(env, updated, customDomains) });
  }

  if (action === "update-template") {
    const updated = {
      ...site,
      templateVersion: LATEST_TEMPLATE_VERSION,
      updatedAt: new Date().toISOString()
    };

    await store.setSite(updated);
    await requestBuild(env, ref, "template");

    return json({ site: toSiteView(env, updated, customDomains) });
  }

  if (action === "rebuild") {
    if (!(await hasPublishedContent(session.client, site.collectionID, site.channel))) {
      throw new BadRequestError(NOTHING_PUBLISHED);
    }

    await requestBuild(env, ref, "rebuild");

    return json({ builds: await getBuildStatus(env, site.id) });
  }

  if (action === "eject") {
    return json({
      name: "andesine.config.ts",
      content: createConfigFile(
        site,
        getSiteURL(env, site, customDomains),
        session.instance,
        showsPoweredBy(session.workspacePlan)
      )
    });
  }

  if (action === "delete") {
    await session.client.extensions.deleteSelfPublishableKey({ keyID: site.keyID });
    await store.deleteSite(collectionID);
    await deleteSiteBuilds(env, site.id);

    for (const hostname of [
      getDefaultHost(env, site),
      ...(site.domains ?? []).map((domain) => domain.hostname)
    ]) {
      await env.HOSTS.delete(getHostKey(hostname));
      await getRegistry(env).release(hostname, ref);
    }

    await Promise.all(
      (site.domains ?? []).map(({ customHostnameID }) =>
        deleteCustomHostname(env, customHostnameID).catch(() => undefined)
      )
    );

    return json({ deleted: true });
  }

  return json({ message: "Not found" }, 404);
};

export { handlePanelRequest };
