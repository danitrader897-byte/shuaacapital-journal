const CAL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const FEEDS = [
  { src: "FXStreet", url: "https://www.fxstreet.com/rss/news" },
  { src: "ForexLive", url: "https://www.forexlive.com/feed/news" },
  { src: "Investing", url: "https://www.investing.com/rss/news_1.rss" },
  { src: "CNBC", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html" },
];
const UA = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
  Accept: "application/rss+xml, application/xml, text/xml, */*",
};

let memo = { cal: null, calT: 0, hl: null, hlT: 0, dbg: {} };

async function getJson(url, ms = 8000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function getText(url, ms = 8000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

const clean = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();

function parseRss(xml, src) {
  const items = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  return items
    .slice(0, 15)
    .map((it) => {
      const pick = (tag) => {
        const m = it.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">"));
        return m ? clean(m[1]) : "";
      };
      return {
        title: pick("title"),
        link: pick("link"),
        ts: Date.parse(pick("pubDate")) || 0,
        src,
      };
    })
    .filter((h) => h.title && /^https?:\/\//i.test(h.link));
}

async function loadHeadlines() {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const items = parseRss(await getText(f.url), f.src);
      if (!items.length) throw new Error("kosong");
      return items;
    })
  );
  const all = [];
  const dbg = {};
  results.forEach((r, i) => {
    const name = FEEDS[i].src;
    if (r.status === "fulfilled") {
      dbg[name] = "ok (" + r.value.length + ")";
      all.push(...r.value);
    } else {
      dbg[name] = "gagal: " + (r.reason && r.reason.message);
    }
  });
  const seen = new Set();
  const list = all
    .filter((h) => (seen.has(h.title) ? false : seen.add(h.title)))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 15);
  return { list, dbg };
}

module.exports = async (req, res) => {
  const now = Date.now();

  if (!memo.cal || now - memo.calT > 5 * 60e3) {
    try {
      const c = await getJson(CAL);
      if (Array.isArray(c)) { memo.cal = c; memo.calT = now; }
    } catch (e) {}
  }

  if (!memo.hl || now - memo.hlT > 60e3) {
    try {
      const { list, dbg } = await loadHeadlines();
      memo.dbg = dbg;
      if (list.length) { memo.hl = list; memo.hlT = now; }
    } catch (e) {}
  }

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  const out = { calendar: memo.cal || [], headlines: memo.hl || [] };
  if (req.query && req.query.debug) out.debug = memo.dbg;
  res.status(200).json(out);
};
