import { createClient } from "@andesine/sdk";
import { apiFetch, backend, EXTENSION_API_URL } from "@andesine/extensions/solid";
import type { SiteConfig } from "../backend/site";
import type { BuildRecord, BuildStatus, EntryPages, SiteDomain } from "../shared/types";

interface SiteView {
  id: string;
  /** The site's collection; a nested collection's entries can be on it too. */
  collectionID: string;
  subdomain: string;
  channel: string;
  templateVersion: string;
  config: SiteConfig;
  domains: SiteDomain[];
  url: string;
  createdAt: string;
  updatedAt: string;
}
interface SiteSummary {
  canManage: boolean;
  templates: { latest: string };
  site: SiteView | null;
  builds: BuildStatus | null;
  /** The site's channel has its collection's content, which a build needs. */
  published: boolean;
  /** The workspace's plan has custom domains (Pro). */
  customDomains: boolean;
}

const client = createClient({ baseURL: EXTENSION_API_URL, fetch: apiFetch });

let channels: ReturnType<typeof client.publishing.listChannels> | null = null;

/** Calls a panel route of the backend, which checks the member's access. */
const callBackend = async <T>(action: string, body: object): Promise<T> => {
  const response = await backend.fetch(`/panel/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };

  if (!response.ok) throw new Error(result.message ?? "The Pages backend didn't answer");

  return result;
};

/** The workspace's channels, loaded once while the extension runs; none if they can't be read. */
const listChannels = () => {
  channels ??= client.publishing.listChannels().catch(() => []);

  return channels;
};
/** The collection's name, to say which one the site publishes; null if it can't be read. */
const getCollectionName = async (collectionID: string): Promise<string | null> => {
  const collection = await client.collections.get({ collectionID }).catch(() => null);

  return collection?.name ?? null;
};

export { callBackend, getCollectionName, listChannels };
export type { BuildRecord, BuildStatus, EntryPages, SiteDomain, SiteSummary, SiteView };
