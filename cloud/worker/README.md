# Fish Logger Cloud API

This Cloudflare Worker is the controlled gateway to the production cloud
storage:

- D1 binding `FISH_DB` points to `fish-logger-prod-data`.
- R2 binding `FISH_MEDIA` points to `fish-logger-prod-media`.
- `FISH_API_TOKEN` is a Worker secret and is required by every `/api/*`
  request. The public `/health` route only tests the D1 binding.

The Worker does not yet replace the Flask production routes. It is deployed and
verified separately first; migration of existing SQLite data and media happens
only after a backup and explicit cutover.

## GitLab deployment

The self-hosted GitLab pipeline supplies:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`

The deployment job renders the non-secret D1 UUID into a generated Wrangler
configuration, applies pending D1 migrations, and deploys the Worker. R2 and D1
are accessed through bindings; their storage credentials are never placed in
the Worker or browser.

Before enabling data routes, set `FISH_API_TOKEN` as an encrypted Worker
secret in Cloudflare. Do not add it as a plain Wrangler variable or commit it.
