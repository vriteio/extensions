// `npm run dev`: the extension, its backend, the sites Worker, and a local build server in one
// terminal. Builds run on the host, not in containers; sites are http://<subdomain>.localhost:8788.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const ENV_FILE = join(ROOT, ".env");
const SITE_DIRECTORY = join(ROOT, ".andesine", "site");
const BACKEND_PORT = 3010;
const SITES_PORT = 8788;
const BUILD_SERVER_PORT = 8080;
const KEY_TIMEOUT = 60_000;
const COLORS = { extension: 35, backend: 36, sites: 32, builds: 33 };
// Development values of `.env`; `andesine extensions dev` sets the key and the trusted instance.
const DEV_VARIABLES = {
  SITES_DOMAIN: "localhost",
  SITES_FALLBACK_HOST: "localhost",
  SITES_DEV_PORT: String(SITES_PORT),
  LOCAL_BUILD_SERVER: `http://localhost:${BUILD_SERVER_PORT}`
};
const children = [];

const log = (message) => console.log(`\x1b[1m[dev]\x1b[0m ${message}`);
const readEnv = () => (existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "");
const getVariable = (source, name) => {
  return new RegExp(`^${name}=(.*)$`, "m").exec(source)?.[1]?.trim() ?? "";
};
const setVariable = (source, name, value) => {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");

  if (pattern.test(source)) return source.replace(pattern, () => line);

  return `${source}${source && !source.endsWith("\n") ? "\n" : ""}${line}\n`;
};
/** Creates `.env` from the example, with a state secret and the local hosting values. */
const prepareEnv = () => {
  let source = readEnv() || readFileSync(join(ROOT, ".env.example"), "utf8");

  if (!getVariable(source, "STATE_SECRET")) {
    source = setVariable(source, "STATE_SECRET", randomBytes(32).toString("hex"));
  }

  for (const [name, value] of Object.entries(DEV_VARIABLES)) {
    source = setVariable(source, name, value);
  }

  writeFileSync(ENV_FILE, source, { mode: 0o600 });
};
/** The mkcert root, so the backend trusts a local instance with an mkcert certificate. */
const getExtraCertificates = () => {
  if (process.env.NODE_EXTRA_CA_CERTS) return process.env.NODE_EXTRA_CA_CERTS;

  try {
    const root = execFileSync("mkcert", ["-CAROOT"], {
      encoding: "utf8"
    }).trim();
    const file = join(root, "rootCA.pem");

    return existsSync(file) ? file : undefined;
  } catch {
    return undefined;
  }
};
const getTemplateVersion = () => {
  const source = readFileSync(join(ROOT, "src/backend/site.ts"), "utf8");
  const versions = /TEMPLATE_VERSIONS = \[([^\]]*)\]/.exec(source)?.[1].match(/[\d.]+/g) ?? [];

  return versions.at(-1);
};
/** Runs a command until it ends; the template site's setup uses it. */
const runOnce = (command, args, cwd) => {
  execFileSync(command, args, { cwd, stdio: "inherit" });
};
/** The installed template of the latest version that sites build with, made once. */
const prepareSite = () => {
  const version = getTemplateVersion();

  if (existsSync(join(SITE_DIRECTORY, "node_modules"))) return;

  log(`Setting up the Pages template ${version} in .andesine/site (once)`);
  runOnce("npx", ["--yes", `andesine@${version}`, "pages", "init", SITE_DIRECTORY], ROOT);
  runOnce("npm", ["install", "--no-audit", "--no-fund"], SITE_DIRECTORY);
};
const start = (name, command, args, env = {}) => {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "1", ...env },
    stdio: ["inherit", "pipe", "pipe"]
  });
  const prefix = `\x1b[${COLORS[name]}m${name.padEnd(9)}\x1b[0m│ `;
  const write = (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (line.trim()) process.stdout.write(`${prefix}${line}\n`);
    }
  };

  child.stdout.on("data", write);
  child.stderr.on("data", write);
  child.on("exit", (code) => {
    if (!stopping) {
      log(`${name} stopped (${code ?? "signal"}); stopping the rest`);
      stop();
    }

    if (!children.some(isRunning)) process.exit(0);
  });
  children.push(child);

  return child;
};
/** A free port for a wrangler inspector; other wrangler dev sessions may hold the default one. */
const getFreePort = () => {
  return new Promise((resolve, reject) => {
    const server = createServer().once("error", reject);

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();

      server.close(() => resolve(port));
    });
  });
};
/** Waits until `andesine extensions dev` writes the development key. */
const waitForKey = async () => {
  const started = Date.now();

  while (!getVariable(readEnv(), "ANDESINE_EXTENSION_KEY")) {
    if (Date.now() - started > KEY_TIMEOUT) throw new Error("No development key after 60 seconds");

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
};

let stopping = false;

const isRunning = (child) => child.exitCode === null && child.signalCode === null;
/**
 * Stops the children, then exits. Ctrl+C sends the terminal's SIGINT to the children too; a second
 * SIGINT would end the CLI before it stops the extension, e.g. in the middle of a login refresh,
 * so they get SIGTERM, which it takes as the same request.
 */
const stop = () => {
  if (stopping) return;

  stopping = true;
  children.filter(isRunning).forEach((child) => child.kill("SIGTERM"));
  // The CLI stops the development extension within 10 seconds.
  setTimeout(() => process.exit(0), 15_000).unref();
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

prepareEnv();
prepareSite();

const cli = process.env.ANDESINE_CLI;
const extraCertificates = getExtraCertificates();
const wranglerEnv = extraCertificates ? { NODE_EXTRA_CA_CERTS: extraCertificates } : {};
const cliCommand = cli ? (cli.endsWith(".js") ? [process.execPath, cli] : [cli]) : ["andesine"];
const backendURL = `http://localhost:${BACKEND_PORT}`;

if (!extraCertificates) log("mkcert not found: the backend trusts only public certificates");

start("extension", cliCommand[0], [
  ...cliCommand.slice(1),
  "extensions",
  "dev",
  "--backend",
  backendURL
]);
await waitForKey();
start("builds", process.execPath, ["container/server.mjs"], {
  SITE_DIRECTORY,
  PORT: String(BUILD_SERVER_PORT)
});
start(
  "backend",
  "wrangler",
  [
    "dev",
    "--port",
    String(BACKEND_PORT),
    "--persist-to",
    ".wrangler/state",
    "--enable-containers=false",
    "--inspector-port",
    String(await getFreePort())
  ],
  wranglerEnv
);
start(
  "sites",
  "wrangler",
  [
    "dev",
    "-c",
    "wrangler.sites.jsonc",
    "--env",
    "dev",
    "--port",
    String(SITES_PORT),
    "--persist-to",
    ".wrangler/state",
    "--inspector-port",
    String(await getFreePort())
  ],
  wranglerEnv
);
log(`Backend ${backendURL}, sites http://<subdomain>.localhost:${SITES_PORT}. Ctrl+C stops all.`);
