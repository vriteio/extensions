import {
  Button,
  Dialog,
  downloadFile,
  IconButton,
  openPage,
  openURL,
  Section,
  Setting,
  Skeleton,
  Stack,
  Text
} from "@andesine/extensions/solid";
import { createResource, createSignal, Show } from "solid-js";
import { SITE_SETUP_PAGE_ID } from "../shared/site-pages";
import { getCollectionName, listChannels, type SiteView } from "./api";
import { RebuildButton, SiteBuilds } from "./site-builds";
import { SiteFrame, type SitePageProps } from "./site-frame";
import type { SiteStatus } from "./site-status";

interface SiteOverviewProps {
  site: () => SiteView;
  status: SiteStatus;
}

/** The site at a glance: its collection, source, address, and build, and the advanced actions. */
const SiteOverview = (props: SiteOverviewProps) => {
  const [deleting, setDeleting] = createSignal(false);
  const [name] = createResource(() => props.site().collectionID, getCollectionName);
  const [channels] = createResource(listChannels);
  const summary = () => props.status.loaded()!;
  const channelName = () => {
    const channel = channels()?.find(({ code }) => code === props.site().channel);

    return channel?.name ?? props.site().channel;
  };
  const isOutdated = () => props.site().templateVersion !== summary().templates.latest;
  const eject = () => {
    return props.status.run<{ name: string; content: string }>("eject", {}, (file) =>
      downloadFile(file.name, file.content, "text/typescript")
    );
  };
  const updateTemplate = () => {
    return props.status.run<{ site: SiteView }>("update-template", {}, (result) =>
      props.status.update({ site: result.site })
    );
  };
  const remove = () => {
    // Read before the refetch, which unmounts this page with the site.
    const { collectionID } = props.site();

    return props.status.run("delete", {}, async () => {
      setDeleting(false);
      await props.status.refetch();
      // The Site page is available only with a site, so the setup opens in its place.
      await openPage(SITE_SETUP_PAGE_ID, { collectionID });
    });
  };

  return (
    <>
      <Section title="Site">
        <Setting label="Collection" description="The site shows its published content">
          <Show when={!name.loading} fallback={<Skeleton class="h-6 w-32" />}>
            <Text size="base" weight="medium" class="text-gray-900">
              {name() ?? ""}
            </Text>
          </Show>
        </Setting>
        <Setting label="Source" description="The channel that the site shows">
          <Show when={!channels.loading} fallback={<Skeleton class="h-6 w-24" />}>
            <Text size="base" weight="medium" class="text-gray-900">
              {channelName()}
            </Text>
          </Show>
        </Setting>
        <Setting label="Address" description="The primary custom domain, if it has one">
          <Stack direction="row" gap="medium" align="center">
            <Text size="base" weight="medium" class="text-gray-900">
              {props.site().url.replace(/^https?:\/\//, "")}
            </Text>
            <IconButton
              icon="i-lucide:external-link"
              label="Open site"
              onClick={() => openURL(props.site().url)}
            />
          </Stack>
        </Setting>
        <Setting label="Latest build" description="The site builds when you publish to its channel">
          <RebuildButton status={props.status} />
        </Setting>
        <SiteBuilds
          status={summary().builds}
          nothingPublished={props.status.isNothingPublished()}
        />
      </Section>
      <Section title="Advanced">
        <Setting label="Template" description="The Andesine Pages version that builds the site">
          <Stack direction="row" gap="medium" align="center">
            <Text size="base" weight="medium" class="text-gray-900">
              {props.site().templateVersion}
            </Text>
            <Show when={summary().canManage && isOutdated()}>
              <Button
                size="small"
                loading={props.status.pending() === "update-template"}
                disabled={props.status.busy()}
                onClick={updateTemplate}
              >
                Update to {summary().templates.latest}
              </Button>
            </Show>
          </Stack>
        </Setting>
        <Show when={summary().canManage}>
          <Setting
            label="Self-hosting"
            description="The site's andesine.config.ts, to build it with the template yourself"
          >
            <Button
              size="small"
              loading={props.status.pending() === "eject"}
              disabled={props.status.busy()}
              onClick={eject}
            >
              Download andesine.config.ts
            </Button>
          </Setting>
          <Setting
            label="Delete the site"
            description="The address stops working; the collection and its content stay"
          >
            <Button size="small" variant="danger" onClick={() => setDeleting(true)}>
              Delete site
            </Button>
          </Setting>
        </Show>
      </Section>
      <Show when={deleting()}>
        <Dialog title="Delete the site?" size="small" onClose={() => setDeleting(false)}>
          <Stack gap="small">
            <Text size="sm">
              {props.site().url} stops working at once, and its publishable key is deleted. The
              collection and its content stay.
            </Text>
            <Stack direction="row" gap="small" justify="end">
              <Button onClick={() => setDeleting(false)}>Cancel</Button>
              <Button
                variant="danger"
                loading={props.status.pending() === "delete"}
                onClick={remove}
              >
                Delete site
              </Button>
            </Stack>
          </Stack>
        </Dialog>
      </Show>
    </>
  );
};

export const SitePage = (props: SitePageProps) => (
  <SiteFrame {...props}>{(site, status) => <SiteOverview site={site} status={status} />}</SiteFrame>
);
