import type { AndesineClient } from "@andesine/sdk";
import { getBackend } from "../andesine";
import type { Env } from "../env";
import { deleteCustomHostname } from "../cloudflare";
import { getHostKey } from "../../shared/storage";
import { getRegistry } from "../registry";
import { getSHA256 } from "../signing";
import { deleteSiteBuilds, requestBuild } from "../site-builds";
import { createSiteStore } from "../store";

/**
 * A hash of a collection's published tree at a snapshot, or null when it isn't available; only
 * the collection, as the snapshot ID differs for every snapshot.
 */
const getTreeHash = async (
  client: AndesineClient,
  collectionID: string,
  snapshotID: string
): Promise<string | null> => {
  try {
    const { collection } = await client.content.getTree({ collectionID, snapshotID });

    return await getSHA256(new TextEncoder().encode(JSON.stringify(collection)));
  } catch {
    return null;
  }
};

/**
 * A publish to a site's channel builds the site when the site's collection changed; an uninstall
 * stops the installation's sites.
 */
const handleAndesineWebhook = async (env: Env, request: Request): Promise<Response> => {
  const delivery = await getBackend(env).receive(await request.text());
  const { event, client, extensionID, instance } = delivery;

  if (event.type === "extension.uninstalled") {
    const hosts = await getRegistry(env).releaseInstallation(instance, extensionID);
    const siteIDs = new Set(hosts.map(({ siteID }) => siteID));

    for (const host of hosts) {
      await env.HOSTS.delete(getHostKey(host.hostname));

      if (host.customHostnameID) {
        await deleteCustomHostname(env, host.customHostnameID).catch(() => undefined);
      }
    }

    await Promise.all([...siteIDs].map((siteID) => deleteSiteBuilds(env, siteID)));
  } else if (event.type === "publishing.channel_advanced") {
    const sites = await createSiteStore(env, client, extensionID).listSites();

    for (const site of sites.filter(({ channel }) => channel === event.subject.code)) {
      const [previous, next] = await Promise.all([
        getTreeHash(client, site.collectionID, event.data.previousSnapshotID),
        getTreeHash(client, site.collectionID, event.data.snapshotID)
      ]);
      const isChanged = !previous || previous !== next;
      const ref = { instance, extensionID, collectionID: site.collectionID, siteID: site.id };

      if (isChanged) await requestBuild(env, ref, "publish");
    }
  }

  return new Response(null, { status: 204 });
};

export { handleAndesineWebhook };
