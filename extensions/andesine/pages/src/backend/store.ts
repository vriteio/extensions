import { AndesineAPIError, type AndesineClient } from "@andesine/sdk";
import type { Env } from "./env";
import { getSiteKey } from "../shared/storage";
import { readRecord, signRecord } from "./signing";
import type { Site } from "./site";

interface SiteStore {
  getSite(collectionID: string): Promise<Site | null>;
  listSites(): Promise<Site[]>;
  setSite(site: Site): Promise<void>;
  deleteSite(collectionID: string): Promise<void>;
}

const MAX_SITES = 5;

const isNotFound = (error: unknown): boolean => {
  return error instanceof AndesineAPIError && error.status === 404;
};
/** Sites in the installation's storage; members can write storage, so records are signed. */
const createSiteStore = (env: Env, client: AndesineClient, extensionID: string): SiteStore => {
  const scope = (key: string) => `${extensionID}:${key}`;
  const read = (key: string, value: unknown) =>
    readRecord<Site>(env.STATE_SECRET, scope(key), value);

  return {
    async getSite(collectionID) {
      const key = getSiteKey(collectionID);

      try {
        return await read(key, (await client.extensions.getSelfStorageEntry({ key })).value);
      } catch (error) {
        if (isNotFound(error)) return null;

        throw error;
      }
    },
    async listSites() {
      const page = await client.extensions.listSelfStorageEntries({
        prefix: getSiteKey(""),
        limit: 100
      });
      const sites = await Promise.all(page.data.map(({ key, value }) => read(key, value)));

      return sites.filter((site): site is Site => Boolean(site));
    },
    async setSite(site) {
      const key = getSiteKey(site.collectionID);
      const record = await signRecord(env.STATE_SECRET, scope(key), site);

      await client.extensions.setSelfStorageEntry({ key, value: record as never });
    },
    async deleteSite(collectionID) {
      await client.extensions.deleteSelfStorageEntry({ key: getSiteKey(collectionID) });
    }
  };
};

export { MAX_SITES, isNotFound, createSiteStore };
export type { SiteStore };
