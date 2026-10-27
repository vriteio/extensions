import { AndesineAPIError, type AndesineClient } from "@andesine/sdk";
import {
  CONNECTION_KEY,
  MAPPING_KEY_PREFIX,
  getMappingKey,
  getStateKey,
  type Mapping,
  type SyncRun,
  type SyncState
} from "../sync";
import type { Env } from "./env";
import { readRecord, signRecord } from "./signing";

interface Connection {
  installationID: number;
  account: string;
}
/** An Andesine installation of the extension. */
interface InstallationLink {
  instance: string;
  extensionID: string;
}
interface Store {
  getConnection(): Promise<Connection | null>;
  setConnection(connection: Connection): Promise<void>;
  deleteConnection(): Promise<void>;
  getMapping(collectionID: string): Promise<Mapping | null>;
  listMappings(): Promise<Mapping[]>;
  setMapping(mapping: Mapping): Promise<void>;
  deleteMapping(collectionID: string): Promise<void>;
  getState(collectionID: string): Promise<SyncState>;
  setState(collectionID: string, state: SyncState): Promise<void>;
}

const MAX_MAPPINGS = 10;

const createEmptyState = (): SyncState => ({
  lastCommit: null,
  entries: {},
  collections: {},
  images: {},
  assetPaths: {},
  headingTitles: [],
  rootTitle: null,
  orders: {},
  lastImport: null,
  lastExport: null,
  exportBase: null,
  source: null
});
/** A run that starts now, e.g. an import of a commit, or a failure. */
const createRun = (commit: string | null, error: string | null = null): SyncRun => ({
  at: new Date().toISOString(),
  commit,
  skipped: [],
  keptDrafts: [],
  warnings: [],
  error
});
const isNotFound = (error: unknown): boolean => {
  return error instanceof AndesineAPIError && error.status === 404;
};
/** Records the backend signed, in the installation's extension storage. */
const createStore = (env: Env, client: AndesineClient, extensionID: string): Store => {
  const scope = (key: string) => `${extensionID}:${key}`;
  const read = async <T>(key: string): Promise<T | null> => {
    try {
      const entry = await client.extensions.getSelfStorageEntry({ key });

      return readRecord<T>(env.STATE_SECRET, scope(key), entry.value);
    } catch (error) {
      if (isNotFound(error)) return null;

      throw error;
    }
  };
  const write = async (key: string, value: unknown): Promise<void> => {
    const record = await signRecord(env.STATE_SECRET, scope(key), value);

    await client.extensions.setSelfStorageEntry({ key, value: record as never });
  };
  const remove = async (key: string): Promise<void> => {
    await client.extensions.deleteSelfStorageEntry({ key });
  };

  return {
    getConnection: () => read<Connection>(CONNECTION_KEY),
    setConnection: (connection) => write(CONNECTION_KEY, connection),
    deleteConnection: () => remove(CONNECTION_KEY),
    getMapping: (collectionID) => read<Mapping>(getMappingKey(collectionID)),
    async listMappings() {
      const page = await client.extensions.listSelfStorageEntries({
        prefix: MAPPING_KEY_PREFIX,
        limit: 100
      });
      const mappings = await Promise.all(
        page.data.map(({ key, value }) => readRecord<Mapping>(env.STATE_SECRET, scope(key), value))
      );

      return mappings
        .filter((mapping): mapping is Mapping => Boolean(mapping))
        .slice(0, MAX_MAPPINGS);
    },
    setMapping: (mapping) => write(getMappingKey(mapping.collectionID), mapping),
    // The state stays, so a new mapping of the same source keeps its files' entries.
    deleteMapping: (collectionID) => remove(getMappingKey(collectionID)),
    async getState(collectionID) {
      return { ...createEmptyState(), ...(await read<SyncState>(getStateKey(collectionID))) };
    },
    setState: (collectionID, state) => write(getStateKey(collectionID), state)
  };
};
const getLinkKey = (link: InstallationLink) => `andesine:${link.instance}|${link.extensionID}`;
const listInstallationLinks = async (
  env: Env,
  installationID: number
): Promise<InstallationLink[]> => {
  return (
    (await env.INSTALLATIONS.get<InstallationLink[]>(`github:${installationID}`, "json")) ?? []
  );
};
const linkInstallation = async (
  env: Env,
  installationID: number,
  link: InstallationLink
): Promise<void> => {
  const links = await listInstallationLinks(env, installationID);
  const others = links.filter((item) => getLinkKey(item) !== getLinkKey(link));

  await env.INSTALLATIONS.put(`github:${installationID}`, JSON.stringify([...others, link]));
  await env.INSTALLATIONS.put(getLinkKey(link), String(installationID));
};
const unlinkInstallation = async (env: Env, link: InstallationLink): Promise<void> => {
  const installationID = Number(await env.INSTALLATIONS.get(getLinkKey(link)));

  if (installationID) {
    const links = await listInstallationLinks(env, installationID);
    const others = links.filter((item) => getLinkKey(item) !== getLinkKey(link));

    await env.INSTALLATIONS.put(`github:${installationID}`, JSON.stringify(others));
  }

  await env.INSTALLATIONS.delete(getLinkKey(link));
};

export {
  MAX_MAPPINGS,
  createEmptyState,
  createRun,
  createStore,
  isNotFound,
  listInstallationLinks,
  linkInstallation,
  unlinkInstallation
};
export type { InstallationLink, Store };
