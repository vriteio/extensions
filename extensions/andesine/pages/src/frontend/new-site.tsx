import { Text } from "@andesine/extensions/solid";
import { createResource, Show } from "solid-js";
import { getCollectionName, type SiteSummary, type SiteView } from "./api";
import { CreateSite } from "./create-site";

interface NewSiteProps {
  collectionID: string;
  summary: SiteSummary;
  onCreated(site: SiteView): void;
}

/** A collection without a site: the form that creates one, or who can. */
const NewSite = (props: NewSiteProps) => {
  const [name] = createResource(() => props.collectionID, getCollectionName);

  return (
    <Show
      when={props.summary.canManage}
      fallback={
        <Text tone="muted">Ask someone who can publish this collection to make a site.</Text>
      }
    >
      <Show when={!name.loading}>
        <CreateSite
          collectionID={props.collectionID}
          name={name() ?? undefined}
          onCreated={props.onCreated}
        />
      </Show>
    </Show>
  );
};

export { NewSite };
