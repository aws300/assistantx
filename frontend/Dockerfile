# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:alpine AS serve

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

EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
