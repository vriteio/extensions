import type { EntryPanelProps } from "@andesine/extensions";
import {
  Button,
  Callout,
  Icon,
  Navigation,
  openPage,
  openURL,
  Select,
  Setting,
  Skeleton,
  Stack,
  Tooltip
} from "@andesine/extensions/solid";
import { createResource, createSignal, Show } from "solid-js";
import type { ExportJob } from "../shared/types";
import { getContentOptions, listChannels, startExport } from "./api";
import { addJob, describeProgress, jobs } from "./jobs";
import { EXPORTS_PAGE_ID } from "./pages";

interface LatestExportProps {
  job: ExportJob;
  entryID: string;
  onDownload(url: string): void;
}

const DRAFT = "draft";
const NAVIGATION = [
  { items: [{ id: EXPORTS_PAGE_ID, label: "Exports history", icon: "i-lucide:history" }] }
];

const LatestExport = (props: LatestExportProps) => {
  const tooltip = () => {
    const { job } = props;

    if (job.state === "running") return `${job.title}: ${describeProgress(job)}`;
    if (job.state === "ready") return `Download ${job.fileName}`;

    return `The export of ${job.title} failed: ${job.message}`;
  };
  const icon = () => (props.job.state === "failed" ? "i-lucide:circle-alert" : "i-lucide:download");
  const click = () => {
    if (props.job.state === "ready") return props.onDownload(props.job.downloadURL);

    void openPage(EXPORTS_PAGE_ID, { entryID: props.entryID });
  };

  return (
    <Tooltip content={tooltip()}>
      <Button
        class="flex w-7 shrink-0 items-center justify-center px-0"
        loading={props.job.state === "running"}
        onClick={click}
      >
        <Show
          when={props.job.state === "failed"}
          fallback={<Icon name={icon()} class="text-gray-400" />}
        >
          <Icon name={icon()} tone="danger" />
        </Show>
      </Button>
    </Tooltip>
  );
};

/** The right panel of an entry: exports it, or a collection around it, as a PDF. */
export const ExportPanel = (props: EntryPanelProps) => {
  // At the top level, the host gives no collection.
  const collectionID = () => (props.collectionID as string | undefined) ?? null;
  const [content, setContent] = createSignal(props.entryID);
  const [channel, setChannel] = createSignal(DRAFT);
  const [starting, setStarting] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);
  // Only an export started while the panel is open shows next to the button.
  const [startedID, setStartedID] = createSignal<string | null>(null);
  const [options] = createResource(
    () => ({ entryID: props.entryID, collectionID: collectionID() }),
    ({ entryID, collectionID }) => getContentOptions(entryID, collectionID)
  );
  const [channels] = createResource(listChannels);
  // The host keeps the view when another entry opens, so an old choice falls back to the entry.
  const selected = () => options()?.find(({ value }) => value === content()) ?? options()?.[0];
  const latest = () => jobs()?.find(({ id }) => id === startedID());
  const running = () => latest()?.state === "running";
  const channelOptions = () => [
    { value: DRAFT, label: "Current draft" },
    ...(channels() ?? []).map(({ code, name }) => ({ value: code, label: name }))
  ];
  const download = (url: string) => {
    openURL(url).catch((error: Error) => setFailure(error.message));
  };
  const exportPDF = async () => {
    const option = selected();

    if (!option) return;

    setStarting(true);
    setFailure(null);

    try {
      const job = await startExport({
        ...option.request,
        channel: channel() === DRAFT ? null : channel()
      });

      addJob(job);
      setStartedID(job.id);
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Stack gap="medium">
      <Setting label="Content" description="The entry or the collection that the PDF holds">
        <Show when={options()} fallback={<Skeleton class="h-7" />}>
          {(loaded) => (
            <Select
              value={selected()?.value}
              options={loaded().map(({ value, label }) => ({ value, label }))}
              disabled={running()}
              onChange={setContent}
            />
          )}
        </Show>
      </Setting>
      <Setting label="Version" description="The current draft, or the copy on a channel">
        <Select
          value={channel()}
          options={channelOptions()}
          disabled={running()}
          onChange={setChannel}
        />
      </Setting>
      <Stack direction="row" gap="small">
        <Show when={latest()}>
          {(job) => <LatestExport job={job()} entryID={props.entryID} onDownload={download} />}
        </Show>
        <Button
          variant="primary"
          class="flex-1"
          loading={starting()}
          disabled={running() || !options()}
          onClick={() => {
            void exportPDF();
          }}
        >
          Export PDF
        </Button>
      </Stack>
      <Show when={failure()}>{(message) => <Callout tone="danger">{message()}</Callout>}</Show>
      <Navigation
        sections={NAVIGATION}
        selected={props.pageID}
        onSelect={(id) => {
          void openPage(id, { entryID: props.entryID });
        }}
      />
    </Stack>
  );
};
