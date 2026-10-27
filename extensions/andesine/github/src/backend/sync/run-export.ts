import { toContentSlug, type Andesine } from "@andesine/sdk";
import {
  SIDECAR_PATH,
  createPathLookup,
  exportEntry,
  flattenTree,
  getEntryPath,
  getDirectory,
  getFileLocation,
  getRelativeFilePath,
  getSlug,
  joinPath,
  parseSidecar,
  planPublish,
  serializeSidecar,
  sha256,
  type PublishedCollection,
  type PublishedEntry
} from "../../sync";
import { commitChanges, getBranchHead, readTextFile, type CommitChange } from "../github";
import { createRun, isNotFound } from "../store";
import type { SyncContext } from "./context";
import { mapLimit } from "./limit";
import { getErrorMessage, SYNC_TRAILER } from "./run-import";

interface ExportRun {
  /** The snapshot before the publish; null compares with the files that are synced. */
  previousSnapshotID: string | null;
  /** The published snapshot; the channel's current one when omitted. */
  snapshotID?: string;
  /** Exports only entries without a file, after a first import. */
  onlyMissing?: boolean;
  /** With `onlyMissing`, entries that also overwrite their files, e.g. when Andesine's side won. */
  overwrite?: string[];
}
interface PublishedTree {
  snapshotID: string;
  entries: PublishedEntry[];
  collections: PublishedCollection[];
}

type PublishedAsset = Andesine.PublishedContent["assets"][number];

const loadTree = async (
  context: SyncContext,
  snapshotID?: string
): Promise<PublishedTree | null> => {
  try {
    const tree = await context.client.content.getTree({
      collectionID: context.mapping.collectionID,
      ...(snapshotID ? { snapshotID } : { channel: context.mapping.channel })
    });

    return {
      snapshotID: tree.snapshotID,
      ...flattenTree(tree.collection, context.mapping.collectionID)
    };
  } catch (error) {
    // An expired snapshot: the export compares with the synced files instead.
    if (isNotFound(error)) return null;

    throw error;
  }
};
/** The sidecar at the branch head. */
const loadSidecar = async ({ mapping, token }: SyncContext) => {
  const head = await getBranchHead(token, mapping.repository, mapping.branch);

  return parseSidecar(await readTextFile(token, mapping.repository, SIDECAR_PATH, head.commit));
};
/** Positions are written as `order` only in folders where synced files use it. */
const getOrder = (orderedFolders: Set<string>, path: string, position: number): number | null => {
  return orderedFolders.has(getFileLocation(path).folder) ? position : null;
};
/** A file name for an image: its upload's name as a slug, with a hash when another file has it. */
const getImageName = async (
  context: SyncContext,
  asset: PublishedAsset,
  folder: string,
  checksum: string,
  changes: CommitChange[]
): Promise<string> => {
  const { filename } = await context.client.assets.get({ assetID: asset.assetID });
  const stem = getSlug(filename.replace(/\.[^.]+$/, "")) ?? toContentSlug(asset.assetID);
  const extension = asset.format === "jpeg" ? "jpg" : asset.format;
  const isTaken = (path: string) => {
    const owner = Object.entries(context.state.assetPaths).find(([, item]) => item === path)?.[0];

    return (owner && owner !== asset.assetID) || changes.some((change) => change.path === path);
  };
  const path = joinPath(folder, `${stem}.${extension}`);

  return isTaken(path) ? joinPath(folder, `${stem}-${checksum.slice(0, 6)}.${extension}`) : path;
};
/**
 * The repository file of a published image, in the images directory or next to the entry's file;
 * committed images are reused by their asset ID, e.g. by the other entries that show them.
 */
const resolveImageFile = async (
  context: SyncContext,
  asset: PublishedAsset | undefined,
  entryPath: string,
  changes: CommitChange[]
): Promise<string> => {
  if (!asset) throw new Error("A published image has no delivery URL");

  const known = context.state.assetPaths[asset.assetID];

  if (known) return known;

  const response = await fetch(asset.url);

  if (!response.ok) throw new Error(`Image ${asset.assetID} couldn't be downloaded`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  const checksum = await sha256(bytes);
  const folder =
    context.mapping.imageLocation === "entry"
      ? getDirectory(entryPath)
      : context.mapping.imagesDirectory;
  const path = await getImageName(context, asset, folder, checksum, changes);

  changes.push({ path, content: bytes });
  context.state.assetPaths[asset.assetID] = path;
  context.state.images[checksum] = asset.assetID;

  return path;
};

/**
 * Andesine → GitHub: writes the files of entries whose published version changed, moves and
 * removes files of moved and unpublished entries, and commits them with the sidecar in one
 * commit. The commit's trailer makes the import skip the push it causes.
 */
const runExport = async (context: SyncContext, options: ExportRun): Promise<void> => {
  const { client, mapping, state, token } = context;
  const run = createRun(null);
  const [next, previous, sidecar] = await Promise.all([
    loadTree(context, options.snapshotID),
    options.previousSnapshotID ? loadTree(context, options.previousSnapshotID) : null,
    loadSidecar(context)
  ]);

  if (!next) throw new Error("The published snapshot isn't available");

  const synced = new Set(Object.values(state.entries));
  const plan = planPublish(previous?.entries ?? null, next.entries);
  const overwrite = new Set(options.overwrite);
  const changed = plan.changed.filter((entry) => {
    return !options.onlyMissing || !synced.has(entry.id) || overwrite.has(entry.id);
  });
  const changes: CommitChange[] = [];
  const lookup = createPathLookup(state, next.collections);
  const paths = new Map(
    next.entries.map((entry) => [entry.id, getEntryPath(entry, lookup, mapping)])
  );
  const pathsBySlug = new Map(next.entries.map((entry) => [entry.slugPath, paths.get(entry.id)!]));
  const orderedFolders = new Set(
    Object.keys(state.orders).map((path) => getFileLocation(path).folder)
  );

  for (const entryID of plan.removed) {
    const path = lookup.entryPaths.get(entryID);

    if (!path) continue;

    changes.push({ path, content: null });
    delete state.entries[path];
    delete sidecar.files[path];
  }

  // The content loads in parallel; files are then written in order, as image names depend on it.
  const contents = await mapLimit(changed, (entry) => {
    return client.content
      .get({ entryID: entry.id, snapshotID: next.snapshotID })
      .catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))));
  });

  for (const [index, entry] of changed.entries()) {
    const path = paths.get(entry.id)!;
    const known = lookup.entryPaths.get(entry.id);
    // Another entry's file may have taken the synced path earlier in this run.
    const previousPath = known && state.entries[known] === entry.id ? known : undefined;
    const location = getFileLocation(getRelativeFilePath(mapping, path));
    const collection = next.collections.find(({ id }) => id === entry.collectionID);
    const isRoot = location.isIndex && !location.folder;

    try {
      const published = contents[index];

      if (published instanceof Error) throw published;

      const variant = mapping.imageFormat === "webp" ? "display" : "source";

      for (const asset of published.assets.filter((item) => item.variant === variant)) {
        await resolveImageFile(context, asset, path, changes);
      }

      const exported = await exportEntry({
        content: published.content,
        properties: published.properties,
        path,
        mapping,
        indexTitle: location.isIndex
          ? isRoot
            ? (state.rootTitle ?? undefined)
            : collection?.name
          : undefined,
        rootTitle: isRoot ? (state.rootTitle ?? undefined) : undefined,
        order: getOrder(
          orderedFolders,
          path,
          location.isIndex ? (collection?.position ?? entry.position) : entry.position
        ),
        titleStyle: state.headingTitles.includes(path) ? "heading" : undefined,
        resolveLink: (slugPath) => {
          const target = pathsBySlug.get(slugPath);

          return target ? getRelativeFilePath(mapping, target) : null;
        },
        resolveImage: (assetID) => state.assetPaths[assetID] ?? ""
      });

      if (previousPath && previousPath !== path) {
        changes.push({ path: previousPath, content: null });
        delete state.entries[previousPath];
        delete sidecar.files[previousPath];
      }

      changes.push({ path, content: exported.content });
      sidecar.files[path] = exported.sidecar;
      state.entries[path] = entry.id;
      run.warnings.push(
        ...exported.unresolvedLinks.map((href) => `${path}: link ${href} isn't synced`)
      );
    } catch (error) {
      run.skipped.push({ path, reason: getErrorMessage(error) });
    }
  }

  if (changes.length) {
    changes.push({ path: SIDECAR_PATH, content: serializeSidecar(sidecar) });

    const commit = await commitChanges(
      token,
      mapping.repository,
      mapping.branch,
      changes,
      `Sync from Andesine (${mapping.channel})\n\n${SYNC_TRAILER} ${next.snapshotID}`
    );

    // The import's next comparison starts after this commit, so it doesn't read it back; a push
    // during the export is the commit's parent, which the import must still read.
    if (commit && state.lastCommit === commit.parent) state.lastCommit = commit.sha;

    run.commit = commit?.sha ?? null;
  }

  state.lastExport = run;

  // The changes of a failed export were in this one.
  if (!options.onlyMissing) state.exportBase = null;

  await context.store.setState(mapping.collectionID, state);
};

export { runExport };
