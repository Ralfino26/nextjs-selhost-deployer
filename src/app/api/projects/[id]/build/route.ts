import { NextRequest, NextResponse } from "next/server";
import { buildProject } from "@/lib/services/docker.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectName = id;
    await buildProject(projectName);

    return NextResponse.json({ success: true, message: "Project built" });
  } catch (error) {
    console.error("Error building project:", error);
    return NextResponse.json(
      { error: "Failed to build project" },
      { status: 500 }
    );
  }
}

