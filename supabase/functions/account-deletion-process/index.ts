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
    if (!UUID.test(targetUid) || targetUid === user.id) return jsonResponse({ error: "A valid different user ID is required" }, 400, headers);

    const { data: request, error: requestError } = await admin.from("account_deletion_requests")
      .select("user_id,status").eq("user_id", targetUid).maybeSingle();
    if (requestError) return jsonResponse({ error: "Deletion request could not be checked" }, 500, headers);
    if (!request || !["approved", "processing"].includes(request.status)) {
      return jsonResponse({ error: "This account does not have an approved deletion request" }, 409, headers);
    }

    const { error: markError } = await admin.from("account_deletion_requests")
      .update({ status: "processing", updated_at: new Date().toISOString() }).eq("user_id", targetUid);
    if (markError) return jsonResponse({ error: "Deletion could not be started" }, 500, headers);

    // Remove the deleted account's avatar files. Chat attachments are retained with
    // the shared conversation so the other participant keeps their message history.
    const { data: avatarFiles, error: avatarListError } = await admin.storage.from("avatars")
      .list(targetUid, { limit: 1000 });
    if (!avatarListError && avatarFiles?.length) {
      const paths = avatarFiles.filter(file => file.name && file.id).map(file => `${targetUid}/${file.name}`);
      if (paths.length) await admin.storage.from("avatars").remove(paths);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(targetUid);
    if (deleteError) {
      await admin.from("account_deletion_requests")
        .update({ status: "approved", updated_at: new Date().toISOString() }).eq("user_id", targetUid);
      return jsonResponse({ error: "Account deletion failed; the request has been returned to approved status" }, 500, headers);
    }

    const { error: auditError } = await admin.from("moderation_audit").insert({
      actor_id: user.id,
      action: "account_deletion_processed",
      metadata: { target_user_id: targetUid, shared_conversations_retained: true },
    });
    if (auditError) console.error("Account deletion audit write failed:", auditError.code);
    return jsonResponse({ userId: targetUid, status: "completed", sharedConversationsRetained: true }, 200, headers);
  } catch (error) {
    const status = errorStatus(error);
    return jsonResponse({ error: status === 401 ? "Authentication required" : "Unable to process account deletion" }, status, headers);
  }
});
