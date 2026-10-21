FROM node:22.14.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend ./
RUN npm run build
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
CMD ["node", "dist/main.js"]
