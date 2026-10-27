/** The setup until the collection has a site, then the Site page with its settings pages. */
const SITE_SETUP_PAGE_ID = "site-setup";
const SITE_PAGE_ID = "site-settings";
/** The panel's build row opens it. */
const SITE_BUILDS_PAGE_ID = "site-builds";
/** Which pages are available: the backend saves a collection's site as `site:<collectionID>`. */
const SITE_KEY = "site:{publishingCollectionID}";

/** The settings pages under the Site page, by section; the manifest and the panel use them. */
const SITE_SETTINGS_PAGES = [
  {
    id: "site-general",
    section: "Site",
    name: "General",
    icon: "i-lucide:settings",
    view: "SiteGeneralPage"
  },
  {
    id: "site-appearance",
    section: "Site",
    name: "Appearance",
    icon: "i-lucide:palette",
    view: "SiteAppearancePage"
  },
  {
    id: "site-navigation",
    section: "Site",
    name: "Navigation",
    icon: "i-lucide:panel-top",
    view: "SiteNavigationPage"
  },
  {
    id: "site-content",
    section: "Site",
    name: "Content and AI",
    icon: "i-lucide:sparkles",
    view: "SiteContentPage"
  },
  {
    id: "site-domains",
    section: "Hosting",
    name: "Domains",
    icon: "i-lucide:link",
    view: "SiteDomainsPage"
  },
  {
    id: SITE_BUILDS_PAGE_ID,
    section: "Hosting",
    name: "Builds",
    icon: "i-lucide:hammer",
    view: "SiteBuildsPage"
  }
] as const;

export { SITE_BUILDS_PAGE_ID, SITE_KEY, SITE_PAGE_ID, SITE_SETTINGS_PAGES, SITE_SETUP_PAGE_ID };
