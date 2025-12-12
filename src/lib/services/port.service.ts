import { config } from "../config";

// Dynamically import dockerode to avoid build issues
async function getDocker() {
  const Docker = (await import("dockerode")).default;
  return new Docker();
}

// Get all used ports by scanning Docker containers
async function getUsedPorts(): Promise<number[]> {
  const usedPorts: number[] = [];
  
  try {
    const docker = await getDocker();
    const containers = await docker.listContainers({ all: true });
    
    for (const container of containers) {
      // Check if container is in our networks (websites_network or infra_network)
      const networks = container.NetworkSettings?.Networks || {};
      const isInOurNetwork = 
        networks[config.websitesNetwork] || 
        networks[config.infraNetwork] ||
        Object.keys(networks).some(net => net.includes('websites') || net.includes('infra'));
      
      if (isInOurNetwork && container.Ports) {
        for (const port of container.Ports) {
          if (port.PublicPort) {
            usedPorts.push(port.PublicPort);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error scanning Docker containers for ports:", error);
    // Fallback: scan filesystem for docker-compose.yml files
    return await getUsedPortsFromFilesystem();
  }

  return usedPorts;
}

// Fallback: Get ports from docker-compose.yml files
async function getUsedPortsFromFilesystem(): Promise<number[]> {
  const usedPorts: number[] = [];
  const { readdir, readFile } = await import("fs/promises");
  const { join } = await import("path");
  const baseDir = config.projectsBaseDir;

  try {
    const projects = await readdir(baseDir, { withFileTypes: true });
    
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      
      const dockerComposePath = join(
        baseDir,
        project.name,
        "docker",
        "docker-compose.yml"
      );

      try {
        const content = await readFile(dockerComposePath, "utf-8");
        const portMatch = content.match(/ports:\s*\n\s+-\s+"(\d+):3000"/);
        if (portMatch) {
          usedPorts.push(parseInt(portMatch[1], 10));
        }
      } catch {
        // File doesn't exist or can't be read, skip
      }
    }
  } catch {
    // Base directory doesn't exist yet
  }

  return usedPorts;
}

export async function getNextAvailablePort(): Promise<number> {
  const usedPorts = await getUsedPorts();
  let port = config.startingPort;

  // Find next available port
  while (usedPorts.includes(port)) {
    port++;
  }

  return port;
}

export async function isPortAvailable(port: number): Promise<boolean> {
  const usedPorts = await getUsedPorts();
  return !usedPorts.includes(port);
}
