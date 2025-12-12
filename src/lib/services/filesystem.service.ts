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
  
  // Use GitHub CLI to clone: gh repo clone owner/repo
  try {
    await execAsync(`gh repo clone ${repo} ${repoDir}`, {
      cwd: targetDir,
    });
  } catch (error) {
    // If gh CLI fails, fall back to git clone
    console.warn("GitHub CLI not available, falling back to git clone");
    const repoUrl = `https://github.com/${repo}.git`;
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

  // Bun-based Dockerfile as per your workflow
  const dockerfileContent = `FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
ENV NODE_ENV=production
RUN bun next build
EXPOSE 3000
CMD ["bun", "next", "start"]
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
      NODE_ENV: production
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
      - "27027:27017"
    volumes:
      - ./data:/data/db
`;

  await writeFile(dockerComposePath, dockerComposeContent);
}

export async function projectDirectoryExists(projectName: string): Promise<boolean> {
  const projectDir = join(config.projectsBaseDir, projectName);
  return existsSync(projectDir);
}
