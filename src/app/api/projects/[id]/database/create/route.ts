import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { config } from "@/lib/config";
import { existsSync } from "fs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectName = id;
    const projectDir = join(config.projectsBaseDir, projectName);
    const databaseDir = join(projectDir, "database");

    // Check if project exists
    if (!existsSync(projectDir)) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Check if database already exists
    if (existsSync(databaseDir)) {
      const dockerComposePath = join(databaseDir, "docker-compose.yml");
      if (existsSync(dockerComposePath)) {
        return NextResponse.json(
          { error: "Database already exists for this project" },
          { status: 400 }
        );
      }
    }

    // Create database compose file
    const { writeDatabaseCompose } = await import("@/lib/services/filesystem.service");
    await writeDatabaseCompose(projectDir, projectName);

    // Start database
    const { startDatabase } = await import("@/lib/services/docker.service");
    await startDatabase(projectName);

    return NextResponse.json({ 
      success: true, 
      message: "Database created and started successfully" 
    });
  } catch (error: any) {
    console.error("Error creating database:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create database" },
      { status: 500 }
    );
  }
}

