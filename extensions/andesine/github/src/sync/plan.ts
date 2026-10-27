import { toContentSlug } from "@andesine/sdk/slug";
import { getFileLocation, getMappedPath, getRelativeFilePath, joinPath } from "./paths";
import type { FileChange, Mapping, SyncState } from "./types";

interface PublishedTreeCollection {
  id: string | null;
  name: string;
  slugPath: string;
  entries: Array<{ id: string; name: string; slugPath: string; version: { id: string } }>;
  collections: PublishedTreeCollection[];
}
interface PublishedEntry {
  id: string;
  name: string;
  slugPath: string;
  versionID: string;
  collectionID: string;
  /** 1-based position among the entries of its collection. */
  position: number;
}
interface PublishedCollection {
  id: string;
  name: string;
  parentID: string | null;
  /** 1-based position among the collections of its parent. */
  position: number;
}
interface PushPlan {
  /** Mapped-directory paths of added and changed files. */
  upserts: string[];
  removals: string[];
  renames: Array<{ from: string; to: string }>;
}
interface PublishPlan {
  changed: PublishedEntry[];
  /** IDs of entries no longer published. */
  removed: string[];
}
/** Synced paths by ID, built once per run. */
interface PathLookup {
  /** Entry ID → repository path of its synced file. */
  entryPaths: Map<string, string>;
  /** The folder of a collection: its synced folder, else its parent's folder and a slug. */
  getFolder(collectionID: string): string;
}

/** Entries and collections of a published tree, with their positions. */
const flattenTree = (
  root: PublishedTreeCollection,
  rootID: string
): { entries: PublishedEntry[]; collections: PublishedCollection[] } => {
  const entries: PublishedEntry[] = [];
  const collections: PublishedCollection[] = [];
  const visit = (collection: PublishedTreeCollection, collectionID: string): void => {
    collection.entries.forEach((entry, index) => {
      entries.push({
        id: entry.id,
        name: entry.name,
        slugPath: entry.slugPath,
        versionID: entry.version.id,
        collectionID,
        position: index + 1
      });
    });
    collection.collections.forEach((child, index) => {
      collections.push({
        id: child.id!,
        name: child.name,
        parentID: collectionID,
        position: index + 1
      });
      visit(child, child.id!);
    });
  };

  visit(root, rootID);

  return { entries, collections };
};
/** Repository changes that the mapping syncs, by mapped-directory path. */
const planPush = (changes: FileChange[], mapping: Mapping): PushPlan => {
  const plan: PushPlan = { upserts: [], removals: [], renames: [] };

  for (const change of changes) {
    const path = getMappedPath(change.path, mapping);
    const previous = change.previousPath ? getMappedPath(change.previousPath, mapping) : null;

    if (change.status === "removed") {
      if (path) plan.removals.push(path);
    } else if (change.status === "renamed" && previous && path) {
      plan.renames.push({ from: previous, to: path });
      plan.upserts.push(path);
    } else if (path) {
      if (previous) plan.removals.push(previous);

      plan.upserts.push(path);
    } else if (previous) {
      plan.removals.push(previous);
    }
  }

  return plan;
};
const planPublish = (previous: PublishedEntry[] | null, next: PublishedEntry[]): PublishPlan => {
  const previousVersions = new Map((previous ?? []).map((entry) => [entry.id, entry.versionID]));
  const nextIDs = new Set(next.map(({ id }) => id));

  return {
    changed: next.filter((entry) => previousVersions.get(entry.id) !== entry.versionID),
    removed: [...previousVersions.keys()].filter((id) => !nextIDs.has(id))
  };
};
/** The first synced key of each ID, as a lookup by the ID. */
const invert = (record: Record<string, string>): Map<string, string> => {
  return new Map(
    Object.entries(record)
      .reverse()
      .map(([key, id]) => [id, key])
  );
};
const createPathLookup = (state: SyncState, collections: PublishedCollection[]): PathLookup => {
  const folders = invert(state.collections);
  const collectionsByID = new Map(collections.map((collection) => [collection.id, collection]));
  const getFolder = (collectionID: string): string => {
    const known = folders.get(collectionID);
    const collection = collectionsByID.get(collectionID);

    if (known !== undefined) return known;
    if (!collection?.parentID) return "";

    const folder = joinPath(
      getFolder(collection.parentID),
      toContentSlug(collection.name, collection.id)
    );

    folders.set(collectionID, folder);

    return folder;
  };

  return { entryPaths: invert(state.entries), getFolder };
};
/**
 * The repository path of an entry's file. A synced file keeps its name, also after a rename in
 * Andesine, and moves only when its entry moved to another collection.
 */
const getEntryPath = (entry: PublishedEntry, lookup: PathLookup, mapping: Mapping): string => {
  const known = lookup.entryPaths.get(entry.id);
  const folder = lookup.getFolder(entry.collectionID);

  if (known) {
    const location = getFileLocation(getRelativeFilePath(mapping, known));
    const isSameFolder = location.folder === folder;

    return isSameFolder
      ? known
      : joinPath(mapping.directory, folder, `${location.stem}.${location.extension}`);
  }

  const stem = entry.name === "index" ? "index" : toContentSlug(entry.name, entry.id);

  return joinPath(mapping.directory, folder, `${stem}.${mapping.format}`);
};

export { flattenTree, planPush, planPublish, createPathLookup, getEntryPath };
export type { PublishedEntry, PublishedCollection, PushPlan, PathLookup };
