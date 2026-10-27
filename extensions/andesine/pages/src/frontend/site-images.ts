import type { ImageFile } from "@andesine/extensions/solid";
import { createResource, createSignal } from "solid-js";
import { callBackend } from "./api";
import type { SiteForm } from "./site-form";

type ImageField = "logoSrc" | "favicon" | "socialImage" | "socialBackground";

/** Uploads the site's images, e.g. the logo, into the form, and previews them. */
const createSiteImages = (form: SiteForm) => {
  const collectionID = () => form.site().collectionID;
  const [uploading, setUploading] = createSignal(false);
  // Data URLs of the uploaded images by their config values; only the settings pages show them.
  const [previews, { mutate: setPreviews }] = createResource<Record<string, string>, string>(
    collectionID,
    (id) => {
      return callBackend<Record<string, string>>("previews", {
        collectionID: id
      }).catch(() => ({}));
    },
    { initialValue: {} }
  );
  /** Uploaded images preview from data URLs; other values are URLs, which the host may show. */
  const getPreview = (value: string) => previews()[value] ?? (value || undefined);
  const upload = async (field: ImageField, file: ImageFile) => {
    setUploading(true);
    form.setError(null);

    try {
      const result = await callBackend<{ value: string; preview: string }>("upload", {
        collectionID: collectionID(),
        type: file.type,
        data: file.data
      });

      setPreviews((current) => ({
        ...current,
        [result.value]: result.preview
      }));
      form.setForm(field, result.value);
    } catch (failure) {
      form.setError(failure instanceof Error ? failure.message : "The image wasn't uploaded");
    } finally {
      setUploading(false);
    }
  };

  return { uploading, getPreview, upload };
};

export { createSiteImages };
