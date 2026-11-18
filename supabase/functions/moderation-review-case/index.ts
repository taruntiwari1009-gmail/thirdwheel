import { requireUser, isModerator, errorStatus } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/http.ts";

const VALID_STATUSES = new Set(["reviewing", "actioned", "dismissed"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const reportId = typeof body.reportId === "string" ? body.reportId : "";
    const status = typeof body.status === "string" ? body.status : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    if (!UUID.test(reportId) || !VALID_STATUSES.has(status)) {
      return jsonResponse({ error: "A valid report ID and review status are required" }, 400, headers);
    }

    const { data: report, error: updateError } = await admin.from("reports")
      .update({ status }).eq("id", reportId).select("*").maybeSingle();
    if (updateError) {
      console.error("Moderation review update failed:", updateError.code);
      return jsonResponse({ error: "This report could not be updated" }, 500, headers);
    }
    if (!report) return jsonResponse({ error: "Report not found" }, 404, headers);

    const { error: auditError } = await admin.from("moderation_audit").insert({
      actor_id: user.id,
      report_id: reportId,
      action: "status_changed",
      metadata: { status, note },
    });
    if (auditError) {
      console.error("Moderation audit write failed:", auditError.code);
      return jsonResponse({ error: "The review was saved but its audit event could not be recorded. Contact the system owner." }, 500, headers);
    }
    return jsonResponse({ report }, 200, headers);
  } catch (error) {
    const status = errorStatus(error);
    return jsonResponse({ error: status === 401 ? "Authentication required" : "Unable to review this report" }, status, headers);
  }
});
