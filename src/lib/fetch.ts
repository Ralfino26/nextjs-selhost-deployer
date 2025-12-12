// Helper function to get auth headers
export function getAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {};
  }
  
  const auth = sessionStorage.getItem("auth");
  if (!auth) {
    return {};
  }
  
  return {
    Authorization: `Basic ${auth}`,
  };
}

// Helper function to add auth headers to fetch requests
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const headers = new Headers(options.headers);
  
  Object.entries(authHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  return fetch(url, {
    ...options,
    headers,
  });
}

