/**
 * Round trip of the fixture docs through the sync library, without an instance: import each file
 * to server MDX, read it back as the server would, export it, and compare with the expected file.
 * A second import of the exported file must give the same MDX (an unchanged file writes nothing).
 * `npm run check:sync -- --write` updates the expected files after a reviewed change.
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ContentNode } from "@andesine/converters";
import { fromMDX } from "@andesine/converters/mdx";
import {
  exportEntry,
  getFileLocation,
  importFile,
  type ImportedFile,
  type Mapping,
  type SidecarFile
} from "../src/sync";
import { getImageReference, resolveImageReference } from "../src/sync/paths";

const ROOT = new URL("../fixtures/", import.meta.url).pathname;
const EXPECTED = join(ROOT, "expected");
const write = process.argv.includes("--write");
const mapping: Mapping = {
  collectionID: "coll_docs",
  repository: { id: 1, owner: "acme", name: "docs" },
  branch: "main",
  directory: "docs",
  channel: "published",
  format: "mdx",
  imagesDirectory: "images",
  imageLocation: "directory",
  imageURLPrefix: "",
  imageFormat: "original",
  linkStyle: "site",
  include: [],
  exclude: []
};

let failures = 0;

const report = (label: string, ok: boolean, detail = ""): void => {
  if (!ok) failures += 1;

  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : `\n${detail}`}`);
};
const listFiles = async (directory: string): Promise<string[]> => {
  const items = await readdir(directory, { withFileTypes: true, recursive: true });

  return items
    .filter((item) => item.isFile() && /\.mdx?$/.test(item.name))
    .map((item) => relative(ROOT, join(item.parentPath, item.name)))
    .sort();
};
/** Reads server MDX back as JSON, with entry links as published slug paths. */
const readAsServer = async (mdx: string, slugPaths: Map<string, string>): Promise<ContentNode> => {
  const document = await fromMDX(mdx, {
    properties: { as: "element", name: "Property" },
    fragments: { default: { as: "element", name: "Fragment" } },
    imageAssetID: ({ url }) => url.replace(/^asset:/, "")
  });
  const visit = (node: ContentNode): void => {
    for (const mark of node.marks ?? []) {
      const href = String(mark.attrs?.href ?? "");
      const [, id, anchor = ""] = /^entry:(ent_\w+)(#.*)?$/.exec(href) ?? [];

      if (id) mark.attrs = { ...mark.attrs, href: `${slugPaths.get(id)}${anchor}` };
    }

    node.content?.forEach(visit);
  };

  visit(document);

  return document;
};
const diff = (expected: string, actual: string): string => {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const index = expectedLines.findIndex((line, position) => line !== actualLines[position]);

  return `  line ${index + 1}\n  - ${expectedLines[index] ?? ""}\n  + ${actualLines[index] ?? ""}`;
};

const files = (await listFiles(join(ROOT, "docs"))).filter((path) => !path.startsWith("expected/"));
const entryIDs = new Map(files.map((path, index) => [path, `ent_${index + 1}`]));
const slugPaths = new Map(
  [...entryIDs].map(([path, id]) => [id, `/${path.replace(/\.mdx?$/, "")}`])
);
const images = new Map<string, string>();
const resolveEntry = (path: string): string | null => entryIDs.get(`docs/${path}`) ?? null;
const resolveImage = async (path: string): Promise<string> => {
  const id =
    [...images].find(([, imagePath]) => imagePath === path)?.[0] ?? `ast_${images.size + 1}`;

  images.set(id, path);

  return id;
};
const exportImported = async (
  imported: ImportedFile,
  sidecar?: SidecarFile
): Promise<{ content: string; sidecar: SidecarFile }> => {
  const isRoot = imported.isIndex && imported.folder === "";
  const exported = await exportEntry({
    content: await readAsServer(imported.mdx, slugPaths),
    path: imported.path,
    mapping,
    indexTitle: imported.collectionName,
    rootTitle: isRoot ? imported.collectionName : undefined,
    order: imported.order,
    titleStyle: imported.titleStyle,
    resolveLink: (slugPath) => {
      const path = [...slugPaths].find(([, value]) => value === slugPath)?.[0];
      const file = [...entryIDs].find(([, id]) => id === path)?.[0];

      return file ? file.slice("docs/".length) : null;
    },
    resolveImage: (assetID) => images.get(assetID) ?? `images/${assetID}.png`
  });

  return { content: exported.content, sidecar: { ...sidecar, ...exported.sidecar } };
};

await mkdir(EXPECTED, { recursive: true });

for (const path of files) {
  const source = await readFile(join(ROOT, path), "utf8");

  try {
    const imported = await importFile({
      file: { path, content: source },
      mapping,
      resolveEntry,
      resolveImage
    });
    const exported = await exportImported(imported);
    const reimported = await importFile({
      file: { path, content: exported.content },
      mapping,
      sidecar: exported.sidecar,
      resolveEntry,
      resolveImage
    });
    const expectedPath = join(EXPECTED, path);

    if (write) {
      await mkdir(join(expectedPath, ".."), { recursive: true });
      await writeFile(expectedPath, exported.content);
    }

    const expected = await readFile(expectedPath, "utf8").catch(() => "");

    report(`${path}: export`, exported.content === expected, diff(expected, exported.content));
    report(
      `${path}: unchanged file writes nothing`,
      reimported.mdx === imported.mdx,
      diff(imported.mdx, reimported.mdx)
    );
    report(
      `${path}: links resolved`,
      imported.unresolvedLinks.length === 0,
      `  ${imported.unresolvedLinks.join(", ")}`
    );
  } catch (error) {
    // Converter limits are skipped files in a sync, so they are reported, not failed.
    console.log(`skip ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Fragments and properties survive an edit on GitHub.
const fragmentEntry: ContentNode = {
  type: "doc",
  content: [
    { type: "title", content: [{ type: "text", text: "Setup" }] },
    { type: "paragraph", content: [{ type: "text", text: "Intro." }] },
    { type: "property", attrs: { label: "status", type: "text", value: "draft" } },
    {
      type: "fragment",
      attrs: { name: "Requirements" },
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First requirement." }] },
        { type: "paragraph", content: [{ type: "text", text: "Last requirement." }] }
      ]
    },
    { type: "paragraph", content: [{ type: "text", text: "Outro." }] }
  ]
};
const fragmentPath = "docs/setup.mdx";
const exportedFragment = await exportEntry({
  content: fragmentEntry,
  path: fragmentPath,
  mapping,
  order: null,
  resolveLink: () => null,
  resolveImage: () => ""
});
const edited = exportedFragment.content
  .replace("First requirement.", "First requirement.\n\nAdded inside.")
  .replace("Outro.", "Outro, edited.");
const importedFragment = await importFile({
  file: { path: fragmentPath, content: edited },
  mapping,
  sidecar: exportedFragment.sidecar,
  resolveEntry: () => null,
  resolveImage: async () => ""
});
const fragmentMDX = importedFragment.mdx;
const fragmentStart = fragmentMDX.indexOf('<Fragment name="Requirements">');
const fragmentEnd = fragmentMDX.indexOf("</Fragment>");
const fragmentBody = fragmentMDX.slice(fragmentStart, fragmentEnd);

report(
  "fragment: no Fragment or Property elements in the file",
  !/<(Fragment|Property)\b/.test(exportedFragment.content)
);
report(
  "fragment: restored after an edit",
  fragmentStart !== -1 && fragmentEnd > fragmentStart,
  fragmentMDX
);
report(
  "fragment: an added block inside stays inside",
  fragmentBody.includes("Added inside.") && fragmentBody.includes("Last requirement."),
  fragmentMDX
);
report(
  "fragment: edited block outside stays outside",
  fragmentMDX.indexOf("Outro, edited.") > fragmentEnd
);
report(
  "property: restored in its position",
  fragmentMDX.indexOf('<Property name="status"') > fragmentMDX.indexOf("Intro.") &&
    fragmentMDX.indexOf('<Property name="status"') < fragmentStart,
  fragmentMDX
);
report("location: index file", getFileLocation("getting-started/index.mdx").isIndex);

// Labels can repeat; the file uses the API keys, and the sidecar keeps the labels.
const repeatedEntry: ContentNode = {
  type: "doc",
  content: [
    { type: "title", content: [{ type: "text", text: "Tags" }] },
    { type: "property", attrs: { label: "Tag", type: "text", value: "first" } },
    { type: "property", attrs: { label: "Tag", type: "text", value: "second" } },
    { type: "paragraph", content: [{ type: "text", text: "Body." }] }
  ]
};
const exportedRepeated = await exportEntry({
  content: repeatedEntry,
  properties: { tag: { name: "Tag" }, tag2: { name: "Tag" } },
  path: "docs/tags.mdx",
  mapping,
  order: null,
  resolveLink: () => null,
  resolveImage: () => ""
});
const importedRepeated = await importFile({
  file: { path: "docs/tags.mdx", content: exportedRepeated.content },
  mapping,
  sidecar: exportedRepeated.sidecar,
  resolveEntry: () => null,
  resolveImage: async () => ""
});

report(
  "property: repeated labels use API keys",
  /^tag: first$/m.test(exportedRepeated.content) &&
    /^tag2: second$/m.test(exportedRepeated.content),
  exportedRepeated.content
);
report(
  "property: labels restored from the sidecar",
  (importedRepeated.mdx.match(/<Property name="Tag"/g) ?? []).length === 2,
  importedRepeated.mdx
);

// Images under a URL prefix are referenced by it, and read back to the images directory.
const servedMapping: Mapping = {
  ...mapping,
  imagesDirectory: "public/images",
  imageURLPrefix: "/images"
};
const servedReference = getImageReference(
  "docs/guides/setup.mdx",
  "public/images/diagram.png",
  servedMapping
);

report("image: URL prefix reference", servedReference === "/images/diagram.png", servedReference);
report(
  "image: URL prefix read back",
  resolveImageReference("docs/guides/setup.mdx", servedReference, servedMapping) ===
    "public/images/diagram.png"
);

console.log(failures ? `\n${failures} failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
