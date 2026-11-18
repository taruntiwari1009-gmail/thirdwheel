import { requireUser, isModerator, errorStatus } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/http.ts";

Deno.serve(async req => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const headers = corsHeaders(req);
  if (!headers) return jsonResponse({ error: "Origin not allowed" }, 403);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, headers);
  try {
    const { user, admin } = await requireUser(req);
    if (!isModerator(user)) return jsonResponse({ error: "Moderator access required" }, 403, headers);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(body.limit || 50), 10) || 50));

    const { data, error } = await admin.from("moderation_audit")
      .select("id,actor_id,report_id,action,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("Moderation audit query failed:", error.code);
      return jsonResponse({ error: "Audit history is unavailable" }, 500, headers);
    }
    return jsonResponse({ events: data || [] }, 200, headers);
  } catch (error) {
    const status = errorStatus(error);
    return jsonResponse({ error: status === 401 ? "Authentication required" : "Unable to load audit history" }, status, headers);
  }
});
