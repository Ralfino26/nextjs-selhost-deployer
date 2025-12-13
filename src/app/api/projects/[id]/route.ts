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
      } catch (error) {
        console.warn(`Failed to get git info for ${projectName}:`, error);
      }

      // Get Docker container information
      let containerId: string | undefined;
      let containerImage: string | undefined;
      let containerCreated: string | undefined;
      let containerNetworks: string[] | undefined;

      try {
        const { getDocker } = await import("@/lib/services/docker.service");
        const docker = await getDocker();
        const container = docker.getContainer(projectName);
        const info = await container.inspect();
        
        containerId = info.Id.substring(0, 12); // Short ID
        containerImage = info.Config?.Image;
        containerCreated = info.Created ? new Date(info.Created).toLocaleString() : undefined;
        containerNetworks = Object.keys(info.NetworkSettings?.Networks || {});
      } catch (error) {
        console.warn(`Failed to get container info for ${projectName}:`, error);
      }

      const project: ProjectDetails = {
        id: projectName,
        name: projectName,
        repo: repoDir.name,
        port,
        domain: domain || "ERROR: Domain not found in Nginx Proxy Manager",
        createDatabase: hasDatabase,
        status,
        directory: projectDir,
        gitRemote,
        gitBranch,
        gitCommit,
        containerId,
        containerImage,
        containerCreated,
        containerNetworks,
        dockerComposePath,
        repoPath,
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

