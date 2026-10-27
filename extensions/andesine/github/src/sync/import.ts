import type { ContentNode } from "@andesine/converters";
import { toMDX } from "@andesine/converters/mdx";
import {
  createTitle,
  decodeFile,
  getImageNodes,
  getLinkMarks,
  getPropertyKey,
  getTitleText,
  hashBlocks,
  ORDER_KEY
} from "./blocks";
import { getLinkCandidates, isRelativeLink, splitAnchor } from "./links";
import { getFileLocation, getRelativeFilePath, resolveImageReference } from "./paths";
import type { ImportedFile, Mapping, RepositoryFile, SidecarFile } from "./types";

interface RestoredBlocks {
  blocks: ContentNode[];
  /** Block hashes, and `fragment:<name>` for restored fragments. */
  hashes: string[];
}
interface ImportFileOptions {
  file: RepositoryFile;
  mapping: Mapping;
  sidecar?: SidecarFile;
  /** Entry ID of a synced file (mapped-directory path), or null when it isn't synced. */
  resolveEntry(path: string): string | null;
  /** Asset ID of a repository image (path from the repository root). */
  resolveImage(path: string): Promise<string>;
  /** The label of a frontmatter key without one in the sidecar, e.g. from the entry's properties. */
  resolvePropertyLabel?(key: string): string | null;
}

const EXTERNAL_IMAGE_PATTERN = /^https?:\/\//i;

/** The H1 is the title when frontmatter has none; it then leaves the body. */
const takeTitle = (
  blocks: ContentNode[],
  frontmatterTitle: string,
  fallback: string
): { title: string; style?: "heading" } => {
  const [first] = blocks;
  const isHeadingTitle = !frontmatterTitle && first?.type === "heading" && first.attrs?.level === 1;

  if (frontmatterTitle) return { title: frontmatterTitle };
  if (!isHeadingTitle) return { title: fallback };

  blocks.shift();

  return {
    title: getTitleText({ type: "doc", content: [{ ...first, type: "title" }] }),
    style: "heading"
  };
};
/** Wraps the blocks between anchors in their fragments; edge blocks that changed stay outside. */
const restoreFragments = (
  blocks: ContentNode[],
  hashes: string[],
  sidecar: SidecarFile | undefined
): RestoredBlocks => {
  const result = [...blocks];
  const resultHashes = [...hashes];

  let cursor = 0;

  for (const anchor of sidecar?.fragments ?? []) {
    const find = (hash: string | null): number => {
      return hash ? resultHashes.indexOf(hash, cursor) : -1;
    };
    const fromIndex = find(anchor.from);
    const beforeIndex = anchor.before === null ? cursor - 1 : find(anchor.before);
    const start = fromIndex !== -1 ? fromIndex : beforeIndex + 1;
    const toIndex = anchor.to ? resultHashes.indexOf(anchor.to, start) : -1;
    const afterIndex =
      anchor.after === null ? result.length : resultHashes.indexOf(anchor.after, start);
    const end = toIndex !== -1 ? toIndex : afterIndex - 1;
    const isEmpty = anchor.from === null;
    const isFound = isEmpty
      ? beforeIndex !== -1 || anchor.before === null
      : start <= end && end < result.length;

    if (!isFound) continue;

    const children = isEmpty ? [] : result.slice(start, end + 1);
    const fragment: ContentNode = {
      type: "fragment",
      attrs: { name: anchor.name },
      content: children
    };

    result.splice(start, children.length, fragment);
    resultHashes.splice(start, children.length, `fragment:${anchor.name}`);
    cursor = start + 1;
  }

  return { blocks: result, hashes: resultHashes };
};
/** Puts properties after their anchor item; unanchored ones go first, as frontmatter is. */
const restoreProperties = (
  { blocks, hashes }: RestoredBlocks,
  properties: ContentNode[],
  sidecar: SidecarFile | undefined
): ContentNode[] => {
  const anchors = new Map((sidecar?.properties ?? []).map(({ key, after }) => [key, after]));
  const leading = properties.filter((property) => !anchors.get(getPropertyKey(property)));
  const result = [...leading];

  blocks.forEach((block, index) => {
    result.push(block);
    result.push(
      ...properties.filter((property) => {
        const after = anchors.get(getPropertyKey(property));

        return after && after === hashes[index];
      })
    );
  });

  const placed = new Set(result);

  return [...result, ...properties.filter((property) => !placed.has(property))];
};
/** Frontmatter keys back to labels: the sidecar's, the resolved ones, or the key itself. */
const labelProperties = (body: ContentNode[], options: ImportFileOptions): ContentNode[] => {
  const labels = new Map(
    (options.sidecar?.properties ?? []).flatMap(({ key, label }) => (label ? [[key, label]] : []))
  );

  return body.map((node) => {
    if (node.type !== "property") return node;

    const key = getPropertyKey(node);
    const label = labels.get(key) ?? options.resolvePropertyLabel?.(key) ?? key;

    return { ...node, attrs: { ...node.attrs, label } };
  });
};
const rewriteLinks = (
  document: ContentNode,
  path: string,
  resolveEntry: ImportFileOptions["resolveEntry"]
): string[] => {
  const unresolved: string[] = [];

  for (const mark of getLinkMarks(document)) {
    const href = String(mark.attrs.href);

    if (!isRelativeLink(href)) continue;

    const [, anchor] = splitAnchor(href);
    const entryID = getLinkCandidates(href, path).map(resolveEntry).find(Boolean);

    if (entryID) mark.attrs.href = `entry:${entryID}${anchor}`;
    else unresolved.push(href);
  }

  return unresolved;
};
const resolveImages = async (
  document: ContentNode,
  options: ImportFileOptions
): Promise<string[]> => {
  const references: string[] = [];

  for (const image of getImageNodes(document)) {
    const reference = String(image.attrs?.assetID ?? "");
    const isExternal = EXTERNAL_IMAGE_PATTERN.test(reference);
    const path = resolveImageReference(options.file.path, reference, options.mapping);

    if (isExternal) {
      references.push(reference);
    } else if (path) {
      image.attrs = { ...image.attrs, assetID: `asset:${await options.resolveImage(path)}` };
      references.push(path);
    } else {
      throw new Error(`The image ${reference} is outside the repository`);
    }
  }

  return references;
};

/**
 * Converts a standard Markdown or MDX file into the server's MDX dialect: the title as the H1,
 * properties as `<Property>` and fragments as `<Fragment>` elements in their anchored places,
 * `entry:` links, and `asset:` images. The server restores IDs and attributes from the entry.
 * @throws ConversionError for content the converters don't support.
 */
const importFile = async (options: ImportFileOptions): Promise<ImportedFile> => {
  const relativePath = getRelativeFilePath(options.mapping, options.file.path);
  const location = getFileLocation(relativePath);
  const decoded = await decodeFile(options.file.content, location.extension);
  const content = decoded.content ?? [];
  const properties = content.filter((node) => node.type === "property");
  const orderProperty = properties.find((node) => getPropertyKey(node) === ORDER_KEY);
  const order = Number(orderProperty?.attrs?.value);
  const blocks = content.filter((node) => node.type !== "title" && node.type !== "property");
  const { title, style } = takeTitle(blocks, getTitleText(decoded), location.stem);
  const restored = restoreFragments(blocks, await hashBlocks(blocks), options.sidecar);
  const fieldProperties = properties.filter((node) => node !== orderProperty);
  const body = labelProperties(
    restoreProperties(restored, fieldProperties, options.sidecar),
    options
  );
  const name = location.isIndex ? "index" : title;
  const document: ContentNode = { type: "doc", content: [createTitle(name), ...body] };
  const unresolvedLinks = rewriteLinks(document, relativePath, options.resolveEntry);
  const images = await resolveImages(document, options);
  const mdx = await toMDX(document, {
    properties: { as: "element", name: "Property" },
    fragments: { default: { as: "element", name: "Fragment" } },
    imageURL: (node) => String(node.attrs?.assetID)
  });

  return {
    path: options.file.path,
    name,
    folder: location.folder,
    isIndex: location.isIndex,
    ...(location.isIndex && { collectionName: title }),
    order: orderProperty && Number.isFinite(order) ? order : null,
    ...(style && { titleStyle: style }),
    mdx,
    images,
    unresolvedLinks
  };
};

export { importFile };
