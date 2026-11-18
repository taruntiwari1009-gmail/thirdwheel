import React, { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { invokeModerationFunction } from "../services/backend";

const FILTERS = ["pending", "reviewing", "actioned", "dismissed"];
const ACTIONS = ["reviewing", "actioned", "dismissed"];

const formatDate = value => value ? new Date(value).toLocaleString() : "Not available";
const describeMetadata = metadata => Object.entries(metadata || {})
  .map(([key, value]) => `${key.replaceAll("_", " ")}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
  .join(" · ");

export default function ModeratorDashboard() {
  const { currentUser } = useContext(AuthContext);
  const isOwner = currentUser?.appMetadata?.owner === true;
  const isModerator = isOwner || currentUser?.appMetadata?.moderator === true;
  const [status, setStatus] = useState("pending");
  const [cases, setCases] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [deletionRequests, setDeletionRequests] = useState([]);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [deletionBusyUid, setDeletionBusyUid] = useState("");

  const [auditEvents, setAuditEvents] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [userQuery, setUserQuery] = useState("");
  const [roleUsers, setRoleUsers] = useState([]);
  const [roleSearchLoading, setRoleSearchLoading] = useState(false);
  const [roleBusyUid, setRoleBusyUid] = useState("");

  const loadCases = useCallback(async () => {
    if (!isModerator) { setCases([]); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const result = await invokeModerationFunction("moderation-list-cases", { status });
      setCases(result?.cases || []);
    } catch (loadError) {
      console.error("Unable to load moderation queue:", loadError);
      setError(loadError.message || "The moderation queue couldn't be loaded. Confirm your moderator access and try again.");
    } finally { setLoading(false); }
  }, [isModerator, status]);

  const loadAudit = useCallback(async () => {
    if (!isModerator) return;
    setAuditLoading(true);
    try {
      const result = await invokeModerationFunction("moderation-list-audit", { limit: 50 });
      setAuditEvents(result?.events || []);
    } catch (loadError) {
      console.error("Unable to load moderation audit history:", loadError);
      setError(loadError.message || "Audit history could not be loaded.");
    } finally { setAuditLoading(false); }
  }, [isModerator]);

  const loadDeletionRequests = useCallback(async () => {
    if (!isOwner) return;
    setDeletionLoading(true);
    try {
      const statuses = ["pending_review", "approved", "processing", "rejected"];
      const results = await Promise.all(statuses.map(requestStatus =>
        invokeModerationFunction("account-deletion-list", { status: requestStatus })
      ));
      setDeletionRequests(results.flatMap(result => result?.requests || []));
    } catch (loadError) {
      console.error("Unable to load account deletion requests:", loadError);
      setError(loadError.message || "Account deletion requests could not be loaded.");
    } finally { setDeletionLoading(false); }
  }, [isOwner]);

  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => { loadAudit(); }, [loadAudit]);
  useEffect(() => { if (isOwner) loadDeletionRequests(); }, [isOwner, loadDeletionRequests]);

  const handleDeletionAction = async (request, action) => {
    if (!isOwner || deletionBusyUid) return;
    const prompts = {
      approve: "Approve this account deletion request? The account will not be removed until you process it.",
      reject: "Reject this account deletion request? The account will remain active.",
      process: "Permanently delete this account? Shared conversation history will remain for the other participant.",
    };
    if (!window.confirm(prompts[action])) return;
    setDeletionBusyUid(request.user_id); setError(""); setNotice("");
    try {
      const endpoint = action === "process" ? "account-deletion-process" : `account-deletion-${action}`;
      const result = await invokeModerationFunction(endpoint, { userId: request.user_id });
      setNotice(action === "approve"
        ? "The account deletion request has been approved."
        : action === "reject"
          ? "The account deletion request has been rejected. The account remains active."
          : `Account deletion ${result?.status || "processed"}; shared conversation history is retained.`);
      await Promise.all([loadDeletionRequests(), loadAudit()]);
    } catch (actionError) {
      console.error("Unable to update account deletion request:", actionError);
      setError(actionError.message || "The account deletion action failed.");
    } finally { setDeletionBusyUid(""); }
  };

  const reviewCase = async (item, nextStatus) => {
    if (!isModerator || busyId) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      await invokeModerationFunction("moderation-review-case", {
        reportId: item.id,
        status: nextStatus,
        note: (notes[item.id] || "").trim(),
      });
      setNotice(`Case ${item.id.slice(0, 8)} updated to ${nextStatus}.`);
      await Promise.all([loadCases(), loadAudit()]);
    } catch (reviewError) {
      console.error("Unable to update moderation case:", reviewError);
      setError(reviewError.message || "This case couldn't be updated. Please try again.");
    } finally { setBusyId(""); }
  };

  const searchUsers = async event => {
    event?.preventDefault();
    if (!isOwner || roleSearchLoading) return;
    const query = userQuery.trim().replace(/^@/, "");
    if (query.length < 2) {
      setError("Enter at least two characters to search for an account.");
      return;
    }
    setRoleSearchLoading(true); setError(""); setRoleUsers([]);
    try {
      const result = await invokeModerationFunction("moderation-list-users", { query });
      setRoleUsers(result?.users || []);
      if (!result?.users?.length) setNotice("No matching accounts found.");
    } catch (searchError) {
      console.error("Unable to search accounts for role management:", searchError);
      setError(searchError.message || "Accounts could not be searched.");
    } finally { setRoleSearchLoading(false); }
  };

  const updateRole = async target => {
    if (!isOwner || target.owner || roleBusyUid) return;
    const nextModerator = !target.moderator;
    const action = nextModerator ? "grant" : "revoke";
    if (!window.confirm(`${nextModerator ? "Grant" : "Revoke"} moderator access for ${target.display_name || "this account"}?`)) return;
    setRoleBusyUid(target.user_id); setError(""); setNotice("");
    try {
      await invokeModerationFunction("moderation-set-role", { userId: target.user_id, moderator: nextModerator });
      setRoleUsers(previous => previous.map(user => user.user_id === target.user_id
        ? { ...user, moderator: nextModerator }
        : user));
      setNotice(`Moderator access ${action === "grant" ? "granted" : "revoked"}. The account's role claim takes effect after its next token refresh.`);
      await loadAudit();
    } catch (roleError) {
      console.error("Unable to change moderator role:", roleError);
      setError(roleError.message || "The moderator role could not be changed.");
    } finally { setRoleBusyUid(""); }
  };

  if (!isModerator) {
    return <main className="pageShell moderationPage">
      <header className="pageHeader moderationPageHeader"><Link to="/" className="textLink">← Third Wheel</Link></header>
      <section className="moderationEmpty"><h2>Restricted workspace</h2><p className="muted">Only approved moderators and the account owner can access this area.</p></section>
    </main>;
  }

  return <main className="pageShell moderationPage">
    <header className="pageHeader moderationPageHeader">
      <Link to="/" className="textLink">← Third Wheel</Link>
      <div className="moderationPageIntro">
        <span className="eyebrow">TRUST & SAFETY</span>
        <h1>Moderation workspace.</h1>
        <p className="muted">Review every report carefully. A report is an allegation, not a finding.</p>
      </div>
      <span className="moderationAccessTag">{isOwner ? "Owner access" : "Moderator access"}</span>
    </header>

    {notice && <p className="successText" role="status">{notice}</p>}
    {error && <p className="errorText" role="alert">{error}</p>}

    <div className="moderationToolbar moderationFilters">
      <label htmlFor="moderation-filter">Show cases</label>
      <select id="moderation-filter" value={status} onChange={event => setStatus(event.target.value)}>
        {FILTERS.map(value => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
      </select>
      <button type="button" className="secondaryAction" onClick={loadCases} disabled={loading}>{loading ? "Refreshing…" : "Refresh queue"}</button>
    </div>

    {isOwner && <section className="moderationPanel adminPanel">
      <div className="sectionHeading ownerQueueHeading">
        <div><p className="eyebrow">OWNER CONTROLS</p><h2>Moderator access</h2></div>
      </div>
      <p className="muted">Search for an account by display name or username, then grant or revoke moderator access. The owner role cannot be changed here.</p>
      <form className="roleSearchForm" onSubmit={searchUsers}>
        <input type="search" value={userQuery} onChange={event => setUserQuery(event.target.value)}
          placeholder="Search name or @username…" aria-label="Search accounts for moderator access" minLength="2" />
        <button type="submit" className="secondaryAction" disabled={roleSearchLoading || userQuery.trim().replace(/^@/, "").length < 2}>
          {roleSearchLoading ? "Searching…" : "Find account"}
        </button>
      </form>
      {roleUsers.length > 0 && <div className="roleUserList">
        {roleUsers.map(target => <article className="roleUserRow" key={target.user_id}>
          <div><strong>{target.display_name || "Third Wheel member"}</strong>
            <span>{target.username ? `@${target.username}` : "No username"} · {target.user_id}</span></div>
          <span className={`caseStatus ${target.owner ? "status-actioned" : target.moderator ? "status-reviewing" : ""}`}>
            {target.owner ? "Owner" : target.moderator ? "Moderator" : "Member"}
          </span>
          {!target.owner && <button type="button" className={target.moderator ? "secondaryAction" : "primaryAction"}
            onClick={() => updateRole(target)} disabled={Boolean(roleBusyUid)}>
            {roleBusyUid === target.user_id ? "Saving…" : target.moderator ? "Revoke" : "Make moderator"}
          </button>}
        </article>)}
      </div>}
    </section>}

    {isOwner && <section className="ownerDeletionQueue moderationPanel">
      <div className="sectionHeading ownerQueueHeading"><div><p className="eyebrow">OWNER CONTROLS</p><h2>Account deletion requests</h2></div>
        <button type="button" className="secondaryAction" onClick={loadDeletionRequests} disabled={deletionLoading}>{deletionLoading ? "Refreshing…" : "Refresh requests"}</button>
      </div>
      <p className="muted">Approve or reject pending requests. Approved requests require a separate processing action. Processing removes the account and avatar while retaining shared conversation history.</p>
      {deletionLoading && <p role="status">Loading deletion requests…</p>}
      {!deletionLoading && deletionRequests.length === 0 && <p className="muted small">No deletion requests.</p>}
      {deletionRequests.map(request => <article className="moderationCase deletionRequest" key={request.user_id}>
        <div className="moderationCaseHeader"><span className="eyebrow">ACCOUNT REQUEST</span><span className={`caseStatus status-${request.status}`}>{request.status.replaceAll("_", " ")}</span></div>
        <p className="caseUserId">User ID: {request.user_id}</p>
        <p className="muted small">Requested: {formatDate(request.requested_at)}</p>
        <div className="caseActions">
          {request.status === "pending_review" && <>
            <button type="button" className="secondaryAction" onClick={() => handleDeletionAction(request, "approve")} disabled={Boolean(deletionBusyUid)}>{deletionBusyUid === request.user_id ? "Saving…" : "Approve request"}</button>
            <button type="button" className="textAction" onClick={() => handleDeletionAction(request, "reject")} disabled={Boolean(deletionBusyUid)}>Reject request</button>
          </>}
          {["approved", "processing"].includes(request.status) && <button type="button" className="primaryAction" onClick={() => handleDeletionAction(request, "process")} disabled={Boolean(deletionBusyUid)}>{deletionBusyUid === request.user_id ? "Processing…" : request.status === "processing" ? "Continue processing" : "Process deletion"}</button>}
        </div>
      </article>)}
    </section>}

    {loading ? <p role="status">Loading moderation cases…</p> : cases.length === 0
      ? <section className="moderationEmpty moderationEmptyState"><h2>No {status} cases</h2><p className="muted">There are no reports in this queue right now.</p></section>
      : <section className="moderationCases moderationCaseList" aria-label="Moderation cases">
        {cases.map(item => <article className="moderationCase moderationCaseCard" key={item.id}>
          <div className="moderationCaseHeader"><span className="eyebrow">CASE {item.id.slice(0, 8)}</span>
            <span className={`caseStatus status-${item.status}`}>{item.status}</span></div>
          <h2>{(item.reason || "other").replaceAll("_", " ")}</h2>
          <dl className="caseMetadata">
            <div><dt>Reported account</dt><dd><Link to={`/profile/${item.target_user_id}`}>{item.target_user_id || "Unavailable"}</Link></dd></div>
            <div><dt>Reporter</dt><dd>{item.reporter_id || "Unavailable"}</dd></div>
            <div><dt>Submitted</dt><dd>{formatDate(item.created_at)}</dd></div>
          </dl>
          <div className="caseEvidence"><strong>Additional context</strong><p>{item.details || "No additional details were provided."}</p></div>
          <label className="caseNote">Moderator note
            <textarea rows="3" maxLength="1000" value={notes[item.id] ?? ""} onChange={event => setNotes(previous => ({ ...previous, [item.id]: event.target.value }))} placeholder="Record the evidence reviewed and rationale for your decision." />
          </label>
          <div className="caseActions">
            {ACTIONS.filter(action => action !== item.status).map(action => <button type="button" key={action}
              className={action === "dismissed" ? "secondaryAction" : "primaryAction"} disabled={Boolean(busyId)}
              onClick={() => reviewCase(item, action)}>{busyId === item.id ? "Saving…" : action[0].toUpperCase() + action.slice(1)}</button>)}
          </div>
        </article>)}
      </section>}

    <section className="moderationPanel auditPanel">
      <div className="sectionHeading ownerQueueHeading">
        <div><p className="eyebrow">ACCOUNTABILITY</p><h2>Audit history</h2></div>
        <button type="button" className="secondaryAction" onClick={loadAudit} disabled={auditLoading}>{auditLoading ? "Refreshing…" : "Refresh log"}</button>
      </div>
      <p className="muted">A record of moderation and owner actions. Only moderators and the owner can view this history.</p>
      {auditLoading && <p role="status">Loading audit history…</p>}
      {!auditLoading && auditEvents.length === 0 && <p className="muted small">No audit events recorded yet.</p>}
      <div className="auditEventList">
        {auditEvents.map(item => <article className="auditEvent" key={item.id}>
          <div className="auditEventHeader"><strong>{(item.action || "activity").replaceAll("_", " ")}</strong><time>{formatDate(item.created_at)}</time></div>
          <p>{describeMetadata(item.metadata) || (item.report_id ? `Report ${item.report_id}` : "Administrative event")}</p>
          <small>Actor: {item.actor_id || "System"}{item.report_id ? ` · Report: ${item.report_id}` : ""}</small>
        </article>)}
      </div>
    </section>
  </main>;
}
