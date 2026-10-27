import {
  Button,
  Callout,
  IconButton,
  openPage,
  openURL,
  Section,
  Setting,
  Skeleton,
  Stack,
  Text
} from "@andesine/extensions/solid";
import type { CollectionPageProps } from "@andesine/extensions";
import { type JSX, Match, Show, Switch } from "solid-js";
import { callBackend } from "./api";
import { MappingForm } from "./mapping-form";
import { MAPPING_PAGE_ID, SETUP_PAGE_ID } from "./pages";
import { createSyncState, type SyncController } from "./sync-state";
import { RunDetails } from "./sync-status";

interface SyncLoadedProps {
  sync: SyncController;
  children: JSX.Element;
}
interface SyncedCollectionProps extends CollectionPageProps {
  children(collectionID: string): JSX.Element;
}
interface SyncSettingsProps {
  collectionID: string;
  /** The setup maps the collection; the mapping page edits it. */
  mode: "setup" | "mapping";
}
interface SyncRunsProps {
  collectionID: string;
}
interface ConnectionSectionProps {
  sync: SyncController;
  onDisconnected(): void;
}

/** A page's content once the sync's status loads, or the error that it failed with. */
const SyncLoaded = (props: SyncLoadedProps) => (
  <Switch>
    <Match when={props.sync.failure()}>
      {(message) => <Callout tone="danger">{message()}</Callout>}
    </Match>
    <Match when={props.sync.loaded()}>{props.children}</Match>
  </Switch>
);
/** The synced collection: each page's `when` makes it available only with one. */
const SyncedCollection = (props: SyncedCollectionProps) => (
  <Show when={props.publishingCollectionID} keyed>
    {(collectionID) => props.children(collectionID)}
  </Show>
);
/** The GitHub account: connect it, or disconnect it, which removes every mapping. */
const ConnectionSection = (props: ConnectionSectionProps) => {
  const status = () => props.sync.loaded()!;
  const connect = async () => {
    const { url } = await callBackend<{ url: string }>("connect", {
      collectionID: props.sync.collectionID()
    });

    await openURL(url);
  };

  return (
    <Section title="GitHub">
      <Show
        when={status().connection}
        fallback={
          <Setting
            label="Account"
            description="Connect a GitHub account that can access the repository"
          >
            <Stack direction="row" gap="small">
              <Button onClick={() => props.sync.refetch()}>Check again</Button>
              <Button variant="primary" disabled={!status().canManage} onClick={connect}>
                Connect GitHub
              </Button>
            </Stack>
          </Setting>
        }
      >
        {(connection) => (
          <Setting
            label="Account"
            description="The connected GitHub account; disconnecting it removes every mapping"
          >
            <Stack direction="row" gap="medium" align="center">
              <Text size="base" weight="medium" class="text-gray-900">
                {connection().account}
              </Text>
              <Show when={status().canManage}>
                <IconButton
                  icon="i-lucide:unplug"
                  label="Disconnect"
                  variant="danger"
                  disabled={props.sync.busy()}
                  onClick={async () => {
                    if (await props.sync.run("disconnect", "GitHub is disconnected")) {
                      props.onDisconnected();
                    }
                  }}
                />
              </Show>
            </Stack>
          </Setting>
        )}
      </Show>
    </Section>
  );
};
/**
 * The collection's sync settings: the account and the mapping, with the save bar last. The setup
 * opens the mapping page once it's saved; a disconnect opens the setup.
 */
const SyncSettings = (props: SyncSettingsProps) => {
  const sync = createSyncState(() => props.collectionID);
  const status = () => sync.loaded()!;
  const openSetup = () => openPage(SETUP_PAGE_ID, { collectionID: props.collectionID });
  const saved = async () => {
    await sync.refetch();

    if (props.mode === "setup") {
      await openPage(MAPPING_PAGE_ID, { collectionID: props.collectionID });
    }
  };

  return (
    <SyncLoaded sync={sync}>
      <Section title="Collection">
        <Setting label="Collection" description="Its entries and the collections in it sync">
          <Show when={!sync.name.loading} fallback={<Skeleton class="h-6 w-32" />}>
            <Text size="base" weight="medium" class="text-gray-900">
              {sync.name() ?? ""}
            </Text>
          </Show>
        </Setting>
      </Section>
      <ConnectionSection
        sync={sync}
        onDisconnected={() => {
          if (props.mode === "mapping") void openSetup();
        }}
      />
      <Show when={status().connection}>
        <Show
          when={status().canManage}
          fallback={
            <Text tone="muted">Ask someone who can publish this collection to map it.</Text>
          }
        >
          {/* Keyed by the saved mapping, so the form starts from it again after a save. */}
          <Show when={JSON.stringify(status().mapping)} keyed>
            <MappingForm
              collectionID={props.collectionID}
              mapping={status().mapping}
              onSaved={saved}
            />
          </Show>
        </Show>
      </Show>
    </SyncLoaded>
  );
};

/** The last run in each direction with its details, a sync, and disabling the sync. */
const SyncRuns = (props: SyncRunsProps) => {
  const sync = createSyncState(() => props.collectionID);
  const status = () => sync.loaded()!;
  const disableSync = async () => {
    if (await sync.run("remove-mapping", "The sync is disabled")) {
      await openPage(SETUP_PAGE_ID, { collectionID: props.collectionID });
    }
  };

  return (
    <SyncLoaded sync={sync}>
      <Section title="Last syncs">
        <Show when={status().status?.running}>
          <Callout title="A sync is running">
            These are the results of the previous sync; the new ones show once it ends.
          </Callout>
        </Show>
        <RunDetails label="From GitHub" run={status().status?.lastImport ?? null} />
        <RunDetails label="To GitHub" run={status().status?.lastExport ?? null} />
        <Setting
          label="Sync now"
          description="Reads the branch, then commits the changes of a failed export"
        >
          <Button
            size="small"
            loading={sync.pending() === "sync"}
            disabled={
              !status().canManage ||
              !status().connection ||
              sync.busy() ||
              Boolean(status().status?.running)
            }
            onClick={() => sync.run("sync", "The sync has started")}
          >
            Sync now
          </Button>
        </Setting>
      </Section>
      <Show when={status().canManage}>
        <Section title="Advanced">
          <Setting
            label="Disable sync"
            description="Stops syncing; entries and files stay linked, so syncing again keeps them"
          >
            <Button
              size="small"
              variant="danger"
              loading={sync.pending() === "remove-mapping"}
              disabled={sync.busy()}
              onClick={disableSync}
            >
              Disable sync
            </Button>
          </Setting>
        </Section>
      </Show>
    </SyncLoaded>
  );
};

/** "Setup": connects GitHub and maps the collection; available until it's mapped. */
export const GitHubSetupPage = (props: CollectionPageProps) => (
  <SyncedCollection {...props}>
    {(collectionID) => <SyncSettings collectionID={collectionID} mode="setup" />}
  </SyncedCollection>
);
/** "Mapping settings": edits the mapping; available once it's mapped. */
export const GitHubMappingPage = (props: CollectionPageProps) => (
  <SyncedCollection {...props}>
    {(collectionID) => <SyncSettings collectionID={collectionID} mode="mapping" />}
  </SyncedCollection>
);
/** "Sync details", under "Mapping settings": the last syncs, and disabling the sync. */
export const GitHubSyncPage = (props: CollectionPageProps) => (
  <SyncedCollection {...props}>
    {(collectionID) => <SyncRuns collectionID={collectionID} />}
  </SyncedCollection>
);
