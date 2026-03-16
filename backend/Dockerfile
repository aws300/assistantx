FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -v -trimpath -ldflags '-s -w' -o /app/server ./cmd/server

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/server .
COPY configs/ configs/
COPY skills/ /app/skills/
EXPOSE 8080 9090
CMD ["./server"]
