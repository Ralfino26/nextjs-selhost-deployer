import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { config } from "../config";

const execAsync = promisify(exec);

// Dynamically import dockerode to avoid build issues
export async function getDocker() {
  const Docker = (await import("dockerode")).default;
  return new Docker();
}

// Build and start a project using docker-compose
// Networks (websites_network and infra_network) should already exist or be created by compose
export async function deployProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposeDir = join(projectDir, "docker");

  // Down, build, and up -d for clean deployment
  // This ensures new images are always used and config changes are applied
  await execAsync(`docker compose down`, {
    cwd: dockerComposeDir,
  });
  
  await execAsync(`docker compose build`, {
    cwd: dockerComposeDir,
  });
  
  await execAsync(`docker compose up -d`, {
    cwd: dockerComposeDir,
  });
}

// Deploy with streaming logs
export async function deployProjectWithLogs(
  projectName: string,
  onLog: (line: string) => void
): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposeDir = join(projectDir, "docker");

  const { spawn } = await import("child_process");

  // Down with streaming
  await new Promise<void>((resolve, reject) => {
    onLog("🛑 Stopping containers...\n");
    const downProcess = spawn("docker", ["compose", "down"], {
      cwd: dockerComposeDir,
      shell: "/bin/sh",
    });

    downProcess.stdout?.on("data", (data) => {
      onLog(data.toString());
    });

    downProcess.stderr?.on("data", (data) => {
      onLog(data.toString());
    });

    downProcess.on("close", (code) => {
      if (code === 0) {
        onLog("✅ Containers stopped\n");
        resolve();
      } else {
        // Down can fail if containers don't exist, which is fine
        onLog("ℹ️  No containers to stop (this is OK)\n");
        resolve();
      }
    });

    downProcess.on("error", (error) => {
      // Don't fail on down errors, just log and continue
      onLog(`ℹ️  Down process warning: ${error.message}\n`);
      resolve();
    });
  });

  // Build with streaming
  await new Promise<void>((resolve, reject) => {
    onLog("🔨 Building images...\n");
    const buildProcess = spawn("docker", ["compose", "build"], {
      cwd: dockerComposeDir,
      shell: "/bin/sh",
    });

    buildProcess.stdout?.on("data", (data) => {
      onLog(data.toString());
    });

    buildProcess.stderr?.on("data", (data) => {
      onLog(data.toString());
    });

    buildProcess.on("close", (code) => {
      if (code === 0) {
        onLog("✅ Build completed successfully\n");
        resolve();
      } else {
        reject(new Error(`Build failed with code ${code}`));
      }
    });

    buildProcess.on("error", (error) => {
      reject(error);
    });
  });

  // Start with streaming
  await new Promise<void>((resolve, reject) => {
    onLog("🚀 Starting containers...\n");
    const upProcess = spawn("docker", ["compose", "up", "-d"], {
      cwd: dockerComposeDir,
      shell: "/bin/sh",
    });

    upProcess.stdout?.on("data", (data) => {
      onLog(data.toString());
    });

    upProcess.stderr?.on("data", (data) => {
      onLog(data.toString());
    });

    upProcess.on("close", (code) => {
      if (code === 0) {
        onLog("✅ Deployment completed successfully\n");
        resolve();
      } else {
        reject(new Error(`Deployment failed with code ${code}`));
      }
    });

    upProcess.on("error", (error) => {
      reject(error);
    });
  });
}

// Start database if it exists
export async function startDatabase(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const databaseDir = join(projectDir, "database");

  try {
    await execAsync(`docker compose up -d`, {
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

  await execAsync(`docker compose restart`, {
    cwd: dockerComposeDir,
  });
}

// Restart database without losing data (down && up -d, preserves volumes)
export async function restartDatabase(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const databaseDir = join(projectDir, "database");

  try {
    // Use docker compose down && up -d to fully restart the database
    // This preserves volumes (no -v flag) and applies any config changes
    await execAsync(`docker compose down`, {
      cwd: databaseDir,
    });
    
    await execAsync(`docker compose up -d`, {
      cwd: databaseDir,
    });
  } catch (error) {
    // Database compose file might not exist
    console.error(`Failed to restart database for ${projectName}:`, error);
    throw new Error(`Database not found or failed to restart: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Stop a project
export async function stopProject(projectName: string): Promise<void> {
  const projectDir = join(config.projectsBaseDir, projectName);
  const dockerComposeDir = join(projectDir, "docker");

  await execAsync(`docker compose stop`, {
    cwd: dockerComposeDir,
  });
}

// Delete a project - removes ONLY Docker resources for this specific project
// NEVER touches other projects or Docker resources
export async function deleteProject(projectName: string): Promise<void> {
  console.log(`[DELETE] Starting cleanup for project: ${projectName} ONLY`);

  // ONLY remove containers with EXACT names matching this project
  const mainContainerName = projectName;
  const dbContainerName = `${projectName}-mongo`;
  
  try {
    const docker = await getDocker();
    
    // Remove main container ONLY if it exists and name matches exactly
    try {
      const mainContainer = docker.getContainer(mainContainerName);
      const mainInfo = await mainContainer.inspect();
      
      // Double-check: container name must match exactly
      if (mainInfo.Name === `/${mainContainerName}` || mainInfo.Name === mainContainerName) {
        console.log(`[DELETE] Removing container: ${mainContainerName}`);
        if (mainInfo.State.Running) {
          await mainContainer.stop();
        }
        await mainContainer.remove({ force: true, v: true });
        console.log(`[DELETE] ✓ Container ${mainContainerName} removed`);
      } else {
        console.warn(`[DELETE] Container name mismatch, skipping: ${mainInfo.Name} != ${mainContainerName}`);
      }
    } catch (error: any) {
      if (error.statusCode !== 404) {
        console.warn(`[DELETE] Warning removing container ${mainContainerName}:`, error.message);
      }
    }

    // Remove database container ONLY if it exists and name matches exactly
    try {
      const dbContainer = docker.getContainer(dbContainerName);
      const dbInfo = await dbContainer.inspect();
      
      // Double-check: container name must match exactly
      if (dbInfo.Name === `/${dbContainerName}` || dbInfo.Name === dbContainerName) {
        console.log(`[DELETE] Removing container: ${dbContainerName}`);
        if (dbInfo.State.Running) {
          await dbContainer.stop();
        }
        await dbContainer.remove({ force: true, v: true });
        console.log(`[DELETE] ✓ Container ${dbContainerName} removed`);
      } else {
        console.warn(`[DELETE] Container name mismatch, skipping: ${dbInfo.Name} != ${dbContainerName}`);
      }
    } catch (error: any) {
      if (error.statusCode !== 404) {
        console.warn(`[DELETE] Warning removing container ${dbContainerName}:`, error.message);
      }
    }
  } catch (error) {
    console.warn(`[DELETE] Warning: Could not access Docker API:`, error);
  }

  // ONLY remove volumes that are EXACTLY named after this project
  // Use strict matching to avoid removing volumes from other projects
  try {
    console.log(`[DELETE] Checking for project-specific volumes (strict matching)...`);
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    // List all volumes
    const result = await execAsync(`docker volume ls -q`);
    const volumes = result.stdout.trim().split("\n").filter(Boolean);
    
    // STRICT matching: volume name must be EXACTLY the project name or start with project name + specific patterns
    // This prevents matching volumes from other projects that might contain the project name as a substring
    const projectVolumes = volumes.filter((vol: string) => {
      // Exact match
      if (vol === projectName) return true;
      // Match: {projectName}_* or {projectName}-*
      if (vol.startsWith(`${projectName}_`) || vol.startsWith(`${projectName}-`)) return true;
      // Match: docker-{projectName} or docker-{projectName}_*
      if (vol === `docker-${projectName}` || vol.startsWith(`docker-${projectName}_`) || vol.startsWith(`docker-${projectName}-`)) return true;
      // Match: {projectName}-mongo or {projectName}_mongo
      if (vol === `${projectName}-mongo` || vol === `${projectName}_mongo`) return true;
      return false;
    });

    for (const volume of projectVolumes) {
      try {
        await execAsync(`docker volume rm -f ${volume}`);
        console.log(`[DELETE] ✓ Removed volume: ${volume}`);
      } catch (error) {
        console.warn(`[DELETE] Warning: Could not remove volume ${volume}:`, error);
      }
    }
    
    if (projectVolumes.length === 0) {
      console.log(`[DELETE] No project-specific volumes found`);
    }
  } catch (error) {
    console.warn(`[DELETE] Warning: Could not check volumes:`, error);
  }

  // ONLY remove images with EXACT names matching this project
  try {
    console.log(`[DELETE] Removing project-specific images (exact match only)...`);
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    // ONLY exact image names - no wildcards, no partial matches
    const exactImageNames = [
      `${projectName}:latest`,
      `docker-${projectName}:latest`,
    ];

    for (const imageName of exactImageNames) {
      try {
        // Check if image exists first
        await execAsync(`docker image inspect ${imageName} > /dev/null 2>&1`);
        await execAsync(`docker rmi -f ${imageName}`);
        console.log(`[DELETE] ✓ Removed image: ${imageName}`);
      } catch (error) {
        // Image doesn't exist or couldn't be removed, ignore
        console.log(`[DELETE] Image ${imageName} not found or couldn't be removed (OK)`);
      }
    }
    console.log(`[DELETE] ✓ Images cleanup completed`);
  } catch (error) {
    console.warn(`[DELETE] Warning: Could not remove images:`, error);
  }

  console.log(`[DELETE] ✓ Cleanup finished for project: ${projectName} ONLY`);
  console.log(`[DELETE] Other projects and Docker resources remain untouched`);
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
      
      const result = await execAsync(
        `docker compose logs --tail=${lines}`,
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



