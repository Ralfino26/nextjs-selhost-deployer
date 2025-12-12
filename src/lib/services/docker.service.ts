import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { config } from "../config";

const execAsync = promisify(exec);

// Dynamically import dockerode to avoid build issues
async function getDocker() {
  const Docker = (await import("dockerode")).default;
  return new Docker();
}

// Ensure Docker network exists
export async function ensureNetwork(): Promise<void> {
  const docker = await getDocker();
  try {
    await docker.getNetwork(config.dockerNetwork).inspect();
  } catch {
    // Network doesn't exist, create it
    await docker.createNetwork({
      Name: config.dockerNetwork,
      Driver: "bridge",
    });
  }
}

// Build and start a project using docker-compose
export async function deployProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");

  // Ensure network exists
  await ensureNetwork();

  // Run docker-compose up -d --build
  await execAsync(`docker-compose -f ${dockerComposePath} up -d --build`, {
    cwd: projectDir,
  });
}

// Start database if it exists
export async function startDatabase(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const databaseComposePath = join(projectDir, "database", "docker-compose.yml");

  try {
    await execAsync(`docker-compose -f ${databaseComposePath} up -d`, {
      cwd: projectDir,
    });
  } catch (error) {
    // Database compose file might not exist
    console.error(`Failed to start database for ${projectName}:`, error);
  }
}

// Restart a project
export async function restartProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");

  await execAsync(`docker-compose -f ${dockerComposePath} restart`, {
    cwd: projectDir,
  });
}

// Stop a project
export async function stopProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");

  await execAsync(`docker-compose -f ${dockerComposePath} stop`, {
    cwd: projectDir,
  });
}

// Delete a project (stop and remove containers)
export async function deleteProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");
  const databaseComposePath = join(projectDir, "database", "docker-compose.yml");

  // Stop and remove main service
  try {
    await execAsync(`docker-compose -f ${dockerComposePath} down -v`, {
      cwd: projectDir,
    });
  } catch (error) {
    console.error(`Failed to remove main service:`, error);
  }

  // Stop and remove database if exists
  try {
    await execAsync(`docker-compose -f ${databaseComposePath} down -v`, {
      cwd: projectDir,
    });
  } catch (error) {
    // Database might not exist, ignore
  }
}

// Get container logs
export async function getLogs(
  projectName: string,
  lines: number = 100
): Promise<string> {
  const docker = await getDocker();
  const container = docker.getContainer(projectName);
  
  try {
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: lines,
    });
    return logs.toString();
  } catch (error) {
    return `Error fetching logs: ${error}`;
  }
}

// Get project status
export async function getProjectStatus(projectName: string): Promise<"Running" | "Stopped" | "Error"> {
  try {
    const docker = await getDocker();
    const container = docker.getContainer(projectName);
    const info = await container.inspect();
    
    if (info.State.Running) {
      return "Running";
    } else if (info.State.Status === "exited") {
      return "Stopped";
    } else {
      return "Error";
    }
  } catch {
    return "Stopped";
  }
}

