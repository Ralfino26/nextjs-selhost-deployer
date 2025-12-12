import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { config } from "@/lib/config";
import { deployProject } from "@/lib/services/docker.service";

const execAsync = promisify(exec);

export async function POST(
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

    const repoPath = join(projectDir, repoDir.name);

    // Use gh repo sync as per your workflow
    try {
      await execAsync("gh repo sync", { cwd: repoPath });
    } catch (error) {
      // Fall back to git pull if gh CLI not available
      console.warn("GitHub CLI not available, falling back to git pull");
      await execAsync("git pull", { cwd: repoPath });
    }

    // Rebuild and redeploy
    await deployProject(projectName);

    return NextResponse.json({
      success: true,
      message: "Project updated and redeployed",
    });
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

