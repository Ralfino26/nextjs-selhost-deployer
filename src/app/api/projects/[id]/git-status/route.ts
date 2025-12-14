import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { config } from "@/lib/config";
import { isAuthenticated } from "@/lib/auth";

const execAsync = promisify(exec);

export async function GET(
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
        { error: "Repository directory not found", isBehind: false },
        { status: 404 }
      );
    }

    const repoPath = join(projectDir, repoDir.name);

    // Fetch latest from remote (without merging)
    try {
      await execAsync("git fetch origin", {
        cwd: repoPath,
        shell: "/bin/sh",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        timeout: 10000, // 10 second timeout
      });
    } catch (error) {
      console.warn(`[GIT STATUS] Failed to fetch for ${projectName}:`, error);
      // Continue anyway, might be network issue
    }

    // Get current branch
    let currentBranch: string;
    try {
      const branchResult = await execAsync("git rev-parse --abbrev-ref HEAD", {
        cwd: repoPath,
        shell: "/bin/sh",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      currentBranch = branchResult.stdout.trim();
    } catch (error) {
      return NextResponse.json(
        { error: "Could not determine current branch", isBehind: false },
        { status: 400 }
      );
    }

    // Get local commit hash
    let localCommit: string;
    try {
      const localResult = await execAsync("git rev-parse HEAD", {
        cwd: repoPath,
        shell: "/bin/sh",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      localCommit = localResult.stdout.trim();
    } catch (error) {
      return NextResponse.json(
        { error: "Could not get local commit", isBehind: false },
        { status: 400 }
      );
    }

    // Get remote commit hash
    let remoteCommit: string;
    try {
      const remoteResult = await execAsync(`git rev-parse origin/${currentBranch}`, {
        cwd: repoPath,
        shell: "/bin/sh",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      remoteCommit = remoteResult.stdout.trim();
    } catch (error) {
      // Remote branch might not exist or network issue
      return NextResponse.json({
        isBehind: false,
        error: "Could not get remote commit",
        currentBranch,
        localCommit: localCommit.substring(0, 7),
      });
    }

    // Check if local is behind remote
    const isBehind = localCommit !== remoteCommit;

    // Get number of commits behind (if behind)
    let commitsBehind = 0;
    if (isBehind) {
      try {
        const behindResult = await execAsync(
          `git rev-list --count HEAD..origin/${currentBranch}`,
          {
            cwd: repoPath,
            shell: "/bin/sh",
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          }
        );
        commitsBehind = parseInt(behindResult.stdout.trim(), 10) || 0;
      } catch (error) {
        // Couldn't count, but we know it's behind
        commitsBehind = -1;
      }
    }

    return NextResponse.json({
      isBehind,
      commitsBehind,
      currentBranch,
      localCommit: localCommit.substring(0, 7),
      remoteCommit: remoteCommit.substring(0, 7),
    });
  } catch (error) {
    console.error("Error checking git status:", error);
    return NextResponse.json(
      { error: "Failed to check git status", isBehind: false },
      { status: 500 }
    );
  }
}

