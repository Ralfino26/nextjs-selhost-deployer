import { readFileSync } from "fs";
import { join } from "path";
import { existsSync } from "fs";
import { getDefaultConfig, type DefaultConfigData } from "./config-defaults";

const CONFIG_FILE = join(process.cwd(), "data", "config.json");

interface ConfigData extends DefaultConfigData {}

let cachedConfig: ConfigData | null = null;

function loadConfig(): ConfigData {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Try to load from config.json
  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(content);
      
      // Merge with defaults to ensure all fields are present
      // This handles cases where the config file is missing fields
      const defaults = getDefaultConfig();
      const merged: ConfigData = {
        ...defaults,
        ...parsed,
        // Ensure optional fields are preserved
        npmUrl: parsed.npmUrl ?? defaults.npmUrl,
        npmEmail: parsed.npmEmail ?? defaults.npmEmail,
        npmPassword: parsed.npmPassword ?? defaults.npmPassword,
      };
      cachedConfig = merged;
      return merged;
    } catch (error) {
      console.error("[CONFIG] Error reading config.json (corrupt or invalid), using defaults:", error);
      // If file is corrupt, fall back to defaults
    }
  }

  // Return defaults if config.json doesn't exist or is corrupt
  const defaults = getDefaultConfig();
  cachedConfig = defaults;
  return defaults;
}

// Clear cache (call this after saving settings)
export function clearConfigCache() {
  cachedConfig = null;
}

// Configuration object - reads from config.json first, then defaults
export const config = {
  get projectsBaseDir(): string {
    return loadConfig().projectsBaseDir;
  },
  
  get backupBaseDir(): string {
    return loadConfig().backupBaseDir;
  },
  
  get startingPort(): number {
    return loadConfig().startingPort;
  },
  
  get websitesNetwork(): string {
    return loadConfig().websitesNetwork;
  },
  
  get infraNetwork(): string {
    return loadConfig().infraNetwork;
  },
  
  get githubToken(): string {
    return loadConfig().githubToken;
  },
  
  
  get npmUrl(): string {
    return loadConfig().npmUrl || process.env.NPM_URL || "http://nginx-proxy-manager:81";
  },
  
  get npmEmail(): string {
    return loadConfig().npmEmail || process.env.NPM_EMAIL || "";
  },
  
  get npmPassword(): string {
    return loadConfig().npmPassword || process.env.NPM_PASSWORD || "";
  },
};

// Web interface credentials - ONLY from environment variables
export const webAuth = {
  username: process.env.WEB_USERNAME || "ralf",
  password: process.env.WEB_PASSWORD || "supersecret",
};
