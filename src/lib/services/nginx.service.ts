import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Get domain name from Nginx Proxy Manager for a given container name
 * This queries the NPM database or API to find the domain
 */
export async function getDomainFromNPM(containerName: string): Promise<string | null> {
  try {
    // Try to get domain from NPM database
    // NPM stores data in a SQLite database at /data/database.sqlite (in NPM container)
    // Or we can query via NPM API if available
    
    // Method 1: Try to query NPM database directly
    // This requires access to the NPM container's database
    try {
      // Find NPM container
      const { stdout: npmContainers } = await execAsync(
        'docker ps --filter "name=nginx-proxy-manager" --format "{{.Names}}"'
      );
      
      if (!npmContainers.trim()) {
        return null;
      }
      
      const npmContainer = npmContainers.trim().split("\n")[0];
      
      // Query NPM database for proxy host with forward_host matching container name
      // NPM database structure: proxy_hosts table has forward_host and domain_names
      const query = `docker exec ${npmContainer} sqlite3 /data/database.sqlite "SELECT domain_names FROM proxy_hosts WHERE forward_host LIKE '%${containerName}%' LIMIT 1"`;
      
      try {
        const { stdout: domain } = await execAsync(query);
        if (domain.trim()) {
          // Domain is stored as JSON array, parse it
          const domains = JSON.parse(domain.trim());
          return Array.isArray(domains) && domains.length > 0 ? domains[0] : null;
        }
      } catch {
        // Database query failed, try alternative method
      }
    } catch {
      // NPM container not found or query failed
    }
    
    // Method 2: Try to get from docker labels or environment
    // Some setups use labels on containers
    try {
      const { stdout: inspect } = await execAsync(
        `docker inspect ${containerName} --format '{{index .Config.Labels "com.nginx-proxy-manager.domain"}}'`
      );
      if (inspect.trim()) {
        return inspect.trim();
      }
    } catch {
      // Label not found
    }
    
    return null;
  } catch (error) {
    console.error("Error getting domain from NPM:", error);
    return null;
  }
}

/**
 * Alternative: Get domain from container's environment or labels
 */
export async function getDomainFromContainer(containerName: string): Promise<string | null> {
  try {
    // Check if container has VIRTUAL_HOST or domain label
    const { stdout: virtualHost } = await execAsync(
      `docker inspect ${containerName} --format '{{index .Config.Labels "VIRTUAL_HOST"}}' 2>/dev/null || echo ""`
    );
    
    if (virtualHost.trim()) {
      return virtualHost.trim();
    }
    
    // Check environment variable
    const { stdout: env } = await execAsync(
      `docker inspect ${containerName} --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -i "domain\|host" || echo ""`
    );
    
    // Try to extract domain from env
    const domainMatch = env.match(/(?:DOMAIN|HOST|VIRTUAL_HOST)=([^\s]+)/i);
    if (domainMatch) {
      return domainMatch[1];
    }
    
    return null;
  } catch (error) {
    console.error("Error getting domain from container:", error);
    return null;
  }
}

