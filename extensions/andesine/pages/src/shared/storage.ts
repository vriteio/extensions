/**
 * How sites are stored, shared by the backend, the sites Worker, and the panel. Files are stored
 * once by content hash, so a build uploads only new files; a build's manifest maps its paths to
 * hashes.
 */

/** `host:<hostname>` in the `HOSTS` KV namespace: the site, and its live build once built. */
interface HostEntry {
  siteID: string;
  buildID?: string;
}
interface BuildManifest {
  /** Output path (e.g. `guides/setup/index.html`) → SHA-256 of the file. */
  files: Record<string, string>;
  /** Request folder path (e.g. `/`) → target; served as HTTP redirects. */
  redirects?: Record<string, string>;
}

/** The collection's site in the installation's storage. */
const getSiteKey = (collectionID: string): string => `site:${collectionID}`;
const getHostKey = (hostname: string): string => `host:${hostname}`;
/** All of a site's objects in the `SITES` bucket. */
const getSitePrefix = (siteID: string): string => `sites/${siteID}/`;
const getManifestKey = (siteID: string, buildID: string): string => {
  return `sites/${siteID}/builds/${buildID}.json`;
};
const getFileKey = (siteID: string, hash: string): string => `sites/${siteID}/files/${hash}`;
/** An image uploaded for the site's configuration, e.g. `<sha256>.png`. */
const getUploadKey = (siteID: string, file: string): string => `sites/${siteID}/uploads/${file}`;

export { getSiteKey, getHostKey, getSitePrefix, getManifestKey, getFileKey, getUploadKey };
export type { HostEntry, BuildManifest };
