FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/backend/package*.json apps/backend/
RUN npm ci --workspace=ptbizsms-api --include-workspace-root

COPY . .
RUN npm run prisma:generate --workspace=ptbizsms-api

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=ptbizsms-api"]
