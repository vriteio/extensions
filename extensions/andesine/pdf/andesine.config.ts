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
import { EXPORTS_PAGE_ID } from "./src/frontend/pages";

type BackendKeys = NonNullable<ExtensionDefinition["backend"]>["keys"];

const View = viewRefs<Views>();

export default defineExtension({
  name: "andesine/pdf",
  version: "0.1.0",
  displayName: "PDF Export",
  description: "Exports an entry, or a whole collection, as a PDF document.",
  icon: "i-pdf:logo?bg",
  apiVersion: 1,
  // The backend reads the draft or a channel's copy; it writes nothing to Andesine.
  permissions: ["read:entries", "read:collections", "read:publishing"],
  backend: {
    url: "https://pdf.extensions.andesine.app",
    keys: backendKeys.keys as BackendKeys
  },
  pages: [
    {
      id: EXPORTS_PAGE_ID,
      name: "Exports history",
      icon: "i-tabler:file-type-pdf",
      context: "entry",
      view: View.ExportsPage
    }
  ],
  panels: [
    {
      id: "export",
      side: "right",
      name: "Export PDF",
      icon: "i-tabler:file-type-pdf",
      context: "entry",
      view: View.ExportPanel
    }
  ]
});

// `i-pdf:<file>` icons are the SVG files of ./icons.
export const build = defineBuild({ icons: { pdf: "icons" } });
