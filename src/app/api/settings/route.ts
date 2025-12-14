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
      // Return exactly what's in config.json, nothing more
      return NextResponse.json(config);
    } catch (error) {
      // Config file doesn't exist or is corrupt, return empty object
      console.warn("[SETTINGS] Config file missing or corrupt:", error);
      return NextResponse.json({});
    }
  } catch (error) {
    console.error("[SETTINGS] Error fetching settings:", error);
    return NextResponse.json({});
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
    } catch (error) {
      // Config file doesn't exist or is corrupt, start with empty object
      console.warn("[SETTINGS] Config file missing or corrupt, starting fresh:", error);
      existingConfig = {};
    }

    // Merge: only update fields that are provided in the request body
    // IMPORTANT: For password fields, don't overwrite with empty strings
    // This prevents accidentally clearing passwords when user doesn't fill in the field
    const mergedConfig: any = {
      ...existingConfig,
    };
    
    // Update non-sensitive fields normally
    if (body.githubToken !== undefined) mergedConfig.githubToken = body.githubToken;
    if (body.mongoUser !== undefined) mergedConfig.mongoUser = body.mongoUser;
    if (body.mongoPassword !== undefined && body.mongoPassword !== "") {
      mergedConfig.mongoPassword = body.mongoPassword;
    }
    if (body.mongoDefaultDatabase !== undefined) mergedConfig.mongoDefaultDatabase = body.mongoDefaultDatabase;
    if (body.projectsBaseDir !== undefined) mergedConfig.projectsBaseDir = body.projectsBaseDir;
    if (body.backupBaseDir !== undefined) mergedConfig.backupBaseDir = body.backupBaseDir;
    if (body.startingPort !== undefined) mergedConfig.startingPort = body.startingPort;
    if (body.websitesNetwork !== undefined) mergedConfig.websitesNetwork = body.websitesNetwork;
    if (body.infraNetwork !== undefined) mergedConfig.infraNetwork = body.infraNetwork;
    
    // Optional NPM fields: only update if provided and not empty (for passwords)
    if (body.npmUrl !== undefined) mergedConfig.npmUrl = body.npmUrl || "";
    if (body.npmEmail !== undefined) mergedConfig.npmEmail = body.npmEmail || "";
    if (body.npmPassword !== undefined && body.npmPassword !== "") {
      mergedConfig.npmPassword = body.npmPassword;
    }

    // Validate the merged config
    const config = configSchema.parse(mergedConfig);

    // Ensure data directory exists
    const { mkdir } = await import("fs/promises");
    await mkdir(join(process.cwd(), "data"), { recursive: true });

    // Use exactly what was provided - no defaults, no fallbacks
    const configToSave = {
      ...config,
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

