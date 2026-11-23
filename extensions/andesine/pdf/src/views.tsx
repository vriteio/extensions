import { defineViews } from "@andesine/extensions/solid";
import { ExportPanel } from "./frontend/export-panel";
import { ExportsPage } from "./frontend/exports-page";

// The frontend entry: the views that andesine.config.ts names with `View.<name>`.
const views = defineViews({ ExportPanel, ExportsPage });

export type Views = typeof views;
export default views;
