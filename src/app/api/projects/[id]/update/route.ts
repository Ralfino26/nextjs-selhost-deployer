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

    // Always use GitHub token if available
    if (!config.githubToken) {
      return NextResponse.json(
        { error: "GitHub token not configured. Please set it in Settings." },
        { status: 400 }
      );
    }

    // Use gh repo sync as per your workflow (with token)
    try {
      const env = { ...process.env, GITHUB_TOKEN: config.githubToken };
      await execAsync("gh repo sync", { cwd: repoPath, env, shell: "/bin/sh" });
    } catch (error) {
      // Fall back to git pull if gh CLI not available
      console.warn("GitHub CLI not available, falling back to git pull with token");
      
      try {
        // Get current remote URL
        const remoteResult = await execAsync("git config --get remote.origin.url", { 
          cwd: repoPath,
          shell: "/bin/sh"
        });
        const remoteUrl = remoteResult.stdout.trim();
        
        // If it's a GitHub URL, update remote with token
        if (remoteUrl.includes("github.com")) {
          // Extract repo path from URL (handle both https://github.com/owner/repo.git and git@github.com:owner/repo.git)
          let repoPathFromUrl = remoteUrl;
          if (repoPathFromUrl.startsWith("git@")) {
            repoPathFromUrl = repoPathFromUrl.replace("git@github.com:", "").replace(".git", "");
          } else {
            repoPathFromUrl = repoPathFromUrl.replace("https://github.com/", "").replace(".git", "");
            // Remove token if already present
            repoPathFromUrl = repoPathFromUrl.replace(/^[^@]+@/, "");
          }
          
          // Update remote URL with token
          const newUrl = `https://${config.githubToken}@github.com/${repoPathFromUrl}.git`;
          await execAsync(`git remote set-url origin "${newUrl}"`, { 
            cwd: repoPath,
            shell: "/bin/sh"
          });
          
          // Now pull with the updated remote
          await execAsync("git pull", { 
            cwd: repoPath,
            shell: "/bin/sh"
          });
        } else {
          // Not a GitHub URL, just pull normally
          await execAsync("git pull", { 
            cwd: repoPath,
            shell: "/bin/sh"
          });
        }
      } catch (gitError: any) {
        console.error("Git pull failed:", gitError);
        throw new Error(`Failed to update repository: ${gitError.message}`);
      }
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

