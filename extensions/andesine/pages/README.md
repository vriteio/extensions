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

The backend (`https://pages.extensions.andesine.app`) that builds and serves the sites is not in
this repository. `src/shared` holds the site configuration, types, and constants that the panel
and the backend share.

## Commands

- `npm run build` — validate the manifest and build the views into `dist/`.
- `npm run check` — type check, lint, and format check the extension.
