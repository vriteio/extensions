import {
  Badge,
  Button,
  Callout,
  CodeBlock,
  Item,
  ItemDetails,
  Section,
  Setting,
  Stack,
  Text,
  Tooltip,
  type BadgeProps
} from "@andesine/extensions/solid";
import { For, Show } from "solid-js";
import { NOTHING_PUBLISHED } from "../shared/constants";
import type { BuildRecord, BuildStatus } from "./api";
import { SiteFrame, type SitePageProps } from "./site-frame";
import type { SiteStatus } from "./site-status";

interface StatusBadge {
  label: string;
  icon: string;
  tone: NonNullable<BadgeProps["tone"]>;
}
interface SiteBuildsProps {
  status: BuildStatus | null;
  /** The site's channel has no content, so nothing builds. */
  nothingPublished: boolean;
}
interface BuildItemProps {
  build: BuildRecord;
  /** Open at first, e.g. a failed latest build. */
  open?: boolean;
}
interface RebuildButtonProps {
  status: SiteStatus;
}

const TRIGGER_LABELS: Record<BuildRecord["trigger"], string> = {
  created: "Site created",
  settings: "Settings saved",
  template: "Template updated",
  publish: "Publish",
  rebuild: "Rebuild"
};
// As the app's webhook delivery states: the icon's color is the status.
const STATUSES: Record<BuildRecord["status"], StatusBadge> = {
  building: { label: "Building", icon: "i-lucide:hammer", tone: "primary" },
  live: { label: "Live", icon: "i-lucide:circle-check", tone: "success" },
  failed: { label: "Failed", icon: "i-lucide:circle-alert", tone: "danger" },
  replaced: { label: "Replaced", icon: "i-lucide:history", tone: "muted" }
};

/** How long a finished build took, e.g. "42s" or "2m 5s". */
const getDuration = (build: BuildRecord): string | null => {
  if (!build.finishedAt) return null;

  const seconds = Math.max(
    1,
    Math.round((new Date(build.finishedAt).getTime() - new Date(build.startedAt).getTime()) / 1000)
  );

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};
/** Rebuild, for managers; disabled while nothing is published. */
const RebuildButton = (props: RebuildButtonProps) => (
  <Show when={props.status.loaded()?.canManage}>
    <Show
      when={props.status.loaded()?.published}
      fallback={
        <Tooltip content={NOTHING_PUBLISHED}>
          <Button size="small" disabled>
            Rebuild
          </Button>
        </Tooltip>
      }
    >
      <Button
        size="small"
        loading={props.status.pending() === "rebuild"}
        disabled={props.status.busy()}
        onClick={props.status.rebuild}
      >
        Rebuild
      </Button>
    </Show>
  </Show>
);
/** A build as a row, as the app's webhook events: open for its badges, error, and log. */
const BuildItem = (props: BuildItemProps) => {
  const status = () => STATUSES[props.build.status];
  const duration = () => getDuration(props.build);
  // The error's first line sums it up; the rest, e.g. a stack, is output as the log is.
  const errorLines = () => (props.build.error ?? "").trim().split("\n");
  const summary = () => errorLines()[0];
  const output = () => {
    const lines = props.build.log.length ? props.build.log : errorLines().slice(1);

    return lines.slice(-30).join("\n");
  };

  return (
    <Item
      icon={status().icon}
      tone={status().tone}
      label={TRIGGER_LABELS[props.build.trigger]}
      date={props.build.finishedAt ?? props.build.startedAt}
      details={[status().label]}
    >
      <ItemDetails open={props.open}>
        <Stack direction="row" gap="small" wrap>
          <Badge icon={status().icon} tone={status().tone}>
            {status().label}
          </Badge>
          <Show when={duration()}>{(text) => <Badge icon="i-lucide:timer">{text()}</Badge>}</Show>
          <Show when={props.build.files}>
            <Badge icon="i-lucide:files">{props.build.files} files</Badge>
          </Show>
        </Stack>
        <Show when={summary()}>{(text) => <Text size="sm">{text()}</Text>}</Show>
        <Show when={output()}>{(code) => <CodeBlock code={code()} log />}</Show>
      </ItemDetails>
    </Item>
  );
};

/** The latest build as a row, open at first when it failed, as on the builds page. */
const SiteBuilds = (props: SiteBuildsProps) => {
  const latest = () => props.status?.builds[0];

  return (
    <Stack gap="small">
      <Show
        when={latest()}
        fallback={
          <Text size="sm" tone="muted">
            {props.status?.pending
              ? "The first build starts soon"
              : "Builds when you publish to its channel"}
          </Text>
        }
      >
        {(build) => <BuildItem build={build()} open={build().status === "failed"} />}
      </Show>
      <Show when={latest() && props.status?.pending}>
        <Text size="sm" tone="muted">
          Another build is queued.
        </Text>
      </Show>
      <Show when={props.nothingPublished}>
        <Callout>{NOTHING_PUBLISHED}</Callout>
      </Show>
    </Stack>
  );
};

/** The site's builds, latest first, with a rebuild; a failed latest build opens with its log. */
export const SiteBuildsPage = (props: SitePageProps) => (
  <SiteFrame {...props}>
    {(_site, status) => {
      const builds = () => status.loaded()?.builds?.builds ?? [];

      return (
        <Section title="Builds">
          <Setting
            label="Rebuild"
            description="The site builds when you publish to its channel; the last five builds are listed"
          >
            <RebuildButton status={status} />
          </Setting>
          <Show when={status.isNothingPublished()}>
            <Callout>{NOTHING_PUBLISHED}</Callout>
          </Show>
          <Show
            when={builds().length}
            fallback={
              <Text size="sm" tone="muted">
                {status.loaded()?.builds?.pending ? "The first build starts soon" : "Not built yet"}
              </Text>
            }
          >
            <Stack gap="none" class="gap-0.5">
              <For each={builds()}>
                {(build, index) => (
                  <BuildItem build={build} open={index() === 0 && build.status === "failed"} />
                )}
              </For>
            </Stack>
          </Show>
        </Section>
      );
    }}
  </SiteFrame>
);

export { RebuildButton, SiteBuilds, STATUSES as BUILD_STATUSES };
export type { StatusBadge };
