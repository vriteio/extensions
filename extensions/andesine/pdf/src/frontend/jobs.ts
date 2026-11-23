import { createSignal } from "solid-js";
import type { ExportJob, RunningJob } from "../shared/types";
import { listJobs } from "./api";

const POLL_INTERVAL = 2000;

// The member's exports of the last 24 hours, newest first; the panel and the page share them.
const [jobs, setJobs] = createSignal<ExportJob[] | null>(null);

let poll: ReturnType<typeof setInterval> | null = null;

/** Loads the list again every few seconds while an export runs. */
const followRunning = () => {
  const isRunning = jobs()?.some(({ state }) => state === "running") ?? false;

  if (isRunning && !poll) {
    poll = setInterval(() => {
      void refreshJobs();
    }, POLL_INTERVAL);
  }

  if (!isRunning && poll) {
    clearInterval(poll);
    poll = null;
  }
};
const refreshJobs = async () => {
  setJobs(await listJobs().catch(() => jobs() ?? []));
  followRunning();
};
const addJob = (job: ExportJob) => {
  setJobs([job, ...(jobs() ?? [])]);
  followRunning();
};
const describeProgress = (job: RunningJob): string => {
  if (job.step === "rendering") return "Rendering the PDF";

  return job.total > 1 ? `Loading ${job.done} of ${job.total} entries` : "Loading the content";
};

export { jobs, refreshJobs, addJob, describeProgress };
