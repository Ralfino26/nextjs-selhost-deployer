// Configuration for deployment manager
export const config = {
  // Base directory where all projects are stored
  projectsBaseDir: process.env.PROJECTS_BASE_DIR || "/srv/vps/websites",
  
  // Starting port for projects (will auto-increment from 5000)
  startingPort: parseInt(process.env.STARTING_PORT || "5000", 10),
  
  // Docker network names
  websitesNetwork: process.env.WEBSITES_NETWORK || "websites_network",
  infraNetwork: process.env.INFRA_NETWORK || "infra_network",
  
  // GitHub API token (optional, for private repos)
  githubToken: process.env.GITHUB_TOKEN || "",
  
  // MongoDB default credentials
  database: {
    user: process.env.MONGO_USER || "ralf",
    password: process.env.MONGO_PASSWORD || "supersecret",
    defaultDatabase: process.env.MONGO_DEFAULT_DATABASE || "admin",
  },
};

