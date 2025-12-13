import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import { clearConfigCache } from "@/lib/config";

const configSchema = z.object({
  githubToken: z.string(),
  mongoUser: z.string(),
  mongoPassword: z.string(),
  mongoDefaultDatabase: z.string(),
  projectsBaseDir: z.string(),
  backupBaseDir: z.string(),
  startingPort: z.number(),
  websitesNetwork: z.string(),
  infraNetwork: z.string(),
  npmUrl: z.string().optional(),
  npmEmail: z.string().optional(),
  npmPassword: z.string().optional(),
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
      // Config file doesn't exist, return defaults
      return NextResponse.json({
        githubToken: "",
        mongoUser: "ralf",
        mongoPassword: "supersecret",
        mongoDefaultDatabase: "admin",
        projectsBaseDir: "/srv/vps/websites",
        backupBaseDir: "/srv/vps/backups",
        startingPort: 5000,
        websitesNetwork: "websites_network",
        infraNetwork: "infra_network",
        npmUrl: process.env.NPM_URL || "http://nginx-proxy-manager:81",
        npmEmail: process.env.NPM_EMAIL || "",
        npmPassword: process.env.NPM_PASSWORD || "",
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

    // Ensure optional fields are included (even if empty)
    const configToSave = {
      ...config,
      npmUrl: config.npmUrl || "",
      npmEmail: config.npmEmail || "",
      npmPassword: config.npmPassword || "",
    };

    // Save to file
    await writeFile(CONFIG_FILE, JSON.stringify(configToSave, null, 2), "utf-8");

    // Clear config cache so new values are loaded
    clearConfigCache();

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

