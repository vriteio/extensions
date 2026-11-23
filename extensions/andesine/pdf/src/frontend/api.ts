import { createClient } from "@andesine/sdk";
import { apiFetch, backend, EXTENSION_API_URL } from "@andesine/extensions/solid";
import type { ExportJob, ExportRequest } from "../shared/types";

interface ContentOption {
  value: string;
  label: string;
  request: Pick<ExportRequest, "entryID" | "collectionID">;
}

const client = createClient({ baseURL: EXTENSION_API_URL, fetch: apiFetch });

let channels: ReturnType<typeof client.publishing.listChannels> | null = null;

/** Calls a panel route of the backend, which checks the member's access. */
const callBackend = async <T>(action: string, body: object): Promise<T> => {
  const response = await backend.fetch(`/panel/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = (await response.json().catch(() => ({}))) as T & { message?: string };

  if (!response.ok) throw new Error(result.message ?? "The PDF Export backend didn't answer");

  return result;
};
const startExport = (request: ExportRequest) => callBackend<ExportJob>("export", request);
const listJobs = () => callBackend<ExportJob[]>("list", {});
/** The workspace's channels, loaded once while the extension runs; none if they can't be read. */
const listChannels = () => {
  channels ??= client.publishing.listChannels().catch(() => []);

  return channels;
};
/** The entry, its collection, then readable parent collections, nearest first. */
const getContentOptions = async (
  entryID: string,
  collectionID: string | null
): Promise<ContentOption[]> => {
  const getCollection = (id: string) => {
    return client.collections.get({ collectionID: id }).catch(() => null);
  };
  const [entry, collection] = await Promise.all([
    client.entries.get({ id: entryID }).catch(() => null),
    collectionID ? getCollection(collectionID) : null
  ]);
  const parents = await Promise.all((collection?.ancestors ?? []).map(getCollection));
  const nearestFirst = parents
    .filter((parent) => parent !== null)
    .sort((a, b) => b.ancestors.length - a.ancestors.length);
  const toOption = (id: string, name: string, kind: string): ContentOption => {
    return { value: id, label: `${name} (${kind})`, request: { entryID: null, collectionID: id } };
  };

  return [
    {
      value: entryID,
      label: `${entry?.name ?? "Entry"} (this entry)`,
      request: { entryID, collectionID }
    },
    ...(collection ? [toOption(collection.id, collection.name, "this collection")] : []),
    ...nearestFirst.map(({ id, name }) => toOption(id, name, "parent collection"))
  ];
};

export { startExport, listJobs, listChannels, getContentOptions };
