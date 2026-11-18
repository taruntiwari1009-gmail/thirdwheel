import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { invokeModerationFunction } from "../services/backend";

const FILTERS = ["pending", "reviewing", "actioned", "dismissed"];
const ACTIONS = ["reviewing", "actioned", "dismissed"];

export default function ModeratorDashboard() {
  const [status, setStatus] = useState("pending");
  const [cases, setCases] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    <header className="pageHeader">
      <Link to="/" className="textLink">← Third Wheel</Link>
      <p className="eyebrow">TRUST & SAFETY</p>
      <h1>Moderation queue</h1>
      <p className="muted">Review reports carefully. A report is an allegation, not a finding.</p>
    </header>
    <div className="moderationToolbar">
      <label htmlFor="moderation-filter">Show cases</label>
      <select id="moderation-filter" value={status} onChange={event => setStatus(event.target.value)}>
        {FILTERS.map(value => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
      </select>
      <button type="button" className="secondaryAction" onClick={loadCases} disabled={loading}>Refresh</button>
    </div>
    {notice && <p className="successText" role="status">{notice}</p>}
    {error && <p className="errorText" role="alert">{error}</p>}
    {loading ? <p role="status">Loading moderation cases…</p> : cases.length === 0
      ? <section className="moderationEmpty"><h2>No {status} cases</h2><p className="muted">There are no reports in this queue right now.</p></section>
      : <section className="moderationCases" aria-label="Moderation cases">
        {cases.map(item => <article className="moderationCase" key={item.id}>
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
