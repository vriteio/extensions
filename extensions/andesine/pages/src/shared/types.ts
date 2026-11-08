/** Types that the panel and the backend share; no runtime code, so both type checks can read them. */

/** A DNS record that the domain's owner adds. */
interface DNSRecord {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  /** Whether DNS answers with the record yet; checked while the domain waits. */
  found?: boolean;
}
interface SiteDomain {
  hostname: string;
  customHostnameID: string;
  status: "pending" | "active" | "failed";
  records: DNSRecord[];
  errors: string[];
  /** The canonical URL of the site: its sitemap and links use it. */
  primary: boolean;
  /** How the certificate is validated: `http` needs only the CNAME, `txt` adds TXT records. */
  validation?: DomainValidation;
}
interface BuildRecord {
  id: string;
  status: "building" | "live" | "failed" | "replaced";
  trigger: BuildTrigger;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  /** The last lines of a failed build's log. */
  log: string[];
  files: number;
}
interface BuildStatus {
  builds: BuildRecord[];
  /** A build is asked for and starts soon. */
  pending: boolean;
  /** The ID of the build that the site shows. */
  live: string | null;
}

/** The pages of a site's live build by entry ID, from the map that the template writes for search. */
interface EntryPages {
  buildID: string | null;
  /** Entry ID → the path of its page, e.g. `/guides/setup/`; pages hidden from search are left out. */
  pages: Record<string, string>;
}

type DomainValidation = "http" | "txt";
type BuildTrigger = "created" | "settings" | "template" | "publish" | "rebuild";

export type {
  DNSRecord,
  SiteDomain,
  BuildRecord,
  BuildStatus,
  EntryPages,
  DomainValidation,
  BuildTrigger
};
