import {
  Callout,
  Combobox,
  Input,
  SaveBar,
  Section,
  Select,
  Setting,
  Skeleton,
  Textarea
} from "@andesine/extensions/solid";
import { createEffect, createResource, createSignal, onCleanup, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { Mapping, MappingInput, Precedence } from "../sync/types";
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from "../sync/paths";
import { callBackend, listChannels, type MappingPreview, type RepositoryOption } from "./api";

interface MappingFormProps {
  collectionID: string;
  mapping: Mapping | null;
  onSaved(): void;
}

type MappingDraft = ReturnType<typeof fromMapping>;
type ImageLinks = "file" | "site";

const PREVIEW_DELAY = 500;

const toLines = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
/** The form's values of a mapping, or the defaults of a new one. */
const fromMapping = (mapping: Mapping | null) => ({
  repositoryID: mapping ? String(mapping.repository.id) : "",
  branch: mapping?.branch ?? "",
  directory: mapping?.directory ?? "docs",
  channel: mapping?.channel ?? "published",
  format: mapping?.format ?? "mdx",
  imagesDirectory: mapping?.imagesDirectory ?? "images",
  imageLocation: mapping?.imageLocation ?? "directory",
  // Site paths need a path; without one, images are linked by file paths.
  imageLinks: (mapping?.imageURLPrefix ? "site" : "file") as ImageLinks,
  imageURLPrefix: mapping?.imageURLPrefix ?? "",
  imageFormat: mapping?.imageFormat ?? "original",
  linkStyle: mapping?.linkStyle ?? "file",
  include: (mapping?.include ?? DEFAULT_INCLUDE).join("\n"),
  exclude: (mapping?.exclude ?? DEFAULT_EXCLUDE).join("\n")
});
const toMappingInput = (draft: MappingDraft): MappingInput => ({
  repositoryID: Number(draft.repositoryID),
  branch: draft.branch,
  directory: draft.directory,
  channel: draft.channel,
  format: draft.format,
  imagesDirectory: draft.imagesDirectory,
  imageLocation: draft.imageLocation,
  imageURLPrefix:
    draft.imageLocation === "directory" && draft.imageLinks === "site" ? draft.imageURLPrefix : "",
  imageFormat: draft.imageFormat,
  linkStyle: draft.linkStyle,
  include: toLines(draft.include),
  exclude: toLines(draft.exclude)
});

/**
 * The mapping's settings, as sections of the page: where the files are, and how they're written.
 * A new mapping saves once it has a repository, a branch, and a channel.
 */
const MappingForm = (props: MappingFormProps) => {
  const [draft, setDraft] = createStore(fromMapping(props.mapping));
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [repositoryList] = createResource(async () => {
    return callBackend<{ repositories: RepositoryOption[]; privateRepositories: boolean }>(
      "repositories",
      { collectionID: props.collectionID }
    ).catch(() => ({ repositories: [], privateRepositories: true }));
  });
  const [branches] = createResource(
    () => draft.repositoryID,
    async (id) => {
      const result = await callBackend<{ branches: string[] }>("branches", {
        collectionID: props.collectionID,
        repositoryID: Number(id)
      }).catch(() => ({ branches: [] }));

      return result.branches;
    }
  );
  const [channels] = createResource(listChannels);
  const [initialSync, setInitialSync] = createSignal<Precedence>("github");
  const [previewSource, setPreviewSource] = createSignal<string | null>(null);
  const [preview] = createResource(previewSource, (source) => {
    return callBackend<MappingPreview>("preview", {
      collectionID: props.collectionID,
      mapping: JSON.parse(source)
    }).catch(() => null);
  });
  const repositories = () => repositoryList()?.repositories;
  // A private repository without the Pro plan can't be mapped; the backend refuses it too.
  const needsPro = () => {
    const repository = repositories()?.find((item) => String(item.id) === draft.repositoryID);

    return Boolean(repository?.private && !repositoryList()?.privateRepositories);
  };
  const isComplete = () => {
    return Boolean(draft.repositoryID && draft.branch && draft.channel) && !needsPro();
  };
  const previewText = () => {
    const counts = preview();

    if (preview.loading) return "Comparing the repository with the collection…";
    if (!counts) return "Files and entries in the same folder with the same name are linked";

    return `${counts.matched} files match entries; ${counts.githubOnly} are only in GitHub, ${counts.andesineOnly} only in Andesine`;
  };
  // A new mapping is unsaved once it's complete; a saved one when the form differs from it.
  const isDirty = () => {
    if (!props.mapping) return isComplete();

    return (
      JSON.stringify(toMappingInput(draft)) !==
      JSON.stringify(toMappingInput(fromMapping(props.mapping)))
    );
  };
  const selectRepository = (id: string) => {
    const repository = repositories()?.find((item) => String(item.id) === id);

    setDraft({ repositoryID: id, branch: repository?.defaultBranch ?? "" });
  };
  const discard = () => {
    setDraft(reconcile(fromMapping(props.mapping)));
    setError(null);
  };
  const save = async () => {
    setSaving(true);
    setError(null);

    try {
      await callBackend("mapping", {
        collectionID: props.collectionID,
        mapping: { ...toMappingInput(draft), ...(!props.mapping && { initialSync: initialSync() }) }
      });
      props.onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The mapping wasn't saved");
    } finally {
      setSaving(false);
    }
  };

  // A new mapping compares its source once it stops changing, e.g. while the directory is typed.
  createEffect(() => {
    // The channel doesn't change which files and entries match.
    const { repositoryID, branch, directory, include, exclude } = toMappingInput(draft);
    const source =
      !props.mapping && isComplete()
        ? JSON.stringify({ repositoryID, branch, directory, include, exclude })
        : null;
    const timer = setTimeout(() => setPreviewSource(source), PREVIEW_DELAY);

    onCleanup(() => clearTimeout(timer));
  });

  return (
    <>
      <Section title="Repository">
        <Setting
          label="Source"
          description="GitHub changes are published here; publishes here go to GitHub"
        >
          <Show when={!channels.loading} fallback={<Skeleton class="h-7" />}>
            <Select
              value={draft.channel}
              options={(channels() ?? []).map((item) => ({ value: item.code, label: item.name }))}
              onChange={(value) => setDraft("channel", value)}
            />
          </Show>
        </Setting>
        <Setting label="Repository" description="A repository that the GitHub App can access">
          <Show when={!repositoryList.loading} fallback={<Skeleton class="h-7" />}>
            <Combobox
              value={draft.repositoryID}
              placeholder="Choose a repository"
              options={(repositories() ?? []).map((item) => ({
                value: String(item.id),
                label: item.private ? `${item.name} (private)` : item.name
              }))}
              onChange={selectRepository}
            />
          </Show>
        </Setting>
        <Show when={needsPro()}>
          <Callout title="Private repositories need the Pro plan">
            Upgrade the workspace to sync private repositories, or choose a public one.
          </Callout>
        </Show>
        <Show when={draft.repositoryID}>
          <Setting label="Branch" description="The branch that is read and committed to">
            {/* The default branch is set at once, but its label shows only with the options. */}
            <Show when={!branches.loading} fallback={<Skeleton class="h-7" />}>
              <Combobox
                value={draft.branch}
                placeholder="Choose a branch"
                options={(branches() ?? []).map((name) => ({ value: name, label: name }))}
                onChange={(value) => setDraft("branch", value)}
              />
            </Show>
          </Setting>
        </Show>
        <Show when={draft.repositoryID && draft.branch}>
          <Setting
            label="Directory"
            description="Folders are collections; empty for the repository root"
          >
            <Input
              value={draft.directory}
              placeholder="docs"
              code
              onInput={(value) => setDraft("directory", value)}
            />
          </Setting>
        </Show>
      </Section>
      <Show when={!props.mapping && isComplete()}>
        <Section title="First sync">
          <Setting label="Matching files" description={previewText()}>
            <Select
              value={initialSync()}
              options={[
                { value: "github", label: "Keep GitHub files" },
                { value: "andesine", label: "Keep Andesine entries" }
              ]}
              onChange={(value) => setInitialSync(value as Precedence)}
            />
          </Setting>
        </Section>
      </Show>
      <Section title="Content">
        <Setting label="New files" description="Format of files for entries created in Andesine">
          <Select
            value={draft.format}
            options={[
              { value: "mdx", label: "MDX" },
              { value: "md", label: "Markdown" }
            ]}
            onChange={(value) => setDraft("format", value as MappingInput["format"])}
          />
        </Setting>
        <Setting label="Links" description="How links between synced files are written">
          <Select
            value={draft.linkStyle}
            options={[
              { value: "file", label: "File paths (./setup.mdx)" },
              { value: "site", label: "Site URLs (../setup/)" }
            ]}
            onChange={(value) => setDraft("linkStyle", value as MappingInput["linkStyle"])}
          />
        </Setting>
        <Setting label="Include" description="Glob patterns in the directory, one per line" />
        <Textarea
          value={draft.include}
          rows={2}
          code
          onInput={(value) => setDraft("include", value)}
        />
        <Setting label="Exclude" description="Glob patterns that skip files" />
        <Textarea
          value={draft.exclude}
          rows={4}
          code
          onInput={(value) => setDraft("exclude", value)}
        />
      </Section>
      <Section title="Images">
        <Setting label="Location" description="Where published images are committed">
          <Select
            value={draft.imageLocation}
            options={[
              { value: "directory", label: "In one directory" },
              { value: "entry", label: "Next to their entries" }
            ]}
            onChange={(value) => setDraft("imageLocation", value as MappingInput["imageLocation"])}
          />
        </Setting>
        <Show when={draft.imageLocation === "directory"}>
          <Setting label="Directory" description="From the repository root">
            <Input
              value={draft.imagesDirectory}
              placeholder="images"
              code
              onInput={(value) => setDraft("imagesDirectory", value)}
            />
          </Setting>
          <Setting label="Image links" description="How files link the images">
            <Select
              value={draft.imageLinks}
              options={[
                { value: "file", label: "File paths (../images/a.png)" },
                { value: "site", label: "Site paths (/images/a.png)" }
              ]}
              onChange={(value) => setDraft("imageLinks", value as ImageLinks)}
            />
          </Setting>
          <Show when={draft.imageLinks === "site"}>
            <Setting
              label="Site path"
              description="Where the site serves the directory, e.g. /images for public/images"
            >
              <Input
                value={draft.imageURLPrefix}
                placeholder="/images"
                code
                onInput={(value) => setDraft("imageURLPrefix", value)}
              />
            </Setting>
          </Show>
        </Show>
        <Setting label="Format" description="The format of committed images">
          <Select
            value={draft.imageFormat}
            options={[
              { value: "original", label: "As uploaded (PNG or JPEG)" },
              { value: "webp", label: "WebP" }
            ]}
            onChange={(value) => setDraft("imageFormat", value as MappingInput["imageFormat"])}
          />
        </Setting>
      </Section>
      <Show when={error()}>{(message) => <Callout tone="danger">{message()}</Callout>}</Show>
      <SaveBar
        dirty={isDirty()}
        saving={saving()}
        message={props.mapping ? undefined : "Save the mapping to start syncing"}
        saveLabel="Save"
        onSave={save}
        onDiscard={discard}
      />
    </>
  );
};

export { MappingForm };
