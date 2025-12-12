import { readFileSync } from "fs";
import { join } from "path";
import { existsSync } from "fs";

const CONFIG_FILE = join(process.cwd(), "data", "config.json");

interface ConfigData {
  githubToken: string;
  mongoUser: string;
  mongoPassword: string;
  mongoDefaultDatabase: string;
  projectsBaseDir: string;
  startingPort: number;
  websitesNetwork: string;
  infraNetwork: string;
  npmUrl?: string;
  npmEmail?: string;
  npmPassword?: string;
}

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
      cachedConfig = JSON.parse(content);
      return cachedConfig!;
    } catch (error) {
      console.error("Error reading config.json:", error);
    }
  }

  // Return defaults if config.json doesn't exist
  const defaults: ConfigData = {
    githubToken: "",
    mongoUser: "ralf",
    mongoPassword: "supersecret",
    mongoDefaultDatabase: "admin",
    projectsBaseDir: "/srv/vps/websites",
    startingPort: 5000,
    websitesNetwork: "websites_network",
    infraNetwork: "infra_network",
    npmUrl: process.env.NPM_URL || "http://nginx-proxy-manager:81",
    npmEmail: process.env.NPM_EMAIL || "",
    npmPassword: process.env.NPM_PASSWORD || "",
  };
  
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
  
  get database(): {
    user: string;
    password: string;
    defaultDatabase: string;
  } {
    const c = loadConfig();
    return {
      user: c.mongoUser,
      password: c.mongoPassword,
      defaultDatabase: c.mongoDefaultDatabase,
    };
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
