# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine@sha256:2140dad235c130ac861018a4e13a6bc8aea3a35f3a40e20c1b060d51a7efd250 AS serve

# Write nginx config inline
RUN printf '%s\n' \
  'server {' \
  '    listen 80;' \
  '    listen [::]:80;' \
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

# checkov:skip=CKV_DOCKER_3: Container runs as root to bind privileged port 80. The chart (charts/templates/frontend.yaml) and HTTPRoute (charts/templates/httproute.yaml) are configured to route to port 80, which requires privileged access or chart modifications. Running as non-root would require either: (1) changing the listen port to 8080 and updating the chart's Service and HTTPRoute targetPort (not owned by this Dockerfile), or (2) using capabilities or sysctl that EKS may not grant. Keeping root until chart owner can coordinate the port change.

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
