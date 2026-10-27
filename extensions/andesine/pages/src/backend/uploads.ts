import { MAX_UPLOAD_SIZE } from "../shared/constants";
import { getUploadKey } from "../shared/storage";
import type { Env } from "./env";
import { BadRequestError } from "./errors";
import { getSHA256 } from "./signing";

interface UploadInput {
  type?: unknown;
  data?: unknown;
}
interface Upload {
  file: string;
  type: string;
  /** Base64. */
  data: string;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico"
};
const CHUNK = 0x8000;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";

  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }

  return btoa(binary);
};
const fromBase64 = (data: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};
const toDataURL = ({ type, data }: Upload): string => `data:${type};base64,${data}`;
/** Stores an image by its content hash; the same image is stored once. */
const saveUpload = async (env: Env, siteID: string, input: UploadInput): Promise<Upload> => {
  const type = typeof input.type === "string" ? input.type : "";
  const extension = EXTENSIONS[type];
  const bytes = typeof input.data === "string" ? fromBase64(input.data) : null;

  if (!extension) throw new BadRequestError("Use a PNG, JPEG, WebP, SVG, or ICO image");
  if (!bytes?.length) throw new BadRequestError("The image is empty or invalid");

  if (bytes.length > MAX_UPLOAD_SIZE) {
    throw new BadRequestError(`The image is larger than ${MAX_UPLOAD_SIZE / 1024} KB`);
  }

  const file = `${await getSHA256(bytes)}.${extension}`;

  await env.SITES.put(getUploadKey(siteID, file), bytes, { httpMetadata: { contentType: type } });

  return { file, type, data: input.data as string };
};
/** The uploads that exist, in the order of `files`. */
const readUploads = async (env: Env, siteID: string, files: string[]): Promise<Upload[]> => {
  const uploads = await Promise.all(
    files.map(async (file) => {
      const object = await env.SITES.get(getUploadKey(siteID, file));

      if (!object) return null;

      return {
        file,
        type: object.httpMetadata?.contentType ?? "application/octet-stream",
        data: toBase64(new Uint8Array(await object.arrayBuffer()))
      };
    })
  );

  return uploads.filter((upload): upload is Upload => Boolean(upload));
};
const assertUploads = async (env: Env, siteID: string, files: string[]): Promise<void> => {
  const objects = await Promise.all(
    files.map((file) => env.SITES.head(getUploadKey(siteID, file)))
  );

  if (objects.some((object) => !object)) throw new BadRequestError("Upload the image again");
};
/** Deletes the site's uploads that `used` doesn't include. */
const removeUnusedUploads = async (env: Env, siteID: string, used: string[]): Promise<void> => {
  const prefix = getUploadKey(siteID, "");
  const listed = await env.SITES.list({ prefix });
  const unused = listed.objects
    .map(({ key }) => key)
    .filter((key) => !used.includes(key.slice(prefix.length)));

  if (unused.length) await env.SITES.delete(unused);
};

export { saveUpload, readUploads, assertUploads, removeUnusedUploads, toDataURL };
export type { Upload };
