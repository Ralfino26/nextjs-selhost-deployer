import { exec } from "child_process";
import { promisify } from "util";
import { config } from "../config";
import { getDomainForProject } from "./nginx.service";

const execAsync = promisify(exec);

interface VisitorStats {
  activeConnections?: number;
  visitorsLastHour?: number;
  requestsLastHour?: number;
  visitorsToday?: number;
  requestsToday?: number;
}

// Get active TCP connections for a container
export async function getActiveConnections(projectName: string, port: number): Promise<number> {
  try {
    // Get the container's IP address and internal port
    const { getDocker } = await import("./docker.service");
    const docker = await getDocker();
    const container = docker.getContainer(projectName);
    const info = await container.inspect();

    if (!info.State.Running) {
      return 0;
    }

    // Get container IP from network settings
    const networks = info.NetworkSettings?.Networks || {};
    const networkName = Object.keys(networks)[0];
    const containerIP = networks[networkName]?.IPAddress;

    // Internal port is usually 3000 for Next.js apps
    const internalPort = 3000;

    if (!containerIP) {
      // If no IP, try to count connections to the exposed port
      try {
        const result = await execAsync(
          `ss -tn state established | grep ":${port} " | wc -l`,
          { shell: "/bin/sh" }
        );
        return parseInt(result.stdout.trim(), 10) || 0;
      } catch (error) {
        return 0;
      }
    }

    // Count connections in multiple ways:
    // 1. Use Docker exec to check connections inside the container
    // 2. Connections to container IP on internal port (3000)
    // 3. Connections to exposed port on localhost
    // 4. Connections via container name (Docker DNS)
    
    let totalConnections = 0;

    // Method 1: Check connections inside the container (most accurate)
    try {
      const execResult = await new Promise<string>((resolve, reject) => {
        container.exec(
          {
            Cmd: ["sh", "-c", `ss -tn state established | grep ":${internalPort}" | wc -l || netstat -tn | grep ESTABLISHED | grep ":${internalPort}" | wc -l || echo "0"`],
            AttachStdout: true,
            AttachStderr: true,
          },
          (err, exec) => {
            if (err) {
              reject(err);
              return;
            }
            
            exec?.start({}, (err, stream) => {
              if (err) {
                reject(err);
                return;
              }
              
              let output = "";
              stream?.on("data", (chunk: Buffer) => {
                output += chunk.toString();
              });
              
              stream?.on("end", () => {
                resolve(output.trim());
              });
            });
          }
        );
      });
      
      const containerConnections = parseInt(execResult, 10) || 0;
      if (containerConnections > 0) {
        totalConnections = containerConnections;
      }
    } catch (error) {
      // Container exec failed, try other methods
    }

    // Method 2: Count connections to container IP:internalPort (if Method 1 failed)
    if (totalConnections === 0) {
      try {
        const result1 = await execAsync(
          `ss -tn state established | grep "${containerIP}:${internalPort}" | wc -l`,
          { shell: "/bin/sh" }
        );
        totalConnections = parseInt(result1.stdout.trim(), 10) || 0;
      } catch (error) {
        // Ignore
      }
    }

    // Method 3: Count connections to exposed port (localhost:port)
    if (totalConnections === 0) {
      try {
        const result2 = await execAsync(
          `ss -tn state established | grep ":${port} " | wc -l`,
          { shell: "/bin/sh" }
        );
        totalConnections = parseInt(result2.stdout.trim(), 10) || 0;
      } catch (error) {
        // Ignore
      }
    }

    // Method 4: Count connections via container name (Docker network DNS)
    if (totalConnections === 0) {
      try {
        const result3 = await execAsync(
          `ss -tn state established | grep -E "${projectName}:${internalPort}|${projectName.toLowerCase()}:${internalPort}" | wc -l`,
          { shell: "/bin/sh" }
        );
        totalConnections = parseInt(result3.stdout.trim(), 10) || 0;
      } catch (error) {
        // Ignore
      }
    }

    // Fallback to netstat if ss is not available
    if (totalConnections === 0) {
      try {
        const result = await execAsync(
          `netstat -tn | grep ESTABLISHED | grep -E "${containerIP}:${internalPort}|:${port} " | wc -l`,
          { shell: "/bin/sh" }
        );
        totalConnections = parseInt(result.stdout.trim(), 10) || 0;
      } catch (netstatError) {
        // Ignore
      }
    }

    return totalConnections;
  } catch (error) {
    console.error(`Error getting active connections for ${projectName}:`, error);
    return 0;
  }
}

// Parse NPM access logs to get visitor statistics
export async function getVisitorStatsFromNPM(
  projectName: string,
  port: number
): Promise<Omit<VisitorStats, "activeConnections">> {
  try {
    const domain = await getDomainForProject(projectName, port);
    if (!domain) {
      return {};
    }

    // Try to access NPM logs - NPM stores logs in /data/logs/ by default
    // But we need to check if we have access to them
    // For now, we'll try to parse from NPM container logs or access logs if available
    
    // Option 1: Try to get logs from NPM container
    try {
      const { getDocker } = await import("./docker.service");
      const docker = await getDocker();
      
      // Try to find NPM container
      const containers = await docker.listContainers({ all: true });
      const npmContainer = containers.find((c) => 
        c.Names?.some(name => name.includes("nginx-proxy-manager") || name.includes("npm"))
      );

      if (npmContainer) {
        const container = docker.getContainer(npmContainer.Id);
        
        // Try to get access logs from NPM
        // NPM logs are typically in /data/logs/ inside the container
        // We can try to exec into the container to read logs
        try {
          // Get recent access logs (last hour)
          const oneHourAgo = Math.floor((Date.now() - 3600000) / 1000);
          const now = Math.floor(Date.now() / 1000);
          
          // Try to exec into NPM container to get access logs
          // This is a simplified approach - in production you might want to mount logs
          const logResult = await new Promise<string>((resolve, reject) => {
            container.exec(
              {
                Cmd: ["sh", "-c", `find /data/logs -name "*.log" -type f -mmin -60 2>/dev/null | head -1 | xargs tail -1000 2>/dev/null || echo ""`],
                AttachStdout: true,
                AttachStderr: true,
              },
              (err, exec) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                exec?.start({}, (err, stream) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  
                  let output = "";
                  stream?.on("data", (chunk: Buffer) => {
                    output += chunk.toString();
                  });
                  
                  stream?.on("end", () => {
                    resolve(output);
                  });
                });
              }
            );
          });

          if (logResult) {
            return parseAccessLogs(logResult, domain, oneHourAgo, now);
          }
        } catch (execError) {
          // Exec failed, try alternative method
        }
      }
    } catch (error) {
      // NPM container not found or error
    }

    // Option 2: Try to read from mounted NPM logs directory (if accessible)
    // This would require NPM logs to be mounted to the host
    // For now, return empty stats
    return {};
  } catch (error) {
    console.error(`Error getting visitor stats from NPM for ${projectName}:`, error);
    return {};
  }
}

// Parse access log format (Nginx/Common Log Format)
function parseAccessLogs(
  logContent: string,
  domain: string,
  oneHourAgo: number,
  now: number
): Omit<VisitorStats, "activeConnections"> {
  const lines = logContent.split("\n").filter((line) => line.trim() !== "");
  const domainLower = domain.toLowerCase();

  // Filter logs for this domain and time range
  const recentLogs = lines.filter((line) => {
    // Check if line contains domain (simplified - real parsing would be more complex)
    if (!line.toLowerCase().includes(domainLower)) {
      return false;
    }

    // Try to extract timestamp (format varies)
    // Common formats: [12/Dec/2024:10:30:45 +0000] or 2024-12-12T10:30:45
    const timestampMatch = line.match(/\[(\d{2}\/\w+\/\d{4}:\d{2}:\d{2}:\d{2})/);
    if (timestampMatch) {
      // Parse timestamp (simplified - would need proper date parsing)
      // For now, just count all matching lines
      return true;
    }

    return true;
  });

  // Extract unique IPs for visitor counting
  const uniqueIPs = new Set<string>();
  const uniqueIPsToday = new Set<string>();
  
  const oneDayAgo = Math.floor((Date.now() - 86400000) / 1000);
  let requestsLastHour = 0;
  let requestsToday = 0;

  recentLogs.forEach((line) => {
    // Extract IP address (usually first field in access log)
    const ipMatch = line.match(/^(\d+\.\d+\.\d+\.\d+)/);
    if (ipMatch) {
      const ip = ipMatch[1];
      uniqueIPs.add(ip);
      uniqueIPsToday.add(ip);
      requestsLastHour++;
    }
    requestsToday++;
  });

  return {
    visitorsLastHour: uniqueIPs.size,
    requestsLastHour,
    visitorsToday: uniqueIPsToday.size,
    requestsToday,
  };
}

// Get combined visitor statistics
export async function getVisitorStats(
  projectName: string,
  port: number
): Promise<VisitorStats> {
  try {
    // Get active connections (real-time)
    const activeConnections = await getActiveConnections(projectName, port);

    // Get stats from NPM logs (if available)
    const npmStats = await getVisitorStatsFromNPM(projectName, port);

    return {
      activeConnections,
      ...npmStats,
    };
  } catch (error) {
    console.error(`Error getting visitor stats for ${projectName}:`, error);
    return {
      activeConnections: 0,
    };
  }
}

