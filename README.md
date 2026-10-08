# Andesine extensions

The registry of Andesine extensions. Each extension's source lives in this repository; CI builds
reviewed commits and publishes the registry that Andesine instances read:

- Registry index: `https://extensions.andesine.app/index.json` (the instance setting
  `EXTENSIONS_REGISTRY_URL`)
- Artifacts: `https://extensions.andesine.app/extensions/<scope>/<name>/<version>/`

## Layout

```
extensions/<scope>/<name>/    An extension project, created with `npx andesine extensions init`
  andesine.config.ts          The manifest; `name` must be `<scope>/<name>`
  andesine.keys.json          The backend's public keys and revoked key IDs
  andesine.registry.json      { "publisher": { "name": "…", "url": "https://…" } }
  package.json
  package-lock.json           Required: CI installs locked dependencies only
  src/
registry/revocations.json     Revoked versions (permanent)
```

## Publish a version

1. Develop the extension against a local Andesine stack with `npm run dev` (see the
   `andesine` CLI).
2. Set the backend URL to its HTTPS deployment and add a backend key with
   `npx andesine extensions keys generate`. Keep the private key on the backend's server; only
   public keys are committed.
3. Increase `version` in `andesine.config.ts` and open a pull request to the `andesine` branch.
   Every change is reviewed, including changes that keep the permissions.

CI checks the pull request with `andesine extensions registry check`:

- the manifest, with the same rules as Andesine instances (HTTPS backend and request URLs,
  permissions, contributions, configuration);
- the keys: manifest keys are current keys, published keys never change, and revoked keys stay
  revoked;
- the versions: a new version is newer than every published one; a published version cannot
  change, and must rebuild to the same styles as its published styles artifact;
- revocations: they are permanent and name existing versions and available replacements;
- published extensions are never removed (revoke their versions instead).

After the merge, CI builds the extensions from the merged commit, writes the new versions next
to the published ones (they are never overwritten), writes the index last, and deploys the
site. Source changes without a new version are not published.

## Keys

Keys belong to the extension, not to a version, so key changes need no new version. To rotate a
key, add the new key (`keys generate`), deploy the backend with its private key, then remove the
old key in a second pull request (`keys revoke <kid>`). In an emergency, revoke the key at once;
instances reject it on their next registry refresh.

## Revoke a version

Add a record to `registry/revocations.json`:

```json
[
  {
    "name": "acme/publish",
    "version": "1.2.0",
    "reason": "Sends drafts to the wrong channel",
    "replacement": "1.2.1",
    "recordedAt": "2026-10-08T12:00:00Z"
  }
]
```

Instances move installations to the replacement, or disable them when there is none. Publish
the replacement version before or with the revocation.

## Setup

- GitHub Pages: source "GitHub Actions", custom domain `extensions.andesine.app` (DNS `CNAME`
  to `vriteio.github.io`), HTTPS enforced.
- The `gh-pages` branch keeps every published file; CI creates it on the first publish. Do not
  edit it by hand.
- `ANDESINE_CLI_VERSION` in the workflows pins the CLI that checks and builds the registry.
