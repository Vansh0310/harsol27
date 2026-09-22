# syntax=docker/dockerfile:1
#
# Built from the REPO ROOT as build context (see ../docker-compose.yml),
# because this is an npm workspaces monorepo and the lockfile lives at the root.
#   docker build -f backend/Dockerfile .

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

COPY backend ./backend
RUN npm run build --workspace backend
RUN npx --workspace backend prisma generate

# ---- Production stage ----
FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

# Never run a production Node process as root.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY backend/prisma ./backend/prisma
RUN npm ci --omit=dev --workspace backend --include-workspace-root=false \
  && npx --workspace backend prisma generate

COPY --from=build /app/backend/dist ./backend/dist

USER appuser
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
