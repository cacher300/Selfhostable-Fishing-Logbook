from __future__ import annotations

import logging
import queue
from typing import Any

from flask import Flask, jsonify, request

from reviewer import (
    BackgroundReviewQueue,
    ReviewProcessor,
    Settings,
    parse_review_job,
    webhook_token_matches,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


def create_app(
    settings: Settings | None = None,
    review_queue: Any | None = None,
) -> Flask:
    active_settings = settings or Settings.from_env()
    active_queue = review_queue or BackgroundReviewQueue(
        ReviewProcessor(active_settings)
    )

    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 1_000_000

    @app.after_request
    def security_headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.get("/health")
    def health():
        return jsonify(
            {
                "ok": True,
                "service": "openai-mr-review-bot",
                "queue_depth": active_queue.jobs.qsize()
                if hasattr(active_queue, "jobs")
                else 0,
            }
        )

    @app.post("/webhooks/gitlab")
    def gitlab_webhook():
        provided = request.headers.get("X-Gitlab-Token", "")
        if not webhook_token_matches(
            provided, active_settings.gitlab_webhook_secret
        ):
            return jsonify({"error": "unauthorized"}), 401
        if request.headers.get("X-Gitlab-Event") != "Merge Request Hook":
            return jsonify({"ok": True, "status": "ignored event"}), 202

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "invalid JSON payload"}), 400

        try:
            job, status = parse_review_job(payload, active_settings)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        if job is None:
            return jsonify({"ok": True, "status": status}), 202

        try:
            queued = active_queue.enqueue(job)
        except queue.Full:
            return jsonify({"error": "review queue is full"}), 503
        return jsonify(
            {
                "ok": True,
                "status": "queued" if queued else "already queued",
                "project": job.project_path,
                "merge_request": job.merge_request_iid,
                "commit": job.head_sha,
            }
        ), 202

    return app
