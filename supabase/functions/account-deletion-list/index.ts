import { requireUser, isOwner, errorStatus } from "./_shared/auth.ts";
import { corsHeaders, handlePreflight, jsonResponse } from "./_shared/http.ts";

const VALID_STATUSES = new Set(["pending_review", "approved", "processing", "rejected"]);

Deno.serve(async req => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const headers = corsHeaders(req);
  if (!headers) return jsonResponse({ error: "Origin not allowed" }, 403);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, headers);
  try {
    const { user, admin } = await requireUser(req);
    if (!isOwner(user)) return jsonResponse({ error: "Owner access required" }, 403, headers);
    const body = await req.json().catch(() => ({}));
    const requestedStatus = typeof body.status === "string" ? body.status : "pending_review";
    if (!VALID_STATUSES.has(requestedStatus)) return jsonResponse({ error: "Invalid request status" }, 400, headers);

    const { data, error } = await admin.from("account_deletion_requests").select("user_id,status,requested_at,updated_at")
      .eq("status", requestedStatus).order("requested_at", { ascending: true }).limit(100);
    if (error) {
      console.error("Deletion request query failed:", error.code);
      return jsonResponse({ error: "Deletion requests are unavailable" }, 500, headers);
    }
    return jsonResponse({ requests: data || [] }, 200, headers);
  } catch (error) {
    const status = errorStatus(error);
    return jsonResponse({ error: status === 401 ? "Authentication required" : "Unable to load deletion requests" }, status, headers);
  }
});
