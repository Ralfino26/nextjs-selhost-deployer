import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createProjectDirectory,
  cloneRepository,
  writeDockerfile,
  writeDockerCompose,
  writeDatabaseCompose,
} from "@/lib/services/filesystem.service";

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

    // Clone repository using gh repo clone (format: "Ralfino26/repo-name")
    const repoName = await cloneRepository(data.repo, projectDir);

    // Write Dockerfile in the repo folder (only if it doesn't exist)
    await writeDockerfile(projectDir, repoName);

    // Don't create docker-compose.yml yet - user will choose port in step 2
    // We create the folder structure but don't write the file yet until user confirms port

    return NextResponse.json({
      success: true,
      projectName: data.projectName,
      repoName,
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

