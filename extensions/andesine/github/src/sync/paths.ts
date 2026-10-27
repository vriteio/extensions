import { toContentSlug } from "@andesine/sdk/slug";
import type { Mapping } from "./types";

interface FileLocation {
  /** Mapped directory-relative folder path, "" for the root. */
  folder: string;
  /** File name without its extension. */
  stem: string;
  extension: "md" | "mdx";
  isIndex: boolean;
}

const SIDECAR_DIRECTORY = ".andesine";
const SIDECAR_PATH = `${SIDECAR_DIRECTORY}/sync.json`;
const FILE_PATTERN = /^(.*?)([^/]+)\.(mdx?)$/;
const DEFAULT_INCLUDE = ["**/*.{md,mdx}"];
const DEFAULT_EXCLUDE = ["**/_*", "**/_*/**", "**/.*", "**/.*/**"];
const compiledPatterns = new WeakMap<string[], RegExp[]>();

const trimSlashes = (path: string): string => path.replace(/^\/+|\/+$/g, "");
const joinPath = (...parts: string[]): string => parts.map(trimSlashes).filter(Boolean).join("/");
const getDirectory = (path: string): string => path.split("/").slice(0, -1).join("/");
/** A repository path from a mapped directory-relative path. */
const getRepositoryPath = (mapping: Pick<Mapping, "directory">, path: string): string => {
  return joinPath(mapping.directory, path);
};
/** A mapped directory-relative path from the repository path of a file in the directory. */
const getRelativeFilePath = (mapping: Pick<Mapping, "directory">, path: string): string => {
  return mapping.directory ? path.slice(mapping.directory.length + 1) : path;
};
/** Resolves `.` and `..` segments; null when the path leaves the root. */
const normalizePath = (path: string): string | null => {
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;

    if (segment === "..") {
      if (!segments.length) return null;

      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  return segments.join("/");
};
const getRelativePath = (fromDirectory: string, to: string): string => {
  const from = fromDirectory ? fromDirectory.split("/") : [];
  const target = to.split("/");

  let common = 0;

  while (common < from.length && common < target.length - 1 && from[common] === target[common]) {
    common += 1;
  }

  const up = from.slice(common).map(() => "..");
  const relative = [...up, ...target.slice(common)].join("/");

  return up.length ? relative : `./${relative}`;
};
/**
 * How a file references an image: under the URL prefix when the image is in the images directory
 * and one is set, else relative to the file.
 */
const getImageReference = (filePath: string, imagePath: string, mapping: Mapping): string => {
  const directory = `${mapping.imagesDirectory}/`;
  const isServed = Boolean(mapping.imageURLPrefix) && imagePath.startsWith(directory);

  return isServed
    ? `${mapping.imageURLPrefix}/${imagePath.slice(directory.length)}`
    : getRelativePath(getDirectory(filePath), imagePath);
};
/** The repository path of an image reference from a file; null when it leaves the repository. */
const resolveImageReference = (
  filePath: string,
  reference: string,
  mapping: Mapping
): string | null => {
  const prefix = mapping.imageURLPrefix ? `${mapping.imageURLPrefix}/` : null;

  if (prefix && reference.startsWith(prefix)) {
    return normalizePath(joinPath(mapping.imagesDirectory, reference.slice(prefix.length)));
  }

  return reference.startsWith("/")
    ? normalizePath(reference)
    : normalizePath(joinPath(getDirectory(filePath), reference));
};
/** A name's slug as the server derives it, or null when it has no letters or numbers. */
const getSlug = (name: string): string | null => {
  try {
    return toContentSlug(name);
  } catch {
    return null;
  }
};
const escapeRegExp = (text: string): string => text.replace(/[.+^$()|[\]\\]/g, "\\$&");
/** Glob to RegExp: `**` spans folders, `*` and `?` stay in one segment, `{a,b}` alternates. */
const compileGlob = (pattern: string): RegExp => {
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === "*" && pattern[index + 1] === "*") {
      const isFolder = pattern[index + 2] === "/";

      source += isFolder ? "(?:.*/)?" : ".*";
      index += isFolder ? 2 : 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else if (character === "{") {
      const end = pattern.indexOf("}", index);

      if (end === -1) {
        source += "\\{";
      } else {
        source += `(?:${pattern
          .slice(index + 1, end)
          .split(",")
          .map(escapeRegExp)
          .join("|")})`;
        index = end;
      }
    } else {
      source += escapeRegExp(character);
    }
  }

  return new RegExp(`^${source}$`);
};
/** Compiled once per pattern list, e.g. a mapping's include patterns. */
const compilePatterns = (patterns: string[]): RegExp[] => {
  const compiled = compiledPatterns.get(patterns) ?? patterns.map(compileGlob);

  compiledPatterns.set(patterns, compiled);

  return compiled;
};
/** A file's path inside the mapped directory, or null when it isn't synced. */
const getMappedPath = (path: string, mapping: Mapping): string | null => {
  const prefix = mapping.directory ? `${mapping.directory}/` : "";
  const relative = path.startsWith(prefix) ? path.slice(prefix.length) : null;
  const include = mapping.include.length ? mapping.include : DEFAULT_INCLUDE;
  const isSidecar = path.startsWith(`${SIDECAR_DIRECTORY}/`);

  if (!relative || isSidecar || !FILE_PATTERN.test(relative)) return null;

  const isIncluded = compilePatterns(include).some((pattern) => pattern.test(relative));
  const isExcluded = compilePatterns(mapping.exclude).some((pattern) => pattern.test(relative));

  return isIncluded && !isExcluded ? relative : null;
};
const getFileLocation = (relativePath: string): FileLocation => {
  const [, folder = "", stem = "", extension = "md"] = FILE_PATTERN.exec(relativePath) ?? [];

  return {
    folder: trimSlashes(folder),
    stem,
    extension: extension as FileLocation["extension"],
    isIndex: stem === "index"
  };
};

export {
  SIDECAR_PATH,
  DEFAULT_INCLUDE,
  DEFAULT_EXCLUDE,
  trimSlashes,
  joinPath,
  getDirectory,
  getRepositoryPath,
  getRelativeFilePath,
  normalizePath,
  getRelativePath,
  getImageReference,
  resolveImageReference,
  getSlug,
  getMappedPath,
  getFileLocation
};
