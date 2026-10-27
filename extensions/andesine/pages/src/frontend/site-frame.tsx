import type { CollectionPageProps } from "@andesine/extensions";
import { Callout, openPage } from "@andesine/extensions/solid";
import { Match, Switch, type JSX } from "solid-js";
import { SITE_PAGE_ID } from "../shared/site-pages";
import { type SiteView } from "./api";
import { NewSite } from "./new-site";
import { createSiteStatus, type SiteStatus } from "./site-status";

interface SiteFrameProps extends CollectionPageProps {
  children(site: () => SiteView, status: SiteStatus): JSX.Element;
}
interface NewSiteSectionProps {
  collectionID: string;
  status: SiteStatus;
}

// Pages are collection pages; the site is of their publishing collection.
const getCollectionID = (props: CollectionPageProps) => {
  return props.publishingCollectionID ?? props.collectionID;
};
/** The form for a new site of the collection; once it's made, the Site page opens. */
const NewSiteSection = (props: NewSiteSectionProps) => {
  const created = async (site: SiteView) => {
    props.status.update({ site });
    await openPage(SITE_PAGE_ID, { collectionID: site.collectionID });
  };

  return (
    <NewSite
      collectionID={props.collectionID}
      summary={props.status.loaded()!}
      onCreated={created}
    />
  );
};
/** A page of the collection's site: its content once the site loads, else how to make one. */
const SiteFrame = (props: SiteFrameProps) => {
  const collectionID = () => getCollectionID(props);
  const status = createSiteStatus(() => ({ collectionID: collectionID() }));

  return (
    <Switch>
      <Match when={status.failure()}>
        {(message) => <Callout tone="danger">{message()}</Callout>}
      </Match>
      <Match when={status.loaded() && !status.loaded()!.site}>
        <NewSiteSection collectionID={collectionID()} status={status} />
      </Match>
      <Match when={status.loaded()?.site}>{(site) => props.children(site, status)}</Match>
    </Switch>
  );
};
/** "Setup": a new site for the collection; available until the collection has one. */
const SiteSetupPage = (props: CollectionPageProps) => {
  const collectionID = () => getCollectionID(props);
  const status = createSiteStatus(() => ({ collectionID: collectionID() }));

  return (
    <Switch>
      <Match when={status.failure()}>
        {(message) => <Callout tone="danger">{message()}</Callout>}
      </Match>
      <Match when={status.loaded()}>
        <NewSiteSection collectionID={collectionID()} status={status} />
      </Match>
    </Switch>
  );
};

export { SiteFrame, SiteSetupPage };
export type { CollectionPageProps as SitePageProps };
