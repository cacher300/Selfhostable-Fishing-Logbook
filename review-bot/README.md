# OpenAI GitLab merge-request reviewer

A small advisory review service for the self-managed GitLab project
`studio-zk/fish/desktop`. GitLab sends merge-request webhooks to this service;
the service fetches the current diff, asks the OpenAI Responses API for a
structured review, and creates or updates one merge-request comment.

The bot cannot approve, merge, push, or deploy. Its GitLab token should use the
Reporter role and only the `api` scope.

## Security properties

- Verifies GitLab's `X-Gitlab-Token` header with a constant-time comparison.
- Rejects projects not listed in `GITLAB_ALLOWED_PROJECTS`.
- Keeps OpenAI and GitLab credentials only in an untracked server `.env` file.
- Sends only reviewable diff text, not a repository clone.
- Skips common generated, binary, credential, and lock files.
- Redacts known OpenAI/GitLab token formats before calling OpenAI.
- Treats all merge-request content as untrusted prompt data.
- Uses `store: false` for OpenAI Responses API calls.
- Posts advisory findings only and neutralizes GitLab mentions.
- Re-checks the MR commit before posting so stale reviews are discarded.
- Records the reviewed commit so duplicate webhook deliveries do not incur another API call.

## Configure

Copy the example without committing the result:

```sh
cp .env.example .env
chmod 600 .env
```

Set these required values in `.env`:

| Variable | Value |
| --- | --- |
| `OPENAI_API_KEY` | Restricted OpenAI project key with Model capabilities Request |
| `GITLAB_REVIEW_TOKEN` | Reporter project token with `api` scope |
| `GITLAB_WEBHOOK_SECRET` | At least 32 random characters |
| `GITLAB_URL` | `https://git.zionkoudijs.com` |
| `GITLAB_ALLOWED_PROJECTS` | `studio-zk/fish/desktop` |

The default model is `gpt-5.6-terra`. Change `OPENAI_MODEL` to
`gpt-5.6-luna` for lower-cost reviews.

## Run

```sh
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:8092/health
```

The container listens only on host loopback port 8092. Put it behind an HTTPS
reverse proxy before configuring the GitLab webhook.

Example Nginx location:

```nginx
location = /webhooks/gitlab {
    proxy_pass http://127.0.0.1:8092;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## GitLab webhook

In the project, open **Settings > Webhooks > Add new webhook**:

| Field | Value |
| --- | --- |
| URL | `https://review-bot.zionkoudijs.com/webhooks/gitlab` |
| Secret token | The exact `GITLAB_WEBHOOK_SECRET` value |
| Trigger | Merge request events |
| SSL verification | Enabled |

The service responds immediately with HTTP 202 and processes the review in a
single background queue. Open and update events trigger reviews. Draft MRs are
ignored by default.

## Test

```sh
python -m unittest discover -s tests -v
REVIEW_BOT_ENV_FILE=.env.example docker compose config
```
