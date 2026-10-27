import { DurableObject } from "cloudflare:workers";
import type { Mapping, Precedence } from "../sync";
import type { Env } from "./env";
import { getBackend } from "./andesine";
import { isPrivateRepository } from "./github";
import { canSyncPrivateRepositories, PlanRequiredError, PRIVATE_REPOSITORY_MESSAGE } from "./plan";
import { createRun, createStore, listInstallationLinks, type InstallationLink } from "./store";
import { loadSyncContext, type SyncContext } from "./sync/context";
import { runExport } from "./sync/run-export";
import { getErrorMessage, runImport } from "./sync/run-import";

/** A GitHub push to a repository branch. */
interface PushJob {
  kind: "push";
  id: string;
  installationID: number;
  repositoryID: number;
  branch: string;
  commit: string;
}
/** A publish to a mapped channel. */
interface PublishJob {
  kind: "publish";
  id: string;
  link: InstallationLink;
  collectionID: string;
  previousSnapshotID: string;
  snapshotID: string;
}
/** “Sync now”, and the first sync of a new mapping (which also exports entries without files). */
interface FullJob {
  kind: "full";
  id: string;
  link: InstallationLink;
  collectionID: string;
  exportMissing: boolean;
  /** For a new mapping: which side's content wins for files that match entries. */
  precedence?: Precedence;
}
interface QueuedJob {
  job: SyncJob;
  attempts: number;
  queuedAt: string;
}

type SyncJob = PushJob | PublishJob | FullJob;

const MAX_ATTEMPTS = 5;
const RETRY_DELAY = 30_000;

/** The sync contexts of the mappings of the pushed repository branch. */
const loadPushContexts = async (env: Env, job: PushJob): Promise<SyncContext[]> => {
  const contexts: SyncContext[] = [];

  for (const link of await listInstallationLinks(env, job.installationID)) {
    const client = getBackend(env).createClient(link.instance, link.extensionID);
    const mappings = await createStore(env, client, link.extensionID).listMappings();
    const pushed = mappings.filter(({ repository, branch }) => {
      return repository.id === job.repositoryID && branch === job.branch;
    });

    for (const mapping of pushed) {
      const context = await loadSyncContext(env, link, mapping.collectionID, job.id);

      if (context) contexts.push(context);
    }
  }

  return contexts;
};
/** Stops syncs of a private repository without the Pro plan, e.g. after a downgrade. */
const assertPlan = async (context: SyncContext): Promise<void> => {
  const [self, isPrivate] = await Promise.all([
    context.client.extensions.getSelf(),
    isPrivateRepository(context.token, context.mapping.repository)
  ]);

  if (isPrivate && !canSyncPrivateRepositories(self.workspacePlan)) {
    throw new PlanRequiredError(PRIVATE_REPOSITORY_MESSAGE);
  }
};
/** Whether an earlier attempt of the push job imported the mapping's commit. */
const isImported = (context: SyncContext, job: PushJob): boolean => {
  return context.state.lastCommit === job.commit;
};
/** Imports each mapping on its own; a failed one retries the job, which skips the imported ones. */
const runPush = async (env: Env, job: PushJob): Promise<void> => {
  let failure: unknown = null;

  for (const context of await loadPushContexts(env, job)) {
    if (isImported(context, job)) continue;

    try {
      await assertPlan(context);
      await runImport(context, { commit: job.commit, incremental: true });
    } catch (error) {
      // One workspace's plan doesn't stop the other workspaces that map the repository.
      if (error instanceof PlanRequiredError) await recordRunFailure(context, job, error);
      else failure ??= error;
    }
  }

  if (failure) throw failure;
};
const runJob = async (env: Env, job: SyncJob): Promise<void> => {
  if (job.kind === "push") return runPush(env, job);

  const context = await loadSyncContext(env, job.link, job.collectionID, job.id);

  if (!context) return;

  await assertPlan(context);

  if (job.kind === "publish") {
    return runExport(context, {
      previousSnapshotID: context.state.exportBase ?? job.previousSnapshotID,
      snapshotID: job.snapshotID
    });
  }

  // The runs change the context's state in place, so the export continues from the import's.
  const overwrite = await runImport(context, { incremental: false, precedence: job.precedence });

  if (job.exportMissing) {
    await runExport(context, { previousSnapshotID: null, onlyMissing: true, overwrite });
  } else if (context.state.exportBase) {
    await runExport(context, { previousSnapshotID: context.state.exportBase });
  }
};
/** Records a run's failure in the status that the panel shows. */
const recordRunFailure = async (
  context: SyncContext,
  job: SyncJob,
  error: unknown
): Promise<void> => {
  const run = createRun(null, getErrorMessage(error));

  if (job.kind === "publish") {
    context.state.lastExport = run;
    context.state.exportBase ??= job.previousSnapshotID;
  } else {
    context.state.lastImport = run;
  }

  await context.store.setState(context.mapping.collectionID, context.state);
};
/** Records a job's final failure for each of its mappings. */
const recordFailure = async (env: Env, job: SyncJob, error: unknown): Promise<void> => {
  const contexts =
    job.kind === "push"
      ? await loadPushContexts(env, job)
      : [await loadSyncContext(env, job.link, job.collectionID, job.id)];

  for (const context of contexts) {
    const isFailed = context && !(job.kind === "push" && isImported(context, job));

    if (isFailed) await recordRunFailure(context, job, error);
  }
};

/**
 * One object per repository: its sync jobs run one at a time, because all its mappings share the
 * sidecar and the branch. Jobs are stored, so they survive restarts and retry after failures.
 */
class RepositorySync extends DurableObject<Env> {
  async enqueue(job: SyncJob): Promise<void> {
    const queue = (await this.ctx.storage.get<QueuedJob[]>("queue")) ?? [];
    const isQueued = queue.some((item) => item.job.id === job.id);

    if (isQueued) return;

    await this.ctx.storage.put("queue", [
      ...queue,
      { job, attempts: 0, queuedAt: new Date().toISOString() }
    ]);

    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now());
  }

  /** When the oldest queued or running job of a mapping was queued, or null without one. */
  async getQueuedAt(mapping: Pick<Mapping, "collectionID" | "branch">): Promise<string | null> {
    const queue = (await this.ctx.storage.get<QueuedJob[]>("queue")) ?? [];
    const queued = queue.find(({ job }) => {
      return job.kind === "push"
        ? job.branch === mapping.branch
        : job.collectionID === mapping.collectionID;
    });

    return queued?.queuedAt ?? null;
  }

  async alarm(): Promise<void> {
    const queue = (await this.ctx.storage.get<QueuedJob[]>("queue")) ?? [];
    const [current, ...rest] = queue;

    if (!current) return;

    try {
      await runJob(this.env, current.job);
      await this.ctx.storage.put("queue", rest);
    } catch (error) {
      // A plan doesn't change between retries, so its failure is recorded at once.
      const attempts = error instanceof PlanRequiredError ? MAX_ATTEMPTS : current.attempts + 1;

      if (attempts >= MAX_ATTEMPTS) {
        console.error(`Sync job ${current.job.id} failed: ${getErrorMessage(error)}`);
        await recordFailure(this.env, current.job, error).catch(() => undefined);
        await this.ctx.storage.put("queue", rest);
      } else {
        await this.ctx.storage.put("queue", [{ ...current, attempts }, ...rest]);
        await this.ctx.storage.setAlarm(Date.now() + RETRY_DELAY * attempts);

        return;
      }
    }

    if (rest.length) await this.ctx.storage.setAlarm(Date.now());
  }
}

const getRepositorySync = (env: Env, repositoryID: number) => {
  return env.REPOSITORIES.get(env.REPOSITORIES.idFromName(String(repositoryID)));
};
const enqueueJob = async (env: Env, repositoryID: number, job: SyncJob): Promise<void> => {
  await getRepositorySync(env, repositoryID).enqueue(job);
};
/** The running sync of a mapping, from its repository's queue: a job of it is queued or running. */
const getRunningSync = async (
  env: Env,
  mapping: Mapping
): Promise<{ startedAt: string } | null> => {
  const queuedAt = await getRepositorySync(env, mapping.repository.id).getQueuedAt(mapping);

  return queuedAt ? { startedAt: queuedAt } : null;
};

export { RepositorySync, enqueueJob, getRunningSync };
