// Simple authentication check
// Note: webAuth is read directly from env to avoid importing config.ts in middleware
export function checkAuth(username: string, password: string): boolean {
  if (!username || !password) {
    return false;
  }
  
  const validUsername = process.env.WEB_USERNAME || "ralf";
  const validPassword = process.env.WEB_PASSWORD || "supersecret";
  
  return username === validUsername && password === validPassword;
}

export function isAuthenticated(request: Request): boolean {
  // Check Authorization header first (for API calls)
  const authHeader = request.headers.get("authorization");
  
  if (authHeader && authHeader.startsWith("Basic ")) {
    const base64Credentials = authHeader.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
    const [username, password] = credentials.split(":");
    return checkAuth(username, password);
  }
  
  // Check cookie (for browser requests)
  // Note: In Next.js middleware, we need to use NextRequest to access cookies
  if (request instanceof Request && "cookies" in request) {
    const nextRequest = request as any;
    const authCookie = nextRequest.cookies?.get("auth");
    if (authCookie) {
      const credentials = Buffer.from(authCookie.value, "base64").toString("utf-8");
      const [username, password] = credentials.split(":");
      return checkAuth(username, password);
    }
  }
  
  return false;
}

