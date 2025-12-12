import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { config } from "@/lib/config";
import { getProjectStatus } from "@/lib/services/docker.service";
import { Project } from "@/types/project";

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

      const status = await getProjectStatus(projectName);
      const hasDatabase = projectSubDirs.some(
        (d) => d.isDirectory() && d.name === "database"
      );

      // Try to read domain from metadata.json
      let domain = `${projectName}.byralf.com`; // Default
      try {
        const metadataPath = join(projectDir, "metadata.json");
        const metadataContent = await readFile(metadataPath, "utf-8");
        const metadata = JSON.parse(metadataContent);
        if (metadata.domain) {
          domain = metadata.domain;
        }
      } catch {
        // No metadata file, use default
      }

      const project: Project = {
        id: projectName,
        name: projectName,
        repo: repoDir?.name || "unknown",
        port,
        domain,
        createDatabase: hasDatabase,
        status,
        directory: projectDir,
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

