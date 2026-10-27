import {
  defineBuild,
  defineExtension,
  viewRefs,
  type ElementViewProps,
  type ExtensionDefinition,
  type ViewRef
} from "@andesine/extensions";
// `andesine extensions keys generate` and `keys revoke` maintain this file.
import backendKeys from "./andesine.keys.json" with { type: "json" };
import {
  SITE_KEY,
  SITE_PAGE_ID,
  SITE_SETTINGS_PAGES,
  SITE_SETUP_PAGE_ID
} from "./src/shared/site-pages";
// Only the views' types: they run in the frontend, from src/views.tsx.
import type { Views } from "./src/views";

type BackendKeys = NonNullable<ExtensionDefinition["backend"]>["keys"];

const View = viewRefs<Views>();
const elementView = (id: string, element: string, view: ViewRef<ElementViewProps>) => ({
  id,
  element,
  view,
  content: true
});

export default defineExtension({
  name: "andesine/pages",
  version: "0.1.0",
  displayName: "Andesine Pages",
  description:
    "Hosts documentation sites for collections, and edits the content components of Andesine Pages sites.",
  icon: "i-pages:logo?bg",
  apiVersion: 1,
  // Sites read published content with a publishable key that the backend manages per site.
  permissions: ["read:collections", "read:publishing", "publishable-keys", "ai-answers"],
  backend: {
    url: "https://pages.extensions.andesine.app",
    keys: backendKeys.keys as BackendKeys
  },
  webhooks: {
    lifecycle: {
      events: ["extension.uninstalled"],
      path: "/andesine/webhooks"
    },
    publishing: {
      events: ["publishing.channel_advanced"],
      path: "/andesine/webhooks"
    }
  },
  // The setup until the collection has a site, then the Site page and its settings pages.
  pages: [
    {
      id: SITE_SETUP_PAGE_ID,
      name: "Setup",
      icon: "i-lucide:globe",
      context: "collection",
      highlightContext: true,
      when: { publishing: true, storage: { key: SITE_KEY, exists: false } },
      view: View.SiteSetupPage
    },
    {
      id: SITE_PAGE_ID,
      name: "Site",
      icon: "i-lucide:globe",
      context: "collection",
      highlightContext: true,
      when: { storage: { key: SITE_KEY, exists: true } },
      view: View.SitePage
    },
    ...SITE_SETTINGS_PAGES.map(({ id, name, icon, view }) => ({
      id,
      name,
      icon,
      context: "collection" as const,
      parent: SITE_PAGE_ID,
      when: { storage: { key: SITE_KEY, exists: true } },
      view: View[view]
    }))
  ],
  panels: [
    {
      id: "site",
      side: "right",
      name: "Andesine Pages",
      icon: "i-lucide:globe",
      context: "collection",
      view: View.SitePanel
    }
  ],
  // The names and props match the element schemas of `@andesine/pages`.
  elementViews: [
    {
      ...elementView("callout", "Callout", View.CalloutView),
      name: "Callout",
      description: "A note, tip, warning, or danger box",
      icon: "i-lucide:info",
      accepts: { blocks: ["paragraph"] },
      props: [
        {
          name: "type",
          type: "string",
          title: "Type",
          enum: ["note", "tip", "warning", "danger"],
          control: "toggle",
          default: "note"
        },
        {
          name: "title",
          type: "string",
          title: "Title",
          placeholder: "Optional"
        }
      ]
    },
    {
      ...elementView("card", "Card", View.CardView),
      name: "Card",
      description: "A card with a title, an optional link, and an icon",
      icon: "i-lucide:square",
      accepts: { blocks: ["paragraph"] },
      props: [
        {
          name: "title",
          type: "string",
          title: "Title",
          minLength: 1,
          default: "Title"
        },
        { name: "icon", type: "string", title: "Icon", control: "icon" },
        { name: "href", type: "string", title: "Link", control: "link" }
      ]
    },
    {
      ...elementView("card-grid", "CardGrid", View.CardGridView),
      name: "Card grid",
      description: "Cards side by side",
      icon: "i-lucide:layout-grid",
      accepts: { elements: ["Card"] }
    },
    {
      ...elementView("accordion", "Accordion", View.AccordionView),
      name: "Accordion",
      description: "Content shown when its title is opened",
      icon: "i-lucide:chevrons-up-down",
      rejects: { elements: ["Accordion"] },
      props: [
        {
          name: "title",
          type: "string",
          title: "Title",
          minLength: 1,
          default: "Details"
        },
        { name: "open", type: "boolean", title: "Open on load" }
      ]
    },
    {
      ...elementView("figure", "Figure", View.FigureView),
      name: "Figure",
      description: "An image or other content with a caption",
      icon: "i-lucide:image",
      rejects: { elements: ["Figure"] },
      props: [
        {
          name: "caption",
          type: "string",
          title: "Caption",
          minLength: 1,
          default: "Caption"
        }
      ]
    },
    {
      ...elementView("steps", "Steps", View.StepsView),
      name: "Steps",
      description: "Numbered steps with titles",
      icon: "i-lucide:list-ordered",
      accepts: { elements: ["Step"] },
      children: [
        {
          element: "Step",
          name: "Step",
          description: "A step of the steps it's in",
          icon: "i-lucide:circle-dot",
          props: [
            {
              name: "title",
              type: "string",
              title: "Title",
              minLength: 1,
              default: "Step"
            }
          ]
        }
      ]
    },
    {
      ...elementView("file-tree", "FileTree", View.FileTreeView),
      name: "File tree",
      description: "Files and folders",
      icon: "i-lucide:folder-tree",
      accepts: { elements: ["Folder", "File"] },
      children: [
        {
          element: "Folder",
          name: "Folder",
          description: "A folder in a file tree",
          icon: "i-lucide:folder",
          accepts: { elements: ["Folder", "File"] },
          props: [
            {
              name: "name",
              type: "string",
              title: "Name",
              minLength: 1,
              default: "folder"
            }
          ]
        },
        {
          element: "File",
          name: "File",
          description: "A file in a file tree",
          icon: "i-lucide:file",
          content: false,
          props: [
            {
              name: "name",
              type: "string",
              title: "Name",
              minLength: 1,
              default: "file.ts"
            }
          ]
        }
      ]
    },
    {
      ...elementView("tabs", "Tabs", View.TabsView),
      name: "Tabs",
      description: "Content in tabs",
      icon: "i-lucide:panels-top-left",
      accepts: { elements: ["Tab"] },
      props: [
        {
          name: "syncKey",
          type: "string",
          title: "Sync key",
          description: "Tabs with the same key switch together on a page"
        }
      ],
      children: [
        {
          element: "Tab",
          name: "Tab",
          description: "A tab of the tabs it's in",
          icon: "i-lucide:square-dashed",
          rejects: { elements: ["Tabs"] },
          props: [
            {
              name: "label",
              type: "string",
              title: "Label",
              minLength: 1,
              default: "Tab"
            }
          ]
        }
      ]
    },
    {
      ...elementView("code-group", "CodeGroup", View.CodeGroupView),
      name: "Code group",
      description: "Code blocks shown as tabs",
      icon: "i-lucide:code",
      accepts: { blocks: ["codeBlock"] }
    },
    {
      ...elementView("visibility", "Visibility", View.VisibilityView),
      name: "Visibility",
      description: "Content only for the web page, or only for agents",
      icon: "i-lucide:eye",
      rejects: { elements: ["Visibility"] },
      props: [
        {
          name: "for",
          type: "string",
          title: "Shown to",
          enum: ["humans", "agents"],
          control: "toggle",
          default: "humans"
        }
      ]
    }
  ]
});

// `i-pages:<file>` icons are the SVG files of ./icons.
export const build = defineBuild({
  icons: { pages: "icons" }
});
