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
# Install all production deps directly in this stage to avoid any cross-stage copy issues
COPY package.json package-lock.json* ./
RUN npm ci --only=production
COPY . .
RUN chmod +x start.sh
EXPOSE 5000
CMD ["sh", "start.sh"]
