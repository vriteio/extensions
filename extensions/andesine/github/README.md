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
- The backend (`https://github.extensions.andesine.app`) runs the GitHub App and the syncs with
  `src/sync`; it is not in this repository.
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
