import {
  Button,
  Callout,
  Item,
  ItemGroup,
  Navigation,
  openPage,
  Skeleton,
  Stack,
  Text
} from "@andesine/extensions/solid";
import type { CollectionPanelProps } from "@andesine/extensions";
import { createResource, For, Match, Show, Switch } from "solid-js";
import { listChannels } from "./api";
import { MAPPING_PAGE_ID, SETUP_PAGE_ID, SYNC_PAGE_ID } from "./pages";
import { createSyncState } from "./sync-state";
import { SyncStatus } from "./sync-status";

interface SyncedPanelProps {
  collectionID: string;
  pageID?: string;
}

const NAVIGATION = [
  {
    label: "Manage",
    items: [
      { id: MAPPING_PAGE_ID, label: "Mapping settings", icon: "i-lucide:settings" },
      { id: SYNC_PAGE_ID, label: "Sync details", icon: "i-lucide:history" }
    ]
  }
];

// As the app's Versions panel while it loads: an icon, a label, and a details line per row.
const PanelSkeleton = () => (
  <Stack gap="none" class="gap-0.5">
    <For each={["h-5 w-36 rounded-md", "h-5 w-44 rounded-md"]}>
      {(label) => (
        <Stack direction="row" align="center" class="h-11 px-1">
          <Stack direction="row" align="start" class="gap-1.5">
            <Skeleton class="h-5 w-5 shrink-0 rounded-md" />
            <Stack gap="small">
              <Skeleton class={label} />
              <Skeleton class="h-3 w-24 rounded-[0.25rem]" />
            </Stack>
          </Stack>
        </Stack>
      )}
    </For>
  </Stack>
);
/**
 * The panel of the synced collection: the nearest one with publishing on, e.g. the docs root for a
 * nested entry. It sums up the sync; the page sets it up.
 */
const SyncedPanel = (props: SyncedPanelProps) => {
  const sync = createSyncState(() => props.collectionID);
  const [channels] = createResource(listChannels);
  // With the names, so that the text, group label, and channel don't change after they show.
  const loaded = () => (sync.name.loading || channels.loading ? undefined : sync.loaded());
  const channelName = (code: string) => {
    return channels()?.find((channel) => channel.code === code)?.name ?? code;
  };
  const status = () => sync.loaded()!;
  const open = (pageID: string) => openPage(pageID, { collectionID: props.collectionID });

  return (
    <Stack gap="medium">
      <Switch fallback={<PanelSkeleton />}>
        <Match when={sync.failure()}>
          {(message) => <Callout tone="danger">{message()}</Callout>}
        </Match>
        <Match when={loaded() && !status().mapping}>
          {/* The page connects GitHub and maps the collection. */}
          <Stack gap="small">
            <Text size="sm" tone="muted">
              Sync{" "}
              <Text weight="medium" class="text-gray-900">
                {sync.name() ?? "this collection"}
              </Text>{" "}
              with Markdown or MDX files in a GitHub repository.
            </Text>
            <Button
              variant="primary"
              disabled={props.pageID === SETUP_PAGE_ID}
              onClick={() => open(SETUP_PAGE_ID)}
            >
              Set up sync
            </Button>
          </Stack>
        </Match>
        <Match when={loaded()?.mapping}>
          {(mapping) => (
            <Stack gap="none">
              <ItemGroup label={sync.name() ?? undefined}>
                <Show when={!status().connection}>
                  <Item
                    icon="i-lucide:unplug"
                    tone="warning"
                    label="GitHub isn't connected"
                    details={["Connect it in the mapping settings"]}
                    onClick={() => open(MAPPING_PAGE_ID)}
                  />
                </Show>
                <SyncStatus
                  mapping={mapping()}
                  channelName={channelName(mapping().channel)}
                  lastImport={status().status?.lastImport ?? null}
                  lastExport={status().status?.lastExport ?? null}
                  running={status().status?.running ?? null}
                  onOpenDetails={() => open(SYNC_PAGE_ID)}
                />
              </ItemGroup>
              <Navigation sections={NAVIGATION} selected={props.pageID} onSelect={open} />
            </Stack>
          )}
        </Match>
      </Switch>
    </Stack>
  );
};

/** The right panel; the sync needs a collection with publishing on. */
export const GitHubPanel = (props: CollectionPanelProps) => (
  <Show
    when={props.publishingCollectionID}
    keyed
    fallback={
      <Callout title="Publishing is off">
        The GitHub Sync works through publishing. Turn on publishing for this collection, or for one
        around it, to sync it.
      </Callout>
    }
  >
    {(collectionID) => <SyncedPanel collectionID={collectionID} pageID={props.pageID} />}
  </Show>
);
