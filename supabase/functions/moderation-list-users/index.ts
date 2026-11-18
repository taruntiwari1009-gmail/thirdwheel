import { requireUser, isOwner, errorStatus } from "./_shared/auth.ts";
import { corsHeaders, handlePreflight, jsonResponse } from "./_shared/http.ts";

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
    const query = typeof body.query === "string" ? body.query.trim().replace(/^@/, "").toLowerCase() : "";
    if (query.length < 2 || query.length > 80) {
      return jsonResponse({ error: "Enter between 2 and 80 characters to search accounts" }, 400, headers);
    }

    const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[%_]/g, "\\$&");
    const pattern = `"${escaped}%"`;
    const { data: profiles, error } = await admin.from("profiles")
      .select("id,username,display_name,display_name_lower")
      .or(`display_name_lower.ilike.${pattern},username.ilike.${pattern}`)
      .order("display_name_lower", { ascending: true })
      .limit(20);
    if (error) {
      console.error("Moderator account search failed:", error.code);
      return jsonResponse({ error: "Account search is unavailable" }, 500, headers);
    }

    const users = await Promise.all((profiles || []).map(async profile => {
      const { data, error: authError } = await admin.auth.admin.getUserById(profile.id);
      if (authError || !data.user) return null;
      return {
        user_id: profile.id,
        username: profile.username || "",
        display_name: profile.display_name || "",
        moderator: data.user.app_metadata?.moderator === true,
        owner: data.user.app_metadata?.owner === true,
      };
    }));
    return jsonResponse({ users: users.filter(Boolean) }, 200, headers);
  } catch (error) {
    const status = errorStatus(error);
    return jsonResponse({ error: status === 401 ? "Authentication required" : "Unable to search accounts" }, status, headers);
  }
});
