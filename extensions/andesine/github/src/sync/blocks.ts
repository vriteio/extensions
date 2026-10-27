import type { ContentNode } from "@andesine/converters";
import { fromMarkdown, toMarkdown } from "@andesine/converters/markdown";
import { fromMDX, toMDX } from "@andesine/converters/mdx";

type FileFormat = "md" | "mdx";

const HASH_LENGTH = 16;
/** The frontmatter key of a file's position. */
const ORDER_KEY = "order";

const toHex = (buffer: ArrayBuffer): string => {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const sha256 = async (data: string | Uint8Array): Promise<string> => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;

  return toHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
};
/** A property's frontmatter key while in file form, else its label. */
const getPropertyKey = (node: ContentNode): string => String(node.attrs?.label ?? "");
/** Images carry their file reference (a path or URL) in `assetID` while in file form. */
const getImageReference = (node: ContentNode): string => String(node.attrs?.assetID ?? "");
/** Hashes of blocks as they are written in a file, so export and import compare the same text. */
const hashBlocks = (blocks: ContentNode[]): Promise<string[]> => {
  return Promise.all(
    blocks.map(async (block) => {
      const mdx = await toMDX(
        { type: "doc", content: [block] },
        { title: "omit", imageURL: getImageReference }
      );

      return (await sha256(mdx.trim())).slice(0, HASH_LENGTH);
    })
  );
};
const walkNodes = (node: ContentNode, visit: (node: ContentNode) => void): void => {
  visit(node);
  node.content?.forEach((child) => walkNodes(child, visit));
};
const getTitleText = (document: ContentNode): string => {
  const title = document.content?.find(({ type }) => type === "title");
  const getText = (node: ContentNode): string => {
    return `${node.text ?? ""}${(node.content ?? []).map(getText).join("")}`;
  };

  return title ? getText(title).trim() : "";
};
const createTitle = (text: string): ContentNode => {
  return { type: "title", content: text ? [{ type: "text", text }] : [] };
};
/** Link marks with their hrefs, for rewriting in place. */
const getLinkMarks = (document: ContentNode): Array<{ attrs: Record<string, unknown> }> => {
  const marks: Array<{ attrs: Record<string, unknown> }> = [];

  walkNodes(document, (node) => {
    for (const mark of node.marks ?? []) {
      if (mark.type === "link" && typeof mark.attrs?.href === "string") {
        marks.push(mark as { attrs: Record<string, unknown> });
      }
    }
  });

  return marks;
};
const getImageNodes = (document: ContentNode): ContentNode[] => {
  const images: ContentNode[] = [];

  walkNodes(document, (node) => {
    if (node.type === "image") images.push(node);
  });

  return images;
};
const decodeFile = (content: string, format: FileFormat): Promise<ContentNode> => {
  const options = {
    title: { as: "frontmatter", key: "title" },
    properties: { as: "frontmatter" },
    imageAssetID: ({ url }: { url: string }) => url
  } as const;

  return format === "mdx" ? fromMDX(content, options) : fromMarkdown(content, options);
};
const encodeFile = (
  document: ContentNode,
  format: FileFormat,
  titleStyle: "heading" | "frontmatter"
): Promise<string> => {
  const options = {
    title: titleStyle === "heading" ? "heading" : ({ as: "frontmatter", key: "title" } as const),
    properties: { as: "frontmatter" },
    imageURL: getImageReference
  } as const;

  return format === "mdx" ? toMDX(document, options) : toMarkdown(document, options);
};

export {
  ORDER_KEY,
  sha256,
  hashBlocks,
  getPropertyKey,
  getTitleText,
  createTitle,
  getLinkMarks,
  getImageNodes,
  getImageReference,
  decodeFile,
  encodeFile
};
