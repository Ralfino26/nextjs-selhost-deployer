import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, rename, unlink } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import { clearConfigCache } from "@/lib/config";
import { getDefaultConfig } from "@/lib/config-defaults";

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
      const parsed = JSON.parse(content);
      
      // Merge with defaults to ensure all fields are present
      // This handles cases where the config file is missing fields or is corrupt
      const defaults = getDefaultConfig();
      const config = {
        ...defaults,
        ...parsed,
        // Ensure optional fields are preserved
        npmUrl: parsed.npmUrl ?? defaults.npmUrl,
        npmEmail: parsed.npmEmail ?? defaults.npmEmail,
        npmPassword: parsed.npmPassword ?? defaults.npmPassword,
      };
      
      return NextResponse.json(config);
    } catch (error) {
      // Config file doesn't exist or is corrupt, return defaults
      console.warn("[SETTINGS] Config file missing or corrupt, returning defaults:", error);
      const defaults = getDefaultConfig();
      return NextResponse.json(defaults);
    }
  } catch (error) {
    console.error("[SETTINGS] Error fetching settings:", error);
    // Even if something goes wrong, return defaults so the app keeps working
    const defaults = getDefaultConfig();
    return NextResponse.json(defaults);
  }
}

// POST /api/settings - Save settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Load existing config first to preserve values that aren't being updated
    const defaults = getDefaultConfig();
    let existingConfig: any = { ...defaults };
    try {
      const content = await readFile(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(content);
      // Merge with defaults to ensure all fields are present
      existingConfig = {
        ...defaults,
        ...parsed,
        npmUrl: parsed.npmUrl ?? defaults.npmUrl,
        npmEmail: parsed.npmEmail ?? defaults.npmEmail,
        npmPassword: parsed.npmPassword ?? defaults.npmPassword,
      };
      console.log("[SETTINGS] Loaded existing config");
    } catch (error) {
      // Config file doesn't exist or is corrupt, use defaults
      console.warn("[SETTINGS] Config file missing or corrupt, using defaults:", error);
      existingConfig = defaults;
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

    // Ensure optional fields are included (preserve existing if not provided)
    const configToSave = {
      ...config,
      npmUrl: config.npmUrl || existingConfig.npmUrl || "",
      npmEmail: config.npmEmail || existingConfig.npmEmail || "",
      npmPassword: config.npmPassword || existingConfig.npmPassword || "",
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

