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

    // Read environment variables from .env file in repo directory
    const envFilePath = join(projectDir, repoDir.name, ".env");
    const variables: EnvironmentVariable[] = [];

    try {
      const content = await readFile(envFilePath, "utf-8");
      
      // Parse .env file (key=value format)
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        
        // Parse KEY=VALUE or KEY="VALUE"
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          variables.push({ key, value });
        }
      }
    } catch (error: any) {
      // .env file doesn't exist, return empty array
      if (error?.code !== "ENOENT") {
        console.error("Error reading .env file:", error);
      }
    }

    return NextResponse.json({ variables });
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

    // Write environment variables to .env file in repo directory
    const envFilePath = join(projectDir, repoDir.name, ".env");
    
    // Build .env file content
    const envContent = data.variables
      .map((v) => {
        // Escape value if it contains spaces or special characters
        const value = v.value.includes(" ") || v.value.includes("=") 
          ? `"${v.value.replace(/"/g, '\\"')}"` 
          : v.value;
        return `${v.key}=${value}`;
      })
      .join("\n");
    
    await writeFile(envFilePath, envContent, "utf-8");
    
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

