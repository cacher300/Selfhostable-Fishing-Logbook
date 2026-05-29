FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8080

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py index.html ./
COPY backend ./backend
COPY static ./static
RUN mkdir -p data/uploads

EXPOSE 8080

CMD ["python", "server.py"]
