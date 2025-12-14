/**
 * Centralized default configuration values
 * These are used as fallbacks when config.json is missing or corrupt
 * IMPORTANT: These values must always work and be consistent across the entire application
 */

export interface DefaultConfigData {
  githubToken: string;
  mongoUser: string;
  mongoPassword: string;
  mongoDefaultDatabase: string;
  projectsBaseDir: string;
  backupBaseDir: string;
  startingPort: number;
  websitesNetwork: string;
  infraNetwork: string;
  npmUrl: string;
  npmEmail: string;
  npmPassword: string;
}

/**
 * Get default configuration values
 * These are the hardcoded defaults that will ALWAYS work
 */
export function getDefaultConfig(): DefaultConfigData {
  return {
    githubToken: "",
    mongoUser: "ralf",
    mongoPassword: "supersecret",
    mongoDefaultDatabase: "admin",
    projectsBaseDir: "/srv/vps/websites",
    backupBaseDir: "/srv/vps/backups",
    startingPort: 5000,
    websitesNetwork: "websites_network",
    infraNetwork: "infra_network",
    npmUrl: process.env.NPM_URL || "http://nginx-proxy-manager:81",
    npmEmail: process.env.NPM_EMAIL || "",
    npmPassword: process.env.NPM_PASSWORD || "",
  };
}

