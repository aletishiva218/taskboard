FROM node:18-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

# Install dependencies layer (cached unless package.json changes)
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Development image — includes devDeps, nodemon
FROM base AS development
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

# Production image
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Run migrations on startup, then start server
EXPOSE 5000
CMD ["sh", "-c", "node src/migrations/run.js && node src/server.js"]
