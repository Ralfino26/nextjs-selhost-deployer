import { mkdir, writeFile, readFile, access } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import simpleGit from "simple-git";
import { config } from "../config";

export async function createProjectDirectory(projectName: string): Promise<string> {
  const projectDir = join(config.projectsBaseDir, projectName);
  
  if (!existsSync(projectDir)) {
    await mkdir(projectDir, { recursive: true });
  }
  
  return projectDir;
}

export async function cloneRepository(
  repoUrl: string,
  targetDir: string
): Promise<void> {
  const git = simpleGit();
  
  // Extract repo name from URL (e.g., "ralf/my-app" from "https://github.com/ralf/my-app.git")
  const repoName = repoUrl.split("/").pop()?.replace(".git", "") || "repo";
  const cloneDir = join(targetDir, repoName);
  
  // Use GitHub token if available (for private repos)
  const githubToken = config.githubToken;
  let cloneUrl = repoUrl;
  
  if (githubToken && repoUrl.includes("github.com")) {
    // Insert token into URL for authentication
    cloneUrl = repoUrl.replace(
      "https://github.com/",
      `https://${githubToken}@github.com/`
    );
  }
  
  // Clone the repository
  await git.clone(cloneUrl, cloneDir);
}

export async function writeDockerfile(
  projectDir: string,
  repoName: string
): Promise<void> {
  const dockerfilePath = join(projectDir, repoName, "Dockerfile");
  
  // Check if Dockerfile already exists
  try {
    await access(dockerfilePath);
    return; // Dockerfile exists, don't overwrite
  } catch {
    // Dockerfile doesn't exist, create it
  }

  const dockerfileContent = `# Next.js Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lock* ./
COPY pnpm-lock.yaml* ./
COPY yarn.lock* ./

# Install dependencies based on lock file
RUN if [ -f bun.lock ]; then \\
      apk add --no-cache curl unzip && \\
      curl -fsSL https://bun.sh/install | bash && \\
      /root/.bun/bin/bun install --frozen-lockfile; \\
    elif [ -f pnpm-lock.yaml ]; then \\
      corepack enable pnpm && pnpm install --frozen-lockfile; \\
    elif [ -f yarn.lock ]; then \\
      corepack enable yarn && yarn install --frozen-lockfile; \\
    else \\
      npm ci; \\
    fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js
RUN if [ -f bun.lock ]; then \\
      /root/.bun/bin/bun run build; \\
    elif [ -f pnpm-lock.yaml ]; then \\
      pnpm run build; \\
    elif [ -f yarn.lock ]; then \\
      yarn build; \\
    else \\
      npm run build; \\
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

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
`;

  await writeFile(dockerfilePath, dockerfileContent);
}

export async function writeDockerCompose(
  projectDir: string,
  projectName: string,
  repoName: string,
  port: number
): Promise<void> {
  const dockerDir = join(projectDir, "docker");
  await mkdir(dockerDir, { recursive: true });

  const dockerComposePath = join(dockerDir, "docker-compose.yml");
  
  const dockerComposeContent = `version: '3.8'

services:
  ${projectName}:
    build:
      context: ../${repoName}
      dockerfile: Dockerfile
    container_name: ${projectName}
    ports:
      - "${port}:3000"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    env_file:
      - ../${repoName}/.env.local
    networks:
      - ${config.dockerNetwork}
    volumes:
      - ../${repoName}/.env.local:/app/.env.local:ro

networks:
  ${config.dockerNetwork}:
    external: true
`;

  await writeFile(dockerComposePath, dockerComposeContent);
}

export async function writeDatabaseCompose(
  projectDir: string,
  projectName: string
): Promise<void> {
  const databaseDir = join(projectDir, "database");
  await mkdir(databaseDir, { recursive: true });

  const dockerComposePath = join(databaseDir, "docker-compose.yml");
  
  const dockerComposeContent = `version: '3.8'

services:
  ${projectName}-db:
    image: postgres:16-alpine
    container_name: ${projectName}-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${config.database.user}
      POSTGRES_PASSWORD: ${config.database.password}
      POSTGRES_DB: ${projectName}
    volumes:
      - ${projectName}-db-data:/var/lib/postgresql/data
    networks:
      - ${config.dockerNetwork}
    ports:
      - "5432"

volumes:
  ${projectName}-db-data:

networks:
  ${config.dockerNetwork}:
    external: true
`;

  await writeFile(dockerComposePath, dockerComposeContent);
}

export async function projectDirectoryExists(projectName: string): Promise<boolean> {
  const projectDir = join(config.projectsBaseDir, projectName);
  return existsSync(projectDir);
}

