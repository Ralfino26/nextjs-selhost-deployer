import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { config } from "../config";

const PORT_FILE = join(process.cwd(), "data", "ports.json");

interface PortRegistry {
  ports: number[];
  lastPort: number;
}

// Get all used ports by scanning existing projects
async function getUsedPorts(): Promise<number[]> {
  const usedPorts: number[] = [];
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
        const portMatch = content.match(/ports:\s*-\s*"(\d+):/);
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

  while (usedPorts.includes(port)) {
    port++;
  }

  return port;
}

export async function isPortAvailable(port: number): Promise<boolean> {
  const usedPorts = await getUsedPorts();
  return !usedPorts.includes(port);
}

