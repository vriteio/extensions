import type { Sidecar, SidecarFile } from "./types";

const createSidecar = (): Sidecar => ({ version: 1, files: {} });
/** A missing or invalid sidecar is empty: files then import without restored anchors. */
const parseSidecar = (content: string | null): Sidecar => {
  try {
    const parsed = content ? (JSON.parse(content) as Partial<Sidecar>) : null;
    const isValid = parsed?.version === 1 && typeof parsed.files === "object" && parsed.files;

    return isValid
      ? { version: 1, files: parsed.files as Record<string, SidecarFile> }
      : createSidecar();
  } catch {
    return createSidecar();
  }
};
/** Sorted keys and no empty records, so unchanged anchors give an unchanged file. */
const serializeSidecar = (sidecar: Sidecar): string => {
  const files = Object.fromEntries(
    Object.entries(sidecar.files)
      .filter(([, file]) => Object.keys(file).length)
      .sort(([first], [second]) => first.localeCompare(second))
  );

  return `${JSON.stringify({ version: 1, files }, null, 2)}\n`;
};

export { createSidecar, parseSidecar, serializeSidecar };
