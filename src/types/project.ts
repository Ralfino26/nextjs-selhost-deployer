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

