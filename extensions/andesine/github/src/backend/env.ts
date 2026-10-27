import type { RepositorySync } from "./repository-sync";

/** Worker bindings: `wrangler.jsonc` vars and bindings, and `wrangler secret put` secrets. */
interface Env {
  /** The extension's private JWK (secret). */
  ANDESINE_EXTENSION_KEY: string;
  /** Trusted Andesine API URLs, separated by commas. */
  ANDESINE_INSTANCES: string;
  GITHUB_APP_ID: string;
  /** The App's URL name, as in `https://github.com/apps/<slug>`. */
  GITHUB_APP_SLUG: string;
  /** The App's private key, PEM (PKCS#1 or PKCS#8; secret). */
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_WEBHOOK_SECRET: string;
  /** Signs install states and the backend's storage records (secret). */
  STATE_SECRET: string;
  /** GitHub installation ID → Andesine installations, and the reverse. */
  INSTALLATIONS: KVNamespace;
  /** One object per repository serializes its syncs. */
  REPOSITORIES: DurableObjectNamespace<RepositorySync>;
}

export type { Env };
