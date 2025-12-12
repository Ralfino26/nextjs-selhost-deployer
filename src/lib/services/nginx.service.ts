// Nginx Proxy Manager API integration
interface NPMProxyHost {
  id: number;
  domain_names: string[];
  forward_host: string;
  forward_port: number;
  forward_scheme: string;
  enabled: boolean;
}

interface NPMTokenResponse {
  token: string;
}

// Cache for NPM token and proxy hosts
let npmToken: string | null = null;
let npmProxyHosts: NPMProxyHost[] | null = null;
let npmTokenExpiry: number = 0;

async function getNPMToken(): Promise<string> {
  // Return cached token if still valid (tokens expire after 1 hour)
  if (npmToken && Date.now() < npmTokenExpiry) {
    return npmToken;
  }

  // Load config to get NPM settings
  const { config } = await import("../config");
  const npmUrl = config.npmUrl || process.env.NPM_URL || "http://nginx-proxy-manager:81";
  const npmEmail = config.npmEmail || process.env.NPM_EMAIL || "";
  const npmPassword = config.npmPassword || process.env.NPM_PASSWORD || "";

  if (!npmEmail || !npmPassword) {
    throw new Error("NPM_EMAIL and NPM_PASSWORD must be configured in Settings");
  }

  try {
    console.log(`Attempting to connect to NPM at: ${npmUrl}`);
    const response = await fetch(`${npmUrl}/api/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        identity: npmEmail,
        secret: npmPassword,
      }),
      // Add timeout
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`NPM login failed: ${response.statusText}`);
    }

    const data: NPMTokenResponse = await response.json();
    npmToken = data.token;
    npmTokenExpiry = Date.now() + 3600000; // 1 hour
    return npmToken;
  } catch (error: any) {
    throw new Error(`Failed to get NPM token: ${error?.message || error}`);
  }
}

async function getNPMProxyHosts(): Promise<NPMProxyHost[]> {
  // Return cached hosts if available (cache for 5 minutes)
  if (npmProxyHosts && Date.now() < npmTokenExpiry - 300000) {
    return npmProxyHosts;
  }

  const { config } = await import("../config");
  const npmUrl = config.npmUrl || process.env.NPM_URL || "http://nginx-proxy-manager:81";
  const token = await getNPMToken();

  try {
    const response = await fetch(`${npmUrl}/api/nginx/proxy-hosts`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch proxy hosts: ${response.statusText}`);
    }

    const data = await response.json();
    npmProxyHosts = data.filter((host: NPMProxyHost) => host.enabled) as NPMProxyHost[];
    return npmProxyHosts;
  } catch (error: any) {
    throw new Error(`Failed to get NPM proxy hosts: ${error?.message || error}`);
  }
}

// Get domain name for a project based on port or container name
export async function getDomainForProject(
  projectName: string,
  port: number
): Promise<string | null> {
  try {
    const hosts = await getNPMProxyHosts();
    
    console.log(`Looking for domain for project ${projectName} on port ${port}`);
    console.log(`Found ${hosts.length} proxy hosts in NPM`);
    
    if (hosts.length === 0) {
      console.log("No proxy hosts found in NPM");
      return null;
    }
    
    // Log all hosts for debugging
    hosts.forEach((host) => {
      console.log(`NPM Host: ${host.domain_names[0]} -> ${host.forward_scheme}://${host.forward_host}:${host.forward_port}`);
    });
    
    // Try to match by forward_port and forward_host
    // NPM typically forwards to localhost, 127.0.0.1, or container name
    let matchingHost = hosts.find((host) => {
      // Match by port first
      if (host.forward_port === port) {
        // Remove http:// or https:// prefix if present
        let forwardHost = host.forward_host.toLowerCase().replace(/^https?:\/\//, '');
        console.log(`Checking host: ${host.domain_names[0]} -> ${forwardHost}:${host.forward_port}`);
        
        // Check if forward_host matches localhost, 127.0.0.1, or container name
        const matches = (
          forwardHost === "localhost" ||
          forwardHost === "127.0.0.1" ||
          forwardHost === projectName.toLowerCase() ||
          forwardHost.includes(projectName.toLowerCase())
        );
        
        if (matches) {
          console.log(`Matched! Domain: ${host.domain_names[0]}`);
        }
        
        return matches;
      }
      return false;
    });

    // Fallback: if no exact match, just match by port (in case forward_host is different)
    if (!matchingHost) {
      console.log(`No exact match found, trying port-only match for port ${port}`);
      matchingHost = hosts.find((host) => host.forward_port === port);
      if (matchingHost) {
        console.log(`Matched by port only! Domain: ${matchingHost.domain_names[0]}`);
      }
    }

    if (matchingHost && matchingHost.domain_names.length > 0) {
      // Return the first domain name
      return matchingHost.domain_names[0];
    }

    console.log(`No matching domain found for ${projectName} on port ${port}`);
    return null;
  } catch (error: any) {
    console.error("Error getting domain from NPM:", error?.message || error);
    return null;
  }
}

// Clear cache (useful for testing)
export function clearNPMCache() {
  npmToken = null;
  npmProxyHosts = null;
  npmTokenExpiry = 0;
}

