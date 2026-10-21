FROM node:22.14.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/prisma ./prisma
RUN npx prisma generate
WORKDIR /workspace/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci && npx playwright install --with-deps chromium
WORKDIR /workspace
COPY backend ./backend
COPY frontend ./frontend
COPY scripts ./scripts
COPY tests ./tests
CMD ["node", "scripts/test-runner.mjs"]
