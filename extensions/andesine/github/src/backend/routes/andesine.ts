import { getBackend } from "../andesine";
import type { Env } from "../env";
import { enqueueJob } from "../repository-sync";
import { createStore, unlinkInstallation } from "../store";

/** A publish to a mapped channel exports the collection; the extension's own publishes don't arrive. */
const handleAndesineWebhook = async (env: Env, request: Request): Promise<Response> => {
  const { event, client, extensionID, instance } = await getBackend(env).receive(
    await request.text()
  );
  const link = { instance, extensionID };

  if (event.type === "extension.uninstalled") {
    await unlinkInstallation(env, link);
  } else if (event.type === "publishing.channel_advanced") {
    const mappings = await createStore(env, client, extensionID).listMappings();

    for (const mapping of mappings.filter(({ channel }) => channel === event.subject.code)) {
      await enqueueJob(env, mapping.repository.id, {
        kind: "publish",
        id: `publish:${event.id}:${mapping.collectionID}`,
        link,
        collectionID: mapping.collectionID,
        previousSnapshotID: event.data.previousSnapshotID,
        snapshotID: event.data.snapshotID
      });
    }
  }

  return new Response(null, { status: 204 });
};

export { handleAndesineWebhook };
