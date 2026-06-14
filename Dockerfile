# ── Stage 1: build frontend ──────────────────────────────────────────────────
FROM node:22-alpine AS ui-builder

WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci --prefer-offline

COPY web/ .
RUN npm run build

# ── Stage 2: build Go binary ─────────────────────────────────────────────────
FROM golang:1.22-alpine AS go-builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=ui-builder /app/internal/web/dist ./internal/web/dist

ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build \
      -ldflags "-s -w -X github.com/somnatrace/somnatrace/internal/config.Version=${VERSION}" \
      -o /somnatrace ./cmd/somnatrace

# ── Stage 3: runtime image ───────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=go-builder /somnatrace .

ENV SOMNATRACE_HOST=0.0.0.0 \
    SOMNATRACE_PORT=8080 \
    SOMNATRACE_MODE=production \
    SOMNATRACE_DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 8080

ENTRYPOINT ["./somnatrace"]
