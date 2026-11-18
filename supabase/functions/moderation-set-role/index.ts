import { requireUser, isOwner, errorStatus } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/http.ts";

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
    const moderator = body.moderator === true;
    if (!UUID.test(targetUid) || targetUid === user.id) return jsonResponse({ error: "Choose a valid different account" }, 400, headers);

    const { data: targetResult, error: getError } = await admin.auth.admin.getUserById(targetUid);
    if (getError || !targetResult.user) return jsonResponse({ error: "Account not found" }, 404, headers);
    if (targetResult.user.app_metadata?.owner === true) return jsonResponse({ error: "The owner role cannot be changed here" }, 409, headers);
    const nextMetadata = { ...(targetResult.user.app_metadata || {}), moderator };
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUid, { app_metadata: nextMetadata });
    if (updateError) return jsonResponse({ error: "Moderator role could not be updated" }, 500, headers);

    const { error: auditError } = await admin.from("moderation_audit").insert({
      actor_id: user.id,
      action: moderator ? "moderator_granted" : "moderator_revoked",
      metadata: { target_user_id: targetUid },
    });
    if (auditError) return jsonResponse({ error: "Role updated, but the audit event could not be saved" }, 500, headers);
    return jsonResponse({ userId: targetUid, moderator }, 200, headers);
  } catch (error) {
    const status = errorStatus(error);
    return jsonResponse({ error: status === 401 ? "Authentication required" : "Unable to update moderator role" }, status, headers);
  }
});
