# Dockerfile for Daftar (Production)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.js && node src/core/server.js"]
