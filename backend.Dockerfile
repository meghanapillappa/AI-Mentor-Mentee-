# backend.Dockerfile
# IMPORTANT: build context must be the REPO ROOT (where pyproject.toml + uv.lock live),
# not backend/. The docker-compose.yml below is already set up this way.

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# uv is the package manager this project uses (pyproject.toml + uv.lock at repo root)
RUN pip install --no-cache-dir uv

# Copy only the dependency manifests first so this layer is cached
# unless pyproject.toml / uv.lock actually change.
COPY pyproject.toml uv.lock ./

# Installs exactly what's pinned in uv.lock into /app/.venv (no dev deps)
RUN uv sync --frozen --no-dev

# gunicorn isn't in your pyproject.toml deps — add it to the synced venv for production serving.
RUN uv pip install gunicorn

# Now copy the rest of the repo (backend/, main.py, legacy/, etc.)
COPY . .

# Put the synced venv on PATH so `gunicorn` resolves without "uv run"
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 5000

# app.py and its sibling modules (routes/, services/, auth.py, db.py) use paths/imports
# that assume backend/ is the working directory, so we run gunicorn from there.
WORKDIR /app/backend

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "3", "app:app"]
