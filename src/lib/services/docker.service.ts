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

// Build and start a project using docker-compose
// Networks (websites_network and infra_network) should already exist or be created by compose
export async function deployProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");

  // Run docker compose build and up -d (as per your workflow)
  await execAsync(`docker compose -f ${dockerComposePath} build`, {
    cwd: join(projectDir, "docker"),
  });
  
  await execAsync(`docker compose -f ${dockerComposePath} up -d`, {
    cwd: join(projectDir, "docker"),
  });
}

// Start database if it exists
export async function startDatabase(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const databaseComposePath = join(projectDir, "database", "docker-compose.yml");

  try {
    await execAsync(`docker compose -f ${databaseComposePath} up -d`, {
      cwd: join(projectDir, "database"),
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

  await execAsync(`docker compose -f ${dockerComposePath} restart`, {
    cwd: join(projectDir, "docker"),
  });
}

// Stop a project
export async function stopProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");

  await execAsync(`docker compose -f ${dockerComposePath} stop`, {
    cwd: join(projectDir, "docker"),
  });
}

// Delete a project (stop and remove containers)
export async function deleteProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");
  const databaseComposePath = join(projectDir, "database", "docker-compose.yml");

  // Stop and remove main service
  try {
    await execAsync(`docker compose -f ${dockerComposePath} down -v`, {
      cwd: join(projectDir, "docker"),
    });
  } catch (error) {
    console.error(`Failed to remove main service:`, error);
  }

  // Stop and remove database if exists
  try {
    await execAsync(`docker compose -f ${databaseComposePath} down -v`, {
      cwd: join(projectDir, "database"),
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
  try {
    const docker = await getDocker();
    const container = docker.getContainer(projectName);
    
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: lines,
      timestamps: false,
    });
    
    // Convert buffer to string and clean up
    let logOutput = logs.toString("utf-8");
    
    // Remove ANSI color codes if present
    logOutput = logOutput.replace(/\x1b\[[0-9;]*m/g, "");
    
    return logOutput;
  } catch (error: any) {
    // If container doesn't exist, try using docker compose logs
    try {
      const projectDir = join(config.projectsBaseDir, projectName);
      const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");
      
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      
      const result = await execAsync(
        `docker compose -f ${dockerComposePath} logs --tail=${lines}`,
        { cwd: join(projectDir, "docker") }
      );
      
      return result.stdout || result.stderr || "No logs available";
    } catch (composeError: any) {
      return `Error fetching logs: ${error?.message || error || "Unknown error"}`;
    }
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

