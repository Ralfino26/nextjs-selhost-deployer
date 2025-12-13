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
  containerId?: string;
  containerImage?: string;
  containerCreated?: string;
  containerNetworks?: string[];
  dockerComposePath?: string;
  repoPath?: string;
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

