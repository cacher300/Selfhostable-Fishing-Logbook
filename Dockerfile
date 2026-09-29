# Build the browser bundle with Node, then ship only the built assets.
FROM node:22-slim AS frontend

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY scripts/build-frontend.mjs ./scripts/
COPY schema ./schema
COPY static ./static
RUN node scripts/build-frontend.mjs


FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8080

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py index.html ./
COPY docker-entrypoint.sh ./
COPY templates ./templates
COPY backend ./backend
COPY schema ./schema
COPY static/img ./static/img
COPY --from=frontend /build/static/dist ./static/dist
RUN mkdir -p data/uploads

EXPOSE 8080

ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "--timeout", "120", "server:app"]
