import { requireUser, isOwner, errorStatus } from "./_shared/auth.ts";
import { corsHeaders, handlePreflight, jsonResponse } from "./_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const targetUid = typeof body.userId === "string" ? body.userId : "";
    if (!UUID.test(targetUid)) return jsonResponse({ error: "A valid user ID is required" }, 400, headers);

    const { data: request, error: updateError } = await admin.rpc("approve_account_deletion", {
      p_user_id: targetUid,
      p_actor_id: user.id,
    });
    if (updateError) {
      console.error("Atomic deletion approval failed:", updateError.code);
      return jsonResponse({ error: "Deletion request could not be approved" }, 500, headers);
    }
    if (!request) return jsonResponse({ error: "No pending deletion request found for this account" }, 404, headers);

    return jsonResponse({ userId: targetUid, status: request.status }, 200, headers);
  } catch (error) {
    const status = errorStatus(error);
    return jsonResponse({ error: status === 401 ? "Authentication required" : "Unable to approve deletion request" }, status, headers);
  }
});
