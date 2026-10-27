import { defineViews } from "@andesine/extensions/solid";
import { AccordionView } from "./frontend/accordion-view";
import { CalloutView } from "./frontend/callout-view";
import { CardGridView, CardView } from "./frontend/card-views";
import { FigureView } from "./frontend/figure-view";
import { FileTreeView, StepsView } from "./frontend/list-views";
import { SiteAppearancePage } from "./frontend/site-appearance";
import { SiteBuildsPage } from "./frontend/site-builds";
import { SiteDomainsPage } from "./frontend/site-domains";
import { SiteSetupPage } from "./frontend/site-frame";
import { SitePage } from "./frontend/site-page";
import { SitePanel } from "./frontend/site-panel";
import { SiteContentPage, SiteGeneralPage, SiteNavigationPage } from "./frontend/site-settings";
import { CodeGroupView, TabsView } from "./frontend/tabs-views";
import { VisibilityView } from "./frontend/visibility-view";

// The frontend entry: the views that andesine.config.ts names with `View.<name>`.
const views = defineViews({
  AccordionView,
  CalloutView,
  CardGridView,
  CardView,
  CodeGroupView,
  FigureView,
  FileTreeView,
  SiteAppearancePage,
  SiteBuildsPage,
  SiteContentPage,
  SiteDomainsPage,
  SiteGeneralPage,
  SiteNavigationPage,
  SitePage,
  SitePanel,
  SiteSetupPage,
  StepsView,
  TabsView,
  VisibilityView
});

export type Views = typeof views;
export default views;
