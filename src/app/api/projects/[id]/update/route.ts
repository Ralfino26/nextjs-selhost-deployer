import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { config } from "@/lib/config";
import { isAuthenticated } from "@/lib/auth";

const execAsync = promisify(exec);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthenticated(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

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

    // Get current remote URL first
    let remoteUrl: string;
    try {
      const remoteResult = await execAsync("git config --get remote.origin.url", { 
        cwd: repoPath,
        shell: "/bin/sh"
      });
      remoteUrl = remoteResult.stdout.trim();
    } catch (error: any) {
      console.error("Failed to get remote URL:", error);
      return NextResponse.json(
        { error: "Failed to get git remote URL. Is this a git repository?" },
        { status: 400 }
      );
    }

    // If it's a GitHub URL and we have a token, use it
    if (remoteUrl.includes("github.com") && config.githubToken) {
      // Extract repo path from URL
      let repoPathFromUrl = remoteUrl;
      
      if (repoPathFromUrl.startsWith("git@")) {
        // git@github.com:owner/repo.git -> owner/repo
        repoPathFromUrl = repoPathFromUrl.replace("git@github.com:", "").replace(/\.git$/, "");
      } else if (repoPathFromUrl.startsWith("https://")) {
        // https://github.com/owner/repo.git -> owner/repo
        // Or https://token@github.com/owner/repo.git -> owner/repo
        // Remove protocol and domain, keep only owner/repo
        repoPathFromUrl = repoPathFromUrl.replace(/^https:\/\/([^@]+@)?github\.com\//, "").replace(/\.git$/, "");
        // Also handle cases where it might already have github.com/github.com
        repoPathFromUrl = repoPathFromUrl.replace(/^github\.com\//, "");
      } else {
        repoPathFromUrl = repoPathFromUrl.replace(/\.git$/, "");
      }
      
      // Clean up the repo path - remove any remaining github.com prefix
      repoPathFromUrl = repoPathFromUrl.trim();
      // Remove any github.com/ prefix that might have been left (handle double prefix)
      while (repoPathFromUrl.startsWith("github.com/")) {
        repoPathFromUrl = repoPathFromUrl.replace(/^github\.com\//, "");
      }
      
      // Validate: should be in format "owner/repo" without github.com
      if (!repoPathFromUrl || repoPathFromUrl.includes("github.com") || !repoPathFromUrl.includes("/")) {
        console.error("Invalid repo path extracted:", repoPathFromUrl, "from original URL:", remoteUrl);
        return NextResponse.json(
          { error: `Could not extract valid repository path from remote URL: ${remoteUrl}. Extracted: ${repoPathFromUrl}` },
          { status: 400 }
        );
      }

      // Update remote URL with token (same format as used in clone)
      const newUrl = `https://${config.githubToken}@github.com/${repoPathFromUrl}.git`;
      console.log(`Updating remote URL from: ${remoteUrl} to: https://***@github.com/${repoPathFromUrl}.git`);
      
      try {
        await execAsync(`git remote set-url origin "${newUrl}"`, { 
          cwd: repoPath,
          shell: "/bin/sh"
        });
      } catch (error: any) {
        console.error("Failed to update remote URL:", error);
        return NextResponse.json(
          { error: `Failed to update git remote: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // Now pull
    try {
      // Get current branch first
      const branchResult = await execAsync("git branch --show-current", {
        cwd: repoPath,
        shell: "/bin/sh"
      });
      const currentBranch = branchResult.stdout.trim();
      
      if (!currentBranch) {
        return NextResponse.json(
          { error: "Could not determine current branch" },
          { status: 400 }
        );
      }

      // Pull with token in URL (already set above)
      const pullResult = await execAsync(`git pull origin ${currentBranch}`, { 
        cwd: repoPath,
        shell: "/bin/sh",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
      });
      
      return NextResponse.json({
        success: true,
        message: "Project updated successfully",
        output: pullResult.stdout,
      });
    } catch (gitError: any) {
      console.error("Git pull failed:", gitError);
      const errorMessage = gitError.stderr || gitError.message || "Unknown error";
      
      // Provide more helpful error messages for common issues
      let userFriendlyError = errorMessage;
      if (errorMessage.includes("403") || errorMessage.includes("Write access") || errorMessage.includes("not granted")) {
        userFriendlyError = `Authentication failed. Please check:
1. Your GitHub token has 'repo' scope enabled
2. The token is valid and not expired
3. The token has access to this repository
Original error: ${errorMessage}`;
      } else if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
        userFriendlyError = `Authentication failed. Please verify your GitHub token in Settings.
Original error: ${errorMessage}`;
      }
      
      return NextResponse.json(
        { error: `Failed to update repository: ${userFriendlyError}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update project" },
      { status: 500 }
    );
  }
}

