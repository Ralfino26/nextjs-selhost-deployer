import { webAuth } from "./config";

// Simple authentication check
export function checkAuth(username: string, password: string): boolean {
  if (!username || !password) {
    return false;
  }
  
  return username === webAuth.username && password === webAuth.password;
}

export function isAuthenticated(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }
  
  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
  const [username, password] = credentials.split(":");
  
  return checkAuth(username, password);
}

