import {
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  getRepositoryPath,
  trimSlashes,
  type Mapping,
  type MappingInput,
  type SyncSource,
  type SyncState
} from "../../sync";
import { getBackend } from "../andesine";
import type { Env } from "../env";
import {
  getBranchHead,
  getInstallationToken,
  isPrivateRepository,
  listBranches,
  listMappedFiles,
  listRepositories
} from "../github";
import { canSyncPrivateRepositories, PRIVATE_REPOSITORY_MESSAGE } from "../plan";
import { enqueueJob, getRunningSync } from "../repository-sync";
import { loadCollections } from "../sync/collections";
import { loadExistingContent, matchContent } from "../sync/match";
import { createToken } from "../signing";
import { createEmptyState, createStore, MAX_MAPPINGS, unlinkInstallation } from "../store";

interface PanelRequest {
  collectionID: string;
  repositoryID?: number;
  mapping?: Partial<MappingInput>;
}

const MANAGE_ACTIONS = ["collection:update", "publishing:publish"] as const;
const MAX_PATTERNS = 20;
const STATE_LIFETIME = 600;

class BadRequestError extends Error {}

const json = (body: unknown, status = 200): Response => Response.json(body, { status });
const assertPath = (path: string): string => {
  const trimmed = trimSlashes(path.trim());

  if (trimmed.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new BadRequestError("Use a path inside the repository, without . or .. segments");
  }

  return trimmed;
};
const parsePatterns = (patterns: unknown, fallback: string[]): string[] => {
  const list = Array.isArray(patterns)
    ? patterns
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  if (list.length > MAX_PATTERNS || list.some((item) => item.length > 200)) {
    throw new BadRequestError(`Use up to ${MAX_PATTERNS} patterns of up to 200 characters`);
  }

  return list.length ? list : fallback;
};
const getSource = (mapping: Mapping): SyncSource => ({
  repositoryID: mapping.repository.id,
  branch: mapping.branch,
  directory: mapping.directory
});
const isSameSource = (source: SyncSource | null, mapping: Mapping): boolean => {
  return JSON.stringify(source) === JSON.stringify(getSource(mapping));
};
/**
 * The links of an earlier mapping of the same source, e.g. after the sync was disabled, so its
 * files keep their entries; none for another source.
 */
const getKeptLinks = (previous: SyncState, mapping: Mapping): Partial<SyncState> => {
  if (!isSameSource(previous.source, mapping)) return {};

  return {
    entries: previous.entries,
    collections: previous.collections,
    images: previous.images,
    assetPaths: previous.assetPaths,
    orders: previous.orders,
    headingTitles: previous.headingTitles,
    rootTitle: previous.rootTitle
  };
};
/** The request's mapping, checked against the installation's repositories; saves check its channel. */
const parseMapping = async (
  token: string,
  body: PanelRequest,
  privateRepositories: boolean
): Promise<Mapping> => {
  const input = body.mapping ?? {};
  const repository = (await listRepositories(token)).find(({ id }) => id === input.repositoryID);

  if (!repository) throw new BadRequestError("Choose a repository of the GitHub installation");
  if (repository.private && !privateRepositories) {
    throw new BadRequestError(PRIVATE_REPOSITORY_MESSAGE);
  }

  if (!input.branch || !(await listBranches(token, repository)).includes(input.branch)) {
    throw new BadRequestError("Choose a branch of the repository");
  }

  return {
    collectionID: body.collectionID,
    repository: { id: repository.id, owner: repository.owner, name: repository.name },
    branch: input.branch,
    directory: assertPath(input.directory ?? ""),
    channel: input.channel ?? "",
    format: input.format === "md" ? "md" : "mdx",
    imagesDirectory: assertPath(input.imagesDirectory || "images"),
    imageLocation: input.imageLocation === "entry" ? "entry" : "directory",
    imageURLPrefix: input.imageURLPrefix?.trim() ? `/${assertPath(input.imageURLPrefix)}` : "",
    imageFormat: input.imageFormat === "webp" ? "webp" : "original",
    linkStyle: input.linkStyle === "site" ? "site" : "file",
    include: parsePatterns(input.include, DEFAULT_INCLUDE),
    exclude: parsePatterns(input.exclude, DEFAULT_EXCLUDE)
  };
};
/** Mapping changes, connecting, and syncing need the member to update and publish the collection. */
const handlePanelRequest = async (
  env: Env,
  request: Request,
  action: string
): Promise<Response> => {
  const body = (await request.json().catch(() => ({}))) as PanelRequest;

  if (typeof body.collectionID !== "string") throw new BadRequestError("collectionID is required");

  const session = await getBackend(env).verifySession(request.headers, {
    checks: [{ collectionID: body.collectionID, actions: [...MANAGE_ACTIONS] }]
  });
  const canManage = session.checks[0]?.allowed ?? false;
  const link = { instance: session.instance, extensionID: session.extensionID };
  const store = createStore(env, session.client, session.extensionID);
  const privateRepositories = canSyncPrivateRepositories(session.workspacePlan);

  if (action === "status") {
    const [connection, mapping, state] = await Promise.all([
      store.getConnection(),
      store.getMapping(body.collectionID),
      store.getState(body.collectionID)
    ]);

    return json({
      canManage,
      connection: connection && { account: connection.account },
      mapping,
      status: mapping && {
        lastImport: state.lastImport,
        lastExport: state.lastExport,
        running: await getRunningSync(env, mapping)
      }
    });
  }

  if (!canManage) {
    return json({ message: "You need to be able to update and publish this collection" }, 403);
  }

  if (action === "connect") {
    const state = await createToken(env.STATE_SECRET, link, STATE_LIFETIME);

    return json({
      url: `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new?state=${state}`
    });
  }

  const connection = await store.getConnection();

  if (!connection) return json({ message: "Connect GitHub first" }, 409);

  const token = await getInstallationToken(env, connection.installationID);

  if (action === "repositories") {
    return json({ repositories: await listRepositories(token), privateRepositories });
  }

  if (action === "branches") {
    const repository = (await listRepositories(token)).find(({ id }) => id === body.repositoryID);

    if (!repository) throw new BadRequestError("The repository isn't in the GitHub installation");

    return json({ branches: await listBranches(token, repository) });
  }

  if (action === "preview") {
    const mapping = await parseMapping(token, body, privateRepositories);
    const head = await getBranchHead(token, mapping.repository, mapping.branch);
    const [paths, existing, state] = await Promise.all([
      listMappedFiles(token, mapping, head.commit),
      loadCollections(session.client, body.collectionID).then((collections) => {
        return loadExistingContent(session.client, collections, body.collectionID);
      }),
      store.getState(body.collectionID)
    ]);
    const links = getKeptLinks(state, mapping);
    const linked = paths.filter((path) => {
      return existing.entryIDs.has(links.entries?.[getRepositoryPath(mapping, path)] ?? "");
    });
    const match = matchContent(
      paths.filter((path) => !linked.includes(path)),
      existing
    );

    return json({
      matched: linked.length + match.entries.size,
      githubOnly: match.unmatched.length,
      andesineOnly: Math.max(match.missing - linked.length, 0)
    });
  }

  if (action === "mapping") {
    const [mapping, channels, existing, mappings] = await Promise.all([
      parseMapping(token, body, privateRepositories),
      session.client.publishing.listChannels(),
      store.getMapping(body.collectionID),
      store.listMappings()
    ]);

    if (!channels.some(({ code }) => code === mapping.channel)) {
      throw new BadRequestError("Choose a channel");
    }

    if (!existing && mappings.length >= MAX_MAPPINGS) {
      throw new BadRequestError(`A workspace can map up to ${MAX_MAPPINGS} collections`);
    }

    const isMoved = !existing || !isSameSource(getSource(existing), mapping);

    await store.setMapping(mapping);

    // A new source starts over: a first import, then an export of entries without files.
    if (isMoved) {
      await store.setState(body.collectionID, {
        ...createEmptyState(),
        ...getKeptLinks(await store.getState(body.collectionID), mapping),
        source: getSource(mapping)
      });
      await enqueueJob(env, mapping.repository.id, {
        kind: "full",
        id: `mapping:${body.collectionID}:${Date.now()}`,
        link,
        collectionID: body.collectionID,
        exportMissing: true,
        precedence: body.mapping?.initialSync === "andesine" ? "andesine" : "github"
      });
    }

    return json({ mapping });
  }

  if (action === "sync") {
    const mapping = await store.getMapping(body.collectionID);

    if (!mapping) throw new BadRequestError("Map the collection first");
    if (!privateRepositories && (await isPrivateRepository(token, mapping.repository))) {
      throw new BadRequestError(PRIVATE_REPOSITORY_MESSAGE);
    }

    await enqueueJob(env, mapping.repository.id, {
      kind: "full",
      id: `sync:${body.collectionID}:${Date.now()}`,
      link,
      collectionID: body.collectionID,
      exportMissing: false
    });

    return json({ queued: true });
  }

  if (action === "remove-mapping") {
    await store.deleteMapping(body.collectionID);

    return json({ removed: true });
  }

  if (action === "disconnect") {
    // Disconnecting removes every mapping, so the member must manage all of them.
    const mappings = await store.listMappings();
    const checked = await getBackend(env).verifySession(request.headers, {
      checks: mappings.map(({ collectionID }) => ({ collectionID, actions: [...MANAGE_ACTIONS] }))
    });

    if (!checked.checks.every(({ allowed }) => allowed)) {
      return json(
        { message: "You need to be able to update and publish every mapped collection" },
        403
      );
    }

    await Promise.all(mappings.map(({ collectionID }) => store.deleteMapping(collectionID)));
    await store.deleteConnection();
    await unlinkInstallation(env, link);

    return json({ disconnected: true });
  }

  return json({ message: "Not found" }, 404);
};

export { handlePanelRequest, BadRequestError };
