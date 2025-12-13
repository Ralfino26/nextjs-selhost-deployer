export interface Project {
  id: string;
  name: string;
  repo: string;
  port: number;
  domain: string;
  createDatabase: boolean;
  status: "Running" | "Stopped" | "Building" | "Error";
  lastDeployment?: string;
  directory: string;
}

export interface ProjectDetails extends Project {
  gitRemote?: string;
  gitBranch?: string;
  gitCommit?: string;
  gitCommitMessage?: string;
  gitCommitAuthor?: string;
  gitCommitDate?: string;
  containerId?: string;
  containerImage?: string;
  containerCreated?: string;
  containerNetworks?: string[];
  containerMetrics?: {
    cpuUsage?: number; // percentage
    memoryUsage?: number; // bytes
    memoryLimit?: number; // bytes
    uptime?: number; // seconds
    restartCount?: number;
    networkRx?: number; // bytes received
    networkTx?: number; // bytes transmitted
  };
  visitorStats?: {
    activeConnections?: number; // Real-time active TCP connections
    visitorsLastHour?: number; // Unique visitors in last hour (from NPM logs)
    requestsLastHour?: number; // Total requests in last hour
    visitorsToday?: number; // Unique visitors today
    requestsToday?: number; // Total requests today
  };
  containerHealth?: "healthy" | "unhealthy" | "starting" | "none";
  volumeMounts?: Array<{
    source: string;
    destination: string;
    type: string;
  }>;
  dockerComposePath?: string;
  repoPath?: string;
  database?: {
    containerId?: string;
    containerStatus?: "Running" | "Stopped" | "Error";
    containerImage?: string;
    databaseName?: string;
    port?: number;
    connectionString?: string;
    volumePath?: string;
    username?: string;
  };
}

export interface CreateProjectRequest {
  repo: string;
  projectName: string;
  port: number;
  domain: string;
  createDatabase: boolean;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
}

