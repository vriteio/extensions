interface FileRequest {
  /** The object key below the build's prefix, e.g. `guides/setup/index.html`. */
  key: string;
  /** The path that a request without a trailing slash should redirect to, when it's a page. */
  redirect?: string;
}

const EXTENSION_PATTERN = /\.[a-z\d]+$/i;
const IMMUTABLE_PREFIXES = ["_astro/", "_andesine/assets/"];

/**
 * The file of a request path: folders serve `index.html`, or `index.md` for a Markdown request;
 * paths without an extension are pages and redirect to their folder. Null for invalid paths.
 */
const resolveFile = (pathname: string, wantsMarkdown: boolean): FileRequest | null => {
  let path: string;

  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const segments = path.split("/").slice(1);
  const isInvalid =
    segments.some((segment) => segment === ".." || segment === ".") || path.includes("\0");
  const index = wantsMarkdown ? "index.md" : "index.html";

  if (isInvalid) return null;
  if (path.endsWith("/")) return { key: `${path.slice(1)}${index}` };
  if (EXTENSION_PATTERN.test(path)) return { key: path.slice(1) };

  return { key: `${path.slice(1)}/${index}`, redirect: `${pathname}/` };
};
/** The request folder path of a folder's index file, e.g. `guides/index.html` → `/guides/`. */
const getFolderPath = (key: string): string | null => {
  const match = /^(.*?)index\.(?:html|md)$/.exec(key);

  return match && (match[1] === "" || match[1]!.endsWith("/")) ? `/${match[1]}` : null;
};
/** Hashed build files never change; pages may change with every build. */
const getCacheControl = (key: string): string => {
  const isImmutable = IMMUTABLE_PREFIXES.some((prefix) => key.startsWith(prefix));

  return isImmutable
    ? "public, max-age=31536000, immutable"
    : "public, max-age=60, must-revalidate";
};

export { resolveFile, getFolderPath, getCacheControl };
