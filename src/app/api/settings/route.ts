import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, rename, unlink } from "fs/promises";
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
    
    // Load existing config first to preserve values that aren't being updated
    let existingConfig: any = {};
    try {
      const content = await readFile(CONFIG_FILE, "utf-8");
      existingConfig = JSON.parse(content);
      console.log("[SETTINGS] Loaded existing config");
    } catch {
      // Config file doesn't exist, use defaults
      existingConfig = {
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
      };
      console.log("[SETTINGS] Using defaults (no existing config)");
    }

    // Merge: only update fields that are provided in the request body
    // This allows partial updates without losing existing values
    const mergedConfig = {
      ...existingConfig,
      ...body, // Override with new values from request
    };

    // Validate the merged config
    const config = configSchema.parse(mergedConfig);

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

    console.log("[SETTINGS] Saving config with fields:", Object.keys(configToSave));
    console.log("[SETTINGS] Config values (sensitive fields masked):", {
      ...configToSave,
      githubToken: configToSave.githubToken ? "***" : "",
      mongoPassword: configToSave.mongoPassword ? "***" : "",
      npmPassword: configToSave.npmPassword ? "***" : "",
    });
    
    // Atomic write: write to temp file first, then rename
    // This prevents corruption if the process crashes during write
    const tempFile = `${CONFIG_FILE}.tmp`;
    try {
      await writeFile(tempFile, JSON.stringify(configToSave, null, 2), "utf-8");
      await rename(tempFile, CONFIG_FILE);
      console.log("[SETTINGS] Config saved successfully (atomic write)");
    } catch (writeError) {
      // Clean up temp file if rename failed
      try {
        await unlink(tempFile).catch(() => {});
      } catch {}
      throw writeError;
    }

    // Clear config cache so new values are loaded
    clearConfigCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SETTINGS] Error saving settings:", error);
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

