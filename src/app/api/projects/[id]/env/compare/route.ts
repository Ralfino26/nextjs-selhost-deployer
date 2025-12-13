import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { config } from "@/lib/config";

interface EnvComparison {
  key: string;
  productionValue: string | null;
  exampleValue: string | null;
  status: "up-to-date" | "missing-in-production" | "missing-in-example" | "different" | "only-in-production" | "only-in-example";
}

// Parse .env file content
function parseEnvFile(content: string): Map<string, string> {
  const envVars = new Map<string, string>();
  const lines = content.split("\n");
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    
    const match = trimmedLine.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, ""); // Remove quotes
      envVars.set(key, value);
    }
  }
  
  return envVars;
}

// GET /api/projects/[id]/env/compare - Compare production .env with .env.example
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

    const repoPath = join(projectDir, repoDir.name);
    
    // Read production .env files (priority: .env.local > .env > .env.production)
    const productionEnvFiles = [".env.local", ".env", ".env.production"];
    const productionEnvVars = new Map<string, string>();
    
    for (const envFile of productionEnvFiles) {
      const envFilePath = join(repoPath, envFile);
      try {
        const content = await readFile(envFilePath, "utf-8");
        const parsed = parseEnvFile(content);
        // Merge, but don't overwrite existing (priority order)
        for (const [key, value] of parsed.entries()) {
          if (!productionEnvVars.has(key)) {
            productionEnvVars.set(key, value);
          }
        }
      } catch {
        // File doesn't exist, continue
      }
    }
    
    // Also read from docker-compose.yml (deployed values take precedence)
    const dockerComposePath = join(projectDir, "docker", "docker-compose.yml");
    try {
      const content = await readFile(dockerComposePath, "utf-8");
      const envMatch = content.match(/environment:\s*\n((?:\s+[^:\n]+:[^\n]+\n?)+)/);
      if (envMatch) {
        const envLines = envMatch[1].trim().split("\n");
        for (const line of envLines) {
          const match = line.trim().match(/^([^:]+):\s*(.+)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            if (key !== "NODE_ENV") {
              productionEnvVars.set(key, value); // docker-compose.yml takes precedence
            }
          }
        }
      }
    } catch {
      // docker-compose.yml doesn't exist or can't be read
    }
    
    // Read .env.example
    const exampleEnvPath = join(repoPath, ".env.example");
    let exampleEnvVars = new Map<string, string>();
    try {
      const exampleContent = await readFile(exampleEnvPath, "utf-8");
      exampleEnvVars = parseEnvFile(exampleContent);
    } catch {
      // .env.example doesn't exist
    }
    
    // Create comparison
    const comparison: EnvComparison[] = [];
    const allKeys = new Set<string>();
    
    // Add all keys from both sources
    for (const key of productionEnvVars.keys()) {
      allKeys.add(key);
    }
    for (const key of exampleEnvVars.keys()) {
      allKeys.add(key);
    }
    
    // Compare each key
    for (const key of allKeys) {
      const productionValue = productionEnvVars.get(key) || null;
      const exampleValue = exampleEnvVars.get(key) || null;
      
      let status: EnvComparison["status"];
      
      if (productionValue && exampleValue) {
        if (productionValue === exampleValue) {
          status = "up-to-date";
        } else {
          status = "different";
        }
      } else if (productionValue && !exampleValue) {
        status = "only-in-production";
      } else if (!productionValue && exampleValue) {
        status = "missing-in-production";
      } else {
        // Both null (shouldn't happen, but handle it)
        continue;
      }
      
      comparison.push({
        key,
        productionValue,
        exampleValue,
        status,
      });
    }
    
    // Sort by status priority, then by key
    const statusPriority: Record<EnvComparison["status"], number> = {
      "missing-in-production": 1,
      "different": 2,
      "only-in-production": 3,
      "only-in-example": 4,
      "up-to-date": 5,
    };
    
    comparison.sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return a.key.localeCompare(b.key);
    });
    
    return NextResponse.json({ comparison });
  } catch (error) {
    console.error("Error comparing environment variables:", error);
    return NextResponse.json(
      { error: "Failed to compare environment variables" },
      { status: 500 }
    );
  }
}

