import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/** The site that holds a subdomain, across instances and installations. */
interface SiteOwner {
  instance: string;
  extensionID: string;
  collectionID: string;
  siteID: string;
  /** Custom domains: the Cloudflare custom hostname, deleted with the installation. */
  customHostnameID?: string;
}

const isSameOwner = (first: SiteOwner, second: SiteOwner): boolean => {
  return (
    first.instance === second.instance &&
    first.extensionID === second.extensionID &&
    first.collectionID === second.collectionID
  );
};

/** One object for all sites, so a host name is reserved atomically. */
class SiteRegistry extends DurableObject<Env> {
  /** Reserves a free host name (a subdomain or a custom domain), or updates the owner's own. */
  async reserve(hostname: string, owner: SiteOwner): Promise<boolean> {
    const key = `host:${hostname}`;
    const current = await this.ctx.storage.get<SiteOwner>(key);

    if (current && !isSameOwner(current, owner)) return false;

    await this.ctx.storage.put(key, owner);

    return true;
  }

  /** Releases every host name of an installation, e.g. after an uninstall, and returns them. */
  async releaseInstallation(
    instance: string,
    extensionID: string
  ): Promise<Array<SiteOwner & { hostname: string }>> {
    const entries = await this.ctx.storage.list<SiteOwner>({ prefix: "host:" });
    const owned = [...entries].filter(([, owner]) => {
      return owner.instance === instance && owner.extensionID === extensionID;
    });

    await this.ctx.storage.delete(owned.map(([key]) => key));

    return owned.map(([key, owner]) => ({ ...owner, hostname: key.slice("host:".length) }));
  }

  async release(hostname: string, owner: SiteOwner): Promise<void> {
    const key = `host:${hostname}`;
    const current = await this.ctx.storage.get<SiteOwner>(key);

    if (current && isSameOwner(current, owner)) await this.ctx.storage.delete(key);
  }
}

const getRegistry = (env: Env) => env.REGISTRY.get(env.REGISTRY.idFromName("global"));

export { SiteRegistry, getRegistry };
