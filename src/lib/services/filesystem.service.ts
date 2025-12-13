import { mkdir, writeFile, readFile, access } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
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

  const repoPath = join(projectDir, repoName);
  
  // Detect package manager and lock files
  const bunLockExists = existsSync(join(repoPath, "bun.lock"));
  const packageLockExists = existsSync(join(repoPath, "package-lock.json"));
  const yarnLockExists = existsSync(join(repoPath, "yarn.lock"));
  const pnpmLockExists = existsSync(join(repoPath, "pnpm-lock.yaml"));
  
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

  await writeFile(dockerfilePath, dockerfileContent);
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
  
  // Build environment section
  const envSection = [
    "NODE_ENV: production",
    ...envVars.map((v) => `${v.key}: ${v.value}`),
  ].join("\n      ");
  
  // Exact structure from your workflow
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
}

export async function writeDatabaseCompose(
  projectDir: string,
  projectName: string,
  dbName: string
): Promise<void> {
  const databaseDir = join(projectDir, "database");
  await mkdir(databaseDir, { recursive: true });

  // Get next available database port
  const { getNextAvailableDatabasePort } = await import("./port.service");
  const databasePort = await getNextAvailableDatabasePort();

  const dockerComposePath = join(databaseDir, "docker-compose.yml");
  
  // MongoDB compose as per your workflow
  const dockerComposeContent = `version: '3.9'
services:
  ${projectName}-mongo:
    image: mongo:7
    container_name: ${projectName}-mongo
    restart: unless-stopped
    command: ["mongod", "--bind_ip_all"]
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${config.database.user}
      MONGO_INITDB_ROOT_PASSWORD: ${config.database.password}
      MONGO_INITDB_DATABASE: ${dbName}
    ports:
      - "${databasePort}:27017"
    volumes:
      - ./data:/data/db
`;

  await writeFile(dockerComposePath, dockerComposeContent);
}

export async function projectDirectoryExists(projectName: string): Promise<boolean> {
  const projectDir = join(config.projectsBaseDir, projectName);
  return existsSync(projectDir);
}
