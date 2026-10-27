import {
  Badge,
  Button,
  Callout,
  Code,
  IconButton,
  Input,
  Section,
  Setting,
  Stack,
  Text
} from "@andesine/extensions/solid";
import { createSignal, For, onMount, Show } from "solid-js";
import { MAX_DOMAINS } from "../shared/constants";
import type { SiteDomain, SiteView } from "./api";
import type { StatusBadge } from "./site-builds";
import { SiteFrame, type SitePageProps } from "./site-frame";
import type { SiteStatus } from "./site-status";

interface DomainsSectionProps {
  site: () => SiteView;
  status: SiteStatus;
}
interface SiteDomainsProps {
  domains: SiteDomain[];
  /** The workspace's plan has custom domains; without it, they are listed but don't serve. */
  available: boolean;
  canManage: boolean;
  busy: boolean;
  onAction(action: string, hostname: string | null): void;
}

// As the app's webhook delivery states: the icon's color is the status.
const STATUSES: Record<SiteDomain["status"], StatusBadge> = {
  pending: {
    label: "Waiting for DNS",
    icon: "i-lucide:clock",
    tone: "primary"
  },
  active: { label: "Active", icon: "i-lucide:circle-check", tone: "success" },
  failed: { label: "Failed", icon: "i-lucide:circle-alert", tone: "danger" }
};

/** Custom domains: the DNS records to add, the state of each domain, and the primary one. */
const SiteDomains = (props: SiteDomainsProps) => {
  const [hostname, setHostname] = createSignal("");

  return (
    <Stack gap="small">
      <For each={props.domains}>
        {(domain) => (
          <Stack gap="small">
            <Stack direction="row" gap="small" align="center" justify="between">
              <Stack direction="row" gap="small" align="center">
                <Text weight="medium">{domain.hostname}</Text>
                <Show
                  when={props.available}
                  fallback={
                    <Badge icon="i-lucide:lock" tone="muted">
                      Needs Pro
                    </Badge>
                  }
                >
                  <Badge icon={STATUSES[domain.status].icon} tone={STATUSES[domain.status].tone}>
                    {STATUSES[domain.status].label}
                  </Badge>
                </Show>
                <Show when={domain.primary}>
                  <Badge icon="i-lucide:star" tone="primary">
                    Primary
                  </Badge>
                </Show>
              </Stack>
              <Show when={props.canManage}>
                <Stack direction="row" gap="small" align="center">
                  <Show when={props.available && domain.status === "active" && !domain.primary}>
                    <Button
                      size="small"
                      variant="ghost"
                      disabled={props.busy}
                      onClick={() => props.onAction("primary-domain", domain.hostname)}
                    >
                      Make primary
                    </Button>
                  </Show>
                  <IconButton
                    icon="i-lucide:trash"
                    label="Remove domain"
                    disabled={props.busy}
                    onClick={() => props.onAction("remove-domain", domain.hostname)}
                  />
                </Stack>
              </Show>
            </Stack>
            <Show when={props.available && domain.status !== "active"}>
              <Text size="sm" tone="muted">
                Add these records at your DNS provider:
              </Text>
              <For each={domain.records}>
                {(record) => (
                  <Text size="xs">
                    <Code>{record.type}</Code> <Code>{record.name}</Code> →{" "}
                    <Code>{record.value}</Code>
                  </Text>
                )}
              </For>
              <For each={domain.errors}>
                {(error) => (
                  <Text size="xs" tone="danger">
                    {error}
                  </Text>
                )}
              </For>
            </Show>
          </Stack>
        )}
      </For>
      <Show when={!props.available}>
        <Callout title="Custom domains need the Pro plan">
          Upgrade the workspace to serve the site from your own domains. Listed domains serve again
          after an upgrade.
        </Callout>
      </Show>
      <Show when={props.available && props.canManage && props.domains.length < MAX_DOMAINS}>
        <Stack direction="row" gap="small" align="center">
          <Input value={hostname()} placeholder="docs.example.com" code onInput={setHostname} />
          <Button
            size="small"
            disabled={!hostname() || props.busy}
            onClick={() => {
              props.onAction("add-domain", hostname());
              setHostname("");
            }}
          >
            Add domain
          </Button>
        </Stack>
      </Show>
      <Show when={props.available && props.domains.some(({ primary }) => primary)}>
        <Button
          size="small"
          variant="link"
          disabled={props.busy}
          onClick={() => props.onAction("primary-domain", null)}
        >
          Use the andesine.page address as primary
        </Button>
      </Show>
    </Stack>
  );
};

/** The custom domains of the site; domains that wait for DNS are checked when it shows. */
const DomainsSection = (props: DomainsSectionProps) => {
  const change = (action: string, hostname: string | null) => {
    return props.status.run<{ site: SiteView }>(action, { hostname }, (result) =>
      props.status.update({ site: result.site })
    );
  };

  onMount(() => {
    if (props.site().domains.some(({ status }) => status === "pending")) {
      void change("refresh-domains", null);
    }
  });

  return (
    <Section title="Custom domains">
      <Setting
        label="Domains"
        description="Point a domain to the site; the primary one is in canonical links"
      />
      <SiteDomains
        domains={props.site().domains}
        available={props.status.loaded()?.customDomains ?? false}
        canManage={props.status.loaded()?.canManage ?? false}
        busy={props.status.busy()}
        onAction={change}
      />
    </Section>
  );
};

export const SiteDomainsPage = (props: SitePageProps) => (
  <SiteFrame {...props}>
    {(site, status) => <DomainsSection site={site} status={status} />}
  </SiteFrame>
);
