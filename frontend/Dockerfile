# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
# nginx 1.29-alpine: the 1.27-alpine tag carried 3 critical + 35 high OS-package
# CVEs (openssl, libxml2, libpng, musl, zlib); 1.29-alpine clears all criticals.
# Pinned by digest for reproducibility — re-resolve when bumping the tag.
FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de AS serve

# Pick up any Alpine security fixes published after the base tag was built.
RUN apk upgrade --no-cache

# Write nginx config inline.
# Listens on 8080: an unprivileged port, so the server runs as a non-root user
# without CAP_NET_BIND_SERVICE. The chart's Service maps 80 -> 8080, so the
# in-cluster contract (and the HTTPRoute backendRef) stays on port 80.
RUN printf '%s\n' \
  'server {' \
  '    listen 8080;' \
  '    listen [::]:8080;' \
  '    root /usr/share/nginx/html;' \
  '    index index.html;' \
  '' \
  '    location / {' \
  '        try_files $uri $uri/ /index.html;' \
  '        add_header Cache-Control "no-cache, no-store, must-revalidate";' \
  '        add_header Pragma "no-cache";' \
  '    }' \
  '' \
  '    location /assets/ {' \
  '        expires 1y;' \
  '        add_header Cache-Control "public, immutable";' \
  '    }' \
  '}' \
  > /etc/nginx/conf.d/default.conf

ENV CONNECT_PROTOCOL=proto

# Write entrypoint inline
RUN printf '%s\n' \
  '#!/bin/sh' \
  'BACKEND_URL="${BACKEND_URL:-}"' \
  'CONNECT_PROTOCOL="${CONNECT_PROTOCOL:-proto}"' \
  'sed -i "s|__BACKEND_URL_PLACEHOLDER__|${BACKEND_URL}|g" /usr/share/nginx/html/index.html' \
  'sed -i "s|__CONNECT_PROTOCOL_PLACEHOLDER__|${CONNECT_PROTOCOL}|g" /usr/share/nginx/html/index.html' \
  'exec nginx -g "daemon off;"' \
  > /entrypoint.sh && chmod +x /entrypoint.sh

COPY --from=build /app/dist /usr/share/nginx/html

# Run as a non-root user (CKV_DOCKER_3). nginx needs to write its pid and cache
# dirs, and the entrypoint rewrites placeholders inside index.html, so both are
# handed to the app user. Nothing here needs root once the listen port is 8080.
RUN addgroup -g 1000 -S web \
    && adduser -S -D -H -u 1000 -h /var/cache/nginx -s /sbin/nologin -G web -g web web \
    && touch /var/run/nginx.pid \
    && chown -R web:web /usr/share/nginx/html /var/cache/nginx /var/run/nginx.pid \
    && sed -i 's|^pid .*|pid /var/run/nginx.pid;|' /etc/nginx/nginx.conf

USER web

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
