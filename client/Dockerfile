# syntax=docker/dockerfile:1
# Frontend (Vite SPA) built and served by Caddy, which also reverse-proxies /api.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_API_URL=/api comes from .env.production (committed); build bakes it in.
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv/www
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
