/** The site configuration that the panel edits and the backend checks. */
import * as z from "zod";

type SiteConfig = z.output<typeof siteConfigSchema>;

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
// Like the template: site paths, entry: links, and http(s), mailto, and tel URLs only.
const hrefSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((href) => {
    try {
      const { protocol } = new URL(href, "https://example.com");

      return href.startsWith("entry:") || ["http:", "https:", "mailto:", "tel:"].includes(protocol);
    } catch {
      return false;
    }
  }, "Use a URL, a site path, or an entry: link");
const linkSchema = z.object({ label: textSchema, href: hrefSchema, icon: iconSchema }).strict();
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
    answers: z.boolean().default(false),
    /** The "Powered by Andesine" credit; only Pro sites can turn it off. */
    poweredBy: z.boolean().default(true)
  })
  .strict();

export { UPLOAD_REF_PATTERN, siteConfigSchema };
export type { SiteConfig };
