import { createExtensionBackend, type ExtensionBackend } from "@andesine/sdk/extensions";
import type { Env } from "./env";

const backends = new WeakMap<Env, ExtensionBackend>();

/** The extension's backend helpers, created once per Worker environment. */
const getBackend = (env: Env): ExtensionBackend => {
  let backend = backends.get(env);

  if (!backend) {
    backend = createExtensionBackend({
      name: "andesine/pages",
      privateKey: env.ANDESINE_EXTENSION_KEY,
      trustedInstances: env.ANDESINE_INSTANCES.split(",").map((instance) => instance.trim())
    });
    backends.set(env, backend);
  }

  return backend;
};

export { getBackend };
