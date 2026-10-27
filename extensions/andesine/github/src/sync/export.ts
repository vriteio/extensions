import type { ContentNode } from "@andesine/converters";
import {
  createTitle,
  encodeFile,
  getImageNodes,
  getLinkMarks,
  getPropertyKey,
  getTitleText,
  hashBlocks,
  ORDER_KEY
} from "./blocks";
import { createLinkHref, splitAnchor } from "./links";
import { getFileLocation, getImageReference, getRelativeFilePath } from "./paths";
import type { ExportedFile, FragmentAnchor, Mapping, PropertyAnchor, SidecarFile } from "./types";

interface ExportEntryOptions {
  /** Published content (`content.get` JSON). */
  content: ContentNode;
  /** Repository path of the file. */
  path: string;
  mapping: Mapping;
  /** Title of an index file (its collection's name), or the root index title. */
  indexTitle?: string;
  /** Position written as `order`, or null to leave it out. */
  order: number | null;
  titleStyle?: "heading";
  rootTitle?: string;
  /** Mapped-directory path of the file for a published slug path, or null when it isn't synced. */
  resolveLink(slugPath: string): string | null;
  /** Repository path of the image file for an asset. */
  resolveImage(assetID: string): string;
  /** The content's properties by API key (`content.get`); without them the keys are the labels. */
  properties?: Record<string, { name: string }>;
}

/**
 * Properties keyed by their API keys, unique even when labels repeat; the labels go to the sidecar.
 * The nth property of a label takes the nth key of that label.
 */
const keyProperties = (
  body: ContentNode[],
  properties: ExportEntryOptions["properties"]
): { body: ContentNode[]; labels: Map<string, string> } => {
  const keys = Object.entries(properties ?? {});
  const used = new Set<string>();
  const labels = new Map<string, string>();
  const keyed = body.map((node) => {
    if (node.type !== "property") return node;

    const label = getPropertyKey(node);
    const key = keys.find(([key, { name }]) => name === label && !used.has(key))?.[0] ?? label;

    used.add(key);

    if (key !== label) labels.set(key, label);

    return { ...node, attrs: { ...node.attrs, label: key } };
  });

  return { body: keyed, labels };
};
const clone = (node: ContentNode): ContentNode => structuredClone(node);
const rewriteLinks = (
  document: ContentNode,
  relativePath: string,
  options: ExportEntryOptions
): string[] => {
  const unresolved: string[] = [];

  for (const mark of getLinkMarks(document)) {
    const href = String(mark.attrs.href);

    if (!href.startsWith("/")) continue;

    const [slugPath, anchor] = splitAnchor(href);
    const target = options.resolveLink(slugPath);

    if (target) {
      mark.attrs.href = createLinkHref(relativePath, target, anchor, options.mapping.linkStyle);
    } else {
      unresolved.push(href);
    }
  }

  return unresolved;
};
/** Rewrites asset IDs to file references; returns the images to commit. */
const rewriteImages = (
  document: ContentNode,
  options: ExportEntryOptions
): ExportedFile["images"] => {
  const images: ExportedFile["images"] = [];

  for (const image of getImageNodes(document)) {
    const assetID = String(image.attrs?.assetID ?? "");
    const path = options.resolveImage(assetID);

    image.attrs = {
      ...image.attrs,
      assetID: getImageReference(options.path, path, options.mapping)
    };
    images.push({ path, assetID });
  }

  return images;
};
/**
 * Top-level items as the file holds them: fragments are unwrapped, properties go to frontmatter.
 * The anchors let an import put both back.
 */
const createAnchors = async (
  body: ContentNode[],
  labels: Map<string, string>
): Promise<Pick<SidecarFile, "fragments" | "properties">> => {
  const flattened = body.flatMap((node) => {
    if (node.type === "property") return [];

    return node.type === "fragment" ? (node.content ?? []) : [node];
  });
  const hashes = await hashBlocks(flattened);
  const fragments: FragmentAnchor[] = [];
  const properties: PropertyAnchor[] = [];

  let position = 0;
  let previous: string | null = null;

  for (const node of body) {
    if (node.type === "property") {
      const key = getPropertyKey(node);

      properties.push({ key, ...(labels.has(key) && { label: labels.get(key) }), after: previous });
    } else if (node.type === "fragment") {
      const count = node.content?.length ?? 0;
      const name = String(node.attrs?.name ?? "");

      fragments.push({
        name,
        from: count ? hashes[position] : null,
        to: count ? hashes[position + count - 1] : null,
        before: position > 0 ? hashes[position - 1] : null,
        after: hashes[position + count] ?? null
      });
      position += count;
      previous = `fragment:${name}`;
    } else {
      previous = hashes[position];
      position += 1;
    }
  }

  return {
    ...(fragments.length && { fragments }),
    ...(properties.some(({ after, label }) => after || label) && { properties })
  };
};

/**
 * Converts published content to a standard Markdown or MDX file: the title and properties in
 * frontmatter by their API keys (or the title as the H1), unwrapped fragments, links in the
 * mapping's style, and images as repository files.
 * @throws ConversionError for content the file format can't hold, such as elements in Markdown.
 */
const exportEntry = async (options: ExportEntryOptions): Promise<ExportedFile> => {
  const relativePath = getRelativeFilePath(options.mapping, options.path);
  const location = getFileLocation(relativePath);
  const document = clone(options.content);
  const unresolvedLinks = rewriteLinks(document, relativePath, options);
  const images = rewriteImages(document, options);
  const { body, labels } = keyProperties(
    (document.content ?? []).filter((node) => node.type !== "title"),
    options.properties
  );
  const anchors = await createAnchors(body, labels);
  const title = options.indexTitle ?? getTitleText(document);
  const order: ContentNode[] =
    options.order === null
      ? []
      : [{ type: "property", attrs: { label: ORDER_KEY, type: "number", value: options.order } }];
  const output = {
    ...document,
    content: [
      createTitle(title),
      ...body.filter((node) => node.type === "property" && node.attrs?.label !== ORDER_KEY),
      ...order,
      ...body.filter((node) => node.type !== "property")
    ]
  };
  const content = await encodeFile(output, location.extension, options.titleStyle ?? "frontmatter");

  return {
    path: options.path,
    content,
    sidecar: { ...anchors, ...(options.rootTitle && { rootTitle: options.rootTitle }) },
    images,
    unresolvedLinks
  };
};

export { exportEntry };
