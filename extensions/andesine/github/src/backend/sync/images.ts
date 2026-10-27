import { sha256 } from "../../sync";
import { readFile, type RepositoryRef } from "../github";
import type { SyncContext } from "./context";

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp"
};
const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const READY_TIMEOUT = 30_000;

/** A new asset ID: a random UUID in the API's base62 public form. */
const createAssetID = (): string => {
  let value = BigInt(`0x${crypto.randomUUID().replace(/-/g, "")}`);
  let encoded = "";

  while (value > 0n) {
    encoded = BASE62[Number(value % 62n)] + encoded;
    value /= 62n;
  }

  return `ast_${encoded || "0"}`;
};
const waitUntilReady = async (context: SyncContext, assetID: string): Promise<void> => {
  const deadline = Date.now() + READY_TIMEOUT;

  let { status, failureReason } = await context.client.assets.get({ assetID });

  while (status !== "ready") {
    if (status === "failed") throw new Error(`The image failed processing: ${failureReason}`);
    if (Date.now() > deadline) throw new Error(`The image ${assetID} is still processing`);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    ({ status, failureReason } = await context.client.assets.get({ assetID }));
  }
};
/** Uploads of a run by image path, so files that convert at once share one upload of an image. */
const uploads = new WeakMap<SyncContext, Map<string, Promise<string>>>();

/** The asset of a repository image; the same file is uploaded once. */
const readAndUpload = async (
  context: SyncContext,
  repository: RepositoryRef,
  commit: string,
  path: string,
  entryID: string
): Promise<string> => {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const type = IMAGE_TYPES[extension];
  const bytes = await readFile(context.token, repository, path, commit);

  if (!bytes) throw new Error(`The image ${path} doesn't exist`);
  if (!type) throw new Error(`The image ${path} isn't a PNG, JPEG, or WebP file`);

  const checksum = await sha256(bytes);
  const known = context.state.images[checksum];

  if (known) return known;

  const assetID = createAssetID();
  const filename = path.split("/").pop()!;

  await context.client.assets.register({
    assetID,
    entryID,
    filename,
    byteSize: bytes.byteLength,
    checksum
  });
  await context.client.assets.upload({ assetID, file: new File([bytes], filename, { type }) });
  await waitUntilReady(context, assetID);

  context.state.images[checksum] = assetID;
  context.state.assetPaths[assetID] = path;

  return assetID;
};
const uploadImage = (
  context: SyncContext,
  repository: RepositoryRef,
  commit: string,
  path: string,
  entryID: string
): Promise<string> => {
  const pending = uploads.get(context) ?? new Map<string, Promise<string>>();
  const upload = pending.get(path) ?? readAndUpload(context, repository, commit, path, entryID);

  uploads.set(context, pending.set(path, upload));

  return upload;
};

export { uploadImage };
