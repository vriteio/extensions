import { paginate } from "@andesine/sdk";
import { getDirectory, getFileLocation, getRelativeFilePath, joinPath } from "../../sync";
import type { CollectionRecord } from "./collections";
import type { SyncContext } from "./context";

interface SyncedFile {
  path: string;
  id: string;
  order: number | null;
}

/** Files without `order` go after the others, by path; index files go first. */
const compareFiles = (first: SyncedFile, second: SyncedFile): number => {
  const firstIndex = getFileLocation(first.path).isIndex ? -Infinity : (first.order ?? Infinity);
  const secondIndex = getFileLocation(second.path).isIndex ? -Infinity : (second.order ?? Infinity);

  return firstIndex - secondIndex || first.path.localeCompare(second.path);
};
const getSyncedFiles = (context: SyncContext, folder: string): SyncedFile[] => {
  return Object.entries(context.state.entries)
    .filter(([path]) => {
      return getFileLocation(getRelativeFilePath(context.mapping, path)).folder === folder;
    })
    .map(([path, id]) => ({ path, id, order: context.state.orders[path] ?? null }));
};
/**
 * Puts the synced entries of each folder in `order`, reusing their current ranks, so entries
 * that aren't synced keep their places. Folders without any `order` keep their entries' order.
 */
const applyEntryOrder = async (context: SyncContext, folders: Set<string>): Promise<void> => {
  const items: Array<{ id: string; order: string }> = [];

  for (const folder of folders) {
    const files = getSyncedFiles(context, folder);
    const collectionID = folder ? context.state.collections[folder] : context.mapping.collectionID;
    const hasOrder = files.some(
      ({ path, order }) => order !== null && !getFileLocation(path).isIndex
    );

    if (!hasOrder || !collectionID) continue;

    const ranks = new Map<string, string>();
    const entries = paginate((cursor) => {
      return context.client.entries.list({ collectionID, limit: 100, cursor });
    });

    for await (const entry of entries) ranks.set(entry.id, entry.order);

    const present = files.filter(({ id }) => ranks.has(id));
    const sortedRanks = present.map(({ id }) => ranks.get(id)!).sort();

    [...present].sort(compareFiles).forEach(({ id }, index) => {
      if (ranks.get(id) !== sortedRanks[index]) items.push({ id, order: sortedRanks[index] });
    });
  }

  for (let index = 0; index < items.length; index += 100) {
    await context.client.entries.bulkMove({ items: items.slice(index, index + 100) });
  }
};
/** Puts synced child collections in the `order` of their index files, in their current places. */
const applyCollectionOrder = async (
  context: SyncContext,
  collections: Map<string, CollectionRecord>,
  folders: Set<string>
): Promise<void> => {
  const parents = new Set([...folders].filter(Boolean).map(getDirectory));

  for (const parent of parents) {
    const parentID = parent ? context.state.collections[parent] : context.mapping.collectionID;
    const children = Object.entries(context.state.collections)
      .filter(([folder]) => folder && getDirectory(folder) === parent)
      .map(([folder, id]) => {
        const index = ["mdx", "md"]
          .map((extension) => joinPath(context.mapping.directory, folder, `index.${extension}`))
          .find((path) => context.state.orders[path] !== undefined);

        return { id, folder, order: index ? context.state.orders[index] : null };
      });
    const current = [...(collections.get(parentID ?? "")?.descendants ?? [])];
    const present = children.filter(({ id }) => current.includes(id));
    const hasOrder = present.some(({ order }) => order !== null);

    if (!hasOrder || !parentID) continue;

    const positions = present
      .map(({ id }) => current.indexOf(id))
      .sort((first, second) => first - second);
    const desired = [...present].sort((first, second) => {
      return (
        (first.order ?? Infinity) - (second.order ?? Infinity) ||
        first.folder.localeCompare(second.folder)
      );
    });

    for (const [index, child] of desired.entries()) {
      const from = current.indexOf(child.id);

      if (from === positions[index]) continue;

      current.splice(from, 1);
      current.splice(positions[index], 0, child.id);
      await context.client.collections.move({
        id: child.id,
        newParentID: parentID,
        index: positions[index]
      });
    }
  }
};

export { applyEntryOrder, applyCollectionOrder };
