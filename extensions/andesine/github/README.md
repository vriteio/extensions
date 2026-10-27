# GitHub Sync

Syncs an Andesine collection with Markdown or MDX files in a GitHub repository, through a
publishing channel:

- **GitHub → Andesine:** a push to the mapped branch creates entries for new files, writes changed
  files to their drafts, and publishes them to the channel in one snapshot. When a draft was
  edited in Andesine since the channel's version, the draft is kept and the file becomes a
  version on the channel instead. Deleted files are unpublished.
- **Andesine → GitHub:** a publish to the channel commits the changed entries in one commit.
  Commits made by the sync carry an `Andesine-Sync:` trailer, so their pushes don't sync back.

Files stay standard: the title and properties are frontmatter, keyed by the properties' API keys
(unique even when labels repeat), elements are MDX components, and links between files use file
paths or site URLs. What standard files can't hold (fragment boundaries, property positions and
labels) is kept in `.andesine/sync.json` at the repository root, which only the sync writes.
Folders are collections named after their `index` file's title, `index` files are `index`
entries, and frontmatter `order` sets positions.

The first sync of a mapping links files to the entries and collections that already exist, by
folder and name, and the setup shows how many match. For matched files, the setup's choice keeps
GitHub's files (they become the entries' content) or Andesine's entries (they overwrite the
files). Disabling the sync keeps these links, so a new mapping of the same repository, branch,
and directory doesn't create entries again.

Images are committed in their upload's format (PNG or JPEG; WebP uploads stay WebP) or as WebP,
named after the uploaded file, in one directory or next to their entries. Files link images by
file paths, or, for a directory that the site serves, by site paths, e.g. `/images/a.png` for a
`public/images` directory served at `/images`.

## Layout

- `andesine.config.ts` — the manifest: the “GitHub Sync” right panel and the “Setup”, “Mapping
  settings”, and “Sync details” pages for collections, the backend, and the
  `publishing.channel_advanced` webhook. They work on the nearest collection with publishing on,
  the open one or one around it.
- `src/sync` — the conversion library: files to and from Andesine content, links, images,
  fragment anchors, and the plans of a push or a publish. It has no network or runtime APIs.
- `src/backend` — the Cloudflare Worker: the GitHub App, the panel routes (each change is checked
  for the member with `verifySession` checks), and one Durable Object per repository that runs
  its syncs one at a time and retries them.
- `src/frontend` — the panel, which sums up the sync and links the page, and the page: connect
  GitHub and map the collection (“Setup” and “Mapping settings”), and see the last syncs and
  disable the sync (“Sync details”).
- `fixtures` and `scripts/check-sync.ts` — `npm run check:sync` runs the template docs through an
  import and an export and compares the result with `fixtures/expected`
  (`npm run check:sync -- --write` updates it after a reviewed change).

## Known limits

- Code block titles (` ```ts title="…" `) are not kept; Andesine code blocks have a language only.
- Inline JSX elements (in a paragraph) are not supported by the converters; such files are skipped
  and listed on the “Sync details” page.
- Boolean JSX props are written as `prop={true}`.
- Images are uploaded as PNG, JPEG, or WebP; other image files are skipped.

## GitHub App

Create a GitHub App (in the organization that owns it):

- **Callback URL:** `https://<backend>/github/setup`, with **Request user authorization (OAuth)
  during installation** turned on. The callback checks that the person can access the
  installation, so a link can't connect someone else's installation.
- **Webhook URL:** `https://<backend>/github/webhooks`, with a webhook secret.
- **Permissions:** Contents (read and write), Metadata (read). **Events:** Push.

Put its ID, URL name (slug), and client ID in `wrangler.jsonc` (`GITHUB_APP_ID`,
`GITHUB_APP_SLUG`, `GITHUB_CLIENT_ID`).

## Deploy

1. Create the KV namespace (`npx wrangler kv namespace create INSTALLATIONS`) and put its ID in
   `wrangler.jsonc`.
2. Set the secrets with `npx wrangler secret put <name>`: `ANDESINE_EXTENSION_KEY` (the private
   key from `andesine extensions keys generate`), `GITHUB_APP_PRIVATE_KEY` (PEM),
   `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, and `STATE_SECRET` (32 or more random
   characters; it signs install links and the backend's storage records).
3. `npm run deploy`.

## Local setup

1. Create a GitHub App for development as above, and put its values in `.env` (from
   `.env.example`). The private key goes on one line, with `\n` for line breaks.
2. On the local Andesine stack, enable extensions development (see the `andesine` CLI).
3. Run `npm run tunnel` in its own terminal, and keep it running. It tunnels to the backend's
   port and prints the URLs to set as the App's callback and webhook URLs. `TUNNEL_DOMAIN` in
   `.env` uses a fixed ngrok domain, so the URLs stay the same; without it, a cloudflared quick
   tunnel gets a new URL on each start of the tunnel.
4. Run `npm run dev` in another terminal. It runs the extension, waits for the development key,
   then starts the backend (wrangler dev on port 8787); restart it as needed, the tunnel and the
   App's URLs stay. With a local build of the CLI, set `ANDESINE_CLI` to its `cli.js`.
