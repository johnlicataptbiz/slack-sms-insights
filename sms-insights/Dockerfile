FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache git
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
