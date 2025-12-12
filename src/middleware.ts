import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthenticated, checkAuth } from "./lib/auth";

export const runtime = "nodejs"; // Use Node.js runtime instead of Edge

export function middleware(request: NextRequest) {
  // Skip auth for login page and auth API
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/api/auth/check"
  ) {
    return NextResponse.next();
  }

  // Protect all other routes (including API)
  // Check cookie for authentication
  const authCookie = request.cookies.get("auth");
  let authenticated = false;
  
  if (authCookie) {
    try {
      const credentials = Buffer.from(authCookie.value, "base64").toString("utf-8");
      const [username, password] = credentials.split(":");
      authenticated = checkAuth(username, password);
    } catch (error) {
      authenticated = false;
    }
  }
  
  // Also check Authorization header for API calls
  if (!authenticated) {
    authenticated = isAuthenticated(request);
  }
  
  if (!authenticated) {
    // For API routes, return 401
    if (request.nextUrl.pathname.startsWith("/api")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // For pages, redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

