import {
  Callout,
  IconButton,
  Item,
  ItemGroup,
  openURL,
  Section,
  Text
} from "@andesine/extensions/solid";
import { createResource, createSignal, Index, onMount, Show } from "solid-js";
import type { ExportJob } from "../shared/types";
import { listChannels } from "./api";
import { describeProgress, jobs, refreshJobs } from "./jobs";

const STATUS_ICONS = {
  running: { icon: "i-lucide:loader-circle", tone: "primary" },
  ready: { icon: "i-lucide:file-check", tone: "success" },
  failed: { icon: "i-lucide:circle-alert", tone: "danger" }
} as const;

export const ExportsPage = () => {
  const [failure, setFailure] = createSignal<string | null>(null);
  const [channels] = createResource(listChannels);
  const versionName = (job: ExportJob) => {
    if (!job.channel) return "Current draft";

    return channels()?.find(({ code }) => code === job.channel)?.name ?? job.channel;
  };
  const describe = (job: ExportJob) => {
    if (job.state === "running") return describeProgress(job);
    if (job.state === "failed") return job.message;

    return "Available for 24 hours";
  };
  const download = (job: ExportJob) => {
    if (job.state !== "ready") return;

    openURL(job.downloadURL).catch((error: Error) => setFailure(error.message));
  };

  onMount(() => {
    void refreshJobs();
  });

  return (
    <Show when={jobs()}>
      {(loaded) => (
        <Section title="Exports">
          <Show when={failure()}>{(message) => <Callout tone="danger">{message()}</Callout>}</Show>
          <Show
            when={loaded().length > 0}
            fallback={
              <Text size="sm" tone="muted">
                Your exports of the last 24 hours show here.
              </Text>
            }
          >
            <ItemGroup>
              {/* `Index` keeps the rows while the list reloads during an export. */}
              <Index each={loaded()}>
                {(job) => (
                  <Item
                    label={job().title}
                    date={job().createdAt}
                    details={[versionName(job()), describe(job())]}
                    icon={STATUS_ICONS[job().state].icon}
                    tone={STATUS_ICONS[job().state].tone}
                    onClick={job().state === "ready" ? () => download(job()) : undefined}
                  >
                    <Show when={job().state === "ready"}>
                      <IconButton
                        icon="i-lucide:download"
                        label="Download"
                        onClick={() => download(job())}
                      />
                    </Show>
                  </Item>
                )}
              </Index>
            </ItemGroup>
          </Show>
        </Section>
      )}
    </Show>
  );
};
