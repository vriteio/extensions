import { createClient } from "@andesine/sdk";
import { apiFetch, backend, EXTENSION_API_URL } from "@andesine/extensions/solid";
import type { Mapping, SyncState } from "../sync/types";

interface PanelStatus {
  canManage: boolean;
  connection: { account: string } | null;
  mapping: Mapping | null;
  status:
    | (Pick<SyncState, "lastImport" | "lastExport"> & {
        /** A sync of the mapping is queued or running; the last runs stay the finished ones. */
        running: { startedAt: string } | null;
      })
    | null;
}
interface RepositoryOption {
  id: number;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
}
/** How a new mapping's files match the collection's entries. */
interface MappingPreview {
  matched: number;
  githubOnly: number;
  andesineOnly: number;
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
  const result = (await response.json().catch(() => ({}))) as T & { message?: string };

  if (!response.ok) {
    throw new Error(result.message ?? "The GitHub Sync backend didn't answer");
  }

  return result;
};

/** The workspace's channels, loaded once while the extension runs; none if they can't be read. */
const listChannels = () => {
  channels ??= client.publishing.listChannels().catch(() => []);

  return channels;
};
/** The collection's name, to say which one syncs; null if it can't be read. */
const getCollectionName = async (collectionID: string): Promise<string | null> => {
  const collection = await client.collections.get({ collectionID }).catch(() => null);

  return collection?.name ?? null;
};

export { callBackend, getCollectionName, listChannels };
export type { PanelStatus, RepositoryOption, MappingPreview };
