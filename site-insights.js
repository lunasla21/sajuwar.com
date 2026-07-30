(function () {
  const visitorKey = "sajuwar_visitor_id";
  const sessionKey = "sajuwar_session_id";
  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`);
  let visitorId = localStorage.getItem(visitorKey);
  if (!visitorId) {
    visitorId = makeId();
    localStorage.setItem(visitorKey, visitorId);
  }
  let sessionId = sessionStorage.getItem(sessionKey);
  if (!sessionId) {
    sessionId = makeId();
    sessionStorage.setItem(sessionKey, sessionId);
  }
  function source() {
    const params = new URLSearchParams(location.search);
    const campaign = params.get("utm_source");
    if (campaign) return campaign;
    if (!document.referrer) return "직접 방문";
    try { return new URL(document.referrer).hostname.replace(/^www\./, ""); } catch (error) { return "기타"; }
  }
  function searchTerm() {
    const params = new URLSearchParams(location.search);
    return params.get("utm_term") || params.get("query") || params.get("q") || "";
  }
  function track(event, label = "") {
    const payload = JSON.stringify({
      event,
      label,
      visitor_id: visitorId,
      session_id: sessionId,
      path: location.pathname,
      source: source(),
      search_term: searchTerm(),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/event", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/analytics/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
    }
  }
  window.sajuwarTrack = track;
  track("page_view", document.title);
})();
