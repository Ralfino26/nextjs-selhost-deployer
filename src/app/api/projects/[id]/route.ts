import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { config } from "@/lib/config";
import { getProjectStatus } from "@/lib/services/docker.service";
import { ProjectDetails } from "@/types/project";

const execAsync = promisify(exec);

// GET /api/projects/[id] - Get a single project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectName = id;
    const projectDir = join(config.projectsBaseDir, projectName);

    const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");

    try {
      const content = await readFile(dockerComposePath, "utf-8");
      const portMatch = content.match(/ports:\s*-\s*"(\d+):/);
      const port = portMatch ? parseInt(portMatch[1], 10) : 0;

      // Find repo name
      const projectSubDirs = await readdir(projectDir, { withFileTypes: true });
      const repoDir = projectSubDirs.find(
        (d) => d.isDirectory() && d.name !== "docker" && d.name !== "database"
      );

      if (!repoDir) {
        return NextResponse.json(
          { error: "Repository directory not found" },
          { status: 404 }
        );
      }

      const hasDatabase = projectSubDirs.some(
        (d) => d.isDirectory() && d.name === "database"
      );

      // Get domain from Nginx Proxy Manager (with timeout)
      let domain: string | null = null;
      try {
        const { getDomainForProject } = await import("@/lib/services/nginx.service");
        // Add timeout to prevent hanging
        const domainPromise = getDomainForProject(projectName, port);
        const timeoutPromise = new Promise<null>((resolve) => 
          setTimeout(() => resolve(null), 2000) // 2 second timeout
        );
        domain = await Promise.race([domainPromise, timeoutPromise]);
      } catch (error) {
        console.warn(`Failed to get domain from NPM for ${projectName}: ${error}`);
      }

      // Get status regardless of domain
      const status = await getProjectStatus(projectName);

      const repoPath = join(projectDir, repoDir.name);

      // Get Git information
      let gitRemote: string | undefined;
      let gitBranch: string | undefined;
      let gitCommit: string | undefined;
      let gitCommitMessage: string | undefined;
      let gitCommitAuthor: string | undefined;
      let gitCommitDate: string | undefined;
      
      try {
        const gitRemoteResult = await execAsync("git config --get remote.origin.url", {
          cwd: repoPath,
          shell: "/bin/sh"
        }).catch(() => ({ stdout: "" }));
        gitRemote = gitRemoteResult.stdout.trim() || undefined;

        const gitBranchResult = await execAsync("git rev-parse --abbrev-ref HEAD", {
          cwd: repoPath,
          shell: "/bin/sh"
        }).catch(() => ({ stdout: "" }));
        gitBranch = gitBranchResult.stdout.trim() || undefined;

        const gitCommitResult = await execAsync("git rev-parse --short HEAD", {
          cwd: repoPath,
          shell: "/bin/sh"
        }).catch(() => ({ stdout: "" }));
        gitCommit = gitCommitResult.stdout.trim() || undefined;

        // Get detailed commit information
        if (gitCommit) {
          try {
            const gitLogResult = await execAsync(
              `git log -1 --pretty=format:"%s|%an|%ai" HEAD`,
              { cwd: repoPath, shell: "/bin/sh" }
            ).catch(() => ({ stdout: "" }));
            
            const logParts = gitLogResult.stdout.trim().split("|");
            if (logParts.length === 3) {
              gitCommitMessage = logParts[0] || undefined;
              gitCommitAuthor = logParts[1] || undefined;
              gitCommitDate = logParts[2] ? new Date(logParts[2]).toLocaleString() : undefined;
            }
          } catch (error) {
            // Ignore errors for detailed commit info
          }
        }
      } catch (error) {
        console.warn(`Failed to get git info for ${projectName}:`, error);
      }

      // Get Docker container information
      let containerId: string | undefined;
      let containerImage: string | undefined;
      let containerCreated: string | undefined;
      let containerNetworks: string[] | undefined;
      let containerMetrics: ProjectDetails["containerMetrics"] | undefined;
      let containerHealth: ProjectDetails["containerHealth"] | undefined;
      let volumeMounts: ProjectDetails["volumeMounts"] | undefined;
      let lastDeployment: string | undefined;

      try {
        const { getDocker } = await import("@/lib/services/docker.service");
        const docker = await getDocker();
        const container = docker.getContainer(projectName);
        const info = await container.inspect();
        
        containerId = info.Id.substring(0, 12); // Short ID
        containerImage = info.Config?.Image;
        containerCreated = info.Created ? new Date(info.Created).toLocaleString() : undefined;
        containerNetworks = Object.keys(info.NetworkSettings?.Networks || {});
        
        // Get health check status
        if (info.State.Health) {
          containerHealth = info.State.Health.Status as "healthy" | "unhealthy" | "starting" | "none";
        } else {
          containerHealth = "none";
        }
        
        // Get volume mounts
        if (info.Mounts && info.Mounts.length > 0) {
          volumeMounts = info.Mounts.map((mount: any) => ({
            source: mount.Source || mount.source || "",
            destination: mount.Destination || mount.destination || "",
            type: mount.Type || mount.type || "bind",
          }));
        }
        
        // Get restart count
        const restartCount = info.RestartCount || 0;
        
        // Get uptime (if running)
        let uptime: number | undefined;
        if (info.State.Running && info.State.StartedAt) {
          const startedAt = new Date(info.State.StartedAt).getTime();
          uptime = Math.floor((Date.now() - startedAt) / 1000); // seconds
        }
        
        // Get container metrics (CPU, Memory) if running
        if (info.State.Running) {
          try {
            const stats = await container.stats({ stream: false });
            const statsData = stats as any;
            
            // Calculate CPU usage percentage
            let cpuUsage: number | undefined;
            if (statsData.cpu_stats && statsData.precpu_stats) {
              const cpuDelta = statsData.cpu_stats.cpu_usage.total_usage - statsData.precpu_stats.cpu_usage.total_usage;
              const systemDelta = statsData.cpu_stats.system_cpu_usage - statsData.precpu_stats.system_cpu_usage;
              const numCpus = statsData.cpu_stats.online_cpus || 1;
              
              if (systemDelta > 0 && cpuDelta > 0) {
                cpuUsage = (cpuDelta / systemDelta) * numCpus * 100;
                cpuUsage = Math.round(cpuUsage * 100) / 100; // Round to 2 decimals
              }
            }
            
            // Get memory usage
            let memoryUsage: number | undefined;
            let memoryLimit: number | undefined;
            if (statsData.memory_stats) {
              memoryUsage = statsData.memory_stats.usage || statsData.memory_stats.used || undefined;
              memoryLimit = statsData.memory_stats.limit || undefined;
            }
            
            containerMetrics = {
              cpuUsage,
              memoryUsage,
              memoryLimit,
              uptime,
              restartCount,
            };
          } catch (error) {
            // If stats fail, still include what we have
            containerMetrics = {
              uptime,
              restartCount,
            };
          }
        } else {
          containerMetrics = {
            restartCount,
          };
        }
        
        // Use container start time as last deployment time
        if (info.State.StartedAt) {
          lastDeployment = new Date(info.State.StartedAt).toLocaleString();
        }
      } catch (error) {
        console.warn(`Failed to get container info for ${projectName}:`, error);
      }

      // Get Database information if database exists
      let databaseInfo: ProjectDetails["database"] | undefined;
      
      if (hasDatabase) {
        try {
          const databaseComposePath = join(projectDir, "database", "docker-compose.yml");
          const databaseComposeContent = await readFile(databaseComposePath, "utf-8").catch(() => "");
          
          // Extract database info from docker-compose.yml
          const dbNameMatch = databaseComposeContent.match(/MONGO_INITDB_DATABASE:\s*(\w+)/);
          const portMatch = databaseComposeContent.match(/ports:\s*-\s*"(\d+):/);
          const imageMatch = databaseComposeContent.match(/image:\s*([^\s]+)/);
          
          const databaseName = dbNameMatch ? dbNameMatch[1] : projectName;
          const databasePort = portMatch ? parseInt(portMatch[1], 10) : undefined;
          const databaseImage = imageMatch ? imageMatch[1] : undefined;
          const databaseVolumePath = join(projectDir, "database", "data");
          
          // Get database container information
          const dbContainerName = `${projectName}-mongo`;
          let dbContainerId: string | undefined;
          let dbContainerStatus: "Running" | "Stopped" | "Error" | undefined;
          let dbContainerImage: string | undefined;
          
          try {
            const { getDocker } = await import("@/lib/services/docker.service");
            const docker = await getDocker();
            const dbContainer = docker.getContainer(dbContainerName);
            const dbInfo = await dbContainer.inspect();
            
            dbContainerId = dbInfo.Id.substring(0, 12);
            dbContainerImage = dbInfo.Config?.Image;
            
            if (dbInfo.State.Running) {
              dbContainerStatus = "Running";
            } else if (dbInfo.State.Status === "exited") {
              dbContainerStatus = "Stopped";
            } else {
              dbContainerStatus = "Error";
            }
          } catch (error) {
            // Database container might not exist or not be running
            dbContainerStatus = "Stopped";
          }
          
          // Generate connection string
          const dbUser = config.database.user;
          const dbPassword = config.database.password;
          const connectionString = `mongodb://${dbUser}:${dbPassword}@${dbContainerName}:27017/${databaseName}`;
          
          databaseInfo = {
            containerId: dbContainerId,
            containerStatus: dbContainerStatus,
            containerImage: dbContainerImage || databaseImage,
            databaseName,
            port: databasePort,
            connectionString,
            volumePath: databaseVolumePath,
            username: dbUser,
          };
        } catch (error) {
          console.warn(`Failed to get database info for ${projectName}:`, error);
        }
      }

      const project: ProjectDetails = {
        id: projectName,
        name: projectName,
        repo: repoDir.name,
        port,
        domain: domain || "ERROR: Domain not found in Nginx Proxy Manager",
        createDatabase: hasDatabase,
        status,
        lastDeployment: lastDeployment,
        directory: projectDir,
        gitRemote,
        gitBranch,
        gitCommit,
        gitCommitMessage,
        gitCommitAuthor,
        gitCommitDate,
        containerId,
        containerImage,
        containerCreated,
        containerNetworks,
        containerMetrics,
        containerHealth,
        volumeMounts,
        dockerComposePath,
        repoPath,
        database: databaseInfo,
      };

      return NextResponse.json(project);
    } catch (error) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectName = id;
    const { deleteProject } = await import("@/lib/services/docker.service");
    
    await deleteProject(projectName);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}

