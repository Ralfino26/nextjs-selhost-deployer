import { NextRequest, NextResponse } from "next/server";
import { createMongoBackup } from "@/lib/services/backup.service";
import { isAuthenticated } from "@/lib/auth";

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
    
    const backupPath = await createMongoBackup(projectName);
    
    return NextResponse.json({
      success: true,
      message: "Backup created successfully",
      backupPath,
    });
  } catch (error: any) {
    console.error("Error creating backup:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create backup" },
      { status: 500 }
    );
  }
}

