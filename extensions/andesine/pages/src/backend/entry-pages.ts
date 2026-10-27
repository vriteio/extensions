import type { Env } from "./env";
import { getFileKey, getManifestKey, type BuildManifest } from "../shared/storage";
import type { EntryPages } from "../shared/types";
import { SOURCE_ID } from "./site";
import { getLiveBuildID } from "./site-builds";

// The template writes this map for search; builds don't change, so each site keeps its live one.
const ENTRY_PAGES_FILE = `_andesine/pages/${SOURCE_ID}.json`;
const loaded = new Map<string, { buildID: string; pages: Promise<Record<string, string>> }>();

const readEntryPages = async (
  env: Env,
  siteID: string,
  buildID: string
): Promise<Record<string, string>> => {
  const manifest = await env.SITES.get(getManifestKey(siteID, buildID));
  const hash = manifest && (await manifest.json<BuildManifest>()).files[ENTRY_PAGES_FILE];
  const file = hash && (await env.SITES.get(getFileKey(siteID, hash)));

  return file ? file.json<Record<string, string>>() : {};
};
/** The pages of the site's live build by entry ID; none before the first build. */
const getEntryPages = async (env: Env, siteID: string): Promise<EntryPages> => {
  const buildID = await getLiveBuildID(env, siteID);
  const cached = loaded.get(siteID);

  if (!buildID) return { buildID, pages: {} };

  if (cached?.buildID !== buildID) {
    const pages = readEntryPages(env, siteID, buildID);

    loaded.set(siteID, { buildID, pages });
    pages.catch(() => loaded.delete(siteID));
  }

  return { buildID, pages: await loaded.get(siteID)!.pages };
};

export { getEntryPages };
