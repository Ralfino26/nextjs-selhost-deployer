import { NextResponse } from "next/server";
import { getNextAvailablePort } from "@/lib/services/port.service";

// GET /api/ports/next - Get next available port
export async function GET() {
  try {
    const port = await getNextAvailablePort();
    return NextResponse.json({ port });
  } catch (error) {
    console.error("Error getting next port:", error);
    return NextResponse.json(
      { error: "Failed to get next port" },
      { status: 500 }
    );
  }
}

