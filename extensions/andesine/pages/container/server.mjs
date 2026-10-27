// The build server of the site containers: it builds the Pages template with a generated
// andesine.config.ts and serves the output files, which the site's Durable Object uploads.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, normalize, relative } from "node:path";

const SITE = process.env.SITE_DIRECTORY ?? "/site";
const OUTPUT = join(SITE, "dist");
// Uploaded images of the configuration, e.g. `./uploads/<sha256>.png`.
const UPLOADS = join(SITE, "uploads");
const UPLOAD_FILE_PATTERN = /^[a-f\d]{64}\.(?:png|jpg|webp|svg|ico)$/;
// Terminal colors of the build tools aren't text.
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[\d;]*[A-Za-z]/g;
const STACK_PATTERN = /^\s*at\s/;
const DETAILS_PATTERN = /^\s*(Location|Stack trace):/;
const PORT = Number(process.env.PORT ?? 8080);
const BUILD_TIMEOUT = 9 * 60_000;
const LOG_LINES = 200;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_REDIRECT_PAGE = 1024;
// The page that Astro writes for a redirect in a static build.
const REDIRECT_PAGE =
  /^<!doctype html>\s*<title>Redirecting to: [^<]*<\/title>\s*<meta http-equiv="refresh" content="\d+;url=([^"]+)">/;
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

let building = false;

/**
 * The message of a failed build: Astro prints it right before its location and stack; else the
 * last line about an error that isn't a stack frame.
 */
const getBuildError = (log) => {
  const details = log.findIndex((line) => DETAILS_PATTERN.test(line));
  const message =
    details > 0
      ? log[details - 1]
      : log.findLast((line) => /error|invalid/i.test(line) && !STACK_PATTERN.test(line));

  return message?.trim() || "The build failed";
};
const send = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};
const readBody = async (request) => {
  let body = "";

  for await (const chunk of request) {
    body += chunk;

    if (body.length > MAX_BODY) throw new Error("The request is too large");
  }

  return JSON.parse(body);
};
const listFiles = async (directory) => {
  const items = await readdir(directory, { withFileTypes: true, recursive: true });
  const files = items.filter((item) => item.isFile());

  return Promise.all(
    files.map(async (item) => {
      const path = join(item.parentPath, item.name);

      const hash = createHash("sha256");

      for await (const chunk of createReadStream(path)) hash.update(chunk);

      return {
        path: relative(directory, path),
        size: (await stat(path)).size,
        hash: hash.digest("hex")
      };
    })
  );
};
/** Request folder path (e.g. `/` or `/guides/`) → target, from Astro's redirect pages. */
const findRedirects = async (directory, files) => {
  const pages = files.filter(({ path, size }) => {
    return (path === "index.html" || path.endsWith("/index.html")) && size <= MAX_REDIRECT_PAGE;
  });
  const redirects = {};

  for (const { path } of pages) {
    const target = REDIRECT_PAGE.exec(await readFile(join(directory, path), "utf8"))?.[1];

    if (target) {
      redirects[`/${path.slice(0, -"index.html".length)}`] = target.replace(
        /&(?:amp|lt|gt|quot|#39);/g,
        (entity) => ENTITIES[entity]
      );
    }
  }

  return redirects;
};
/** Runs `astro build`; the log keeps its last lines, without the environment. */
const runBuild = () => {
  return new Promise((resolve) => {
    const log = [];
    const child = spawn(process.execPath, ["node_modules/astro/bin/astro.mjs", "build"], {
      cwd: SITE,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", NODE_ENV: "production" }
    });
    const collect = (chunk) => {
      log.push(...String(chunk).split("\n").filter(Boolean));
      log.splice(0, Math.max(0, log.length - LOG_LINES));
    };
    const timeout = setTimeout(() => {
      log.push("The build took more than 9 minutes and was stopped");
      child.kill("SIGKILL");
    }, BUILD_TIMEOUT);

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0, log });
    });
  });
};
const handleBuild = async (request, response) => {
  if (building) return send(response, 409, { error: "A build is running" });

  building = true;

  try {
    const { configFile, uploads = [] } = await readBody(request);

    await rm(OUTPUT, { recursive: true, force: true });
    await rm(UPLOADS, { recursive: true, force: true });
    await mkdir(UPLOADS, { recursive: true });

    for (const { file, data } of uploads) {
      if (!UPLOAD_FILE_PATTERN.test(file)) throw new Error("Invalid upload name");

      await writeFile(join(UPLOADS, file), Buffer.from(data, "base64"));
    }

    await writeFile(join(SITE, "andesine.config.ts"), configFile);

    const result = await runBuild();

    if (!result.ok) {
      const log = result.log.map((line) => line.replace(ANSI_PATTERN, ""));

      return send(response, 200, { ok: false, error: getBuildError(log), log });
    }

    const files = await listFiles(OUTPUT);

    send(response, 200, { ok: true, files, redirects: await findRedirects(OUTPUT, files) });
  } catch (error) {
    send(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      log: []
    });
  } finally {
    building = false;
  }
};
const handleFile = async (path, response) => {
  const file = normalize(join(OUTPUT, decodeURIComponent(path)));

  if (!file.startsWith(`${OUTPUT}/`)) return send(response, 400, { error: "Invalid path" });

  try {
    const { size } = await stat(file);

    response.writeHead(200, { "content-length": size, "content-type": "application/octet-stream" });
    createReadStream(file).pipe(response);
  } catch {
    send(response, 404, { error: "Not found" });
  }
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://container");

  if (request.method === "GET" && url.pathname === "/health") {
    return send(response, 200, { building });
  }

  if (request.method === "POST" && url.pathname === "/build") {
    void handleBuild(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/files/")) {
    void handleFile(url.pathname.slice("/files/".length), response);
    return;
  }

  send(response, 404, { error: "Not found" });
}).listen(PORT, () => console.log(`Build server on port ${PORT}`));
