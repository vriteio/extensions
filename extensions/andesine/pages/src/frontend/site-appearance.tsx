import {
  ColorInput,
  ImageInput,
  Input,
  Section,
  Setting,
  Checkbox,
  ToggleGroup
} from "@andesine/extensions/solid";
import { Show } from "solid-js";
import { MAX_UPLOAD_SIZE } from "../shared/constants";
import { createSettingsPage, type SiteForm } from "./site-form";
import { createSiteImages } from "./site-images";

interface AppearanceFieldsProps {
  form: SiteForm;
}

const DEFAULT_BRAND_COLORS = ["#ff3617", "#f88f52", "#fc6335"];

const AppearanceFields = (props: AppearanceFieldsProps) => {
  const { form, setForm } = props.form;
  const { uploading, getPreview, upload } = createSiteImages(props.form);
  // The site's colours first, then the template's defaults.
  const brandPresets = () => {
    const { primary, secondary, tertiary } = form.brand;

    return [
      ...new Set(
        [primary, secondary, tertiary, ...DEFAULT_BRAND_COLORS].map((color) => color.toLowerCase())
      )
    ];
  };

  return (
    <>
      <Section title="Logo">
        <Setting label="Logo" description="PNG, JPEG, WebP, or SVG">
          <ImageInput
            value={getPreview(form.logoSrc)}
            accept={["png", "jpeg", "webp", "svg"]}
            maxSize={MAX_UPLOAD_SIZE}
            disabled={props.form.disabled() || uploading()}
            onChange={(file) => upload("logoSrc", file)}
            onRemove={() => setForm("logoSrc", "")}
          />
        </Setting>
        <Show when={form.logoSrc}>
          <Setting label="Logo format" description="An icon next to the name, or a full wordmark">
            <ToggleGroup
              value={form.logoFormat}
              options={[
                { value: "icon", label: "Icon" },
                { value: "full", label: "Wordmark" }
              ]}
              onChange={(value) => setForm("logoFormat", value as "icon" | "full")}
            />
          </Setting>
          <Setting label="Logo text" description="For screen readers, when the logo has text">
            <Input value={form.logoAlt} onInput={(value) => setForm("logoAlt", value)} />
          </Setting>
          <Setting label="Name after the logo" description="Shows the site name next to the logo">
            <Checkbox
              checked={form.logoTitle}
              onChange={(checked) => setForm("logoTitle", checked)}
            />
          </Setting>
        </Show>
        <Setting label="Favicon" description="PNG, SVG, or ICO for the browser tab">
          <ImageInput
            value={getPreview(form.favicon)}
            accept={["png", "svg", "ico"]}
            maxSize={MAX_UPLOAD_SIZE}
            disabled={props.form.disabled() || uploading()}
            onChange={(file) => upload("favicon", file)}
            onRemove={() => setForm("favicon", "")}
          />
        </Setting>
      </Section>
      <Section title="Colours">
        <Setting label="Primary colour" description="Links, buttons, and highlights">
          <ColorInput
            value={form.brand.primary}
            presets={brandPresets()}
            onInput={(value) => setForm("brand", "primary", value)}
          />
        </Setting>
        <Setting label="Secondary colour" description="Gradients with the primary colour">
          <ColorInput
            value={form.brand.secondary}
            presets={brandPresets()}
            onInput={(value) => setForm("brand", "secondary", value)}
          />
        </Setting>
        <Setting label="Tertiary colour" description="Accents of the gradients">
          <ColorInput
            value={form.brand.tertiary}
            presets={brandPresets()}
            onInput={(value) => setForm("brand", "tertiary", value)}
          />
        </Setting>
      </Section>
    </>
  );
};

export const SiteAppearancePage = createSettingsPage(AppearanceFields);
