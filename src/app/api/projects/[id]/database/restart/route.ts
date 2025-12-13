import { NextRequest, NextResponse } from "next/server";
import { restartDatabase } from "@/lib/services/docker.service";
import { webAuth } from "@/lib/config";

// Basic authentication middleware
function authenticate(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  const base64 = authHeader.substring(6);
  const credentials = Buffer.from(base64, "base64").toString("utf-8");
  const [username, password] = credentials.split(":");

  return username === webAuth.username && password === webAuth.password;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    if (!authenticate(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const projectName = id;
    await restartDatabase(projectName);

    return NextResponse.json({ success: true, message: "Database restarted successfully" });
  } catch (error: any) {
    console.error("Error restarting database:", error);
    return NextResponse.json(
      { error: error.message || "Failed to restart database" },
      { status: 500 }
    );
  }
}

