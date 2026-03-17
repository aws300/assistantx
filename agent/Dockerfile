# Build context: agent/
# Build command:  cd agent && docker build -t <image> .

# ── Stage 1: install Python dependencies + application ───────────────────────
FROM python:3.13-slim AS builder

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
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libglib2.0-0 libgobject-2.0-0 libgirepository-1.0-1 \
    procps \
    curl \
    iputils-ping \
    net-tools \
    iproute2 \
    vim-tiny \
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

CMD ["agent", "start"]
