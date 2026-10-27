const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  xml: "application/xml",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
  woff2: "font/woff2",
  pagefind: "application/octet-stream"
};
const getContentType = (path: string): string => {
  return CONTENT_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
};

export { getContentType };
