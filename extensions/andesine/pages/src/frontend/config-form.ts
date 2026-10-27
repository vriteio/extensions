import type { SiteConfig } from "../backend/site";

type FormState = ReturnType<typeof fromConfig>;

const optional = (value: string): string | undefined => value.trim() || undefined;
const fromConfig = (config: SiteConfig) => ({
  name: config.name,
  description: config.description ?? "",
  language: config.language,
  logoSrc: config.logo?.src ?? "",
  logoFormat: config.logo?.format ?? "icon",
  logoAlt: config.logo?.alt ?? "",
  logoTitle: config.logo?.title ?? true,
  favicon: config.favicon ?? "",
  brand: { ...config.brand },
  links: config.links.map((link) => ({ ...link })),
  cta: {
    label: config.cta?.label ?? "",
    href: config.cta?.href ?? "",
    icon: config.cta?.icon ?? ""
  },
  socialLinks: config.socialLinks.map((link) => ({ ...link })),
  pageActions: config.pageActions !== false,
  openIn: config.pageActions === false ? ["chatgpt", "claude"] : [...config.pageActions.openIn],
  socialGenerate: config.social.generate,
  socialImage: config.social.image ?? "",
  socialBackground: config.social.background ?? "",
  instructions: config.agents.instructions ?? "",
  answers: config.answers
});
/** Empty optional fields are left out; the backend checks the rest. */
const toConfig = (state: FormState): Record<string, unknown> => ({
  name: state.name,
  description: optional(state.description),
  language: state.language,
  logo: optional(state.logoSrc) && {
    src: state.logoSrc.trim(),
    format: state.logoFormat,
    alt: optional(state.logoAlt),
    title: state.logoTitle
  },
  favicon: optional(state.favicon),
  brand: state.brand,
  links: state.links,
  cta: optional(state.cta.label) && {
    label: state.cta.label,
    href: state.cta.href,
    icon: optional(state.cta.icon)
  },
  socialLinks: state.socialLinks,
  pageActions: state.pageActions && { openIn: state.openIn },
  agents: { instructions: optional(state.instructions) },
  social: {
    generate: state.socialGenerate,
    image: optional(state.socialImage),
    background: optional(state.socialBackground)
  },
  answers: state.answers
});

export { fromConfig, toConfig };
