import { mkdir, writeFile, readFile, access } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { randomBytes } from "crypto";
import { config } from "../config";

const execAsync = promisify(exec);

export async function createProjectDirectory(projectName: string): Promise<string> {
  const projectDir = join(config.projectsBaseDir, projectName);
  
  if (!existsSync(projectDir)) {
    await mkdir(projectDir, { recursive: true });
  }
  
  // Create docker subdirectory
  const dockerDir = join(projectDir, "docker");
  if (!existsSync(dockerDir)) {
    await mkdir(dockerDir, { recursive: true });
  }
  
  return projectDir;
}

export async function cloneRepository(
  repo: string, // Format: "Ralfino26/repo-name" or "owner/repo"
  targetDir: string
): Promise<string> {
  // Extract repo name from "owner/repo" format
  const repoName = repo.split("/").pop() || "repo";
  const repoDir = join(targetDir, repoName);
  
  const githubToken = config.githubToken;
  
  // Use GitHub CLI to clone: gh repo clone owner/repo
  try {
    // Set GITHUB_TOKEN if available
    const env = githubToken ? { ...process.env, GITHUB_TOKEN: githubToken } : process.env;
    await execAsync(`gh repo clone ${repo} ${repoDir}`, {
      cwd: targetDir,
      env,
    });
  } catch (error) {
    // If gh CLI fails, fall back to git clone
    console.warn("GitHub CLI not available, falling back to git clone");
    let repoUrl = `https://github.com/${repo}.git`;
    
    // Use token in URL if available (for private repos)
    if (githubToken) {
      repoUrl = `https://${githubToken}@github.com/${repo}.git`;
    }
    
    await execAsync(`git clone ${repoUrl} ${repoDir}`, {
      cwd: targetDir,
    });
  }
  
  return repoName;
}

/**
 * Detect if a Next.js project is configured for static export (SSG)
 */
export async function detectStaticExport(repoPath: string): Promise<boolean> {
  // Check next.config.js
  const nextConfigJs = join(repoPath, "next.config.js");
  // Check next.config.ts
  const nextConfigTs = join(repoPath, "next.config.ts");
  // Check next.config.mjs
  const nextConfigMjs = join(repoPath, "next.config.mjs");
  
  const configFiles = [
    { path: nextConfigJs, type: "js" },
    { path: nextConfigTs, type: "ts" },
    { path: nextConfigMjs, type: "mjs" },
  ];

  for (const configFile of configFiles) {
    if (existsSync(configFile.path)) {
      try {
        const content = await readFile(configFile.path, "utf-8");
        
        // Check for various patterns:
        // - output: 'export'
        // - output: "export"
        // - output: 'export',
        // - output: "export",
        // - output: 'export' in object
        const exportPatterns = [
          /output\s*[:=]\s*['"]export['"]/,
          /output\s*:\s*['"]export['"]/,
          /['"]output['"]\s*:\s*['"]export['"]/,
        ];
        
        for (const pattern of exportPatterns) {
          if (pattern.test(content)) {
            console.log(`[SSG DETECT] Found static export in ${configFile.path}`);
            return true;
          }
        }
        
        // Also check for output: "export" in object syntax (common in TypeScript)
        if (content.includes("output") && (content.includes("'export'") || content.includes('"export"'))) {
          // More specific check: look for output property with export value
          const lines = content.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes("output") && (trimmed.includes("'export'") || trimmed.includes('"export"'))) {
              console.log(`[SSG DETECT] Found static export in ${configFile.path} (line: ${trimmed})`);
              return true;
            }
          }
        }
      } catch (error) {
        console.warn(`[SSG DETECT] Could not read ${configFile.path}:`, error);
      }
    }
  }

  // Also check package.json for build script that might indicate static export
  try {
    const packageJsonPath = join(repoPath, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJsonContent = await readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(packageJsonContent);
      
      // Check if build script includes 'export'
      if (packageJson.scripts?.build?.includes("export") || 
          packageJson.scripts?.build?.includes("next export")) {
        console.log(`[SSG DETECT] Found export in build script`);
        return true;
      }
    }
  } catch (error) {
    // Ignore errors
  }

  // Check if there's an 'out' directory (indicates static export was run)
  // This is a fallback check - if out directory exists, it's likely SSG
  const outDir = join(repoPath, "out");
  if (existsSync(outDir)) {
    console.log(`[SSG DETECT] Found 'out' directory, likely SSG site`);
    return true;
  }

  return false;
}

export async function writeDockerfile(
  projectDir: string,
  repoName: string,
  force: boolean = false
): Promise<void> {
  const dockerfilePath = join(projectDir, repoName, "Dockerfile");
  
  // Check if Dockerfile already exists (only skip if not forcing)
  if (!force) {
    try {
      await access(dockerfilePath);
      return; // Dockerfile exists, don't overwrite
    } catch {
      // Dockerfile doesn't exist, create it
    }
  }

  const repoPath = join(projectDir, repoName);
  
  // Detect if this is a static export (SSG) project
  const isStaticExport = await detectStaticExport(repoPath);
  console.log(`[DOCKERFILE] Static export detected: ${isStaticExport}`);
  console.log(`[DOCKERFILE] Repo path: ${repoPath}`);
  
  if (isStaticExport) {
    console.log(`[DOCKERFILE] Generating SSG Dockerfile (nginx-based)`);
    // Generate SSG Dockerfile (nginx-based)
    await writeStaticDockerfile(repoPath, dockerfilePath);
    return;
  }
  
  console.log(`[DOCKERFILE] Generating SSR Dockerfile (Node.js-based)`);
  
  // Detect package manager and lock files
  const bunLockExists = existsSync(join(repoPath, "bun.lock"));
  const packageLockExists = existsSync(join(repoPath, "package-lock.json"));
  const yarnLockExists = existsSync(join(repoPath, "yarn.lock"));
  const pnpmLockExists = existsSync(join(repoPath, "pnpm-lock.yaml"));
  
  console.log(`[DOCKERFILE] Detecting package manager for ${repoName}:`);
  console.log(`[DOCKERFILE]   bun.lock: ${bunLockExists}`);
  console.log(`[DOCKERFILE]   package-lock.json: ${packageLockExists}`);
  console.log(`[DOCKERFILE]   yarn.lock: ${yarnLockExists}`);
  console.log(`[DOCKERFILE]   pnpm-lock.yaml: ${pnpmLockExists}`);
  
  // Default to bun
  let packageManager = "bun";
  let baseImage = "oven/bun:1";
  let installCommand = "bun install";
  let buildCommand = "bun next build";
  let startCommand = ["bun", "next", "start"];
  let copyLockFiles = "COPY package.json ./";
  
  // Read package.json to detect package manager
  try {
    const packageJsonPath = join(repoPath, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJsonContent = await readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(packageJsonContent);
      
      // Check for packageManager field (e.g., "packageManager": "bun@1.0.0")
      if (packageJson.packageManager) {
        const pm = packageJson.packageManager.toLowerCase();
        if (pm.includes("bun")) {
          packageManager = "bun";
        } else if (pm.includes("yarn")) {
          packageManager = "yarn";
        } else if (pm.includes("pnpm")) {
          packageManager = "pnpm";
        } else {
          packageManager = "npm";
        }
      } else {
        // Detect from lock files (priority order)
        if (bunLockExists) {
          packageManager = "bun";
        } else if (yarnLockExists) {
          packageManager = "yarn";
        } else if (pnpmLockExists) {
          packageManager = "pnpm";
        } else if (packageLockExists) {
          packageManager = "npm";
        }
        // If no lock file, default to bun
      }
    }
  } catch (error) {
    console.warn(`Could not read package.json for ${repoName}, using bun as default:`, error);
  }
  
  // Configure based on detected package manager
  switch (packageManager) {
    case "yarn":
      baseImage = "node:20-alpine";
      installCommand = yarnLockExists ? "yarn install --frozen-lockfile" : "yarn install";
      buildCommand = "yarn next build";
      startCommand = ["yarn", "next", "start"];
      copyLockFiles = yarnLockExists 
        ? "COPY package.json yarn.lock ./"
        : "COPY package.json ./";
      break;
    case "pnpm":
      baseImage = "node:20-alpine";
      installCommand = pnpmLockExists ? "pnpm install --frozen-lockfile" : "pnpm install";
      buildCommand = "pnpm next build";
      startCommand = ["pnpm", "next", "start"];
      copyLockFiles = pnpmLockExists
        ? "COPY package.json pnpm-lock.yaml ./"
        : "COPY package.json ./";
      break;
    case "npm":
      baseImage = "node:20-alpine";
      installCommand = packageLockExists ? "npm ci" : "npm install";
      buildCommand = "npm run build";
      startCommand = ["npm", "start"];
      copyLockFiles = packageLockExists
        ? "COPY package.json package-lock.json ./"
        : "COPY package.json ./";
      break;
    case "bun":
    default:
      baseImage = "oven/bun:1";
      installCommand = "bun install";
      buildCommand = "bun next build";
      startCommand = ["bun", "next", "start"];
      // Make bun.lock optional - use wildcard so it doesn't fail if missing
      copyLockFiles = bunLockExists
        ? "COPY package.json bun.lock ./"
        : "COPY package.json ./";
      break;
  }
  
  // Install package manager if needed (for non-bun)
  let installPmStep = "";
  if (packageManager === "yarn") {
    installPmStep = "RUN apk add --no-cache yarn\n";
  } else if (packageManager === "pnpm") {
    installPmStep = "RUN npm install -g pnpm\n";
  }
  
  const dockerfileContent = `FROM ${baseImage}
WORKDIR /app
${installPmStep}${copyLockFiles}
RUN ${installCommand}
COPY . .
ENV NODE_ENV=production
RUN ${buildCommand}
EXPOSE 3000
CMD ${JSON.stringify(startCommand)}
`;

  console.log(`[DOCKERFILE] Generated Dockerfile for ${repoName}:`);
  console.log(`[DOCKERFILE]   Package manager: ${packageManager}`);
  console.log(`[DOCKERFILE]   Base image: ${baseImage}`);
  console.log(`[DOCKERFILE]   Copy command: ${copyLockFiles}`);
  console.log(`[DOCKERFILE]   Install command: ${installCommand}`);

  await writeFile(dockerfilePath, dockerfileContent);
  console.log(`[DOCKERFILE] ✓ Dockerfile written to ${dockerfilePath}`);
}

/**
 * Generate Dockerfile for static export (SSG) sites using nginx
 */
async function writeStaticDockerfile(
  repoPath: string,
  dockerfilePath: string
): Promise<void> {
  // Detect package manager and lock files
  const bunLockExists = existsSync(join(repoPath, "bun.lock"));
  const packageLockExists = existsSync(join(repoPath, "package-lock.json"));
  const yarnLockExists = existsSync(join(repoPath, "yarn.lock"));
  const pnpmLockExists = existsSync(join(repoPath, "pnpm-lock.yaml"));
  
  console.log(`[DOCKERFILE] Generating SSG Dockerfile:`);
  console.log(`[DOCKERFILE]   bun.lock: ${bunLockExists}`);
  console.log(`[DOCKERFILE]   package-lock.json: ${packageLockExists}`);
  console.log(`[DOCKERFILE]   yarn.lock: ${yarnLockExists}`);
  console.log(`[DOCKERFILE]   pnpm-lock.yaml: ${pnpmLockExists}`);
  
  // Default to bun
  let packageManager = "bun";
  let baseImage = "oven/bun:1";
  let installCommand = "bun install";
  let buildCommand = "bun next build";
  let copyLockFiles = "COPY package.json ./";
  
  // Read package.json to detect package manager
  try {
    const packageJsonPath = join(repoPath, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJsonContent = await readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(packageJsonContent);
      
      // Check for packageManager field
      if (packageJson.packageManager) {
        const pm = packageJson.packageManager.toLowerCase();
        if (pm.includes("bun")) {
          packageManager = "bun";
        } else if (pm.includes("yarn")) {
          packageManager = "yarn";
        } else if (pm.includes("pnpm")) {
          packageManager = "pnpm";
        } else {
          packageManager = "npm";
        }
      } else {
        // Detect from lock files
        if (bunLockExists) {
          packageManager = "bun";
        } else if (yarnLockExists) {
          packageManager = "yarn";
        } else if (pnpmLockExists) {
          packageManager = "pnpm";
        } else if (packageLockExists) {
          packageManager = "npm";
        }
      }
    }
  } catch (error) {
    console.warn(`Could not read package.json, using bun as default:`, error);
  }
  
  // Configure based on detected package manager
  switch (packageManager) {
    case "yarn":
      baseImage = "node:20-alpine";
      installCommand = yarnLockExists ? "yarn install --frozen-lockfile" : "yarn install";
      buildCommand = "yarn next build";
      copyLockFiles = yarnLockExists 
        ? "COPY package.json yarn.lock ./"
        : "COPY package.json ./";
      break;
    case "pnpm":
      baseImage = "node:20-alpine";
      installCommand = pnpmLockExists ? "pnpm install --frozen-lockfile" : "pnpm install";
      buildCommand = "pnpm next build";
      copyLockFiles = pnpmLockExists
        ? "COPY package.json pnpm-lock.yaml ./"
        : "COPY package.json ./";
      break;
    case "npm":
      baseImage = "node:20-alpine";
      installCommand = packageLockExists ? "npm ci" : "npm install";
      buildCommand = "npm run build";
      copyLockFiles = packageLockExists
        ? "COPY package.json package-lock.json ./"
        : "COPY package.json ./";
      break;
    case "bun":
    default:
      baseImage = "oven/bun:1";
      installCommand = "bun install";
      buildCommand = "bun next build";
      copyLockFiles = bunLockExists
        ? "COPY package.json bun.lock ./"
        : "COPY package.json ./";
      break;
  }
  
  // Install package manager if needed (for non-bun)
  let installPmStep = "";
  if (packageManager === "yarn") {
    installPmStep = "RUN apk add --no-cache yarn\n";
  } else if (packageManager === "pnpm") {
    installPmStep = "RUN npm install -g pnpm\n";
  }
  
  // Multi-stage build: build stage + nginx stage
  const dockerfileContent = `# Build stage
FROM ${baseImage} AS builder
WORKDIR /app
${installPmStep}${copyLockFiles}
RUN ${installCommand}
COPY . .
ENV NODE_ENV=production
RUN ${buildCommand}

# Production stage with nginx
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Copy static files from build
# Next.js static export outputs to 'out' directory by default
COPY --from=builder /app/out /usr/share/nginx/html

# Copy public folder if it exists (for assets)
COPY --from=builder /app/public /usr/share/nginx/html/public 2>/dev/null || true

# Nginx configuration for SPA routing
RUN cat > /etc/nginx/conf.d/default.conf << 'EOF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Static assets caching
    location /_next/static {
        alias /usr/share/nginx/html/_next/static;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Public assets
    location /public {
        alias /usr/share/nginx/html/public;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing - try files, fallback to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
}
EOF

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

  console.log(`[DOCKERFILE] Generated SSG Dockerfile:`);
  console.log(`[DOCKERFILE]   Package manager: ${packageManager}`);
  console.log(`[DOCKERFILE]   Base image: ${baseImage}`);
  console.log(`[DOCKERFILE]   Build command: ${buildCommand}`);

  await writeFile(dockerfilePath, dockerfileContent);
  console.log(`[DOCKERFILE] ✓ SSG Dockerfile written to ${dockerfilePath}`);
}

export async function writeDockerCompose(
  projectDir: string,
  projectName: string,
  repoName: string,
  port: number,
  envVars: { key: string; value: string }[] = []
): Promise<void> {
  const dockerDir = join(projectDir, "docker");
  await mkdir(dockerDir, { recursive: true });

  const dockerComposePath = join(dockerDir, "docker-compose.yml");
  
  // Check if this is a static export project
  const repoPath = join(projectDir, repoName);
  const isStaticExport = await detectStaticExport(repoPath);
  console.log(`[DOCKER-COMPOSE] Static export detected: ${isStaticExport}`);
  console.log(`[DOCKER-COMPOSE] Repo path: ${repoPath}`);
  
  if (isStaticExport) {
    console.log(`[DOCKER-COMPOSE] Generating SSG docker-compose.yml (nginx on port 80)`);
    // SSG sites use nginx on port 80, no environment variables needed
    const dockerComposeContent = `services:
  ${projectName}:
    container_name: ${projectName}
    build:
      context: ../${repoName}
      dockerfile: Dockerfile
    restart: always
    ports:
      - "${port}:80"
    networks:
      - websites_network
      - infra_network

networks:
  websites_network:
    name: websites_network
  infra_network:
    external: true
`;

    await writeFile(dockerComposePath, dockerComposeContent);
    console.log(`[DOCKER-COMPOSE] Generated SSG docker-compose.yml (nginx on port 80)`);
    return;
  }
  
  // Build environment section for SSR sites
  const envSection = [
    "NODE_ENV: production",
    ...envVars.map((v) => `${v.key}: ${v.value}`),
  ].join("\n      ");
  
  // Exact structure from your workflow (SSR)
  const dockerComposeContent = `services:
  ${projectName}:
    container_name: ${projectName}
    build:
      context: ../${repoName}
      dockerfile: Dockerfile
    restart: always
    ports:
      - "${port}:3000"
    environment:
      ${envSection}
    networks:
      - websites_network
      - infra_network

networks:
  websites_network:
    name: websites_network
  infra_network:
    external: true
`;

  await writeFile(dockerComposePath, dockerComposeContent);
  console.log(`[DOCKER-COMPOSE] Generated SSR docker-compose.yml (Node.js on port 3000)`);
}

/**
 * Generate a secure random password
 */
function generateSecurePassword(length: number = 32): string {
  // Use crypto.randomBytes for secure random generation
  // Generate base64 string and remove special characters that might cause issues
  const bytes = randomBytes(length);
  return bytes
    .toString("base64")
    .replace(/[+/=]/g, "") // Remove characters that might cause issues in env vars
    .substring(0, length);
}

/**
 * Generate a logical database username based on project name
 */
function generateDatabaseUsername(projectName: string): string {
  // Use project name, sanitize it, and add a prefix
  const sanitized = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_") // Replace non-alphanumeric with underscore
    .substring(0, 20); // Limit length
  
  return `db_${sanitized}`;
}

/**
 * Generate a logical database name based on project name
 */
function generateDatabaseName(projectName: string): string {
  // Use project name, sanitize it
  const sanitized = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_") // Replace non-alphanumeric with underscore
    .substring(0, 30); // Limit length
  
  return `${sanitized}_db`;
}

export async function writeDatabaseCompose(
  projectDir: string,
  projectName: string,
  dbName?: string
): Promise<void> {
  const databaseDir = join(projectDir, "database");
  await mkdir(databaseDir, { recursive: true });

  // Get next available database port
  const { getNextAvailableDatabasePort } = await import("./port.service");
  const databasePort = await getNextAvailableDatabasePort();

  // Generate secure credentials per database
  const databaseUsername = generateDatabaseUsername(projectName);
  const databasePassword = generateSecurePassword(32);
  const databaseName = dbName || generateDatabaseName(projectName);

  console.log(`[DATABASE] Generating credentials for ${projectName}:`);
  console.log(`[DATABASE]   Username: ${databaseUsername}`);
  console.log(`[DATABASE]   Database: ${databaseName}`);
  console.log(`[DATABASE]   Password: *** (32 chars)`);

  const dockerComposePath = join(databaseDir, "docker-compose.yml");
  
  // MongoDB compose with generated credentials
  const dockerComposeContent = `version: '3.9'
services:
  ${projectName}-mongo:
    image: mongo:7
    container_name: ${projectName}-mongo
    restart: unless-stopped
    command: ["mongod", "--bind_ip_all"]
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${databaseUsername}
      MONGO_INITDB_ROOT_PASSWORD: ${databasePassword}
      MONGO_INITDB_DATABASE: ${databaseName}
    ports:
      - "${databasePort}:27017"
    volumes:
      - ./data:/data/db
`;

  await writeFile(dockerComposePath, dockerComposeContent);
  console.log(`[DATABASE] ✓ Database compose file created with secure credentials`);
}

export async function projectDirectoryExists(projectName: string): Promise<boolean> {
  const projectDir = join(config.projectsBaseDir, projectName);
  return existsSync(projectDir);
}
