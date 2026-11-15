const CAL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const RSS = "https://www.fxstreet.com/rss/news";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; ShuaaJournal/1.0)" };

let memo = { cal: null, calT: 0, hl: null, hlT: 0 };

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

function parseRss(xml) {
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
        src: "FXStreet",
      };
    })
    .filter((h) => h.title && /^https?:\/\//i.test(h.link));
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
      const h = parseRss(await getText(RSS));
      if (h.length) { memo.hl = h; memo.hlT = now; }
    } catch (e) {}
  }

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.status(200).json({
    calendar: memo.cal || [],
    headlines: memo.hl || [],
  });
};
