import { getFileLocation, getRelativePath, joinPath, normalizePath } from "./paths";
import type { Mapping } from "./types";

const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const FILE_LINK_PATTERN = /\.mdx?$/i;

const isRelativeLink = (href: string): boolean => {
  return Boolean(href) && !SCHEME_PATTERN.test(href) && !/^[#/?]/.test(href);
};
const splitAnchor = (href: string): [path: string, anchor: string] => {
  const index = href.search(/[?#]/);
  const anchor = index === -1 ? "" : href.slice(index).replace(/^\?[^#]*/, "");

  return [index === -1 ? href : href.slice(0, index), anchor];
};
/** The folder that a page's site URL is in: index pages are their folder's URL. */
const getPageDirectory = (relativePath: string): string => {
  const location = getFileLocation(relativePath);

  return location.isIndex ? location.folder : joinPath(location.folder, location.stem);
};
/**
 * Mapped-directory paths that a relative link can name, best first: file links (`./setup.mdx`)
 * resolve from the file's folder, and site URLs (`../setup/`) from the page's URL.
 */
const getLinkCandidates = (href: string, fromPath: string): string[] => {
  const [path] = splitAnchor(href);
  const isFileLink = FILE_LINK_PATTERN.test(path);
  const base = isFileLink ? getFileLocation(fromPath).folder : getPageDirectory(fromPath);
  const target = normalizePath(joinPath(base, path));

  if (target === null) return [];
  if (isFileLink) return [target];

  return target
    ? [`${target}.mdx`, `${target}.md`, `${target}/index.mdx`, `${target}/index.md`]
    : ["index.mdx", "index.md"];
};
/** A link from one synced file to another, in the mapping's link style. */
const createLinkHref = (
  fromPath: string,
  toPath: string,
  anchor: string,
  style: Mapping["linkStyle"]
): string => {
  if (style === "file") {
    return `${getRelativePath(getFileLocation(fromPath).folder, toPath)}${anchor}`;
  }

  const target = getPageDirectory(toPath);
  const relative = getRelativePath(getPageDirectory(fromPath), target ? `${target}/` : "");

  return `${relative.replace(/^\.\/$/, "./")}${anchor}`;
};

export { isRelativeLink, splitAnchor, getLinkCandidates, createLinkHref };
