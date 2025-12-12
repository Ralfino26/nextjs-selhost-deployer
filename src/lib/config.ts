// Configuration for deployment manager
export const config = {
  // Base directory where all projects are stored
  projectsBaseDir: process.env.PROJECTS_BASE_DIR || "/srv/vps/websites",
  
  // Starting port for projects (will auto-increment)
  startingPort: 3000,
  
  // Docker network name
  dockerNetwork: "deployment-network",
  
  // Database default credentials (should be in env in production)
  database: {
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    defaultDatabase: "postgres",
  },
};

