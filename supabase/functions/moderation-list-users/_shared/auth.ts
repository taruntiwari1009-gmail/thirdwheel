import { createClient, type User } from "npm:@supabase/supabase-js@2";

function defaultKey(jsonName: string, legacyName: string): string {
  const value = Deno.env.get(jsonName);
  if (value) {
    try {
      const keys = JSON.parse(value) as Record<string, string>;
      if (keys.default) return keys.default;
    } catch {
      // Fall back to legacy key names when present.
    }
  }
  return Deno.env.get(legacyName) || "";
}

export async function requireUser(req: Request): Promise<{ user: User; admin: ReturnType<typeof createClient> }> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !secretKey) throw new Error("SERVER_CONFIGURATION_ERROR");

  const accessToken = authHeader.slice("Bearer ".length);
  const userClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("UNAUTHENTICATED");

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { user: data.user, admin };
}

export function isModerator(user: User): boolean {
  return user.app_metadata?.owner === true || user.app_metadata?.moderator === true;
}

export function isOwner(user: User): boolean {
  return user.app_metadata?.owner === true;
}

export function errorStatus(error: unknown): number {
  const code = error instanceof Error ? error.message : "";
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "SERVER_CONFIGURATION_ERROR") return 500;
  return 500;
}
