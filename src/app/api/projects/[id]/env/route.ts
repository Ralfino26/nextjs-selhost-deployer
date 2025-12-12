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

    const variables: EnvironmentVariable[] = [];
    const repoPath = join(projectDir, repoDir.name);
    
    // First, try to read from .env files in the repo (official source)
    const envFiles = [".env.local", ".env", ".env.production", ".env.example"];
    for (const envFile of envFiles) {
      const envFilePath = join(repoPath, envFile);
      try {
        const envContent = await readFile(envFilePath, "utf-8");
        const envLines = envContent.split("\n");
        for (const line of envLines) {
          // Skip comments and empty lines
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine.startsWith("#")) continue;
          
          // Parse KEY=VALUE format
          const match = trimmedLine.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, ""); // Remove quotes
            // Don't add duplicates
            if (!variables.find(v => v.key === key)) {
              variables.push({ key, value });
            }
          }
        }
      } catch {
        // File doesn't exist, continue to next
      }
    }

    // Also read from docker-compose.yml (deployed values)
    const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");
    try {
      const content = await readFile(dockerComposePath, "utf-8");
      
      // Parse environment section from docker-compose.yml
      const envMatch = content.match(/environment:\s*\n((?:\s+[^:\n]+:[^\n]+\n?)+)/);
      if (envMatch) {
        const envLines = envMatch[1].trim().split("\n");
        for (const line of envLines) {
          const match = line.trim().match(/^([^:]+):\s*(.+)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            // Skip NODE_ENV as it's always there
            if (key !== "NODE_ENV") {
              // Update existing or add new
              const existing = variables.find(v => v.key === key);
              if (existing) {
                existing.value = value; // docker-compose.yml takes precedence
              } else {
                variables.push({ key, value });
              }
            }
          }
        }
      }
    } catch {
      // docker-compose.yml doesn't exist or can't be read
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

    const repoPath = join(projectDir, repoDir.name);
    
    // Update .env.local file in the repo (or .env if .env.local doesn't exist)
    const envLocalPath = join(repoPath, ".env.local");
    const envPath = join(repoPath, ".env");
    
    // Read existing .env.local or .env file
    let envContent = "";
    let targetEnvFile = envLocalPath;
    try {
      envContent = await readFile(envLocalPath, "utf-8");
    } catch {
      try {
        envContent = await readFile(envPath, "utf-8");
        targetEnvFile = envPath;
      } catch {
        // File doesn't exist, will create new one
        envContent = "";
      }
    }
    
    // Parse existing env vars from file
    const existingEnvVars = new Map<string, string>();
    const envLines = envContent.split("\n");
    const newEnvLines: string[] = [];
    
    // Keep comments and empty lines, update existing vars
    for (const line of envLines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        newEnvLines.push(line);
        continue;
      }
      
      const match = trimmedLine.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        existingEnvVars.set(key, match[2].trim().replace(/^["']|["']$/g, ""));
      }
    }
    
    // Update with new variables
    for (const variable of data.variables) {
      existingEnvVars.set(variable.key, variable.value);
    }
    
    // Write updated .env file
    let newEnvContent = "";
    // Keep existing comments and empty lines
    for (const line of envLines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        newEnvContent += line + "\n";
        continue;
      }
      
      const match = trimmedLine.match(/^([^=]+)=/);
      if (match) {
        const key = match[1].trim();
        if (existingEnvVars.has(key)) {
          const value = existingEnvVars.get(key)!;
          newEnvContent += `${key}=${value}\n`;
          existingEnvVars.delete(key); // Mark as written
        }
      }
    }
    
    // Add any new variables that weren't in the file
    for (const [key, value] of existingEnvVars.entries()) {
      newEnvContent += `${key}=${value}\n`;
    }
    
    // Write to .env.local (preferred) or .env
    await writeFile(targetEnvFile, newEnvContent.trim() + "\n", "utf-8");
    
    // Also update docker-compose.yml with new environment variables
    const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");
    
    // Read existing docker-compose.yml
    const existingContent = await readFile(dockerComposePath, "utf-8");
    
    // Extract port from existing compose file
    const portMatch = existingContent.match(/ports:\s*\n\s+-\s+"(\d+):3000"/);
    const port = portMatch ? parseInt(portMatch[1], 10) : 5000;
    
    // Rebuild docker-compose.yml with new environment variables
    const { writeDockerCompose } = await import("@/lib/services/filesystem.service");
    await writeDockerCompose(projectDir, projectName, repoDir.name, port, data.variables);
    
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

