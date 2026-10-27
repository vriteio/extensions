import { paginate, toContentSlug, type AndesineClient } from "@andesine/sdk";
import { getFileLocation, getSlug, joinPath } from "../../sync";
import type { CollectionRecord } from "./collections";
import { mapLimit } from "./limit";

/** Entries and collections of a mapped collection, by the paths that they would sync to. */
interface ExistingContent {
  /** Folder and file stem key (see `getMatchKeys`) → entry ID. */
  entries: Map<string, string>;
  /** Mapped directory-relative folder path → collection ID. */
  folders: Map<string, string>;
  entryIDs: Set<string>;
}
/** Repository files matched to entries that already exist. */
interface ContentMatch {
  /** Mapped directory-relative file path → entry ID. */
  entries: Map<string, string>;
  /** Files without an entry. */
  unmatched: string[];
  /** Entries without a file. */
  missing: number;
}

const ENTRY_PAGE_SIZE = 100;

/** Lookup keys of a folder and a name: its slug, as the export names files, and its plain text. */
const getMatchKeys = (folder: string, name: string): string[] => {
  const stems = [getSlug(name), name.toLowerCase()].filter((stem) => stem !== null);

  return [...new Set(stems)].map((stem) => `${folder}\n${stem}`);
};
const listEntries = (client: AndesineClient, collectionID: string) => {
  return paginate((cursor) =>
    client.entries.list({ collectionID, limit: ENTRY_PAGE_SIZE, cursor })
  );
};
/** The mapped collection's content, with folders named by slug as the export names them. */
const loadExistingContent = async (
  client: AndesineClient,
  collections: Map<string, CollectionRecord>,
  rootID: string
): Promise<ExistingContent> => {
  const content: ExistingContent = { entries: new Map(), folders: new Map(), entryIDs: new Set() };
  const visit = async (collectionID: string, folder: string): Promise<void> => {
    content.folders.set(folder, collectionID);

    for await (const entry of listEntries(client, collectionID)) {
      const slug = entry.slugPath.split("/").pop() ?? "";
      const keys = [
        ...getMatchKeys(folder, entry.name),
        ...(slug ? getMatchKeys(folder, slug) : [])
      ];

      content.entryIDs.add(entry.id);
      keys.forEach((key) => !content.entries.has(key) && content.entries.set(key, entry.id));
    }

    // Sibling collections list their entries in parallel.
    await mapLimit(collections.get(collectionID)?.descendants ?? [], async (childID) => {
      const child = collections.get(childID);

      if (child) await visit(childID, joinPath(folder, toContentSlug(child.name, child.id)));
    });
  };

  await visit(rootID, "");

  return content;
};
/** Matches files (mapped directory-relative paths) to entries by folder and name; each entry once. */
const matchContent = (paths: string[], existing: ExistingContent): ContentMatch => {
  const entries = new Map<string, string>();
  const used = new Set<string>();
  const unmatched: string[] = [];

  for (const path of paths) {
    const location = getFileLocation(path);
    const entryID = getMatchKeys(location.folder, location.stem)
      .map((key) => existing.entries.get(key))
      .find((id) => id && !used.has(id));

    if (entryID) {
      entries.set(path, entryID);
      used.add(entryID);
    } else {
      unmatched.push(path);
    }
  }

  return { entries, unmatched, missing: existing.entryIDs.size - used.size };
};

export { loadExistingContent, matchContent };
