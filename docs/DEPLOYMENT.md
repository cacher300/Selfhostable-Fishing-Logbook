# Deployment

The production site is served by Nginx and proxied to the Docker Compose service
`selfhostable-fishing-logbook` on `127.0.0.1:8081`.

## Automatic deployment

`.gitlab-ci.yml` runs the tests and then deploys the default branch over SSH.
That means a push to the default branch, including an edit made in GitLab's web
editor, automatically rebuilds and restarts the production container after the
tests pass. The deployment checkout must already exist on the server and have
its `origin` set to the GitLab repository.

Use a dedicated deployment directory, for example:

```text
/srv/fish-logbook
```

Do not use a working directory containing manual code edits. The deploy job
resets that checkout to the commit on the default branch before rebuilding the
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
