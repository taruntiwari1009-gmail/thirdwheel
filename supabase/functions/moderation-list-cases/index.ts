import { requireUser, isModerator, errorStatus } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/http.ts";

const VALID_STATUSES = new Set(["pending", "reviewing", "actioned", "dismissed"]);

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
    const status = typeof body.status === "string" ? body.status : "pending";
    if (!VALID_STATUSES.has(status)) return jsonResponse({ error: "Invalid case status" }, 400, headers);

    const { data, error } = await admin.from("reports").select("*")
      .eq("status", status).order("created_at", { ascending: false }).limit(100);
    if (error) {
      console.error("Moderation case query failed:", error.code);
      return jsonResponse({ error: "Moderation queue is unavailable" }, 500, headers);
    }
    return jsonResponse({ cases: data || [] }, 200, headers);
  } catch (error) {
    const status = errorStatus(error);
    return jsonResponse({ error: status === 401 ? "Authentication required" : "Unable to load moderation queue" }, status, headers);
  }
});
