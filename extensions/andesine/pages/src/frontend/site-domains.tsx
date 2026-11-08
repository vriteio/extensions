import {
  Badge,
  Box,
  Button,
  Callout,
  copyText,
  Dialog,
  IconButton,
  Input,
  Item,
  ItemDetails,
  Section,
  Setting,
  Spinner,
  Stack,
  Text
} from "@andesine/extensions/solid";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { MAX_DOMAINS } from "../shared/constants";
import { callBackend, type SiteDomain, type SiteView } from "./api";
import { EmptyState } from "./empty-state";
import type { StatusBadge } from "./site-builds";
import { SiteFrame, type SitePageProps } from "./site-frame";
import type { SiteStatus } from "./site-status";

interface DomainsSectionProps {
  site: () => SiteView;
  status: SiteStatus;
}
interface DomainItemProps {
  domain: SiteDomain;
  /** The workspace's plan has custom domains; without it, they are listed but don't serve. */
  available: boolean;
  canManage: boolean;
  busy: boolean;
  /** The running action of this domain, for its button's spinner. */
  pending: string | null;
  /** A check that the member started runs. */
  checking: boolean;
  onAction(action: string, hostname: string | null): Promise<void>;
  onCheck(): void;
}
interface RecordValueProps {
  label: string;
  value: string;
}
interface AddDomainDialogProps {
  adding: boolean;
  /** Resolves whether the domain was added; the dialog stays open after an error. */
  onAdd(hostname: string): Promise<boolean>;
  onClose(): void;
}

// Waiting domains are checked this often, for as long as this; DNS changes usually show in minutes.
const REFRESH_INTERVAL = 10_000;
const REFRESH_DURATION = 10 * 60_000;

// As the app's webhook delivery states: the icon's color is the status.
const STATUSES: Record<SiteDomain["status"], StatusBadge> = {
  pending: { label: "Waiting for DNS", icon: "i-lucide:clock", tone: "primary" },
  active: { label: "Active", icon: "i-lucide:circle-check", tone: "success" },
  failed: { label: "Failed", icon: "i-lucide:circle-alert", tone: "danger" }
};
const NEEDS_PRO: StatusBadge = { label: "Needs Pro", icon: "i-lucide:lock", tone: "muted" };

/** A record's name or value, wrapped anywhere, with a copy button; a hover highlights the value. */
const RecordValue = (props: RecordValueProps) => (
  <Stack
    direction="row"
    gap="none"
    align="start"
    class="-mx-1 rounded-md px-1 @hover:bg-gradient-to-r @hover:from-gray-500/5 @hover:to-transparent"
  >
    <Text class="min-w-0 flex-1 font-mono text-xs leading-6 [overflow-wrap:anywhere]">
      {props.value}
    </Text>
    {/* Gray on gray: darker than the ghost button's own hover, so it shows on the table. */}
    <IconButton
      icon="i-lucide:copy"
      label={`Copy ${props.label}`}
      size="small"
      class="mt-0.5 rounded-md p-[3px] text-gray-500 @hover:bg-gray-200 focus-visible:bg-gray-200 [&_div]:h-3.5 [&_div]:w-3.5"
      onClick={() => copyText(props.value)}
    />
  </Stack>
);
/** The DNS records of a domain that isn't active yet, with whether DNS answers with each one. */
const DomainRecords = (props: Omit<DomainItemProps, "available">) => (
  <Stack gap="medium">
    {/* While it waits, errors are often from a check before the records resolved. */}
    {/* While it waits, errors are often from a check before the records resolved. */}
    <Show when={props.domain.status === "failed" && props.domain.errors.length}>
      <Callout tone="danger" title="The domain couldn't be verified">
        <For each={props.domain.errors}>{(error) => <Text>{error}</Text>}</For>
      </Callout>
    </Show>
    <Text tone="muted">
      Add these records at your DNS provider; the domain is checked while this page is open.
    </Text>
    <Box
      padding="none"
      background="soft"
      class="grid grid-cols-[auto_1fr_1.5fr_auto] items-start gap-x-3 rounded-xl gap-y-1 px-3 py-2 [&>*]:min-w-0"
    >
      <For each={["Type", "Name", "Value", "Status"]}>
        {(heading) => (
          <Text size="xs" tone="muted">
            {heading}
          </Text>
        )}
      </For>
      <For each={props.domain.records}>
        {(record) => (
          <>
            <Text class="font-mono text-xs leading-6">{record.type}</Text>
            <RecordValue label="name" value={record.name} />
            <RecordValue label="value" value={record.value} />
            {/* The widest badge, hidden, in the same cell keeps the column's width as statuses change. */}
            <Box
              padding="none"
              class="grid justify-items-start [&>*]:col-start-1 [&>*]:row-start-1"
            >
              <Box padding="none" class="invisible">
                <Button
                  size="small"
                  icon="i-lucide:refresh-cw"
                  class="h-6 py-0 !pr-1.5 [&_div]:h-3.5 [&_div]:w-3.5"
                >
                  Not found yet
                </Button>
              </Box>
              {/* As tall as the badge; a click checks the domains at once. */}
              <Show
                when={record.found}
                fallback={
                  <Button
                    size="small"
                    icon="i-lucide:refresh-cw"
                    class="h-6 py-0 !pr-1.5 [&_div]:h-3.5 [&_div]:w-3.5"
                    loading={props.checking}
                    onClick={() => props.onCheck()}
                  >
                    Not found yet
                  </Button>
                }
              >
                <Badge icon="i-lucide:check" tone="success">
                  Found
                </Badge>
              </Show>
            </Box>
          </>
        )}
      </For>
    </Box>
    <Text tone="muted">
      For a root domain (example.com), use your provider's CNAME flattening or ALIAS record.
    </Text>
    <Show when={props.canManage && props.domain.validation === "http"}>
      <Text tone="muted">
        Domain behind its own proxy, or a CAA record?{" "}
        {/* Inline with the text: its size, without the button's padding. */}
        <Button
          size="small"
          variant="link"
          class="px-0 py-0"
          loading={props.pending === "txt-validation"}
          disabled={props.busy}
          onClick={() => props.onAction("txt-validation", props.domain.hostname)}
        >
          Verify with TXT records instead
        </Button>
      </Text>
    </Show>
  </Stack>
);
/** A domain as a row, as builds are: open while it waits, with its records and actions. */
const DomainItem = (props: DomainItemProps) => {
  const status = () => (props.available ? STATUSES[props.domain.status] : NEEDS_PRO);
  const isWaiting = () => props.available && props.domain.status !== "active";
  const canMakePrimary = () => {
    return props.available && props.domain.status === "active" && !props.domain.primary;
  };

  return (
    <Item
      icon={status().icon}
      tone={status().tone}
      label={props.domain.hostname}
      details={props.domain.primary ? [status().label, "Primary"] : [status().label]}
    >
      <Show when={props.canManage}>
        {/* shortcut: IconButton has no loading state in the SDK; add one there when it's released. */}
        <Show
          when={props.pending === "remove-domain"}
          fallback={
            <IconButton
              icon="i-lucide:trash-2"
              label="Remove domain"
              disabled={props.busy}
              onClick={() => props.onAction("remove-domain", props.domain.hostname)}
            />
          }
        >
          <Spinner class="m-1 h-5 w-5 text-gray-400" />
        </Show>
      </Show>
      <ItemDetails open={isWaiting()}>
        <Show
          when={isWaiting()}
          fallback={
            <Text tone="muted">
              {props.available
                ? `Serves the site at https://${props.domain.hostname}`
                : "Serves the site again after an upgrade to Pro"}
            </Text>
          }
        >
          <DomainRecords {...props} />
        </Show>
        <Show when={props.canManage && canMakePrimary()}>
          <Stack direction="row">
            <Button
              size="small"
              loading={props.pending === "primary-domain"}
              disabled={props.busy}
              onClick={() => props.onAction("primary-domain", props.domain.hostname)}
            >
              Make primary
            </Button>
          </Stack>
        </Show>
      </ItemDetails>
    </Item>
  );
};
/** The domain to add; its records show in its row once it's added. */
const AddDomainDialog = (props: AddDomainDialogProps) => {
  const [hostname, setHostname] = createSignal("");
  const add = async () => {
    if (hostname().trim() && (await props.onAdd(hostname()))) props.onClose();
  };

  return (
    <Dialog
      title="Add a domain"
      description="Then point it to the site with a CNAME record at your DNS provider"
      size="small"
      onClose={props.onClose}
    >
      <Stack gap="medium">
        <Input
          value={hostname()}
          placeholder="docs.example.com"
          onInput={setHostname}
          onEnter={() => add()}
        />
        <Stack direction="row" gap="small">
          <IconButton
            icon="i-lucide:x"
            label="Cancel"
            variant="secondary"
            onClick={props.onClose}
          />
          <Button
            variant="primary"
            class="flex-1"
            loading={props.adding}
            disabled={!hostname().trim()}
            onClick={() => add()}
          >
            Add domain
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  );
};

/** The custom domains of the site; domains that wait for DNS are checked while it shows. */
const DomainsSection = (props: DomainsSectionProps) => {
  // Checks since the last change of the domains; the first one runs at once.
  const [checks, setChecks] = createSignal(0);
  const [adding, setAdding] = createSignal(false);
  // The domain whose action runs; `pending` only names the action.
  const [target, setTarget] = createSignal<string | null>(null);
  const [checking, setChecking] = createSignal(false);

  let startedAt = Date.now();

  const domains = () => props.site().domains;
  const available = () => props.status.loaded()?.customDomains ?? false;
  const canManage = () => props.status.loaded()?.canManage ?? false;
  const canAdd = () => available() && canManage() && domains().length < MAX_DOMAINS;
  const isWaiting = () => domains().some(({ status }) => status === "pending");
  // Without the busy state and notifications of actions; the next check tries again.
  const refresh = async () => {
    const result = await callBackend<{ site: SiteView }>("refresh-domains", {
      collectionID: props.status.siteCollectionID()
    }).catch(() => null);

    if (result) props.status.update({ site: result.site });

    setChecks((count) => count + 1);
  };
  // A manual check also restarts the automatic checks, e.g. after they stopped.
  const check = async () => {
    setChecking(true);
    startedAt = Date.now();
    await refresh();
    setChecking(false);
  };
  const change = async (action: string, hostname: string | null) => {
    setTarget(hostname);
    await props.status.run<{ site: SiteView }>(action, { hostname }, (result) =>
      props.status.update({ site: result.site })
    );
    setTarget(null);

    // A new domain, or new records to add, are checked again from now.
    if (action === "add-domain" || action === "txt-validation") {
      startedAt = Date.now();
      setChecks(0);
    }
  };
  const add = async (hostname: string) => {
    await change("add-domain", hostname);

    return domains().some((domain) => domain.hostname === hostname.trim().toLowerCase());
  };

  createEffect(() => {
    const delay = checks() ? REFRESH_INTERVAL : 0;
    const isDue = isWaiting() && Date.now() - startedAt < REFRESH_DURATION;

    if (!isDue) return;

    const timer = setTimeout(() => {
      void refresh();
    }, delay);

    onCleanup(() => clearTimeout(timer));
  });

  return (
    <Section title="Custom domains">
      <Setting
        label="Domains"
        description="Point a domain to the site; the primary one is in canonical links"
      >
        <Show when={canAdd()}>
          <Button
            size="small"
            icon="i-lucide:plus"
            disabled={props.status.busy()}
            onClick={() => setAdding(true)}
          >
            Add domain
          </Button>
        </Show>
      </Setting>
      <Stack gap="small">
        <For
          each={domains()}
          fallback={<EmptyState icon="i-lucide:globe" label="No custom domains yet" />}
        >
          {(domain) => (
            <DomainItem
              domain={domain}
              available={available()}
              canManage={canManage()}
              busy={props.status.busy()}
              pending={target() === domain.hostname ? props.status.pending() : null}
              checking={checking()}
              onAction={change}
              onCheck={() => check()}
            />
          )}
        </For>
        <Show when={!available()}>
          <Callout title="Custom domains need the Pro plan">
            Upgrade the workspace to serve the site from your own domains. Listed domains serve
            again after an upgrade.
          </Callout>
        </Show>
        <Show when={available() && domains().some(({ primary }) => primary)}>
          <Stack direction="row">
            <Button
              size="small"
              loading={props.status.pending() === "primary-domain" && target() === null}
              disabled={props.status.busy()}
              onClick={() => change("primary-domain", null)}
            >
              Use the andesine.page address as primary
            </Button>
          </Stack>
        </Show>
      </Stack>
      <Show when={adding()}>
        <AddDomainDialog
          adding={props.status.pending() === "add-domain"}
          onAdd={add}
          onClose={() => setAdding(false)}
        />
      </Show>
    </Section>
  );
};

export const SiteDomainsPage = (props: SitePageProps) => (
  <SiteFrame {...props}>
    {(site, status) => <DomainsSection site={site} status={status} />}
  </SiteFrame>
);
