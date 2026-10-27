import { notify, storage } from "@andesine/extensions/solid";
import { createEffect, createResource, createSignal, on, onCleanup } from "solid-js";
import { CONNECTION_KEY, getMappingKey, getStateKey } from "../sync/keys";
import { callBackend, getCollectionName, type PanelStatus } from "./api";

type SyncController = ReturnType<typeof createSyncState>;

// Shared by the extension's views and kept while it runs: a change on a page also shows in the
// panel, and a collection shows at once when it opens again.
const [statuses, setStatuses] = createSignal<ReadonlyMap<string, PanelStatus | Error>>(new Map());

/** The sync of a collection for the panel and the page: its status, name, and actions. */
const createSyncState = (collectionID: () => string) => {
  // The running action, so only its button shows a spinner.
  const [pending, setPending] = createSignal<string | null>(null);
  const [name] = createResource(collectionID, getCollectionName);
  const status = () => statuses().get(collectionID());
  const load = async (id: string) => {
    // A failed request would end the view, so it becomes a message.
    const result = await callBackend<PanelStatus>("status", { collectionID: id }).catch(
      (error: Error) => error
    );

    setStatuses((current) => new Map(current).set(id, result));
  };
  const loaded = () => {
    const value = status();

    return value instanceof Error ? null : (value ?? null);
  };
  const failure = () => {
    const value = status();

    return value instanceof Error ? value.message : null;
  };
  /**
   * Calls an action of the backend, then reloads the status; errors show as notifications. False
   * if it failed.
   */
  const run = async (action: string, message?: string): Promise<boolean> => {
    setPending(action);

    try {
      await callBackend(action, { collectionID: collectionID() });

      if (message) await notify(message);

      await load(collectionID());

      return true;
    } catch (error) {
      await notify(error instanceof Error ? error.message : "The request failed", "error");

      return false;
    } finally {
      setPending(null);
    }
  };

  createEffect(
    on(collectionID, (id) => {
      void load(id);
    })
  );
  // The backend writes these keys, e.g. when a sync ends, so their changes load the status again.
  onCleanup(
    storage.onChange(({ key }) => {
      const id = collectionID();
      const isStatusKey =
        key === CONNECTION_KEY || key === getMappingKey(id) || key === getStateKey(id);

      if (isStatusKey) void load(id);
    })
  );

  return {
    name,
    pending,
    busy: () => pending() !== null,
    loaded,
    failure,
    run,
    collectionID,
    refetch: () => load(collectionID())
  };
};

export { createSyncState };
export type { SyncController };
