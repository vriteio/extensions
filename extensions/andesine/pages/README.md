# Andesine Pages

Element views for the content components of Andesine Pages sites, so their content stays
editable in the editor: `Callout`, `Card` and `CardGrid`, `Accordion`, `Figure`, `Steps`,
`FileTree`, `Tabs` with `Tab`, `CodeGroup`, and `Visibility`. Element names and props match the
element schemas of `@andesine/pages`; required props (a card's title, a figure's caption, a
tab's label) are filled in when an element is inserted, and the views mark them when empty.

The “Site” panel (for a collection) makes the collection a site at `<subdomain>.andesine.page`:
it shows a publishing channel, with a publishable key that the backend manages (read-only, for
the site's origins). The panel edits the site configuration (the template's `andesine.config.ts`
without code: names, logo and favicon URLs, colours, links, page actions, link previews, agent
instructions, and AI answers), pins the template version, downloads `andesine.config.ts` for
self-hosting, and deletes the site. Site creation, settings saves, template updates, “Rebuild”,
and publishes that change the collection build the site; the panel shows the last build (with
the log of a failure) and custom domains with their DNS records.

## Hosting

- `container/` — the build image (one per template version: Node 24, the template, and
  `server.mjs`, which builds with a generated `andesine.config.ts` and serves the output).
- `src/backend/site-builds.ts` — one Durable Object per site: combines triggers within 30
  seconds, builds in the site's container (stopped right after the build), uploads only files
  whose content no kept build has (`sites/<siteID>/files/<sha256>`), writes the build's manifest
  (`sites/<siteID>/builds/<buildID>.json`, path → hash), and only then points every host of the
  site to it (`host:<hostname>` in the `HOSTS` KV namespace). A failed build keeps the live one;
  3 builds are kept, and files that only older builds used are deleted.
- `src/sites` — the `andesine-sites` Worker (`wrangler.sites.jsonc`): one KV read per request,
  manifests in memory, ETags from content hashes (revalidation reads nothing), and files cached
  at the edge by hash; Markdown for `Accept: text/markdown`, the 404 page, and long caching for
  hashed files.
- `src/shared` — the storage layout and types that the backend, the sites Worker, and the panel
  share.
- Custom domains are Cloudflare for SaaS custom hostnames on the `SITES_DOMAIN` zone, validated
  with TXT records; an active domain is added to the host map and the key's origins.

Deployment needs the `andesine.page` zone with Cloudflare for SaaS (fallback origin
`sites.andesine.page`), the R2 bucket `andesine-sites`, the `HOSTS` KV namespace (its ID in both
Wrangler files), Cloudflare Containers, and the secrets `ANDESINE_EXTENSION_KEY`, `STATE_SECRET`,
and `CLOUDFLARE_API_TOKEN` (custom hostnames on that zone only). `npm run deploy` builds and
pushes the container images; `npm run deploy:sites` deploys the sites Worker.

## Backend

`src/backend` is a Cloudflare Worker: the panel routes (each change is checked for the member
with `verifySession` checks), signed site records in extension storage, and a Durable Object
that reserves subdomains across instances. In production, set `ANDESINE_EXTENSION_KEY` and
`STATE_SECRET` with `npx wrangler secret put`.

## Local development

`npm run dev` runs everything in one terminal: `andesine extensions dev`, the backend
(`http://localhost:3010`), the sites Worker (`http://<subdomain>.localhost:8788`), and a build
server on port 8080 in place of containers (no Docker). On the first run, it installs the
Pages template into `.andesine/site`; it creates `.env` from `.env.example` with a state secret,
and starts the backend after `andesine extensions dev` writes the development key.

- Sign in to the instance first: `andesine auth login --base-url <API URL>`.
- An instance with an mkcert certificate is trusted when `mkcert` is installed.
- To use another `andesine` CLI (e.g. a local build), set `ANDESINE_CLI` to its path.
- The instance must allow webhooks to `http://localhost:3010` (local instances: `WEBHOOK_ALLOW_HTTP`
  and `WEBHOOK_DESTINATION_EXCEPTIONS`).

## Commands

- `npm run build` — validate the manifest and build the views into `dist/`.
- `npm run dev` — run the extension, its backend, the sites, and builds locally (see above).
- `npm run deploy` — deploy the backend.
- `npm run check` — type check the frontend and the backend.
