const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function createAnalyticsStore(baseDir) {
  const dataDir = process.env.SAJUWAR_DATA_DIR || path.join(baseDir, "data");
  const eventsPath = path.join(dataDir, "analytics.jsonl");
  const allowedEvents = new Set([
    "page_view",
    "category_click",
    "product_click",
    "free_recon_start",
    "free_recon_complete",
    "signup_complete",
    "login_complete",
    "payment_view",
    "report_view",
  ]);

  function ensureFile() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(eventsPath)) fs.writeFileSync(eventsPath, "", "utf8");
  }

  function clean(value, max = 120) {
    return String(value || "").replace(/[\r\n\t]/g, " ").trim().slice(0, max);
  }

  function safePath(value) {
    const result = clean(value, 180);
    return result.startsWith("/") ? result : "/";
  }

  function record(input = {}) {
    ensureFile();
    const event = clean(input.event, 40);
    if (!allowedEvents.has(event)) return null;
    const item = {
      id: crypto.randomUUID(),
      event,
      visitor_id: clean(input.visitor_id, 80) || "server",
      session_id: clean(input.session_id, 80),
      path: safePath(input.path),
      label: clean(input.label, 80),
      source: clean(input.source, 80),
      search_term: clean(input.search_term, 80),
      occurred_at: new Date().toISOString(),
    };
    fs.appendFileSync(eventsPath, `${JSON.stringify(item)}\n`, "utf8");
    return item;
  }

  function readEvents() {
    ensureFile();
    return fs.readFileSync(eventsPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch (error) { return null; }
    }).filter(Boolean);
  }

  function summarize(days = 30) {
    const safeDays = Math.max(1, Math.min(365, Number(days) || 30));
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - safeDays + 1);
    from.setHours(0, 0, 0, 0);
    const events = readEvents().filter((item) => new Date(item.occurred_at) >= from);
    const dayKey = (value) => String(value || "").slice(0, 10);
    const today = dayKey(now.toISOString());
    const pageViews = events.filter((item) => item.event === "page_view");
    const visitors = new Set(pageViews.map((item) => item.visitor_id).filter(Boolean));
    const todayViews = pageViews.filter((item) => dayKey(item.occurred_at) === today);
    const todayVisitors = new Set(todayViews.map((item) => item.visitor_id).filter(Boolean));
    const countBy = (items, getter) => {
      const counts = new Map();
      items.forEach((item) => {
        const key = getter(item);
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
      });
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([label, count]) => ({ label, count }));
    };
    const daily = [];
    for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      const key = dayKey(date.toISOString());
      const dayEvents = events.filter((item) => dayKey(item.occurred_at) === key);
      const dayViews = dayEvents.filter((item) => item.event === "page_view");
      daily.push({
        date: key,
        views: dayViews.length,
        visitors: new Set(dayViews.map((item) => item.visitor_id).filter(Boolean)).size,
        signups: dayEvents.filter((item) => item.event === "signup_complete").length,
        free_starts: dayEvents.filter((item) => item.event === "free_recon_start").length,
      });
    }
    const eventCount = (name) => events.filter((item) => item.event === name).length;
    return {
      range_days: safeDays,
      today: { views: todayViews.length, visitors: todayVisitors.size },
      totals: {
        views: pageViews.length,
        visitors: visitors.size,
        signups: eventCount("signup_complete"),
        free_starts: eventCount("free_recon_start"),
        free_completes: eventCount("free_recon_complete"),
        product_clicks: eventCount("product_click"),
      },
      conversion: {
        signup_rate: visitors.size ? Math.round((eventCount("signup_complete") / visitors.size) * 1000) / 10 : 0,
        free_complete_rate: eventCount("free_recon_start")
          ? Math.round((eventCount("free_recon_complete") / eventCount("free_recon_start")) * 1000) / 10 : 0,
      },
      daily,
      top_pages: countBy(pageViews, (item) => item.path),
      top_products: countBy(events.filter((item) => item.event === "product_click"), (item) => item.label),
      top_categories: countBy(events.filter((item) => item.event === "category_click"), (item) => item.label),
      top_sources: countBy(pageViews, (item) => item.source || "직접 방문"),
      search_terms: countBy(events.filter((item) => item.search_term), (item) => item.search_term),
    };
  }

  return { record, summarize };
}

module.exports = { createAnalyticsStore };
