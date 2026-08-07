FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -v -trimpath -ldflags '-s -w' -o /app/server ./cmd/server

FROM alpine:3.21
WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget ca-certificates

# Create non-root user
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser

COPY --from=builder /app/server .
COPY configs/ configs/
COPY skills/ /app/skills/

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8080 9090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9090/metrics || exit 1

CMD ["./server"]
