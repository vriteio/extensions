import { paginate, toContentSlug, type AndesineClient } from "@andesine/sdk";
import { getDirectory, getSlug, joinPath } from "../../sync";
import { idempotency, type SyncContext } from "./context";
import { mapLimit } from "./limit";

interface CollectionRecord {
  id: string;
  name: string;
  /** Direct children, in order. */
  descendants: string[];
  parentID: string | null;
}

/**
 * The mapped collection and the collections in it, once per run. `collections.list` returns one
 * collection's direct children, so the tree is listed level by level.
 */
const loadCollections = async (
  client: AndesineClient,
  rootID: string
): Promise<Map<string, CollectionRecord>> => {
  const collections = new Map<string, CollectionRecord>();
  // Returns the IDs of the children; collections without children aren't listed.
  const visit = async (parentID: string): Promise<string[]> => {
    const pages = paginate((cursor) => {
      return client.collections.list({ collectionID: parentID, limit: 100, cursor });
    });
    const children: CollectionRecord[] = [];

    for await (const child of pages) {
      children.push({ id: child.id, name: child.name, descendants: child.descendants, parentID });
    }

    children.forEach((child) => collections.set(child.id, child));
    await mapLimit(
      children.filter(({ descendants }) => descendants.length),
      ({ id }) => visit(id)
    );

    return children.map(({ id }) => id);
  };

  collections.set(rootID, {
    id: rootID,
    name: "",
    descendants: await visit(rootID),
    parentID: null
  });

  return collections;
};
/**
 * The collection of a folder. A missing one is taken from a child whose name or its slug matches
 * the folder's index title or the folder, or created, named after the index title.
 */
const ensureFolder = async (
  context: SyncContext,
  collections: Map<string, CollectionRecord>,
  folder: string,
  indexTitles: Map<string, string>
): Promise<string> => {
  const known = folder ? context.state.collections[folder] : context.mapping.collectionID;

  if (known && (collections.has(known) || !folder)) return known;

  const parentID = await ensureFolder(context, collections, getDirectory(folder), indexTitles);
  const segment = folder.split("/").pop()!;
  const name = indexTitles.get(folder) ?? segment;
  const nameSlug = getSlug(name);
  const existing = [...collections.values()].find((collection) => {
    const slug = toContentSlug(collection.name, collection.id);
    const isSameName = collection.name === name || slug === nameSlug || slug === segment;

    return collection.parentID === parentID && isSameName;
  });
  const id =
    existing?.id ??
    (
      await context.client.collections.create(
        { parentID, name },
        idempotency(context, `collection:${joinPath(context.mapping.directory, folder)}`)
      )
    ).id;

  if (!existing) {
    collections.set(id, { id, name, descendants: [], parentID });
    collections.get(parentID)?.descendants.push(id);
  }

  context.state.collections[folder] = id;

  return id;
};

export { loadCollections, ensureFolder };
export type { CollectionRecord };
