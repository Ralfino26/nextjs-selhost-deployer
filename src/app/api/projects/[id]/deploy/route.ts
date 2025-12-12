import { NextRequest, NextResponse } from "next/server";
import { deployProject } from "@/lib/services/docker.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectName = id;
    await deployProject(projectName);

    return NextResponse.json({ success: true, message: "Project deployed" });
  } catch (error) {
    console.error("Error deploying project:", error);
    return NextResponse.json(
      { error: "Failed to deploy project" },
      { status: 500 }
    );
  }
}

