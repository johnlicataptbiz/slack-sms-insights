FROM node:22-alpine

WORKDIR /app

# Install root-level dependencies (workspaces)
COPY package*.json ./
RUN npm ci

# Copy full application code including all workspaces
COPY apps/ ./apps/
COPY prisma/ ./prisma/
COPY scripts/ ./scripts/

# Generate Prisma client
RUN npx prisma generate --config prisma.config.ts

EXPOSE 3000

CMD ["npm", "start"]
