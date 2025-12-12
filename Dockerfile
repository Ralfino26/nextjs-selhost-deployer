# Next.js Deployment Manager Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat git
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN if [ -f bun.lock ]; then \
      apk add --no-cache curl unzip && \
      curl -fsSL https://bun.sh/install | bash && \
      /root/.bun/bin/bun install --frozen-lockfile; \
    else \
      npm ci; \
    fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js
RUN if [ -f bun.lock ]; then \
      /root/.bun/bin/bun run build; \
    else \
      npm run build; \
    fi

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Install Docker CLI for dockerode
RUN apk add --no-cache docker-cli git

# Keep root user to access Docker socket (required for dockerode)
# The container needs root privileges to manage Docker containers
# USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

