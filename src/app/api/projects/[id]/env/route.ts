import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { config } from "@/lib/config";
import { EnvironmentVariable } from "@/types/project";
import { z } from "zod";

const envSchema = z.object({
  variables: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ),
});

// GET /api/projects/[id]/env - Get environment variables
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectName = id;
    const projectDir = join(config.projectsBaseDir, projectName);

    // Find repo directory
    const { readdir } = await import("fs/promises");
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

    // Read environment variables from docker-compose.yml
    const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");

    try {
      const content = await readFile(dockerComposePath, "utf-8");
      const variables: EnvironmentVariable[] = [];
      
      // Parse environment section from docker-compose.yml
      const envMatch = content.match(/environment:\s*\n((?:\s+[^:\n]+:[^\n]+\n?)+)/);
      if (envMatch) {
        const envLines = envMatch[1].trim().split("\n");
        for (const line of envLines) {
          const match = line.trim().match(/^([^:]+):\s*(.+)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            // Skip NODE_ENV as it's always there
            if (key !== "NODE_ENV") {
              variables.push({ key, value });
            }
          }
        }
      }

      return NextResponse.json({ variables });
    } catch {
      // docker-compose.yml doesn't exist or can't be read, return empty
      return NextResponse.json({ variables: [] });
    }
  } catch (error) {
    console.error("Error fetching environment variables:", error);
    return NextResponse.json(
      { error: "Failed to fetch environment variables" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/env - Save environment variables
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectName = id;
    const body = await request.json();
    const data = envSchema.parse(body);

    const projectDir = join(config.projectsBaseDir, projectName);

    // Find repo directory
    const { readdir } = await import("fs/promises");
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

    // Update docker-compose.yml with new environment variables
    const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");
    
    // Read existing docker-compose.yml
    const existingContent = await readFile(dockerComposePath, "utf-8");
    
    // Extract port from existing compose file
    const portMatch = existingContent.match(/ports:\s*\n\s+-\s+"(\d+):3000"/);
    const port = portMatch ? parseInt(portMatch[1], 10) : 5000;
    
    // Rebuild docker-compose.yml with new environment variables
    const { writeDockerCompose } = await import("@/lib/services/filesystem.service");
    await writeDockerCompose(projectDir, projectName, repoDir.name, port, data.variables);
    
    // Restart container to apply new environment variables
    const { restartProject } = await import("@/lib/services/docker.service");
    await restartProject(projectName);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving environment variables:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to save environment variables" },
      { status: 500 }
    );
  }
}

