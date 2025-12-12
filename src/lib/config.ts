// Configuration for deployment manager
export const config = {
  // Base directory where all projects are stored
  projectsBaseDir: process.env.PROJECTS_BASE_DIR || "/srv/vps/websites",
  
  // Starting port for projects (will auto-increment)
  startingPort: parseInt(process.env.STARTING_PORT || "3000", 10),
  
  // Docker network name
  dockerNetwork: process.env.DOCKER_NETWORK || "deployment-network",
  
  // GitHub API token (optional, for private repos)
  githubToken: process.env.GITHUB_TOKEN || "",
  
  // Database default credentials
  database: {
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    defaultDatabase: process.env.DB_DEFAULT_DATABASE || "postgres",
  },
};

