import {
  Callout,
  Input,
  SaveBar,
  Section,
  Select,
  Setting,
  Skeleton,
  Text
} from "@andesine/extensions/solid";
import { createResource, createSignal, Show } from "solid-js";
import { callBackend, listChannels, type SiteView } from "./api";

interface CreateSiteProps {
  collectionID: string;
  name?: string;
  onCreated(site: SiteView): void;
}

const DEFAULT_CHANNEL = "published";

const toSubdomain = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z\d]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
};

/** A site for the collection: the channel it shows and its address, saved with the footer. */
const CreateSite = (props: CreateSiteProps) => {
  const [subdomain, setSubdomain] = createSignal(toSubdomain(props.name ?? ""));
  const [channel, setChannel] = createSignal(DEFAULT_CHANNEL);
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [channels] = createResource(listChannels);
  const discard = () => {
    setSubdomain(toSubdomain(props.name ?? ""));
    setChannel(DEFAULT_CHANNEL);
    setError(null);
  };
  const create = async () => {
    setCreating(true);
    setError(null);

    try {
      const result = await callBackend<{ site: SiteView }>("create", {
        collectionID: props.collectionID,
        subdomain: subdomain(),
        channel: channel()
      });

      props.onCreated(result.site);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The site wasn't created");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Section title="Site">
        <Setting label="Collection" description="The site shows its published content">
          <Text size="base" weight="medium" class="text-gray-900">
            {props.name ?? ""}
          </Text>
        </Setting>
        <Setting
          label="Source"
          description="The channel that the site shows; it updates when you publish to it"
        >
          <Show when={!channels.loading} fallback={<Skeleton class="h-7" />}>
            <Select
              value={channel()}
              options={(channels() ?? []).map((item) => ({
                value: item.code,
                label: item.name
              }))}
              onChange={setChannel}
            />
          </Show>
        </Setting>
        <Setting label="Address" description="3–40 letters, digits, or hyphens">
          <Input
            value={subdomain()}
            placeholder="docs"
            suffix=".andesine.page"
            onInput={setSubdomain}
          />
        </Setting>
      </Section>
      <Show when={error()}>{(message) => <Callout tone="danger">{message()}</Callout>}</Show>
      <SaveBar
        dirty={Boolean(subdomain())}
        saving={creating()}
        message="Create the site to publish the collection"
        saveLabel="Create site"
        onSave={create}
        onDiscard={discard}
      />
    </>
  );
};

export { CreateSite };
