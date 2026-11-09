import { getDirectory, getFileLocation, getRelativeFilePath, joinPath } from "./paths";
import type { PathLookup, PublishedCollection, PublishedEntry } from "./plan";
import type { Mapping } from "./types";

interface NavigationTree {
  rootID: string;
  rootName: string;
  entries: PublishedEntry[];
  collections: PublishedCollection[];
}
/** A folder's title and children, as a Fumadocs `meta.json` file holds them. */
interface NavigationFolder {
  /** Mapped directory-relative folder path, "" for the root. */
  folder: string;
  title?: string;
  /** Child folder names and file names without extension, in order. */
  pages: string[];
}

const NAVIGATION_FILE = "meta.json";

const isNameList = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};
const getNavigationPath = (mapping: Pick<Mapping, "directory">, folder: string): string => {
  return joinPath(mapping.directory, folder, NAVIGATION_FILE);
};
/** The mapped folder of a navigation file, or null when the path isn't one. */
const getNavigationFolder = (path: string, mapping: Mapping): string | null => {
  const prefix = mapping.directory ? `${mapping.directory}/` : "";
  const isNavigationFile =
    mapping.navigationFiles === "meta.json" &&
    path.startsWith(prefix) &&
    path.split("/").at(-1) === NAVIGATION_FILE;

  return isNavigationFile ? getDirectory(path.slice(prefix.length)) : null;
};
/**
 * The folders of synced files, with their children in the explorer's order: collections first,
 * then entries in descending rank. An index file is its folder's page, except in the root.
 */
const planNavigation = (
  tree: NavigationTree,
  lookup: PathLookup,
  /** Entry ID → repository path of its synced file. */
  paths: Map<string, string>,
  mapping: Mapping
): NavigationFolder[] => {
  const files = tree.entries
    .filter(({ id }) => paths.has(id))
    .map((entry) => {
      return {
        entry,
        location: getFileLocation(getRelativeFilePath(mapping, paths.get(entry.id)!))
      };
    });
  const used = new Set([""]);
  const getFolder = (id: string): string => (id === tree.rootID ? "" : lookup.getFolder(id));

  for (const { location } of files) {
    for (let folder = location.folder; folder; folder = getDirectory(folder)) used.add(folder);
  }

  return [{ id: tree.rootID, name: tree.rootName }, ...tree.collections]
    .map((collection) => ({ collection, folder: getFolder(collection.id) }))
    .filter(({ folder }) => used.has(folder))
    .map(({ collection, folder }) => {
      const folders = tree.collections
        .filter(({ parentID }) => parentID === collection.id)
        .sort((first, second) => first.position - second.position)
        .map(({ id }) => getFolder(id))
        .filter((child) => used.has(child) && child && getDirectory(child) === folder)
        .map((child) => child.split("/").at(-1)!);
      const stems = files
        .filter(({ entry, location }) => {
          const isFolderPage = Boolean(folder) && location.isIndex;

          return (
            entry.collectionID === collection.id && location.folder === folder && !isFolderPage
          );
        })
        .sort((first, second) => second.entry.position - first.entry.position)
        .map(({ location }) => location.stem);

      return { folder, title: collection.name, pages: [...folders, ...stems] };
    });
};
const serializeNavigationFile = ({ title, pages }: NavigationFolder): string => {
  return `${JSON.stringify({ title, pages }, null, 2)}\n`;
};
/** A navigation file's title and pages; null when it isn't valid. Other keys are ignored. */
const parseNavigationFile = (content: string, folder: string): NavigationFolder | null => {
  try {
    const parsed = JSON.parse(content) as { title?: unknown; pages?: unknown };
    const pages = parsed.pages ?? [];
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";

    return isNameList(pages) ? { folder, title: title || undefined, pages } : null;
  } catch {
    return null;
  }
};

export {
  NAVIGATION_FILE,
  isNameList,
  getNavigationPath,
  getNavigationFolder,
  planNavigation,
  serializeNavigationFile,
  parseNavigationFile
};
export type { NavigationTree, NavigationFolder };
