import type { AndesineClient } from "@andesine/sdk";
import { DurableObject } from "cloudflare:workers";
import { getContentType } from "../shared/content-types";
import {
  getFileKey,
  getHostKey,
  getManifestKey,
  getSitePrefix,
  type HostEntry
} from "../shared/storage";
import type { BuildRecord, BuildStatus, BuildTrigger } from "../shared/types";
import { getBackend } from "./andesine";
import {
  getNewFiles,
  getUnusedHashes,
  toManifest,
  type BuildFile,
  type Manifest
} from "./build-files";
import type { Env } from "./env";
import {
  createConfigFile,
  getSiteHosts,
  getSiteURL,
  getUploadFiles,
  hasCustomDomains,
  showsPoweredBy,
  type Site
} from "./site";
import { createSiteStore, isNotFound } from "./store";
import { readUploads } from "./uploads";

/** The site of a builds object, in the installation that owns it. */
interface SiteRef {
  instance: string;
  extensionID: string;
  collectionID: string;
  siteID: string;
}
interface BuildResult {
  ok: boolean;
  error?: string;
  /** A failed build's log. */
  log?: string[];
  files?: BuildFile[];
  redirects?: Record<string, string>;
}
interface LoadedSite {
  site: Site;
  customDomains: boolean;
  poweredBy: boolean;
  client: AndesineClient;
}

const COMBINE_DELAY = 30_000;
const KEPT_BUILDS = 3;
const KEPT_RECORDS = 10;
const UPLOAD_CONCURRENCY = 8;
const DELETE_BATCH = 1000;
const PURGE_DELAY = 30 * 24 * 3600_000;
// Cloudflare retries a failed alarm up to 6 times.
const LAST_ALARM_RETRY = 6;
const BUILD_PORT = 8080;
// A safety net only: the container is stopped right after each build.
const CONTAINER_IDLE_TIMEOUT = 60_000;

/** A build server outside a container, for development; it answers like the container's port. */
const createLocalBuildServer = (origin: string): Fetcher => {
  const fetchLocal = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    return fetch(new URL(`${url.pathname}${url.search}`, origin), init);
  };

  return { fetch: fetchLocal } as unknown as Fetcher;
};
/** Named container images per template version, e.g. `template-0-7-0`. */
const getImageName = (version: string): string => `template-${version.replace(/\./g, "-")}`;
const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
/** The hashes in the manifests, e.g. the files that are in R2 already. */
const getHashes = (manifests: Map<string, Manifest>): Set<string> => {
  return new Set([...manifests.values()].flatMap((manifest) => Object.values(manifest)));
};
/** Whether the collection has published content on the channel, which a build needs. */
const hasPublishedContent = async (
  client: AndesineClient,
  collectionID: string,
  channel: string
): Promise<boolean> => {
  // A collection that was never published to the channel has no published tree there.
  return client.content.getTree({ collectionID, channel }).then(
    () => true,
    (error: unknown) => {
      if (isNotFound(error)) return false;

      throw error;
    }
  );
};
/** The site, and whether the workspace's plan has custom domains now. */
const loadSite = async (env: Env, ref: SiteRef): Promise<LoadedSite | null> => {
  const client = getBackend(env).createClient(ref.instance, ref.extensionID);
  const [site, self] = await Promise.all([
    createSiteStore(env, client, ref.extensionID).getSite(ref.collectionID),
    client.extensions.getSelf()
  ]);

  return site?.id === ref.siteID
    ? {
        site,
        customDomains: hasCustomDomains(self.workspacePlan),
        poweredBy: showsPoweredBy(self.workspacePlan),
        client
      }
    : null;
};
const deleteKeys = async (bucket: R2Bucket, keys: string[]): Promise<void> => {
  for (let index = 0; index < keys.length; index += DELETE_BATCH) {
    await bucket.delete(keys.slice(index, index + DELETE_BATCH));
  }
};
const deletePrefix = async (bucket: R2Bucket, prefix: string): Promise<void> => {
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix, cursor });

    await deleteKeys(
      bucket,
      page.objects.map(({ key }) => key)
    );
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
};

/**
 * One object per site: it combines triggers, builds one at a time in the site's container,
 * uploads only files that no kept build has, and switches the site's hosts to the new build only
 * after a complete upload.
 */
class SiteBuilds extends DurableObject<Env> {
  /** In memory, so a reset that stops a build also clears it. */
  private building = false;

  /** Asks for a build; triggers within 30 seconds become one build. */
  async request(ref: SiteRef, trigger: BuildTrigger): Promise<void> {
    await this.ctx.storage.put({ ref, pending: trigger, purgeAt: null });

    if (!(await this.ctx.storage.getAlarm())) {
      await this.ctx.storage.setAlarm(Date.now() + COMBINE_DELAY);
    }
  }

  async getStatus(): Promise<BuildStatus> {
    const [builds, pending, live] = await Promise.all([
      this.ctx.storage.get<BuildRecord[]>("builds"),
      this.ctx.storage.get<BuildTrigger | null>("pending"),
      this.ctx.storage.get<string>("live")
    ]);

    return { builds: (builds ?? []).slice(0, 5), pending: Boolean(pending), live: live ?? null };
  }

  /** The live build, for host entries of domains that become active later. */
  async getLiveBuildID(): Promise<string | null> {
    return (await this.ctx.storage.get<string>("live")) ?? null;
  }

  /** The panel removes the site's hosts, so it stops at once; its files go after 30 days. */
  async deleteSite(): Promise<void> {
    await this.ctx.storage.put({ pending: null, purgeAt: Date.now() + PURGE_DELAY });
    await this.ctx.storage.setAlarm(Date.now() + PURGE_DELAY);
  }

  async alarm(alarmInfo?: AlarmInvocationInfo): Promise<void> {
    // The running build sets the next alarm for triggers that came during it.
    if (this.building) return;

    const [ref, pending, purgeAt, builds] = await Promise.all([
      this.ctx.storage.get<SiteRef>("ref"),
      this.ctx.storage.get<BuildTrigger | null>("pending"),
      this.ctx.storage.get<number | null>("purgeAt"),
      this.ctx.storage.get<BuildRecord[]>("builds")
    ]);
    // No build runs in this object now, so a build record in progress was stopped, e.g. by a deploy.
    const stopped = builds?.find(({ status }) => status === "building");
    const trigger = pending ?? stopped?.trigger;

    if (ref && purgeAt) {
      if (purgeAt <= Date.now()) await deletePrefix(this.env.SITES, getSitePrefix(ref.siteID));

      return;
    }

    if (stopped) {
      await this.ctx.storage.put("pending", trigger);
      await this.saveRecord({
        ...stopped,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: "The build was stopped; it runs again"
      });
    }

    if (!ref || !trigger) return;

    this.building = true;

    try {
      await this.build(ref, trigger);
    } catch (error) {
      // The last retry fails the build, so it doesn't stay queued.
      if ((alarmInfo?.retryCount ?? 0) < LAST_ALARM_RETRY) throw error;

      const now = new Date().toISOString();

      await this.ctx.storage.put("pending", null);
      await this.saveRecord({
        id: `bld_${crypto.randomUUID().replace(/-/g, "")}`,
        status: "failed",
        trigger,
        startedAt: now,
        finishedAt: now,
        error: getErrorMessage(error),
        log: [],
        files: 0
      });
    } finally {
      this.building = false;
    }

    // A trigger during the build asks for one more build.
    if (await this.ctx.storage.get("pending")) await this.ctx.storage.setAlarm(Date.now() + 1000);
  }

  private async build(ref: SiteRef, trigger: BuildTrigger): Promise<void> {
    const loaded = await loadSite(this.env, ref);
    const published =
      loaded &&
      (await hasPublishedContent(loaded.client, loaded.site.collectionID, loaded.site.channel));

    // Taken once the site loads; a failed load throws, so the alarm retries with the trigger.
    await this.ctx.storage.put("pending", null);

    // Nothing to build yet, e.g. settings saved before the first publish, which builds it.
    if (!loaded || !published) return;

    const { site, customDomains, poweredBy, client } = loaded;

    const record: BuildRecord = {
      id: `bld_${crypto.randomUUID().replace(/-/g, "")}`,
      status: "building",
      trigger,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      log: [],
      files: 0
    };
    const uploaded: string[] = [];

    await this.saveRecord(record);

    try {
      const port = await this.startContainer(site.templateVersion);
      const response = await port.fetch("http://container/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          configFile: createConfigFile(
            site,
            getSiteURL(this.env, site, customDomains),
            ref.instance,
            poweredBy
          ),
          uploads: await readUploads(this.env, site.id, getUploadFiles(site.config))
        })
      });
      const result = (await response.json()) as BuildResult;

      if (!result.ok || !result.files) {
        throw Object.assign(new Error(result.error ?? "The build failed"), { log: result.log });
      }

      const manifest = toManifest(result.files);
      const manifests = await this.listManifests();

      uploaded.push(...(await this.upload(port, site.id, result.files, getHashes(manifests))));
      await this.env.SITES.put(
        getManifestKey(site.id, record.id),
        JSON.stringify({ files: manifest, redirects: result.redirects ?? {} }),
        {
          httpMetadata: { contentType: "application/json" }
        }
      );
      await this.ctx.storage.put(`manifest:${record.id}`, manifest);
      manifests.set(`manifest:${record.id}`, manifest);
      await this.switchHosts(site, record.id, customDomains);
      await this.saveRecord({
        ...record,
        status: "live",
        finishedAt: new Date().toISOString(),
        files: result.files.length
      });
      await this.removeOldBuilds(site.id, manifests);
    } catch (error) {
      const log = (error as { log?: string[] }).log ?? [];

      await deleteKeys(this.env.SITES, [
        getManifestKey(site.id, record.id),
        ...uploaded.map((hash) => getFileKey(site.id, hash))
      ]);
      await this.ctx.storage.delete(`manifest:${record.id}`);
      await this.saveRecord({
        ...record,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: getErrorMessage(error),
        log
      });
    } finally {
      // Containers are billed while they run, and the next build may be days away.
      if (this.ctx.container?.running) await this.ctx.container.destroy().catch(() => undefined);
    }
  }

  /** The site's container, from the image of its template version, once its server answers. */
  private async startContainer(version: string): Promise<Fetcher> {
    const localServer = this.env.LOCAL_BUILD_SERVER;

    if (localServer) return createLocalBuildServer(localServer);

    const container = this.ctx.container!;
    const image = container.images[getImageName(version)];

    if (!image) throw new Error(`There is no build image for template ${version}`);
    // The build reads the API and image delivery hosts; standard-2 has room for the template.
    if (!container.running) {
      container.start({ image, enableInternet: true, instance: "standard-2" });
    }

    await container.setInactivityTimeout(CONTAINER_IDLE_TIMEOUT);

    const port = container.getTcpPort(BUILD_PORT);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        if ((await port.fetch("http://container/health")).ok) return port;
      } catch {
        // The server isn't listening yet.
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("The build container didn't start");
  }

  /** The manifests of the kept builds by storage key; their files are in R2 already. */
  private listManifests(): Promise<Map<string, Manifest>> {
    return this.ctx.storage.list<Manifest>({ prefix: "manifest:" });
  }

  /** Uploads the files whose content no kept build has, and returns their hashes. */
  private async upload(
    port: Fetcher,
    siteID: string,
    files: BuildFile[],
    known: Set<string>
  ): Promise<string[]> {
    const queue = getNewFiles(files, known);
    const uploaded: string[] = [];
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const path = file.path.split("/").map(encodeURIComponent).join("/");
        const response = await port.fetch(`http://container/files/${path}`);

        if (!response.ok || !response.body) {
          throw new Error(`The file ${file.path} couldn't be read`);
        }

        await this.env.SITES.put(getFileKey(siteID, file.hash), response.body, {
          httpMetadata: { contentType: getContentType(file.path) }
        });
        uploaded.push(file.hash);
      }
    };

    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));

    return uploaded;
  }

  /**
   * Points every host of the site to the build, in one KV entry each; custom domains that the
   * plan no longer has stop serving.
   */
  private async switchHosts(site: Site, buildID: string, customDomains: boolean): Promise<void> {
    const entry: HostEntry = { siteID: site.id, buildID };
    const hosts = getSiteHosts(this.env, site, customDomains);
    const stopped = (site.domains ?? []).filter(({ hostname }) => !hosts.includes(hostname));

    await this.ctx.storage.put("live", buildID);
    await Promise.all(stopped.map(({ hostname }) => this.env.HOSTS.delete(getHostKey(hostname))));
    await Promise.all(
      hosts.map((host) => this.env.HOSTS.put(getHostKey(host), JSON.stringify(entry)))
    );

    // A delete during the build removed the hosts already, so they don't serve the build again.
    if (await this.ctx.storage.get("purgeAt")) {
      await Promise.all(hosts.map((host) => this.env.HOSTS.delete(getHostKey(host))));
    }
  }

  /** Keeps the latest live builds for a rollback; files that only older builds used are deleted. */
  private async removeOldBuilds(siteID: string, manifests: Map<string, Manifest>): Promise<void> {
    const builds = (await this.ctx.storage.get<BuildRecord[]>("builds")) ?? [];
    const live = builds.filter(({ status }) => status === "live" || status === "replaced");
    const removed = live.slice(KEPT_BUILDS).map(({ id }) => id);
    const removedKeys = removed.map((id) => `manifest:${id}`);
    const removedManifests = removedKeys.map((key) => manifests.get(key) ?? {});

    await this.ctx.storage.delete(removedKeys);
    removedKeys.forEach((key) => manifests.delete(key));

    const unused = getUnusedHashes(removedManifests, getHashes(manifests));

    await deleteKeys(this.env.SITES, [
      ...removed.map((id) => getManifestKey(siteID, id)),
      ...unused.map((hash) => getFileKey(siteID, hash))
    ]);
    await this.ctx.storage.put(
      "builds",
      builds.map((build, index) =>
        index > 0 && build.status === "live" ? { ...build, status: "replaced" as const } : build
      )
    );
  }

  private async saveRecord(record: BuildRecord): Promise<void> {
    const builds = (await this.ctx.storage.get<BuildRecord[]>("builds")) ?? [];
    const others = builds.filter(({ id }) => id !== record.id);

    await this.ctx.storage.put("builds", [record, ...others].slice(0, KEPT_RECORDS));
  }
}

const getSiteBuilds = (env: Env, siteID: string) => env.BUILDS.get(env.BUILDS.idFromName(siteID));
const requestBuild = async (env: Env, ref: SiteRef, trigger: BuildTrigger): Promise<void> => {
  await getSiteBuilds(env, ref.siteID).request(ref, trigger);
};
const getBuildStatus = (env: Env, siteID: string) => getSiteBuilds(env, siteID).getStatus();
const getLiveBuildID = (env: Env, siteID: string) => getSiteBuilds(env, siteID).getLiveBuildID();
const deleteSiteBuilds = (env: Env, siteID: string) => getSiteBuilds(env, siteID).deleteSite();

export {
  SiteBuilds,
  requestBuild,
  getBuildStatus,
  getLiveBuildID,
  deleteSiteBuilds,
  hasPublishedContent
};
export type { SiteRef };
