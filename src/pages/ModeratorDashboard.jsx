import React, { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { invokeModerationFunction } from "../services/backend";

const FILTERS = ["pending", "reviewing", "actioned", "dismissed"];
const ACTIONS = ["reviewing", "actioned", "dismissed"];

export default function ModeratorDashboard() {
  const { currentUser } = useContext(AuthContext);
  const isOwner = currentUser?.appMetadata?.owner === true;
  const [status, setStatus] = useState("pending");
  const [cases, setCases] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [deletionBusyUid, setDeletionBusyUid] = useState("");

  const loadCases = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await invokeModerationFunction("moderation-list-cases", { status });
      setCases(result?.cases || []);
    } catch (loadError) {
      console.error("Unable to load moderation queue:", loadError);
      setError("The moderation queue couldn't be loaded. Confirm your moderator access and try again.");
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { loadCases(); }, [loadCases]);

  const loadDeletionRequests = useCallback(async () => {
    if (!isOwner) return;
    setDeletionLoading(true);
    try {
      const statuses = ["pending_review", "approved", "processing"];
      const results = await Promise.all(statuses.map(status =>
        invokeModerationFunction("account-deletion-list", { status })
      ));
      setDeletionRequests(results.flatMap(result => result?.requests || []));
    } catch (loadError) {
      console.error("Unable to load account deletion requests:", loadError);
      setError("Account deletion requests could not be loaded.");
    } finally { setDeletionLoading(false); }
  }, [isOwner]);

  useEffect(() => { if (isOwner) loadDeletionRequests(); }, [isOwner, loadDeletionRequests]);

  const handleDeletionAction = async (request, action) => {
    if (!isOwner || deletionBusyUid) return;
    const label = action === "approve" ? "Approve this account deletion request?" : "Permanently delete this account? Shared conversation history will remain for the other participant.";
    if (!window.confirm(label)) return;
    setDeletionBusyUid(request.user_id); setError(""); setNotice("");
    try {
      const result = await invokeModerationFunction(`account-deletion-${action}`, { userId: request.user_id });
      setNotice(action === "approve"
        ? "The account deletion request has been approved."
        : `Account deletion ${result?.status || "processed"}; shared conversation history is retained.`);
      await loadDeletionRequests();
    } catch (actionError) {
      console.error("Unable to process account deletion request:", actionError);
      setError(actionError.message || "The account deletion action failed.");
    } finally { setDeletionBusyUid(""); }
  };

  const reviewCase = async (item, nextStatus) => {
    if (busyId) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      await invokeModerationFunction("moderation-review-case", {
        reportId: item.id,
        status: nextStatus,
        note: (notes[item.id] || "").trim(),
      });
      setNotice(`Case ${item.id} updated to ${nextStatus}.`);
      await loadCases();
    } catch (reviewError) {
      console.error("Unable to update moderation case:", reviewError);
      setError("This case couldn't be updated. Please try again.");
    } finally { setBusyId(""); }
  };

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
    <div className="moderationToolbar moderationFilters">
      <label htmlFor="moderation-filter">Show cases</label>
      <select id="moderation-filter" value={status} onChange={event => setStatus(event.target.value)}>
        {FILTERS.map(value => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
      </select>
      <button type="button" className="secondaryAction" onClick={loadCases} disabled={loading}>Refresh</button>
    </div>
    {notice && <p className="successText" role="status">{notice}</p>}
    {error && <p className="errorText" role="alert">{error}</p>}
    {isOwner && <section className="ownerDeletionQueue moderationPanel">
      <div className="sectionHeading ownerQueueHeading"><div><p className="eyebrow">OWNER CONTROLS</p><h2>Account deletion requests</h2></div>
        <button type="button" className="secondaryAction" onClick={loadDeletionRequests} disabled={deletionLoading}>{deletionLoading ? "Refreshing…" : "Refresh requests"}</button>
      </div>
      <p className="muted">Only the owner can approve and process requests. Processing removes the account and avatar while retaining shared conversation history.</p>
      {deletionLoading && <p role="status">Loading deletion requests…</p>}
      {!deletionLoading && deletionRequests.length === 0 && <p className="muted small">No pending or approved deletion requests.</p>}
      {deletionRequests.map(request => <article className="moderationCase deletionRequest" key={request.user_id}>
        <div className="moderationCaseHeader"><span className="eyebrow">ACCOUNT REQUEST</span><span className={`caseStatus status-${request.status}`}>{request.status.replaceAll("_", " ")}</span></div>
        <p className="caseUserId">User ID: {request.user_id}</p>
        <p className="muted small">Requested: {new Date(request.requested_at).toLocaleString()}</p>
        <div className="caseActions">
          {request.status === "pending_review" && <button type="button" className="secondaryAction" onClick={() => handleDeletionAction(request, "approve")} disabled={Boolean(deletionBusyUid)}>{deletionBusyUid === request.user_id ? "Saving…" : "Approve request"}</button>}
          {["approved", "processing"].includes(request.status) && <button type="button" className="primaryAction" onClick={() => handleDeletionAction(request, "process")} disabled={Boolean(deletionBusyUid)}>{deletionBusyUid === request.user_id ? "Processing…" : request.status === "processing" ? "Continue processing" : "Process deletion"}</button>}
        </div>
      </article>)}
    </section>}
    {loading ? <p role="status">Loading moderation cases…</p> : cases.length === 0
      ? <section className="moderationEmpty moderationEmptyState"><h2>No {status} cases</h2><p className="muted">There are no reports in this queue right now.</p></section>
      : <section className="moderationCases moderationCaseList" aria-label="Moderation cases">
        {cases.map(item => <article className="moderationCase moderationCaseCard" key={item.id}>
          <div className="moderationCaseHeader">
            <span className="eyebrow">CASE {item.id.slice(0, 8)}</span>
            <span className={`caseStatus status-${item.status}`}>{item.status}</span>
          </div>
          <h2>{(item.reason || "other").replaceAll("_", " ")}</h2>
          <dl className="caseMetadata">
            <div><dt>Reported account</dt><dd><Link to={`/profile/${item.target_user_id}`}>{item.target_user_id || "Unavailable"}</Link></dd></div>
            <div><dt>Reporter</dt><dd>{item.reporter_id || "Unavailable"}</dd></div>
          </dl>
          <div className="caseEvidence"><strong>Additional context</strong><p>{item.details || "No additional details were provided."}</p></div>
          <label className="caseNote">Moderator note
            <textarea rows="3" maxLength="1000" value={notes[item.id] ?? ""} onChange={event => setNotes(previous => ({ ...previous, [item.id]: event.target.value }))} placeholder="Record the evidence reviewed and rationale for your decision." />
          </label>
          <div className="caseActions">
            {ACTIONS.filter(action => action !== item.status).map(action => <button type="button" key={action} className={action === "dismissed" ? "secondaryAction" : "primaryAction"} disabled={Boolean(busyId)} onClick={() => reviewCase(item, action)}>{busyId === item.id ? "Saving…" : action[0].toUpperCase() + action.slice(1)}</button>)}
          </div>
        </article>)}
      </section>}
  </main>;
}
