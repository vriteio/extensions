import * as z from "zod";
import type { SiteDomain } from "../shared/types";

interface Site {
  id: string;
  collectionID: string;
  channel: string;
  subdomain: string;
  /** The Pages template version that builds the site. */
  templateVersion: string;
  /** The managed publishable key that builds and browsers use. */
  keyID: string;
  publicKey: string;
  config: SiteConfig;
  domains?: SiteDomain[];
  /** Whether custom domains were served at the last change; plans can turn them off. */
  customDomainsServed?: boolean;
  createdAt: string;
  updatedAt: string;
}
/** The settings that site URLs depend on. */
interface SitesEnv {
  SITES_DOMAIN: string;
  SITES_DEV_PORT?: string;
}

type SiteConfig = z.output<typeof siteConfigSchema>;

/** Template versions that hosted builds have an image for; the last one is the latest. */
const TEMPLATE_VERSIONS = ["0.7.0", "0.8.0"];
const LATEST_TEMPLATE_VERSION = TEMPLATE_VERSIONS[TEMPLATE_VERSIONS.length - 1];
// The first template with `poweredBy`; older ones reject unknown config keys.
const POWERED_BY_TEMPLATE_VERSION = "0.8.0";
const SOURCE_ID = "docs";
const DEFAULT_API_URL = "https://api.andesine.app";
/** Subdomains of the sites domain that sites can't take. */
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "sites",
  "status",
  "docs",
  "help"
]);
const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z\d](?:[a-z\d-]{1,38}[a-z\d])$/,
    "Use 3–40 letters, digits, or hyphens, not at the ends"
  )
  .refine((subdomain) => !RESERVED_SUBDOMAINS.has(subdomain), "This subdomain is reserved");
// The rules of the template's configuration schema, limited to what hosted sites allow: files
// are HTTPS URLs, and the site, base, sources, and sections are set by the extension.
const httpsURLSchema = z.url({ protocol: /^https$/, error: "Use an https:// URL" }).max(2000);
/** `upload:<sha256>.<ext>`: an image uploaded to the site, written next to the config in builds. */
const UPLOAD_REF_PATTERN = /^upload:([a-f\d]{64}\.(?:png|jpg|webp|svg|ico))$/;
const imageSchema = z.union([
  httpsURLSchema,
  z.string().regex(UPLOAD_REF_PATTERN, "Upload the image again")
]);
const iconSchema = z
  .string()
  .regex(
    /^i-(?:lucide|tabler|simple-icons):[\w-]+$/,
    "Use a Lucide, Tabler, or Simple Icons class, e.g. i-lucide:book"
  );
const colorSchema = z.string().regex(/^#[\da-f]{6}$/i, "Use a hex colour, e.g. #ff3617");
const textSchema = z.string().trim().min(1).max(100);
const linkSchema = z
  .object({ label: textSchema, href: z.string().trim().min(1).max(2000), icon: iconSchema })
  .strict();
const siteConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(300).optional(),
    language: z.string().trim().min(2).max(35).default("en"),
    logo: z
      .object({
        src: imageSchema,
        format: z.enum(["icon", "full"]).default("icon"),
        alt: textSchema.optional(),
        title: z.boolean().default(true)
      })
      .strict()
      .optional(),
    favicon: imageSchema.optional(),
    brand: z
      .object({ primary: colorSchema, secondary: colorSchema, tertiary: colorSchema })
      .strict()
      .default({ primary: "#ff3617", secondary: "#f88f52", tertiary: "#fc6335" }),
    links: z.array(linkSchema).max(10).default([]),
    cta: linkSchema.extend({ icon: iconSchema.optional() }).strict().optional(),
    socialLinks: z.array(linkSchema).max(10).default([]),
    pageActions: z
      .union([
        z.literal(false),
        z.object({ openIn: z.array(z.enum(["chatgpt", "claude", "perplexity"])).max(3) }).strict()
      ])
      .default({ openIn: ["chatgpt", "claude"] }),
    agents: z
      .object({ instructions: z.string().trim().min(1).max(4000).optional() })
      .strict()
      .default({}),
    social: z
      .object({
        image: imageSchema.optional(),
        generate: z.boolean().default(true),
        background: imageSchema.optional()
      })
      .strict()
      .default({ generate: true }),
    /** AI answers in search; they use the workspace's AI credits. */
    answers: z.boolean().default(false)
  })
  .strict();

/** The origin of a site host: HTTPS, or local HTTP with the sites Worker's port in development. */
const toSiteOrigin = (env: SitesEnv, host: string): string => {
  return env.SITES_DEV_PORT ? `http://${host}:${env.SITES_DEV_PORT}` : `https://${host}`;
};
const getDefaultHost = (env: SitesEnv, site: Pick<Site, "subdomain">): string => {
  return `${site.subdomain}.${env.SITES_DOMAIN}`;
};
/** Custom domains are a Pro feature; instances without billing report pro. */
const hasCustomDomains = (plan: string): boolean => plan !== "free";
/** Whether a template version is `minimum` or newer, e.g. for a config key it added. */
const isTemplateAtLeast = (version: string, minimum: string): boolean => {
  const [current, required] = [version, minimum].map((value) => value.split(".").map(Number));

  for (let index = 0; index < 3; index += 1) {
    if (current[index] !== required[index]) return current[index] > required[index];
  }

  return true;
};
/** Free sites credit Andesine Pages in the navigation; Pro removes the credit. */
const showsPoweredBy = (plan: string): boolean => plan === "free";
/** The custom domains that serve the site: active ones, when the plan has custom domains. */
const getServedDomains = (site: Pick<Site, "domains">, customDomains: boolean): SiteDomain[] => {
  return customDomains ? (site.domains ?? []).filter(({ status }) => status === "active") : [];
};
/** The primary custom domain when it serves the site, else the default subdomain. */
const getSiteURL = (
  env: SitesEnv,
  site: Pick<Site, "subdomain" | "domains">,
  customDomains: boolean
): string => {
  const primary = getServedDomains(site, customDomains).find(({ primary }) => primary);

  return toSiteOrigin(env, primary?.hostname ?? getDefaultHost(env, site));
};
/** The default host and the custom domains that serve the site; all serve the live build. */
const getSiteHosts = (env: SitesEnv, site: Site, customDomains: boolean): string[] => {
  const domains = getServedDomains(site, customDomains);

  return [getDefaultHost(env, site), ...domains.map(({ hostname }) => hostname)];
};
/** The origins of the site's key: the hosts that serve the site. */
const getSiteOrigins = (env: SitesEnv, site: Site, customDomains: boolean): string[] => {
  return getSiteHosts(env, site, customDomains).map((host) => toSiteOrigin(env, host));
};
const createSiteConfig = (name: string): SiteConfig => siteConfigSchema.parse({ name });
/** The uploaded file of an image value, e.g. `<sha256>.png`, or null for a URL. */
const getUploadFile = (value?: string): string | null => {
  return (value && UPLOAD_REF_PATTERN.exec(value)?.[1]) ?? null;
};
/** The uploaded files that the configuration uses. */
const getUploadFiles = (config: SiteConfig): string[] => {
  const files = [
    config.logo?.src,
    config.favicon,
    config.social.image,
    config.social.background
  ].map(getUploadFile);

  return [...new Set(files.filter((file): file is string => Boolean(file)))];
};
const toImagePath = (value: string): string => {
  const file = getUploadFile(value);

  return file ? `./uploads/${file}` : value;
};
/** The configuration of `@andesine/pages` for a site: its config, URL, and Andesine source. */
const toPagesConfig = (
  site: Site,
  siteURL: string,
  apiURL: string,
  poweredBy: boolean
): Record<string, unknown> => {
  const { answers, ...config } = site.config;

  return {
    ...config,
    ...(isTemplateAtLeast(site.templateVersion, POWERED_BY_TEMPLATE_VERSION) && { poweredBy }),
    ...(config.logo && { logo: { ...config.logo, src: toImagePath(config.logo.src) } }),
    ...(config.favicon && { favicon: toImagePath(config.favicon) }),
    social: {
      ...config.social,
      ...(config.social.image && { image: toImagePath(config.social.image) }),
      ...(config.social.background && { background: toImagePath(config.social.background) })
    },
    site: siteURL,
    sources: [
      {
        id: SOURCE_ID,
        type: "andesine",
        collection: site.collectionID,
        ...(site.channel !== "published" && { channel: site.channel }),
        ...(apiURL !== DEFAULT_API_URL && { apiURL }),
        publicKey: site.publicKey,
        answers
      }
    ]
  };
};
/** `andesine.config.ts` for self-hosting with the site's template version. */
const createConfigFile = (
  site: Site,
  siteURL: string,
  apiURL: string,
  poweredBy: boolean
): string => {
  const config = JSON.stringify(toPagesConfig(site, siteURL, apiURL, poweredBy), null, 2);

  return [
    `// Andesine Pages template ${site.templateVersion}: create the site with`,
    `// \`npx andesine@${site.templateVersion} pages init\`, then replace its andesine.config.ts with this file.`,
    `// The publishable key reads only published content; it works on the site's origins and localhost.`,
    ...(getUploadFiles(site.config).length
      ? [`// Put the uploaded images, e.g. the logo, into ./uploads under the names below.`]
      : []),
    `import { defineConfig } from "@andesine/pages";`,
    "",
    `export default defineConfig(${config});`,
    ""
  ].join("\n");
};

export {
  SOURCE_ID,
  LATEST_TEMPLATE_VERSION,
  subdomainSchema,
  siteConfigSchema,
  createSiteConfig,
  getUploadFiles,
  getDefaultHost,
  getSiteURL,
  getSiteHosts,
  getSiteOrigins,
  getServedDomains,
  hasCustomDomains,
  showsPoweredBy,
  createConfigFile
};
export type { Site, SiteConfig, SiteDomain };
