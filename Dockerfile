FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Use a cleaner production image
FROM node:20-slim AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Standardize on port (though Coolify can map it)
EXPOSE 3000

CMD ["node", "dist/index.js"]
