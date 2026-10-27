import { defineViews } from "@andesine/extensions/solid";
import { GitHubPanel } from "./frontend/github-panel";
import { GitHubMappingPage, GitHubSetupPage, GitHubSyncPage } from "./frontend/github-page";

// The frontend entry: the views that andesine.config.ts names with `View.<name>`.
const views = defineViews({ GitHubMappingPage, GitHubPanel, GitHubSetupPage, GitHubSyncPage });

export type Views = typeof views;
export default views;
