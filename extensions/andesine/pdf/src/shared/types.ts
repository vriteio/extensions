/**
 * What `/panel/export` exports: with `entryID`, that entry (`collectionID` is its collection, null
 * at the top level); without it, the collection `collectionID` with its entries in tree order.
 */
interface ExportRequest {
  entryID: string | null;
  collectionID: string | null;
  /** A publishing channel's code, or null for the current draft. */
  channel: string | null;
}
interface JobBase {
  id: string;
  title: string;
  channel: string | null;
  createdAt: string;
}
interface RunningJob extends JobBase {
  state: "running";
  step: "loading" | "rendering";
  /** Entries loaded so far, of `total`. */
  done: number;
  total: number;
}
interface ReadyJob extends JobBase {
  state: "ready";
  fileName: string;
  /** A signed link to the PDF on the backend, valid until `expiresAt`. */
  downloadURL: string;
  expiresAt: string;
}
interface FailedJob extends JobBase {
  state: "failed";
  message: string;
}

type ExportJob = RunningJob | ReadyJob | FailedJob;

export type { ExportRequest, ExportJob, JobBase, RunningJob, ReadyJob, FailedJob };
