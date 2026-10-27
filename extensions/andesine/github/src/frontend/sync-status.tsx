import { Callout, Item, openURL, Setting, Stack, Text, TimeAgo } from "@andesine/extensions/solid";
import { For, Show } from "solid-js";
import type { Mapping, SyncRun } from "../sync/types";

interface SyncStatusProps {
  mapping: Mapping;
  /** The name of the channel that the collection syncs to. */
  channelName: string;
  lastImport: SyncRun | null;
  lastExport: SyncRun | null;
  /** The sync that runs now; the last runs stay the finished ones meanwhile. */
  running: { startedAt: string } | null;
  /** Opens the page with each run's details. */
  onOpenDetails(): void;
}
interface RunItemProps {
  label: string;
  icon: string;
  run: SyncRun | null;
  onClick(): void;
}
interface RunDetailsProps {
  label: string;
  run: SyncRun | null;
}

/** One direction's last run: when, which commit, and what didn't sync. */
const RunDetails = (props: RunDetailsProps) => (
  <Setting label={props.label}>
    <Show when={props.run} fallback={<Text tone="muted">Not synced yet</Text>}>
      {(run) => (
        <Stack gap="none">
          <Text size="sm">
            <TimeAgo date={run().at} />
            {run().commit ? ` · ${run().commit!.slice(0, 7)}` : ""}
          </Text>
          <Show when={run().error}>{(error) => <Callout tone="danger">{error()}</Callout>}</Show>
          <Show when={run().keptDrafts.length}>
            <Callout tone="warning" title="Edited drafts kept">
              These entries got a version from GitHub; their drafts weren't replaced:{" "}
              {run().keptDrafts.join(", ")}
            </Callout>
          </Show>
          <For each={run().skipped}>
            {(file) => (
              <Text size="sm" tone="danger">
                Skipped {file.path}: {file.reason}
              </Text>
            )}
          </For>
          <Show when={run().warnings.length}>
            <Text size="sm" tone="muted">
              {run().warnings.length} warnings: {run().warnings.slice(0, 3).join("; ")}
            </Text>
          </Show>
        </Stack>
      )}
    </Show>
  </Setting>
);
const count = (value: number, noun: string): string => `${value} ${noun}${value === 1 ? "" : "s"}`;
/** One direction's last run as a row: when it ran, and the details count its issues. */
const RunItem = (props: RunItemProps) => {
  const details = () => {
    const run = props.run;

    if (!run) return ["Not synced yet"];

    return [
      run.commit?.slice(0, 7),
      run.error ? "Failed" : null,
      run.skipped.length ? `${run.skipped.length} skipped` : null,
      run.keptDrafts.length ? `${count(run.keptDrafts.length, "draft")} kept` : null,
      run.warnings.length ? count(run.warnings.length, "warning") : null
    ].filter((detail): detail is string => Boolean(detail));
  };

  return (
    <>
      <Item
        icon={props.icon}
        label={props.label}
        date={props.run?.at}
        details={details()}
        onClick={props.onClick}
      />
      <Show when={props.run?.error}>{(error) => <Callout tone="danger">{error()}</Callout>}</Show>
    </>
  );
};
/** Where the collection syncs to, and the last sync in each direction, as panel rows. */
const SyncStatus = (props: SyncStatusProps) => {
  const repositoryURL = () => {
    const { owner, name } = props.mapping.repository;
    const path = props.mapping.directory ? `/${props.mapping.directory}` : "";

    return `https://github.com/${owner}/${name}/tree/${encodeURIComponent(props.mapping.branch)}${path}`;
  };

  return (
    <>
      <Item
        icon="i-github-sync:github"
        label={props.mapping.repository.name}
        details={[props.mapping.branch, `${props.mapping.directory}/`, props.channelName]}
        onClick={() => openURL(repositoryURL())}
      />
      <Show when={props.running}>
        {(running) => (
          <Item
            icon="i-lucide:refresh-cw"
            tone="primary"
            label="Syncing"
            date={running().startedAt}
            onClick={props.onOpenDetails}
          />
        )}
      </Show>
      <RunItem
        label="From GitHub"
        icon="i-lucide:arrow-down-to-line"
        run={props.lastImport}
        onClick={props.onOpenDetails}
      />
      <RunItem
        label="To GitHub"
        icon="i-lucide:arrow-up-from-line"
        run={props.lastExport}
        onClick={props.onOpenDetails}
      />
    </>
  );
};

export { RunDetails, SyncStatus };
