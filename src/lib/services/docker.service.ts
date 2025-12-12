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

// Helper to get the correct docker compose command
async function getDockerComposeCommand(): Promise<string> {
  try {
    // Try docker-compose (with dash) first
    await execAsync("docker-compose --version");
    return "docker-compose";
  } catch {
    // Fall back to docker compose (without dash)
    return "docker compose";
  }
}

// Build and start a project using docker-compose
// Networks (websites_network and infra_network) should already exist or be created by compose
export async function deployProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposeDir = join(projectDir, "docker");
  const composeCmd = await getDockerComposeCommand();

  // Run docker compose build and up -d (as per your workflow)
  await execAsync(`${composeCmd} build`, {
    cwd: dockerComposeDir,
  });
  
  await execAsync(`${composeCmd} up -d`, {
    cwd: dockerComposeDir,
  });
}

// Start database if it exists
export async function startDatabase(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const databaseDir = join(projectDir, "database");
  const composeCmd = await getDockerComposeCommand();

  try {
    await execAsync(`${composeCmd} up -d`, {
      cwd: databaseDir,
    });
  } catch (error) {
    // Database compose file might not exist
    console.error(`Failed to start database for ${projectName}:`, error);
  }
}

// Restart a project
export async function restartProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposeDir = join(projectDir, "docker");
  const composeCmd = await getDockerComposeCommand();

  await execAsync(`${composeCmd} restart`, {
    cwd: dockerComposeDir,
  });
}

// Stop a project
export async function stopProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposeDir = join(projectDir, "docker");
  const composeCmd = await getDockerComposeCommand();

  await execAsync(`${composeCmd} stop`, {
    cwd: dockerComposeDir,
  });
}

// Delete a project (stop and remove containers)
export async function deleteProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposeDir = join(projectDir, "docker");
  const databaseDir = join(projectDir, "database");
  const composeCmd = await getDockerComposeCommand();

  // Stop and remove main service
  try {
    await execAsync(`${composeCmd} down -v`, {
      cwd: dockerComposeDir,
    });
  } catch (error) {
    console.error(`Failed to remove main service:`, error);
  }

  // Stop and remove database if exists
  try {
    await execAsync(`${composeCmd} down -v`, {
      cwd: databaseDir,
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
      const dockerComposeDir = join(projectDir, "docker");
      
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      
      const composeCmd = await getDockerComposeCommand();
      const result = await execAsync(
        `${composeCmd} logs --tail=${lines}`,
        { cwd: dockerComposeDir }
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

