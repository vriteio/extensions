import type { CollectionPanelProps } from "@andesine/extensions";
import {
  Button,
  Callout,
  Item,
  ItemGroup,
  Navigation,
  openPage,
  openURL,
  Skeleton,
  Stack,
  Text
} from "@andesine/extensions/solid";
import { createResource, For, Match, Show, Switch } from "solid-js";
import {
  SITE_BUILDS_PAGE_ID,
  SITE_PAGE_ID,
  SITE_SETTINGS_PAGES,
  SITE_SETUP_PAGE_ID
} from "../shared/site-pages";
import { getCollectionName, listChannels, type SiteView } from "./api";
import { BUILD_STATUSES } from "./site-builds";
import { createSiteStatus, getEntryPages, type SiteStatus } from "./site-status";

interface SitePanelContentProps {
  collectionID: string;
  entryID?: string;
  pageID?: string;
}
interface SiteItemsProps {
  site: () => SiteView;
  /** The name of the channel that the site shows. */
  channelName: string;
  status: SiteStatus;
  entryID?: string;
  onOpen(pageID: string): void;
}

type SettingsPage = (typeof SITE_SETTINGS_PAGES)[number];

const toItem = ({ id, name, icon }: SettingsPage) => ({ id, label: name, icon });
// As the app's settings menu: the overview and the site's settings, then its hosting.
const NAVIGATION = [
  {
    label: "Site",
    items: [
      {
        id: SITE_PAGE_ID,
        label: "Overview",
        icon: "i-lucide:layout-dashboard"
      },
      ...SITE_SETTINGS_PAGES.filter(({ section }) => section === "Site").map(toItem)
    ]
  },
  {
    label: "Hosting",
    items: SITE_SETTINGS_PAGES.filter(({ section }) => section === "Hosting").map(toItem)
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
/** The site's address, its latest build, and the open entry's page on it, as panel rows. */
const SiteItems = (props: SiteItemsProps) => {
  const builds = () => props.status.loaded()!.builds;
  const latest = () => builds()?.builds[0];
  // The page of the open entry in the live build; unpublished entries have none yet.
  const [entryURL] = createResource(
    () => {
      const live = builds()?.live;

      return live && props.entryID ? { live, entryID: props.entryID } : null;
    },
    async ({ live, entryID }) => {
      const entryPages = await getEntryPages(props.site().collectionID, live).catch(() => null);
      const path = entryPages?.pages[entryID];

      return path ? new URL(path, props.site().url).href : null;
    }
  );
  const entryDetails = () => {
    const url = entryURL();

    if (url) return [new URL(url).pathname];
    if (entryURL.loading) return ["Looking for its page…"];

    return ["Not on the site yet; it shows once published"];
  };

  return (
    <>
      <Item
        icon="i-lucide:globe"
        label={props.site().url.replace(/^https?:\/\//, "")}
        details={[props.channelName]}
        onClick={() => openURL(props.site().url)}
      />
      {/* The build running or queued first, then the latest one: its time and status. */}
      <Switch
        fallback={
          <Item
            icon="i-lucide:hammer"
            label="Builds"
            details={["Builds when you publish"]}
            onClick={() => props.onOpen(SITE_BUILDS_PAGE_ID)}
          />
        }
      >
        <Match when={latest()?.status === "building" && latest()}>
          {(build) => (
            <Item
              icon="i-lucide:refresh-cw"
              tone="primary"
              label="Building"
              date={build().startedAt}
              onClick={() => props.onOpen(SITE_BUILDS_PAGE_ID)}
            />
          )}
        </Match>
        <Match when={builds()?.pending}>
          <Item
            icon="i-lucide:clock"
            tone="primary"
            label="Build queued"
            onClick={() => props.onOpen(SITE_BUILDS_PAGE_ID)}
          />
        </Match>
        <Match when={latest()}>
          {(build) => (
            <Item
              icon={BUILD_STATUSES[build().status].icon}
              tone={BUILD_STATUSES[build().status].tone}
              label="Latest build"
              date={build().finishedAt ?? build().startedAt}
              details={[BUILD_STATUSES[build().status].label]}
              onClick={() => props.onOpen(SITE_BUILDS_PAGE_ID)}
            />
          )}
        </Match>
      </Switch>
      <Show when={props.entryID}>
        <Item
          icon="i-lucide:file-text"
          label="This entry's page"
          details={entryDetails()}
          onClick={entryURL() ? () => openURL(entryURL()!) : undefined}
        />
      </Show>
    </>
  );
};

/** The site of the publishing collection, or how to set one up. */
const SitePanelContent = (props: SitePanelContentProps) => {
  const status = createSiteStatus(() => ({
    collectionID: props.collectionID,
    entryID: props.entryID
  }));
  const [name] = createResource(status.siteCollectionID, getCollectionName);
  const [channels] = createResource(listChannels);
  // With the names, so that the group label and the channel don't change after the rows show.
  const loaded = () => {
    return name.loading || channels.loading ? undefined : status.loaded();
  };
  const channelName = (code: string) => {
    return channels()?.find((channel) => channel.code === code)?.name ?? code;
  };
  const open = (pageID: string) => openPage(pageID, { collectionID: status.siteCollectionID() });

  return (
    <Switch fallback={<PanelSkeleton />}>
      <Match when={status.failure()}>
        {(message) => <Callout tone="danger">{message()}</Callout>}
      </Match>
      <Match when={loaded() && !loaded()!.site}>
        {/* The setup page makes the site, or says why it can't. */}
        <Stack gap="small">
          <Text size="sm" tone="muted">
            Publish{" "}
            <Text weight="medium" class="text-gray-900">
              {name() ?? "this collection"}
            </Text>{" "}
            as a documentation site.
          </Text>
          <Button
            variant="primary"
            disabled={props.pageID === SITE_SETUP_PAGE_ID}
            onClick={() => open(SITE_SETUP_PAGE_ID)}
          >
            Set up a site
          </Button>
        </Stack>
      </Match>
      <Match when={loaded()?.site}>
        {(site) => (
          <Stack gap="none">
            <ItemGroup label={name() ?? undefined}>
              <SiteItems
                site={site}
                channelName={channelName(site().channel)}
                status={status}
                entryID={props.entryID}
                onOpen={open}
              />
            </ItemGroup>
            <Navigation sections={NAVIGATION} selected={props.pageID} onSelect={open} />
          </Stack>
        )}
      </Match>
    </Switch>
  );
};

/** The right panel; a site needs a collection with publishing on. */
export const SitePanel = (props: CollectionPanelProps) => (
  <Show
    when={props.publishingCollectionID}
    keyed
    fallback={
      <Callout title="Publishing is off">
        A site shows a collection's published content. Turn on publishing for this collection, or
        for one around it, to make a site.
      </Callout>
    }
  >
    {(collectionID) => (
      <SitePanelContent collectionID={collectionID} entryID={props.entryID} pageID={props.pageID} />
    )}
  </Show>
);
