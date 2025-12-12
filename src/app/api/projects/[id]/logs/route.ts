import { NextRequest, NextResponse } from "next/server";
import { getLogs } from "@/lib/services/docker.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectName = id;
    const searchParams = request.nextUrl.searchParams;
    const lines = parseInt(searchParams.get("lines") || "100", 10);

    const logs = await getLogs(projectName, lines);

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch logs" },
      { status: 500 }
    );
  }
}

