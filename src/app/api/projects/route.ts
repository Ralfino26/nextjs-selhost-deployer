import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { config } from "@/lib/config";
import { getProjectStatus } from "@/lib/services/docker.service";
import { Project } from "@/types/project";
import { deployProject, startDatabase } from "@/lib/services/docker.service";
import { z } from "zod";

const createProjectSchema = z.object({
  repo: z.string().min(1),
  projectName: z.string().min(1),
  port: z.number().int().positive(),
  domain: z.string().min(1),
  createDatabase: z.boolean(),
  envVars: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ).optional(),
});

// GET /api/projects - List all projects
export async function GET() {
  try {
    const projects: Project[] = [];
    const baseDir = config.projectsBaseDir;
    
    console.log("Fetching projects from:", baseDir);

    try {
      const projectDirs = await readdir(baseDir, { withFileTypes: true });
      console.log("Found directories:", projectDirs.map(d => d.name));

      // First, collect all project data (without domain lookup)
      const projectData: Array<{
        name: string;
        repo: string;
        port: number;
        hasDatabase: boolean;
        status: "Running" | "Stopped" | "Error";
        directory: string;
      }> = [];

      for (const dir of projectDirs) {
        if (!dir.isDirectory()) continue;

        const dockerComposePath = join(
          baseDir,
          dir.name,
          "docker",
          "docker-compose.yml"
        );

        try {
          const content = await readFile(dockerComposePath, "utf-8");
          const portMatch = content.match(/ports:\s*-\s*"(\d+):/);
          const port = portMatch ? parseInt(portMatch[1], 10) : 0;

          // Find repo name by looking for directories inside project dir
          const projectSubDirs = await readdir(join(baseDir, dir.name), {
            withFileTypes: true,
          });
          const repoDir = projectSubDirs.find(
            (d) => d.isDirectory() && d.name !== "docker" && d.name !== "database"
          );

          if (!repoDir) {
            console.warn(`Skipping project ${dir.name}: no repository directory found`);
            continue;
          }

          // Get status
          const hasDatabase = projectSubDirs.some(
            (d) => d.isDirectory() && d.name === "database"
          );
          
          const status = await getProjectStatus(dir.name);

          projectData.push({
            name: dir.name,
            repo: repoDir.name,
            port,
            hasDatabase,
            status,
            directory: join(baseDir, dir.name),
          });
        } catch {
          // Skip projects without docker-compose.yml
        }
      }

      // Now fetch domains in parallel (with timeout)
      const { getDomainForProject } = await import("@/lib/services/nginx.service");
      const domainPromises = projectData.map(async (data) => {
        try {
          const domainPromise = getDomainForProject(data.name, data.port);
          const timeoutPromise = new Promise<null>((resolve) => 
            setTimeout(() => resolve(null), 3000) // 3 second timeout per project
          );
          return await Promise.race([domainPromise, timeoutPromise]);
        } catch (error) {
          console.warn(`Failed to get domain from NPM for ${data.name}: ${error}`);
          return null;
        }
      });

      const domains = await Promise.all(domainPromises);

      // Combine project data with domains
      for (let i = 0; i < projectData.length; i++) {
        projects.push({
          id: projectData[i].name,
          name: projectData[i].name,
          repo: projectData[i].repo,
          port: projectData[i].port,
          domain: domains[i] || "ERROR: Domain not found in Nginx Proxy Manager",
          createDatabase: projectData[i].hasDatabase,
          status: projectData[i].status,
          directory: projectData[i].directory,
        });
      }
    } catch (error: any) {
      // Base directory doesn't exist, return empty array
      console.error("Error reading projects directory:", error);
      console.error("Base directory:", baseDir);
      console.error("Error code:", error?.code);
      console.error("Error message:", error?.message);
      
      // Return empty array if directory doesn't exist
      if (error?.code === "ENOENT") {
        return NextResponse.json([]);
      }
    }

    console.log("Returning projects:", projects.length);
    return NextResponse.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create/finalize a new project (structure should already exist from initialize)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createProjectSchema.parse(body);

    const projectDir = join(config.projectsBaseDir, data.projectName);
    
    // Check if project structure already exists (from initialize)
    const { existsSync } = await import("fs");
    if (!existsSync(projectDir)) {
      return NextResponse.json(
        { error: "Project structure not found. Please initialize the project first." },
        { status: 400 }
      );
    }

    // Extract repo name
    const repoName = data.repo.split("/").pop() || "repo";

    // Write docker-compose.yml with chosen port and environment variables
    const { writeDockerCompose } = await import("@/lib/services/filesystem.service");
    await writeDockerCompose(
      projectDir,
      data.projectName,
      repoName,
      data.port,
      data.envVars || []
    );

    // Write database compose if needed
    if (data.createDatabase) {
      const { writeDatabaseCompose } = await import("@/lib/services/filesystem.service");
      // Use project name as database name
      await writeDatabaseCompose(projectDir, data.projectName, data.projectName);
      await startDatabase(data.projectName);
    }

    // Deploy the project
    await deployProject(data.projectName);

    const project: Project = {
      id: data.projectName,
      name: data.projectName,
      repo: data.repo,
      port: data.port,
      domain: data.domain,
      createDatabase: data.createDatabase,
      status: "Building",
      directory: projectDir,
    };

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}

