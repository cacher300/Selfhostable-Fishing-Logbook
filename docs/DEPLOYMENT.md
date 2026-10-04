# Deployment

The production site is served by Nginx and proxied to the Docker Compose service
`selfhostable-fishing-logbook` on `127.0.0.1:8081`. Nginx is the public HTTPS and HTTP Basic Auth boundary; the Docker port must never be published on a LAN or public interface.

## Automatic deployment

`.gitlab-ci.yml` is the main integration pipeline and runs validation only; it
does not deploy any branch. Deployment belongs in a separate website pipeline.
That pipeline should deploy only its intended website branch after its own
checks pass. The deployment checkout must already exist on the server and have
its `origin` set to the GitLab repository.

Use a dedicated deployment directory, for example:

```text
/srv/fish-logbook
```

Do not use a working directory containing manual code edits. The deploy job
resets that checkout to the exact commit tested by the pipeline before rebuilding the
container.

Configure these protected GitLab CI/CD variables:

| Variable | Purpose |
| --- | --- |
| `DEPLOY_HOST` | Production server hostname or IP |
| `DEPLOY_USER` | SSH user allowed to deploy |
| `DEPLOY_PATH` | Absolute path to the deployment checkout |
| `DEPLOY_DATA_PATH` | Absolute path for the persistent database and uploads, outside the checkout |
| `DEPLOY_SSH_KEY` | SSH private key; File or Variable type |
| `DEPLOY_KNOWN_HOSTS` | The server's pinned SSH host key; File or Variable type |

The deployment user needs permission to run Docker Compose and to update the
deployment checkout. The checkout also needs read-only access to the GitLab
repository, normally through a repository deploy key.

For the first deployment, create the separate runtime-data directory and make
sure the deployment user can write to it. For example:

```sh
sudo mkdir -p /srv/fish-logbook-data/uploads
sudo chown -R deploy:deploy /srv/fish-logbook-data
```

Set `DEPLOY_DATA_PATH` to `/srv/fish-logbook-data`. If the site already has data under the checkout, stop the old container and copy the existing `data/` contents into this directory before the first deployment. The pipeline passes that
path to Docker Compose as `FISH_DATA_DIR`, so rebuilding the image or resetting
the Git checkout does not remove the database or uploaded photos. The pipeline
serializes production deployments so two pushes cannot rebuild the site at the
same time, and waits for the container health check before succeeding.
The deploy job also waits for the Flask smoke test. It builds the image before
replacing the running container, then allows up to 180 seconds for Compose's
startup wait (a container marked unhealthy can fail sooner). If startup fails,
the job prints container status, the last 200 log lines per service, and Docker's
container state including health-check output, and keeps the job failed. These
diagnostics distinguish application crashes and database errors from failed HTTP
health probes; an unhealthy container is not treated as a successful deployment.

## Database and photos

The Compose file mounts the configured data directory into `/app/data`. In
production this should be outside the checkout. It contains:

```text
data/logbook.sqlite3
data/uploads/
```

`data/uploads/` is intentionally ignored by Git. The database stores references
to those files, but not the binary photo data. Restore the photo files from a
backup into the deployment directory before expecting existing photos to load.

A shared drive such as MEGA or Google Drive is acceptable as a temporary backup
destination, preferably as a dated archive of both the database and uploads.
It should not be the live `/uploads` filesystem: sync delays, permissions, and
unstable file URLs can cause broken images. For a longer-term setup, use object
storage such as S3-compatible storage, Cloudflare R2, or Backblaze B2.

## NOAA Great Lakes data

The container keeps the map's NOAA Great Lakes data downloaded in the
background: one gunicorn worker holds a lock and refreshes, and both workers
share the download cache in the container's temp directory
(`/tmp/fishing-logbook-great-lakes`). It prepares every forecast choice ("Now",
6, 12, 24, and 48 hours) at every depth each hour, so expect roughly 180 MB of
NOAA downloads an hour (about 4.4 GB a day) and a few hundred MB of cache on
disk. The wave layer adds about 0.7 MB an hour from NOAA NOMADS (only the
three wave fields of each forecast choice are downloaded). The cache is disposable: it is not
logbook data, is not backed up, and is rebuilt within a few minutes after a
container is recreated. Set `GREAT_LAKES_CACHE_DIR` to keep it across
rebuilds, or `GREAT_LAKES_BACKGROUND_REFRESH=false` to download only on demand.

## Cloudflare D1 and R2 foundation

The production cloud API is maintained under `cloud/worker/` and deployed by
the self-hosted GitLab pipeline. Cloudflare's direct GitLab integration is not
used because the repository is hosted at `git.zionkoudijs.com`, not
GitLab.com.

The Worker has two native bindings:

| Binding | Cloudflare resource | Purpose |
| --- | --- | --- |
| `FISH_DB` | D1 `fish-logger-prod-data` | Versioned logbook documents and media inventory |
| `FISH_MEDIA` | R2 `fish-logger-prod-media` | Private photos and videos |

The Worker accesses both resources through bindings. No D1 or R2 storage key is
stored in GitLab, the Worker source, or a browser. GitLab only stores the scoped
Cloudflare deployment token, account ID, and D1 database ID.

The website pipeline's Cloudflare Worker deployment job should render the D1
UUID into an ignored Wrangler configuration, apply pending migrations, and
deploy `fish-logger-api`. It should run only on the protected website branch
when Worker or website-pipeline files change. The following project variables
should use the deployment environment scope:

- `CLOUDFLARE_API_TOKEN` — protected, masked and hidden.
- `CLOUDFLARE_ACCOUNT_ID` — protected.
- `CLOUDFLARE_D1_DATABASE_ID` — protected.

All `/api/*` Worker routes fail closed until the encrypted
`FISH_API_TOKEN` Worker secret is configured. Only `GET /health` is public.
The initial deployment does not route `fish.zionkoudijs.com` to the Worker and
does not modify the live SQLite/upload volume. Cutover happens only after the
existing data has been backed up, migrated, and verified.
