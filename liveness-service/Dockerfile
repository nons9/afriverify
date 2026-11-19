FROM python:3.12-slim
WORKDIR /srv
RUN apt-get update && apt-get install -y --no-install-recommends curl libgl1 libgles2 libegl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY scripts ./scripts
RUN MODELS_DIR=/srv/models ./scripts/download_models.sh
COPY app ./app
# Unprivileged user: the engine reads code and models and writes nothing to disk.
RUN useradd --system --uid 10001 --create-home app
USER app
ENV MODELS_DIR=/srv/models PORT=8100 HOME=/home/app
EXPOSE 8100
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
