/** A collection mapped to a directory of a repository branch. */
interface Mapping {
  collectionID: string;
  repository: { id: number; owner: string; name: string };
  branch: string;
  /** Repository directory without leading or trailing slashes; empty for the root. */
  directory: string;
  channel: string;
  /** Format of files created for entries new in Andesine. */
  format: "md" | "mdx";
  /** Repository directory for exported images, from the repository root. */
  imagesDirectory: string;
  /** Exported images go to the images directory, or next to their entry's file. */
  imageLocation: "directory" | "entry";
  /** A URL path that serves the images directory, e.g. `/images`; empty for relative paths. */
  imageURLPrefix: string;
  /** Exported images in their upload's format (PNG or JPEG), or as WebP. */
  imageFormat: "original" | "webp";
  linkStyle: "file" | "site";
  include: string[];
  exclude: string[];
}
/** A mapping as the setup and the mapping settings send it. */
interface MappingInput extends Omit<Mapping, "collectionID" | "repository"> {
  repositoryID: number;
  /** For a new mapping: which side's content wins for files that match entries. */
  initialSync?: Precedence;
}
/** Sync state of one mapping, kept by the backend in extension storage. */
interface SyncState {
  /** The last commit whose content Andesine has, or null before the first sync. */
  lastCommit: string | null;
  /** Repository file path → entry ID. */
  entries: Record<string, string>;
  /** Mapped directory-relative folder path ("" for the root) → collection ID. */
  collections: Record<string, string>;
  /** Image SHA-256 → asset ID. */
  images: Record<string, string>;
  /** Asset ID → repository path of its image file. */
  assetPaths: Record<string, string>;
  /** Files whose title is their first H1, not frontmatter. */
  headingTitles: string[];
  /** Title of the mapping's root index file; it doesn't rename the mapped collection. */
  rootTitle: string | null;
  /** Repository file path → its frontmatter `order`, for files that have one. */
  orders: Record<string, number>;
  lastImport: SyncRun | null;
  lastExport: SyncRun | null;
  /** The snapshot before a failed export, so the next export also has its changes. */
  exportBase: string | null;
  /** What the links are of; a new mapping of the same source keeps them. */
  source: SyncSource | null;
}
interface SyncSource {
  repositoryID: number;
  branch: string;
  directory: string;
}
interface SyncRun {
  at: string;
  commit: string | null;
  skipped: SkippedFile[];
  /** Entries whose edited draft was kept; the synced content is a version. */
  keptDrafts: string[];
  warnings: string[];
  error: string | null;
}
interface SkippedFile {
  path: string;
  reason: string;
}
/** Anchors that restore what standard files can't hold. */
interface Sidecar {
  version: 1;
  files: Record<string, SidecarFile>;
}
interface SidecarFile {
  fragments?: FragmentAnchor[];
  properties?: PropertyAnchor[];
  /** Frontmatter title of the mapping's root index file, which doesn't rename the collection. */
  rootTitle?: string;
}
/** Block hashes are of the block as written in the file; null marks the document edge. */
interface FragmentAnchor {
  name: string;
  from: string | null;
  to: string | null;
  before: string | null;
  after: string | null;
}
/** A frontmatter key (the property's API key), with its label when that differs. */
interface PropertyAnchor {
  key: string;
  label?: string;
  after: string | null;
}
interface RepositoryFile {
  path: string;
  content: string;
}
interface FileChange {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  previousPath?: string;
}
/** A file as Andesine content: the server-dialect MDX and what the backend applies around it. */
interface ImportedFile {
  path: string;
  /** Entry name; `index` for index files. */
  name: string;
  /** Mapped directory-relative folder path, "" for the root. */
  folder: string;
  isIndex: boolean;
  /** For index files: the collection name from the frontmatter title. */
  collectionName?: string;
  order: number | null;
  /** The title came from the first H1, so exports keep it there. */
  titleStyle?: "heading";
  mdx: string;
  /** Image paths (from the repository root) and external URLs that the MDX references. */
  images: string[];
  /** Links whose target isn't a synced file. */
  unresolvedLinks: string[];
}
interface ExportedFile {
  path: string;
  content: string;
  sidecar: SidecarFile;
  /** Images to commit, by repository path. */
  images: Array<{ path: string; assetID: string }>;
  unresolvedLinks: string[];
}

/** Which side's content wins on a first sync for files that match entries. */
type Precedence = "github" | "andesine";

export type {
  Mapping,
  MappingInput,
  Precedence,
  SyncState,
  SyncSource,
  SyncRun,
  Sidecar,
  SidecarFile,
  FragmentAnchor,
  PropertyAnchor,
  RepositoryFile,
  FileChange,
  ImportedFile,
  ExportedFile
};
