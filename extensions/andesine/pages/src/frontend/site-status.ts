import { notify, storage } from "@andesine/extensions/solid";
import { createEffect, createSignal, on, onCleanup, untrack } from "solid-js";
import { getSiteKey } from "../shared/storage";
import { callBackend, type BuildStatus, type EntryPages, type SiteSummary } from "./api";

interface SiteTarget {
  collectionID: string;
  /** The open entry; its site is found when the collection has none. */
  entryID?: string;
}

type SiteStatus = ReturnType<typeof createSiteStatus>;

const BUILD_POLL_INTERVAL = 5000;

// Shared by the extension's views and kept while it runs: a change on a page also shows in the
// panel, and a collection shows at once when it opens again.
const [statuses, setStatuses] = createSignal<ReadonlyMap<string, SiteSummary | Error>>(new Map());
const entryPages = new Map<string, Promise<EntryPages>>();

/**
 * The site of a collection for the panel and the pages: the last known summary at once, then the
 * current one. A failed load becomes a message.
 */
const createSiteStatus = (target: () => SiteTarget) => {
  // The running action, so only its button shows a spinner.
  const [pending, setPending] = createSignal<string | null>(null);
  const collectionID = () => target().collectionID;
  const status = () => statuses().get(collectionID());
  const setStatus = (id: string, value: SiteSummary | Error) => {
    setStatuses((current) => new Map(current).set(id, value));
  };
  const load = async (id: string) => {
    const result = await callBackend<SiteSummary>("summary", {
      collectionID: id,
      entryID: untrack(target).entryID
    }).catch((error: Error) => error);

    setStatus(id, result);
  };
  const loaded = () => {
    const value = status();

    return value instanceof Error ? null : (value ?? null);
  };
  /** The site's own collection once known, e.g. a docs root that a nested entry's site has. */
  const siteCollectionID = () => loaded()?.site?.collectionID ?? collectionID();
  const failure = () => {
    const value = status();

    return value instanceof Error ? value.message : null;
  };
  const update = (changes: Partial<SiteSummary>) => {
    const current = loaded();

    if (current) setStatus(collectionID(), { ...current, ...changes });
  };
  /** Calls a site action of the backend for the site's collection; errors show as notifications. */
  const run = async <T>(
    action: string,
    body: object,
    done: (result: T) => Promise<void> | void
  ): Promise<void> => {
    setPending(action);

    try {
      await done(await callBackend<T>(action, { ...body, collectionID: siteCollectionID() }));
    } catch (error) {
      await notify(error instanceof Error ? error.message : "The request failed", "error");
    } finally {
      setPending(null);
    }
  };
  const rebuild = () => {
    return run<{ builds: BuildStatus }>("rebuild", {}, ({ builds }) => update({ builds }));
  };
  // A build runs in the backend's own queue, without a storage write, so it's checked until it ends.
  const isBuilding = () => {
    const builds = loaded()?.builds;

    return Boolean(builds?.pending || builds?.builds[0]?.status === "building");
  };
  // A failed build already says what's wrong, e.g. that nothing could be built.
  const isNothingPublished = () => {
    const builds = loaded()?.builds?.builds ?? [];

    return !loaded()?.published && !builds.some(({ status }) => status === "failed");
  };

  createEffect(
    on(collectionID, (id) => {
      void load(id);
    })
  );
  // The backend writes the site's storage entry, e.g. when it's created or saved.
  onCleanup(
    storage.onChange(({ key }) => {
      if (key === getSiteKey(siteCollectionID())) void load(collectionID());
    })
  );
  createEffect(() => {
    if (!isBuilding()) return;

    const timer = setTimeout(() => {
      void load(collectionID());
    }, BUILD_POLL_INTERVAL);

    onCleanup(() => clearTimeout(timer));
  });

  return {
    pending,
    busy: () => pending() !== null,
    loaded,
    siteCollectionID,
    failure,
    isNothingPublished,
    update,
    run,
    rebuild,
    refetch: () => load(collectionID())
  };
};
/** The site's pages by entry ID, from its live build; loaded once for each build. */
const getEntryPages = (collectionID: string, buildID: string): Promise<EntryPages> => {
  const key = `${collectionID}:${buildID}`;

  if (!entryPages.has(key)) {
    const pages = callBackend<EntryPages>("entry-pages", { collectionID });

    entryPages.set(key, pages);
    pages.catch(() => entryPages.delete(key));
  }

  return entryPages.get(key)!;
};

export { createSiteStatus, getEntryPages };
export type { SiteStatus };
