// `npm run dev`: the extension and its backend in one terminal. `npm run tunnel` (`--tunnel`): the
// tunnel that GitHub calls the backend through, in its own terminal, so it and the App's URLs stay
// while the rest restarts; set the App's URLs to the ones it prints.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const ENV_FILE = join(ROOT, ".env");
const BACKEND_PORT = 8787;
const TUNNEL_ONLY = process.argv.includes("--tunnel");
const KEY_TIMEOUT = 60_000;
const COLORS = { extension: 35, backend: 36, tunnel: 32 };
const GITHUB_VARIABLES = [
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_WEBHOOK_SECRET"
];
const QUICK_TUNNEL_PATTERN = /https:\/\/[a-z\d-]+\.trycloudflare\.com/;
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
/** Creates `.env` from the example, with a state secret. */
const prepareEnv = () => {
  let source = readEnv() || readFileSync(join(ROOT, ".env.example"), "utf8");

  if (!getVariable(source, "STATE_SECRET")) {
    source = setVariable(source, "STATE_SECRET", randomBytes(32).toString("hex"));
  }

  writeFileSync(ENV_FILE, source, { mode: 0o600 });
};
/** The mkcert root, so the backend trusts a local instance with an mkcert certificate. */
const getExtraCertificates = () => {
  if (process.env.NODE_EXTRA_CA_CERTS) return process.env.NODE_EXTRA_CA_CERTS;

  try {
    const root = execFileSync("mkcert", ["-CAROOT"], { encoding: "utf8" }).trim();
    const file = join(root, "rootCA.pem");

    return existsSync(file) ? file : undefined;
  } catch {
    return undefined;
  }
};
const hasCommand = (command) => {
  try {
    execFileSync("which", [command], { stdio: "ignore" });

    return true;
  } catch {
    return false;
  }
};
const start = (name, command, args, env = {}, onLine) => {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "1", ...env },
    stdio: ["inherit", "pipe", "pipe"]
  });
  const prefix = `\x1b[${COLORS[name]}m${name.padEnd(9)}\x1b[0m│ `;
  const write = (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (!line.trim()) continue;

      process.stdout.write(`${prefix}${line}\n`);
      onLine?.(line);
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
/** A free port for the wrangler inspector; other wrangler dev sessions may hold the default one. */
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
const logAppURLs = (url) => {
  log(`Tunnel ${url}. Set these in the GitHub App:`);
  log(`  Callback URL: ${url}/github/setup`);
  log(`  Webhook URL:  ${url}/github/webhooks`);
};
/**
 * A fixed ngrok domain (`TUNNEL_DOMAIN` in `.env`) keeps the App's URLs; else a cloudflared quick
 * tunnel, whose URL changes on each start. False if neither is available.
 */
const startTunnel = () => {
  const domain = getVariable(readEnv(), "TUNNEL_DOMAIN");
  const target = `http://localhost:${BACKEND_PORT}`;

  if (domain) {
    start("tunnel", "ngrok", ["http", target, "--url", domain, "--log", "stdout"]);
    logAppURLs(`https://${domain}`);
    return true;
  }

  if (!hasCommand("cloudflared")) {
    log("No tunnel: set TUNNEL_DOMAIN for ngrok, or install cloudflared");
    return false;
  }

  let found = false;

  start("tunnel", "cloudflared", ["tunnel", "--url", target], {}, (line) => {
    const url = !found && QUICK_TUNNEL_PATTERN.exec(line)?.[0];

    if (!url) return;

    found = true;
    logAppURLs(url);
  });

  return true;
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

if (TUNNEL_ONLY) {
  if (!startTunnel()) process.exit(1);

  log(`Tunnel to port ${BACKEND_PORT}; restart \`npm run dev\` as needed. Ctrl+C stops it.`);
  // The tunnel runs until Ctrl+C; the extension and the backend are `npm run dev`'s.
  await new Promise(() => {});
}

const missing = GITHUB_VARIABLES.filter((name) => !getVariable(readEnv(), name));
const cli = process.env.ANDESINE_CLI;
const extraCertificates = getExtraCertificates();
const wranglerEnv = extraCertificates ? { NODE_EXTRA_CA_CERTS: extraCertificates } : {};
const cliCommand = cli ? (cli.endsWith(".js") ? [process.execPath, cli] : [cli]) : ["andesine"];
const backendURL = `http://localhost:${BACKEND_PORT}`;

if (missing.length) log(`Set the GitHub App in .env first: ${missing.join(", ")} (see README)`);
if (!extraCertificates) log("mkcert not found: the backend trusts only public certificates");

start("extension", cliCommand[0], [
  ...cliCommand.slice(1),
  "extensions",
  "dev",
  "--backend",
  backendURL
]);
await waitForKey();
start(
  "backend",
  "wrangler",
  [
    "dev",
    "--port",
    String(BACKEND_PORT),
    "--persist-to",
    ".wrangler/state",
    "--inspector-port",
    String(await getFreePort())
  ],
  wranglerEnv
);
log(`Backend ${backendURL}. Ctrl+C stops both. GitHub reaches it through \`npm run tunnel\`.`);
