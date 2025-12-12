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

    const envPath = join(projectDir, repoDir.name, ".env.local");

    try {
      const content = await readFile(envPath, "utf-8");
      const variables: EnvironmentVariable[] = content
        .split("\n")
        .filter((line) => line.trim() && !line.startsWith("#"))
        .map((line) => {
          const [key, ...valueParts] = line.split("=");
          return {
            key: key.trim(),
            value: valueParts.join("=").trim(),
          };
        });

      return NextResponse.json({ variables });
    } catch {
      // .env.local doesn't exist, return empty
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

    const envPath = join(projectDir, repoDir.name, ".env.local");

    // Write environment variables
    const content = data.variables
      .map((v) => `${v.key}=${v.value}`)
      .join("\n");

    await writeFile(envPath, content, "utf-8");

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

