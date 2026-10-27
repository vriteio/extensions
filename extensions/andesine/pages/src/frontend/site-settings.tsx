import {
  Button,
  Grid,
  IconPicker,
  ImageInput,
  Input,
  LinkInput,
  List,
  MultiSelect,
  Section,
  Setting,
  Textarea,
  Checkbox
} from "@andesine/extensions/solid";
import { createSignal, Index, Show } from "solid-js";
import { MAX_UPLOAD_SIZE } from "../shared/constants";
import { createSettingsPage, type SiteForm } from "./site-form";
import { createSiteImages } from "./site-images";

interface FieldsProps {
  form: SiteForm;
}
interface LinkDraft {
  label: string;
  href: string;
  icon: string;
}
interface LinkRowProps {
  link: LinkDraft;
  /** The site's collection, whose entries the link can point to. */
  collectionID: string;
  /** For an optional icon, e.g. the call to action's. */
  iconPlaceholder?: string;
  onChange(field: keyof LinkDraft, value: string): void;
}
interface LinkListProps {
  label: string;
  description: string;
  links: LinkDraft[];
  addLabel: string;
  disabled: boolean;
  /** The site's collection, whose entries the links can point to. */
  collectionID: string;
  onChange(links: LinkDraft[]): void;
}

const AI_SERVICES = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "perplexity", label: "Perplexity" }
];

// Link preview images; SVG and ICO aren't shown by most apps that preview links.
const PREVIEW_IMAGE_FORMATS: Array<"png" | "jpeg" | "webp"> = ["png", "jpeg", "webp"];
// Icons for links, and brand logos (Simple Icons) for social links, in one list.
const ICON_SETS: Array<"lucide" | "tabler" | "simple-icons"> = ["lucide", "tabler", "simple-icons"];
// The icon, then the label, then the link, which takes the most room.
const LINK_ROW_CLASS = "grid-cols-[1.75rem_1fr_2fr]";

/** A link's icon, label, and entry, URL, or path in one row. */
const LinkRow = (props: LinkRowProps) => (
  <Grid gap="small" class={LINK_ROW_CLASS}>
    <IconPicker
      value={props.link.icon}
      sets={ICON_SETS}
      placeholder={props.iconPlaceholder}
      clearable={Boolean(props.iconPlaceholder)}
      compact
      onChange={(value) => props.onChange("icon", value)}
    />
    <Input
      value={props.link.label}
      placeholder="Label"
      onInput={(value) => props.onChange("label", value)}
    />
    <LinkInput
      value={props.link.href}
      placeholder="Entry, URL, or /path"
      paths
      collectionID={props.collectionID}
      onChange={(value) => props.onChange("href", value)}
    />
  </Grid>
);
/** Icon links under a setting whose action adds one, as the app's lists. */
const LinkList = (props: LinkListProps) => {
  const update = (index: number, field: keyof LinkDraft, value: string) => {
    props.onChange(
      props.links.map((link, at) => (at === index ? { ...link, [field]: value } : link))
    );
  };
  const move = (from: number, to: number) => {
    const links = [...props.links];
    const [link] = links.splice(from, 1);

    links.splice(to, 0, link);
    props.onChange(links);
  };

  return (
    <>
      <Setting label={props.label} description={props.description}>
        <Show when={!props.disabled}>
          <Button
            icon="i-lucide:plus"
            onClick={() =>
              props.onChange([...props.links, { label: "", href: "", icon: "i-lucide:link" }])
            }
          >
            {props.addLabel}
          </Button>
        </Show>
      </Setting>
      <List
        emptyLabel="No links"
        emptyIcon="i-lucide:link"
        disabled={props.disabled}
        onRemove={(index) => props.onChange(props.links.filter((_, at) => at !== index))}
        onMove={move}
      >
        {/* By position, not by object: an edit makes a new link object, which would make a new row
            and take the focus from its field. */}
        <Index each={props.links}>
          {(link, index) => (
            <LinkRow
              link={link()}
              collectionID={props.collectionID}
              onChange={(field, value) => update(index, field, value)}
            />
          )}
        </Index>
      </List>
    </>
  );
};
const GeneralFields = (props: FieldsProps) => {
  const { form, setForm } = props.form;

  return (
    <Section title="Site">
      <Setting label="Name" description="In the header, the page titles, and link previews">
        <Input value={form.name} onInput={(value) => setForm("name", value)} />
      </Setting>
      <Setting label="Language" description="A language tag, e.g. en or de-CH">
        <Input value={form.language} onInput={(value) => setForm("language", value)} />
      </Setting>
      <Setting label="Description" description="For search engines and link previews" />
      <Textarea
        value={form.description}
        rows={2}
        onInput={(value) => setForm("description", value)}
      />
    </Section>
  );
};
const NavigationFields = (props: FieldsProps) => {
  const { form, setForm } = props.form;
  const [ctaAdded, setCtaAdded] = createSignal(false);
  // A saved call to action shows; a new one shows once added, while it's still empty.
  const ctaShown = () => {
    return ctaAdded() || Boolean(form.cta.label || form.cta.href || form.cta.icon);
  };
  const removeCta = () => {
    setCtaAdded(false);
    setForm("cta", { label: "", href: "", icon: "" });
  };

  return (
    <>
      <Section title="Header">
        <LinkList
          label="Links"
          description="Icon links at the top of the navigation"
          links={form.links}
          addLabel="Add link"
          disabled={props.form.disabled()}
          collectionID={props.form.site().collectionID}
          onChange={(links) => setForm("links", links)}
        />
        <Setting label="Call to action" description="A button at the end of the header">
          <Show when={!props.form.disabled()}>
            <Show
              when={ctaShown()}
              fallback={
                <Button icon="i-lucide:plus" onClick={() => setCtaAdded(true)}>
                  Add call to action
                </Button>
              }
            >
              <Button icon="i-lucide:x" onClick={removeCta}>
                Remove
              </Button>
            </Show>
          </Show>
        </Setting>
        <Show when={ctaShown()}>
          <LinkRow
            link={form.cta}
            collectionID={props.form.site().collectionID}
            iconPlaceholder="No icon"
            onChange={(field, value) => setForm("cta", field, value)}
          />
        </Show>
      </Section>
      <Section title="Footer">
        <LinkList
          label="Social links"
          description="Icon links in the footer"
          links={form.socialLinks}
          addLabel="Add social link"
          disabled={props.form.disabled()}
          collectionID={props.form.site().collectionID}
          onChange={(links) => setForm("socialLinks", links)}
        />
      </Section>
    </>
  );
};
const ContentFields = (props: FieldsProps) => {
  const { form, setForm } = props.form;
  const images = createSiteImages(props.form);

  return (
    <>
      <Section title="Pages">
        <Setting label="Page actions" description="Copy a page as Markdown, or open it in AI chats">
          <Checkbox
            checked={form.pageActions}
            onChange={(checked) => setForm("pageActions", checked)}
          />
        </Setting>
        <Show when={form.pageActions}>
          <Setting label="Open in" description="The AI chats that page actions offer">
            <MultiSelect
              values={form.openIn}
              options={AI_SERVICES}
              placeholder="Select AI chat"
              onChange={(values) => setForm("openIn", values as typeof form.openIn)}
            />
          </Setting>
        </Show>
      </Section>
      <Section title="Link previews">
        <Setting label="Generated previews" description="A link preview image for each page">
          <Checkbox
            checked={form.socialGenerate}
            onChange={(checked) => setForm("socialGenerate", checked)}
          />
        </Setting>
        <Setting label="Preview image" description="For pages without a generated image">
          <ImageInput
            value={images.getPreview(form.socialImage)}
            accept={PREVIEW_IMAGE_FORMATS}
            maxSize={MAX_UPLOAD_SIZE}
            disabled={props.form.disabled() || images.uploading()}
            onChange={(file) => images.upload("socialImage", file)}
            onRemove={() => setForm("socialImage", "")}
          />
        </Setting>
        <Setting label="Preview background" description="Background of generated images">
          <ImageInput
            value={images.getPreview(form.socialBackground)}
            accept={PREVIEW_IMAGE_FORMATS}
            maxSize={MAX_UPLOAD_SIZE}
            disabled={props.form.disabled() || images.uploading()}
            onChange={(file) => images.upload("socialBackground", file)}
            onRemove={() => setForm("socialBackground", "")}
          />
        </Setting>
      </Section>
      <Section title="AI">
        <Setting
          label="AI answers"
          description="Answers in search; each uses the workspace's AI credits"
        >
          <Checkbox checked={form.answers} onChange={(checked) => setForm("answers", checked)} />
        </Setting>
        <Setting label="Instructions for agents" description="In the Markdown pages and llms.txt" />
        <Textarea
          value={form.instructions}
          rows={3}
          onInput={(value) => setForm("instructions", value)}
        />
      </Section>
    </>
  );
};

export const SiteGeneralPage = createSettingsPage(GeneralFields);
export const SiteNavigationPage = createSettingsPage(NavigationFields);
export const SiteContentPage = createSettingsPage(ContentFields);
