# Build context: agent/
# Build command:  cd agent && docker build -t <image> .

# ── Stage 1: install Python dependencies + application ───────────────────────
FROM public.ecr.aws/docker/library/python:3.13-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Silero VAD model into the venv
RUN python -c "from livekit.plugins import silero; silero.VAD.load()"

COPY pyproject.toml ./
RUN echo "# agent" > README.md

COPY src/ ./src/

# Copy skills and configs into the package tree so they're available at runtime
COPY skills/ ./skills/
COPY configs/ ./configs/

RUN pip install --no-cache-dir .

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
# Stays on python:3.13-slim (Debian). python:3.13-alpine scans completely clean,
# but livekit-agents depends on livekit-blingfire, which publishes no musl wheel
# and has no source fallback, so an Alpine runtime cannot install the agent.
# The ~30 CRITICAL/HIGH OS-package findings that remain here (perl-base, glib,
# util-linux, ncurses) currently have NO fixed version published by Debian —
# `apt-get upgrade` below already pulls everything that is actually available.
# Re-check on base-image bumps; nothing in the app calls into these packages.
FROM public.ecr.aws/docker/library/python:3.13-slim

# Runtime needs only the GLib stack the LiveKit/audio plugins link against and
# procps for the healthcheck's pgrep. The interactive debug tools that used to be
# here (vim-tiny, curl, iputils-ping, net-tools, iproute2) accounted for the large
# majority of this image's CVEs — 34 from vim alone — and nothing at runtime calls
# them. `kubectl debug` attaches an ephemeral container when they are needed.
# apt-get upgrade picks up base-image security fixes published since the tag build.
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    libglib2.0-0 libgobject-2.0-0 libgirepository-1.0-1 \
    procps \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN groupadd -g 1000 core && \
    useradd -r -u 1000 -g 1000 -s /sbin/nologin core

WORKDIR /app
RUN chown core:core /app

# Copy skills and configs (overridden by Helm ConfigMap in production)
COPY --from=builder /build/skills/ /app/skills/
COPY --from=builder /build/configs/ /app/configs/

RUN chown -R core:core /app

USER core

ENV PYTHONUNBUFFERED=1

EXPOSE 8080

# Agent is a LiveKit worker with no HTTP server - check the process is alive
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD pgrep -f "agent start" > /dev/null || exit 1

CMD ["agent", "start"]
