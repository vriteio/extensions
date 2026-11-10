# GitHub Sync

Syncs an Andesine collection with Markdown or MDX files in a GitHub repository, in both
directions, through a publishing channel. For setup and behavior, see
[GitHub Sync](https://andesine.app/docs/publishing/github-sync/).

## Known limits

- Inline JSX elements (in a paragraph) are not supported; such files are skipped and listed on
  the “Sync details” page.
- Boolean JSX props are written as `prop={true}`.
- Images are uploaded as PNG, JPEG, or WebP; other image files are skipped.
