import {
  defineBuild,
  defineExtension,
  viewRefs,
  type ExtensionDefinition
} from "@andesine/extensions";
// `andesine extensions keys generate` and `keys revoke` maintain this file.
import backendKeys from "./andesine.keys.json" with { type: "json" };
// Only the views' types: they run in the frontend, from src/views.tsx.
import type { Views } from "./src/views";
import { MAPPING_PAGE_ID, SETUP_PAGE_ID, SYNC_PAGE_ID } from "./src/frontend/pages";

type BackendKeys = NonNullable<ExtensionDefinition["backend"]>["keys"];

const View = viewRefs<Views>();

export default defineExtension({
  name: "andesine/github",
  version: "0.1.0",
  displayName: "GitHub Sync",
  description:
    "Syncs a collection with Markdown or MDX files in a GitHub repository, through a publishing channel.",
  icon: "i-github-sync:logo?bg",
  apiVersion: 1,
  permissions: ["entries", "collections", "versions", "read:publishing", "publishing"],
  // The panel links to repositories and opens the GitHub App's install page.
  requests: ["https://github.com"],
  backend: {
    url: "https://github.extensions.andesine.app",
    keys: backendKeys.keys as BackendKeys
  },
  webhooks: {
    lifecycle: { events: ["extension.uninstalled"], path: "/andesine/webhooks" },
    publishing: { events: ["publishing.channel_advanced"], path: "/andesine/webhooks" }
  },
  // The setup until the collection is mapped, then the mapping's page; the backend saves the
  // mapping as `mapping:<collectionID>` in the extension's storage.
  pages: [
    {
      id: SETUP_PAGE_ID,
      name: "Setup",
      icon: "i-lucide:github",
      context: "collection",
      highlightContext: true,
      when: {
        publishing: true,
        storage: { key: "mapping:{publishingCollectionID}", exists: false }
      },
      view: View.GitHubSetupPage
    },
    {
      id: MAPPING_PAGE_ID,
      name: "Mapping settings",
      icon: "i-lucide:github",
      context: "collection",
      highlightContext: true,
      when: { storage: { key: "mapping:{publishingCollectionID}", exists: true } },
      view: View.GitHubMappingPage
    },
    {
      id: SYNC_PAGE_ID,
      name: "Sync details",
      icon: "i-lucide:refresh-cw",
      context: "collection",
      parent: MAPPING_PAGE_ID,
      when: { storage: { key: "mapping:{publishingCollectionID}", exists: true } },
      view: View.GitHubSyncPage
    }
  ],
  panels: [
    {
      id: "github",
      side: "right",
      name: "GitHub Sync",
      // The `mdi:github` mark, from ./icons.
      icon: "i-github-sync:github",
      context: "collection",
      view: View.GitHubPanel
    }
  ]
});

// `i-github-sync:<file>` icons are the SVG files of ./icons.
export const build = defineBuild({ icons: { "github-sync": "icons" } });
