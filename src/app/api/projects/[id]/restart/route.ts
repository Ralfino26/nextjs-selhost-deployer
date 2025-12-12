import { NextRequest, NextResponse } from "next/server";
import { restartProject } from "@/lib/services/docker.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectName = id;
    await restartProject(projectName);

    return NextResponse.json({ success: true, message: "Project restarted" });
  } catch (error) {
    console.error("Error restarting project:", error);
    return NextResponse.json(
      { error: "Failed to restart project" },
      { status: 500 }
    );
  }
}

