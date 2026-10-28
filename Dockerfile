FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build frontend bundle
COPY . .
RUN npm run build

# Production runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev && npm install -g tsx

# Copy compiled frontend and backend code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/firebase-applet-config.json* ./

# Create data directory for volume mapping
RUN mkdir -p /app/data /app/data/uploads

# Expose app port
EXPOSE 3000

# Start server using tsx
CMD ["tsx", "server.ts"]
