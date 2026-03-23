FROM node:22.12.0-bookworm-slim AS base

WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
# Use a placeholder DATABASE_URL at build time for Prisma client generation;
# the real value must be provided at runtime via environment variable.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
COPY . .
ENV NODE_ENV=production
ENV SKIP_FRONTEND_BUILD=true
RUN npm run build

FROM node:22.12.0-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV SKIP_FRONTEND_BUILD=true

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

CMD ["npm", "start"]
