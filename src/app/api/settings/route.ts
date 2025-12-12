import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";

const configSchema = z.object({
  githubToken: z.string(),
  mongoUser: z.string(),
  mongoPassword: z.string(),
  mongoDefaultDatabase: z.string(),
  projectsBaseDir: z.string(),
  startingPort: z.number(),
  websitesNetwork: z.string(),
  infraNetwork: z.string(),
});

const CONFIG_FILE = join(process.cwd(), "data", "config.json");

// GET /api/settings - Get current settings
export async function GET() {
  try {
    try {
      const content = await readFile(CONFIG_FILE, "utf-8");
      const config = JSON.parse(content);
      return NextResponse.json(config);
    } catch {
      // Config file doesn't exist, return defaults from env
      return NextResponse.json({
        githubToken: process.env.GITHUB_TOKEN || "",
        mongoUser: process.env.MONGO_USER || "ralf",
        mongoPassword: process.env.MONGO_PASSWORD || "supersecret",
        mongoDefaultDatabase: process.env.MONGO_DEFAULT_DATABASE || "admin",
        projectsBaseDir: process.env.PROJECTS_BASE_DIR || "/srv/vps/websites",
        startingPort: parseInt(process.env.STARTING_PORT || "5000", 10),
        websitesNetwork: process.env.WEBSITES_NETWORK || "websites_network",
        infraNetwork: process.env.INFRA_NETWORK || "infra_network",
      });
    }
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

// POST /api/settings - Save settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = configSchema.parse(body);

    // Ensure data directory exists
    const { mkdir } = await import("fs/promises");
    await mkdir(join(process.cwd(), "data"), { recursive: true });

    // Save to file
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");

    // Note: These settings are stored in config.json but environment variables
    // take precedence. To apply changes, users need to update .env and restart.

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving settings:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid settings data", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}

