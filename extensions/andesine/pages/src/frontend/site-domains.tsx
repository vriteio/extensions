import {
  Badge,
  Button,
  Callout,
  Code,
  Dialog,
  IconButton,
  Input,
  Item,
  ItemDetails,
  Section,
  Setting,
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
  onAction(action: string, hostname: string | null): Promise<void>;
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

/** The DNS records of a domain that isn't active yet, with whether DNS answers with each one. */
const DomainRecords = (props: Omit<DomainItemProps, "available">) => (
  <Stack gap="small">
    <Text size="sm" tone="muted">
      Add these records at your DNS provider; the domain is checked while this page is open:
    </Text>
    <For each={props.domain.records}>
      {(record) => (
        <Stack direction="row" gap="small" align="center">
          <Text size="xs">
            <Code>{record.type}</Code> <Code>{record.name}</Code> → <Code>{record.value}</Code>
          </Text>
          <Show
            when={record.found}
            fallback={
              <Badge icon="i-lucide:clock" tone="muted">
                Not found yet
              </Badge>
            }
          >
            <Badge icon="i-lucide:check" tone="success">
              Found
            </Badge>
          </Show>
        </Stack>
      )}
    </For>
    <Text size="xs" tone="muted">
      For a root domain (example.com), use your provider's CNAME flattening or ALIAS record.
    </Text>
    {/* Until the records resolve, Cloudflare's errors only repeat that they're missing. */}
    <Show when={props.domain.records.every(({ found }) => found)}>
      <For each={props.domain.errors}>
        {(error) => (
          <Text size="xs" tone="danger">
            {error}
          </Text>
        )}
      </For>
    </Show>
    <Show when={props.canManage && props.domain.validation === "http"}>
      <Text size="xs" tone="muted">
        Domain behind its own proxy, or a CAA record?{" "}
        <Button
          size="small"
          variant="link"
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
      <ItemDetails open={isWaiting()}>
        <Show
          when={isWaiting()}
          fallback={
            <Text size="sm" tone="muted">
              {props.available
                ? `Serves the site at https://${props.domain.hostname}`
                : "Serves the site again after an upgrade to Pro"}
            </Text>
          }
        >
          <DomainRecords {...props} />
        </Show>
        <Show when={props.canManage}>
          <Stack direction="row" gap="small" justify="end">
            <Show when={canMakePrimary()}>
              <Button
                size="small"
                disabled={props.busy}
                onClick={() => props.onAction("primary-domain", props.domain.hostname)}
              >
                Make primary
              </Button>
            </Show>
            <Button
              size="small"
              variant="danger"
              disabled={props.busy}
              onClick={() => props.onAction("remove-domain", props.domain.hostname)}
            >
              Remove domain
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
  const change = async (action: string, hostname: string | null) => {
    await props.status.run<{ site: SiteView }>(action, { hostname }, (result) =>
      props.status.update({ site: result.site })
    );

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
              onAction={change}
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
          <Button
            size="small"
            variant="link"
            disabled={props.status.busy()}
            onClick={() => change("primary-domain", null)}
          >
            Use the andesine.page address as primary
          </Button>
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
