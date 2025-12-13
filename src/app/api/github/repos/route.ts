import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { webAuth } from "@/lib/config";

// Basic authentication middleware
function authenticate(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  const base64 = authHeader.substring(6);
  const credentials = Buffer.from(base64, "base64").toString("utf-8");
  const [username, password] = credentials.split(":");

  return username === webAuth.username && password === webAuth.password;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  language: string | null;
  updated_at: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
}

// GET /api/github/repos - Get all GitHub repositories for the authenticated user
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    if (!authenticate(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const githubToken = config.githubToken || process.env.GITHUB_TOKEN;
    
    if (!githubToken) {
      return NextResponse.json(
        { error: "GitHub token not configured. Please set it in Settings." },
        { status: 400 }
      );
    }

    // Fetch all repositories (including private ones)
    const repos: GitHubRepo[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&direction=desc`,
        {
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "nextjs-selhost-deployer",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`GitHub API error: ${response.status} ${errorText}`);
        return NextResponse.json(
          { error: `Failed to fetch repositories: ${response.status} ${errorText}` },
          { status: response.status }
        );
      }

      const pageRepos: GitHubRepo[] = await response.json();
      repos.push(...pageRepos);

      // Check if there are more pages
      const linkHeader = response.headers.get("link");
      hasMore = linkHeader?.includes('rel="next"') || false;
      page++;
    }

    return NextResponse.json(repos);
  } catch (error: any) {
    console.error("Error fetching GitHub repositories:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch GitHub repositories" },
      { status: 500 }
    );
  }
}

