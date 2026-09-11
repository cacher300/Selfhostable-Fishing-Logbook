import json
import unittest

import httpx

from app import create_app
from reviewer import (
    GitLabClient,
    OpenAIReviewer,
    REVIEW_MARKER,
    ReviewJob,
    Settings,
    compile_diffs,
    format_review,
    parse_review_job,
)


def settings():
    return Settings(
        openai_api_key="sk-test-value-not-a-real-key",
        gitlab_review_token="glpat-test-value-not-a-real-token",
        gitlab_webhook_secret="x" * 40,
        gitlab_url="https://git.example.test",
        allowed_projects=frozenset({"studio-zk/fish/desktop"}),
        max_diff_chars=10000,
        max_file_chars=5000,
    )


def webhook_payload(**overrides):
    payload = {
        "object_kind": "merge_request",
        "project": {
            "id": 42,
            "path_with_namespace": "studio-zk/fish/desktop",
        },
        "object_attributes": {
            "iid": 7,
            "action": "update",
            "state": "opened",
            "title": "Improve storage",
            "last_commit": {"id": "a" * 40},
        },
    }
    payload.update(overrides)
    return payload


class QueueStub:
    def __init__(self):
        self.received = []

    def enqueue(self, job):
        self.received.append(job)
        return True


class WebhookTests(unittest.TestCase):
    def test_rejects_wrong_webhook_secret(self):
        queue = QueueStub()
        client = create_app(settings(), queue).test_client()
        response = client.post(
            "/webhooks/gitlab",
            json=webhook_payload(),
            headers={
                "X-Gitlab-Token": "wrong",
                "X-Gitlab-Event": "Merge Request Hook",
            },
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(queue.received, [])

    def test_queues_allowed_merge_request(self):
        queue = QueueStub()
        client = create_app(settings(), queue).test_client()
        response = client.post(
            "/webhooks/gitlab",
            json=webhook_payload(),
            headers={
                "X-Gitlab-Token": "x" * 40,
                "X-Gitlab-Event": "Merge Request Hook",
            },
        )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(
            queue.received,
            [
                ReviewJob(
                    project_id=42,
                    project_path="studio-zk/fish/desktop",
                    merge_request_iid=7,
                    head_sha="a" * 40,
                )
            ],
        )

    def test_disallowed_project_is_ignored(self):
        payload = webhook_payload()
        payload["project"]["path_with_namespace"] = "other/private"
        job, status = parse_review_job(payload, settings())
        self.assertIsNone(job)
        self.assertEqual(status, "project is not allowed")


class DiffTests(unittest.TestCase):
    def test_filters_generated_and_sensitive_files_and_redacts_tokens(self):
        compiled, included, skipped, truncated = compile_diffs(
            [
                {
                    "new_path": "app.py",
                    "diff": "+token = 'sk-abcdefghijklmnopqrstuv'",
                },
                {
                    "new_path": "package-lock.json",
                    "diff": "+large generated content",
                },
                {
                    "new_path": ".env",
                    "diff": "+PASSWORD=secret",
                },
            ],
            10000,
            5000,
        )
        self.assertEqual(included, 1)
        self.assertEqual(skipped, 2)
        self.assertFalse(truncated)
        self.assertIn("[REDACTED]", compiled)
        self.assertNotIn("sk-abcdefghijklmnopqrstuv", compiled)

    def test_review_output_neutralizes_mentions(self):
        body = format_review(
            {
                "summary": "Notify @all",
                "findings": [
                    {
                        "severity": "high",
                        "path": "app.py",
                        "line": 10,
                        "title": "Bug @here",
                        "explanation": "This fails.",
                        "suggestion": "Validate first.",
                    }
                ],
            },
            "b" * 40,
            "gpt-test",
            1,
            0,
            False,
        )
        self.assertIn(REVIEW_MARKER, body)
        self.assertNotIn("@all", body)
        self.assertNotIn("@here", body)


class OpenAITests(unittest.TestCase):
    def test_uses_structured_output_and_disables_storage(self):
        captured = {}

        def handler(request):
            captured.update(json.loads(request.content))
            return httpx.Response(
                200,
                json={
                    "output": [
                        {
                            "type": "message",
                            "content": [
                                {
                                    "type": "output_text",
                                    "text": json.dumps(
                                        {
                                            "summary": "Looks safe.",
                                            "verdict": "approve",
                                            "findings": [],
                                        }
                                    ),
                                }
                            ],
                        }
                    ]
                },
            )

        transport = httpx.MockTransport(handler)
        client = httpx.Client(
            transport=transport,
            base_url="https://api.openai.test/v1",
        )
        reviewer = OpenAIReviewer(settings(), client)
        result = reviewer.review(
            {
                "project_id": 42,
                "iid": 7,
                "title": "Change",
                "source_branch": "feature",
                "target_branch": "main",
            },
            "--- FILE: app.py ---\n+print('ok')",
        )
        self.assertEqual(result["verdict"], "approve")
        self.assertFalse(captured["store"])
        self.assertEqual(
            captured["text"]["format"]["type"], "json_schema"
        )

    def test_redacts_tokens_from_merge_request_metadata(self):
        captured = {}
        exposed_token = "sk-abcdefghijklmnopqrstuv"

        def handler(request):
            captured.update(json.loads(request.content))
            return httpx.Response(
                200,
                json={
                    "output": [
                        {
                            "type": "message",
                            "content": [
                                {
                                    "type": "output_text",
                                    "text": json.dumps(
                                        {
                                            "summary": "Reviewed.",
                                            "verdict": "approve",
                                            "findings": [],
                                        }
                                    ),
                                }
                            ],
                        }
                    ]
                },
            )

        client = httpx.Client(
            transport=httpx.MockTransport(handler),
            base_url="https://api.openai.test/v1",
        )
        OpenAIReviewer(settings(), client).review(
            {
                "project_id": 42,
                "iid": 7,
                "title": f"Do not expose {exposed_token}",
                "source_branch": "feature",
                "target_branch": "main",
            },
            "--- FILE: app.py ---\n+print('ok')",
        )
        input_text = captured["input"][0]["content"][0]["text"]
        self.assertNotIn(exposed_token, input_text)
        self.assertIn("[REDACTED]", input_text)


class GitLabTests(unittest.TestCase):
    def test_detects_existing_review_for_commit(self):
        head_sha = "c" * 40

        def handler(request):
            return httpx.Response(
                200,
                json=[
                    {
                        "id": 99,
                        "body": f"<!-- openai-mr-review-bot:{head_sha} -->",
                    }
                ],
            )

        client = httpx.Client(
            transport=httpx.MockTransport(handler),
            base_url="https://git.example.test/api/v4",
        )
        gitlab = GitLabClient(settings(), client)
        self.assertTrue(gitlab.has_review_for_commit(42, 7, head_sha))
        self.assertFalse(gitlab.has_review_for_commit(42, 7, "d" * 40))

    def test_updates_existing_bot_note(self):
        requests = []

        def handler(request):
            requests.append((request.method, request.url.path))
            if request.method == "GET":
                return httpx.Response(
                    200,
                    json=[{"id": 99, "body": REVIEW_MARKER}],
                )
            return httpx.Response(200, json={"id": 99})

        client = httpx.Client(
            transport=httpx.MockTransport(handler),
            base_url="https://git.example.test/api/v4",
        )
        GitLabClient(settings(), client).upsert_review_note(
            42, 7, "new review"
        )
        self.assertEqual(requests[-1], (
            "PUT",
            "/api/v4/projects/42/merge_requests/7/notes/99",
        ))


if __name__ == "__main__":
    unittest.main()
