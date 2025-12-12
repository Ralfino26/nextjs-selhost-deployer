import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createProjectDirectory,
  cloneRepository,
  writeDockerfile,
  writeDockerCompose,
  writeDatabaseCompose,
} from "@/lib/services/filesystem.service";
import { getNextAvailablePort } from "@/lib/services/port.service";

const initializeSchema = z.object({
  repo: z.string().min(1),
  projectName: z.string().min(1),
});

// POST /api/projects/initialize - Initialize project structure (clone repo, create files)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = initializeSchema.parse(body);

    // Create project directory structure
    const projectDir = await createProjectDirectory(data.projectName);

    // Clone repository
    const repoUrl = `https://github.com/${data.repo}.git`;
    await cloneRepository(repoUrl, projectDir);

    // Extract repo name from repo string (e.g., "ralf/my-app" -> "my-app")
    const repoName = data.repo.split("/").pop() || "repo";

    // Write Dockerfile in the repo folder (only if it doesn't exist)
    await writeDockerfile(projectDir, repoName);

    // Get next available port
    const port = await getNextAvailablePort();

    // Write docker-compose.yml in docker folder
    await writeDockerCompose(projectDir, data.projectName, repoName, port);

    // Write database docker-compose.yml in database folder (will be created when database is enabled)
    // We create the folder structure but don't write the file yet until user confirms database

    return NextResponse.json({
      success: true,
      projectName: data.projectName,
      repoName,
      port,
      message: "Project structure initialized",
    });
  } catch (error) {
    console.error("Error initializing project:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to initialize project" },
      { status: 500 }
    );
  }
}

