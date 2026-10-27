interface Signed<T> {
  value: T;
  signature: string;
}

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

const toBase64URL = (bytes: Uint8Array): string => {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};
const fromBase64URL = (text: string): Uint8Array => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");

  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};
/** JSON with sorted object keys: storage (Postgres `jsonb`) doesn't keep the key order. */
const toCanonicalJSON = (value: unknown): string => {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;

    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)));
  });
};
const getKey = (secret: string): Promise<CryptoKey> => {
  let key = keys.get(secret);

  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    keys.set(secret, key);
  }

  return key;
};
const sign = async (secret: string, text: string): Promise<string> => {
  const signature = await crypto.subtle.sign("HMAC", await getKey(secret), encoder.encode(text));

  return toBase64URL(new Uint8Array(signature));
};
const verify = async (secret: string, text: string, signature: string): Promise<boolean> => {
  try {
    const bytes = fromBase64URL(signature);

    return await crypto.subtle.verify("HMAC", await getKey(secret), bytes, encoder.encode(text));
  } catch {
    return false;
  }
};
/** The SHA-256 of the bytes, in hex. */
const getSHA256 = async (bytes: BufferSource): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
/** Members can write extension storage too, so the backend trusts only records it signed. */
const signRecord = async <T>(secret: string, key: string, value: T): Promise<Signed<T>> => {
  return { value, signature: await sign(secret, `${key}\n${toCanonicalJSON(value)}`) };
};
const readRecord = async <T>(secret: string, key: string, record: unknown): Promise<T | null> => {
  const signed = record as Partial<Signed<T>> | null;
  const isSigned = typeof signed?.signature === "string" && signed.value !== undefined;

  if (!isSigned) return null;

  const text = `${key}\n${toCanonicalJSON(signed.value)}`;

  return (await verify(secret, text, signed.signature!)) ? (signed.value as T) : null;
};

export { getSHA256, signRecord, readRecord };
