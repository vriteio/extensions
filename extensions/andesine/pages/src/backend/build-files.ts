import type { BuildManifest } from "../shared/storage";

interface BuildFile {
  path: string;
  size: number;
  hash: string;
}

type Manifest = BuildManifest["files"];

const toManifest = (files: BuildFile[]): Manifest => {
  return Object.fromEntries(files.map(({ path, hash }) => [path, hash]));
};
/** One file per content that no kept build has; the rest is in R2 already. */
const getNewFiles = (files: BuildFile[], known: Set<string>): BuildFile[] => {
  const unique = new Map(files.map((file) => [file.hash, file]));

  return [...unique.values()].filter(({ hash }) => !known.has(hash));
};
/** Hashes that only the removed builds used. */
const getUnusedHashes = (removed: Manifest[], kept: Set<string>): string[] => {
  const hashes = new Set(removed.flatMap((manifest) => Object.values(manifest)));

  return [...hashes].filter((hash) => !kept.has(hash));
};

export { toManifest, getNewFiles, getUnusedHashes };
export type { BuildFile, Manifest };
