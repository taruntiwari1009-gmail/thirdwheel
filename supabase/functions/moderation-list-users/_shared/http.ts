const DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

export function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("Origin");
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map(value => value.trim()).filter(Boolean);
  const allowed = [...new Set([...DEFAULT_ORIGINS, ...configured])];
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (!origin) return base;
  if (!allowed.includes(origin)) return null;
  return { ...base, "Access-Control-Allow-Origin": origin };
}

export function jsonResponse(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  const headers = corsHeaders(req);
  return new Response(headers ? "ok" : "origin not allowed", { status: headers ? 200 : 403, headers: headers || {} });
}
