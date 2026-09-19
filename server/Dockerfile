# syntax=docker/dockerfile:1

# --- build stage: full dependency tree, compiled to plain JS -----------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage: production dependencies only ----------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Never run the API as root.
RUN addgroup -S api && adduser -S api -G api

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER api
EXPOSE 5000

# Readiness is the orchestrator's signal; liveness is checked here.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
