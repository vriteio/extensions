import {
  SIDECAR_PATH,
  getFileLocation,
  getRelativeFilePath,
  getRepositoryPath,
  importFile,
  parseSidecar,
  planPush,
  type ImportedFile,
  type Precedence,
  type PushPlan,
  type SyncRun
} from "../../sync";
import { compareCommits, getBranchHead, listMappedFiles, readTextFile } from "../github";
import { ensureFolder, loadCollections, type CollectionRecord } from "./collections";
import { loadExistingContent, matchContent } from "./match";
import { createRun, isNotFound } from "../store";
import { getAPIErrorCode, idempotency, type SyncContext } from "./context";
import { uploadImage } from "./images";
import { mapLimit } from "./limit";
import { applyCollectionOrder, applyEntryOrder } from "./order";

interface ImportRun {
  /** The pushed commit; the branch head when omitted. */
  commit?: string;
  /** Compare with the last synced commit; otherwise every file is read. */
  incremental: boolean;
  /** On a first sync, the side whose content wins for files that match entries; GitHub's if omitted. */
  precedence?: Precedence;
}
interface ContentWrite {
  path: string;
  id: string;
  mdx: string;
  /** Created in this run, so it has no version on the channel. */
  isNew: boolean;
}

const SYNC_TRAILER = "Andesine-Sync:";
const ITEM_PATTERN = /^Item (\d+):/;
const BULK_LIMIT = 100;

const isSyncCommit = (message: string): boolean => message.includes(`\n${SYNC_TRAILER}`);
const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
/** The draft hash that a replacement must match: the channel's version, or the draft itself. */
const getExpectedHash = async (
  context: SyncContext,
  entryID: string,
  isNew: boolean
): Promise<string> => {
  if (isNew) return (await context.client.entries.get({ id: entryID })).hash;

  try {
    const version = await context.client.publishing.getEntryVersion({
      entryID,
      channel: context.mapping.channel
    });

    return version.hash;
  } catch (error) {
    if (!isNotFound(error)) throw error;

    return (await context.client.entries.get({ id: entryID })).hash;
  }
};
/**
 * Writes the files' content and returns the versions to publish. A file whose draft changed in
 * Andesine since the channel's version gets only a version; its draft is kept.
 */
const writeContent = async (
  context: SyncContext,
  writes: ContentWrite[],
  versionName: string,
  run: SyncRun
): Promise<Array<{ entryID: string; versionID: string }>> => {
  const versions: Array<{ entryID: string; versionID: string }> = [];
  const pending = await mapLimit(writes, async (write) => ({
    ...write,
    expectedHash: await getExpectedHash(context, write.id, write.isNew)
  }));

  while (pending.length) {
    const chunk = pending.slice(0, BULK_LIMIT);

    try {
      const result = await context.client.entries.bulkUpdate(
        {
          items: chunk.map(({ id, mdx, expectedHash }) => ({
            id,
            mdx,
            expectedHash,
            version: { name: versionName }
          }))
        },
        idempotency(context, `content:${chunk.map(({ path }) => path).join(",")}`)
      );

      result.items.forEach((item, index) => {
        if (item.version) versions.push({ entryID: chunk[index].id, versionID: item.version.id });
      });
      pending.splice(0, chunk.length);
    } catch (error) {
      const index = chunk.length === 1 ? 0 : Number(ITEM_PATTERN.exec(getErrorMessage(error))?.[1]);
      const failed = chunk[index];

      if (!failed || !getAPIErrorCode(error)) throw error;

      pending.splice(pending.indexOf(failed), 1);

      if (getAPIErrorCode(error) === "CONTENT_HASH_MISMATCH") {
        const version = await context.client.versions.create(
          { entryID: failed.id, mdx: failed.mdx, name: versionName },
          idempotency(context, `version:${failed.path}`)
        );

        // The same content as the channel's version needs no publish.
        if (version.hash !== failed.expectedHash) {
          versions.push({ entryID: failed.id, versionID: version.id });
          run.keptDrafts.push(failed.path);
        }
      } else {
        run.skipped.push({
          path: failed.path,
          reason: getErrorMessage(error).replace(ITEM_PATTERN, "").trim()
        });
      }
    }
  }

  return versions;
};
/** The files to read: changes since the last synced commit, or the whole mapped directory. */
const planChanges = async (
  context: SyncContext,
  commit: string,
  incremental: boolean
): Promise<PushPlan | "synced"> => {
  const { mapping, state, token } = context;
  const comparison =
    incremental && state.lastCommit
      ? await compareCommits(token, mapping.repository, state.lastCommit, commit)
      : null;

  if (comparison?.messages.length && comparison.messages.every(isSyncCommit)) return "synced";
  if (comparison) return planPush(comparison.files, mapping);

  const files = await listMappedFiles(token, mapping, commit);
  const present = new Set(files);

  return {
    upserts: files,
    removals: Object.keys(state.entries)
      .map((path) => getRelativeFilePath(mapping, path))
      .filter((path) => !present.has(path)),
    renames: []
  };
};
const unpublish = async (context: SyncContext, entryIDs: string[]): Promise<void> => {
  for (const entryID of entryIDs) {
    try {
      await context.client.publishing.unpublishEntry({ entryID, channel: context.mapping.channel });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
};

/**
 * Links a first sync's files to the entries that already exist, by folder and name, and drops links
 * (kept from an earlier mapping) to deleted entries. Returns the files that Andesine's side keeps.
 */
const linkExisting = async (
  context: SyncContext,
  collections: Map<string, CollectionRecord>,
  paths: string[],
  precedence: Precedence
): Promise<Set<string>> => {
  const { client, mapping, state } = context;
  const existing = await loadExistingContent(client, collections, mapping.collectionID);

  for (const [path, id] of Object.entries(state.entries)) {
    if (!existing.entryIDs.has(id)) delete state.entries[path];
  }

  const unlinked = paths.filter((path) => !state.entries[getRepositoryPath(mapping, path)]);

  for (const [path, id] of matchContent(unlinked, existing).entries) {
    state.entries[getRepositoryPath(mapping, path)] = id;
  }

  for (const [folder, id] of existing.folders) {
    if (folder) state.collections[folder] ??= id;
  }

  return new Set(
    precedence === "andesine"
      ? paths.filter((path) => state.entries[getRepositoryPath(mapping, path)])
      : []
  );
};

/**
 * GitHub → Andesine: creates entries for new files, writes the content of changed files (or a
 * version when the draft was edited), moves, orders, and publishes them to the channel in one
 * snapshot. Deleted files are unpublished. Pushes made only of sync commits are skipped. A first
 * sync links files to existing entries; it returns the entry IDs whose files the export overwrites
 * when Andesine's side wins.
 */
const runImport = async (context: SyncContext, options: ImportRun): Promise<string[]> => {
  const { client, mapping, state, token } = context;
  const commit =
    options.commit ?? (await getBranchHead(token, mapping.repository, mapping.branch)).commit;
  const run = createRun(commit);
  const plan = await planChanges(context, commit, options.incremental);
  const touchedFolders = new Set<string>();

  if (plan === "synced") {
    state.lastCommit = commit;
    await context.store.setState(mapping.collectionID, state);

    return [];
  }

  const sidecar = parseSidecar(await readTextFile(token, mapping.repository, SIDECAR_PATH, commit));
  const collections = await loadCollections(client, mapping.collectionID);
  const isFirstSync = !options.incremental && !state.lastCommit;
  const kept = isFirstSync
    ? await linkExisting(context, collections, plan.upserts, options.precedence ?? "github")
    : new Set<string>();
  const moves: Array<{ id: string; collectionID: string }> = [];

  for (const { from, to } of plan.renames) {
    const fromPath = getRepositoryPath(mapping, from);
    const folder = getFileLocation(to).folder;
    const id = state.entries[fromPath];

    if (!id) continue;

    delete state.entries[fromPath];
    delete state.orders[fromPath];
    state.entries[getRepositoryPath(mapping, to)] = id;

    touchedFolders.add(folder);

    if (getFileLocation(from).folder !== folder) moves.push({ id, collectionID: folder });
  }

  const removed = plan.removals
    .map((path) => getRepositoryPath(mapping, path))
    .filter((path) => state.entries[path]);

  await unpublish(
    context,
    removed.map((path) => state.entries[path])
  );
  removed.forEach((path) => {
    delete state.entries[path];
    delete state.orders[path];
  });

  const paths = plan.upserts.filter((item) => !kept.has(item));
  const contents = await mapLimit(paths, (path) => {
    return readTextFile(token, mapping.repository, getRepositoryPath(mapping, path), commit);
  });
  const sources = new Map<string, string>();

  paths.forEach((path, index) => {
    const content = contents[index];

    if (content !== null) sources.set(path, content);
  });

  // A first pass names new entries and folders; links and images need the entries to exist.
  const previews = new Map<string, ImportedFile>();

  for (const [path, content] of sources) {
    try {
      const preview = await importFile({
        file: { path: getRepositoryPath(mapping, path), content },
        mapping,
        sidecar: sidecar.files[getRepositoryPath(mapping, path)],
        resolveEntry: () => null,
        resolveImage: async () => "pending"
      });

      previews.set(path, preview);
    } catch (error) {
      run.skipped.push({ path: getRepositoryPath(mapping, path), reason: getErrorMessage(error) });
    }
  }

  const indexTitles = new Map(
    [...previews.values()]
      .filter(({ isIndex, folder }) => isIndex && folder)
      .map(({ folder, collectionName }) => [folder, collectionName ?? folder])
  );

  for (const move of moves) {
    move.collectionID = await ensureFolder(context, collections, move.collectionID, indexTitles);
  }

  if (moves.length) await client.entries.bulkMove({ items: moves });

  const created = new Set<string>();

  for (const [path, preview] of previews) {
    const repositoryPath = getRepositoryPath(mapping, path);

    touchedFolders.add(preview.folder);

    if (state.entries[repositoryPath]) continue;

    try {
      const collectionID = await ensureFolder(context, collections, preview.folder, indexTitles);
      const entry = await client.entries.create(
        { collectionID, name: preview.name },
        idempotency(context, `entry:${repositoryPath}`)
      );

      state.entries[repositoryPath] = entry.id;
      created.add(entry.id);
    } catch (error) {
      previews.delete(path);
      run.skipped.push({ path: repositoryPath, reason: getErrorMessage(error) });
    }
  }

  const writes: ContentWrite[] = [];

  // Files convert in parallel; their images upload once each (see `uploadImage`).
  await mapLimit([...previews.keys()], async (path) => {
    const repositoryPath = getRepositoryPath(mapping, path);
    const id = state.entries[repositoryPath];

    try {
      // Keys without a sidecar label take the entry's labels, e.g. of its schema's properties.
      const properties = created.has(id) ? {} : (await client.entries.get({ id })).properties;
      const imported = await importFile({
        file: { path: repositoryPath, content: sources.get(path)! },
        mapping,
        sidecar: sidecar.files[repositoryPath],
        resolveEntry: (target) => state.entries[getRepositoryPath(mapping, target)] ?? null,
        resolveImage: (image) => uploadImage(context, mapping.repository, commit, image, id),
        resolvePropertyLabel: (key) => properties[key]?.name ?? null
      });

      writes.push({ path: repositoryPath, id, mdx: imported.mdx, isNew: created.has(id) });
      run.warnings.push(
        ...imported.unresolvedLinks.map((href) => `${repositoryPath}: link ${href} isn't synced`)
      );

      if (imported.order === null) delete state.orders[repositoryPath];
      else state.orders[repositoryPath] = imported.order;

      state.headingTitles = state.headingTitles.filter((item) => item !== repositoryPath);

      if (imported.titleStyle) state.headingTitles.push(repositoryPath);

      if (imported.isIndex && !imported.folder) state.rootTitle = imported.collectionName ?? null;

      if (imported.isIndex && imported.folder) {
        const collectionID = state.collections[imported.folder];
        const current = collections.get(collectionID);
        const name = imported.collectionName;

        if (current && name && current.name !== name) {
          await client.collections.update({ id: collectionID, name, expectedName: current.name });
          current.name = name;
        }
      }
    } catch (error) {
      run.skipped.push({ path: repositoryPath, reason: getErrorMessage(error) });
    }
  });

  // In path order, so a retried job writes the same chunks with the same idempotency keys.
  writes.sort((first, second) => first.path.localeCompare(second.path));

  const versions = await writeContent(context, writes, `GitHub ${commit.slice(0, 7)}`, run);

  await applyEntryOrder(context, touchedFolders);
  await applyCollectionOrder(context, collections, touchedFolders);

  for (let index = 0; index < versions.length; index += BULK_LIMIT) {
    await client.publishing.bulkPublishEntries({
      entries: versions.slice(index, index + BULK_LIMIT),
      channel: mapping.channel
    });
  }

  state.lastCommit = commit;
  state.lastImport = run;
  await context.store.setState(mapping.collectionID, state);

  return [...kept].map((path) => state.entries[getRepositoryPath(mapping, path)]);
};

export { runImport, SYNC_TRAILER, getErrorMessage };
