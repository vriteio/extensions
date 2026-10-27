const CHUNK_SIZE = 0x8000;

/** In chunks: spreading a large file into one call overflows the stack. */
const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";

  for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK_SIZE));
  }

  return btoa(binary);
};
const fromBase64 = (text: string): Uint8Array => {
  return Uint8Array.from(atob(text.replace(/\s+/g, "")), (character) => character.charCodeAt(0));
};
const toBase64URL = (bytes: Uint8Array): string => {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64URL = (text: string): Uint8Array => {
  return fromBase64(text.replace(/-/g, "+").replace(/_/g, "/"));
};

export { toBase64, fromBase64, toBase64URL, fromBase64URL };
