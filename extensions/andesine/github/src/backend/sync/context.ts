import { AndesineAPIError, type AndesineClient } from "@andesine/sdk";
import type { Mapping, SyncState } from "../../sync";
import { getBackend } from "../andesine";
import type { Env } from "../env";
import { getInstallationToken } from "../github";
import { createStore, type InstallationLink, type Store } from "../store";

/** Everything a sync run of one mapping needs. */
interface SyncContext {
  env: Env;
  client: AndesineClient;
  store: Store;
  mapping: Mapping;
  state: SyncState;
  token: string;
  /** Prefix of idempotency keys, from the job, so a retried job repeats no writes. */
  jobID: string;
}

const getAPIErrorCode = (error: unknown): string | null => {
  return error instanceof AndesineAPIError ? error.code : null;
};
/** The context of a mapping, or null when it or the GitHub connection no longer exists. */
const loadSyncContext = async (
  env: Env,
  link: InstallationLink,
  collectionID: string,
  jobID: string
): Promise<SyncContext | null> => {
  const client = getBackend(env).createClient(link.instance, link.extensionID);
  const store = createStore(env, client, link.extensionID);
  const [connection, mapping] = await Promise.all([
    store.getConnection(),
    store.getMapping(collectionID)
  ]);

  if (!connection || !mapping) return null;

  const [state, token] = await Promise.all([
    store.getState(collectionID),
    getInstallationToken(env, connection.installationID)
  ]);

  return { env, client, store, mapping, state, token, jobID };
};
const idempotency = (context: SyncContext, item: string) => ({
  headers: { "Idempotency-Key": `${context.jobID}:${encodeURIComponent(item)}`.slice(0, 255) }
});

export { getAPIErrorCode, loadSyncContext, idempotency };
export type { SyncContext };
