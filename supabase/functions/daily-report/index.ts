import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ==================== Constants ====================
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TODAY = new Date().toISOString().split("T")[0];

// ==================== Types ====================
interface StockResult {
  ticker: string;
  current_price: number;
  prev_close: number;
  price_change: number;
  price_change_pct: number;
  week52_high: number;
  week52_low: number;
  volume: number;
  news_1: string | null;
  news_2: string | null;
}
interface LogEntry { ticker: string; market: string; status: string; msg: string; ts: string; }

// ==================== Yahoo Finance (US) ====================
let _crumbCache: { cookie: string; crumb: string } | null = null;

function extractCookies(resp: Response): string {
  const parts: string[] = [];
  try {
    const sc = (resp.headers as any).getSetCookie?.();
    if (Array.isArray(sc)) sc.forEach((c: string) => parts.push(c.split(";")[0]));
  } catch (_) { /* ignore */ }
  if (parts.length === 0) {
    const raw = resp.headers.get("set-cookie");
    if (raw) raw.split(",").forEach((p) => { const t = p.trim(); if (t.includes("=")) parts.push(t.split(";")[0]); });
  }
  return parts.join("; ");
}

async function getYahooCrumb(logs: LogEntry[]): Promise<{ cookie: string; crumb: string }> {
  if (_crumbCache) return _crumbCache;
  const ts = new Date().toISOString();

  // Step 1: Get cookies from Yahoo
  const r1 = await fetch("https://fc.yahoo.com/", { redirect: "follow", headers: { "User-Agent": UA } });
  let cookie = extractCookies(r1);

  // If no cookies from fc.yahoo.com, try finance.yahoo.com
  if (!cookie) {
    const r1b = await fetch("https://finance.yahoo.com/", { redirect: "follow", headers: { "User-Agent": UA } });
    cookie = extractCookies(r1b);
  }

  if (!cookie) {
    logs.push({ ticker: "-", market: "US", status: "warn", msg: "No cookies obtained from Yahoo", ts });
  }

  // Step 2: Get crumb
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, "Cookie": cookie },
  });

  if (!r2.ok) {
    const body = await r2.text().catch(() => "");
    throw new Error(`Crumb failed: HTTP ${r2.status} - ${body.slice(0, 200)}`);
  }

  const crumb = await r2.text();
  if (!crumb || crumb.length > 50) throw new Error(`Invalid crumb: ${crumb.slice(0, 50)}`);

  _crumbCache = { cookie, crumb };
  logs.push({ ticker: "-", market: "US", status: "ok", msg: `Crumb obtained: ${crumb.slice(0, 10)}...`, ts });
  return _crumbCache;
}

async function fetchUSStock(ticker: string, crumb: string, cookie: string, logs: LogEntry[]): Promise<StockResult | null> {
  const ts = new Date().toISOString();

  // Method 1: v8 chart with crumb
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d&crumb=${encodeURIComponent(crumb)}`;
    const resp = await fetch(url, { headers: { "User-Agent": UA, "Cookie": cookie, "Accept": "application/json" } });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 150)}`);
    }

    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result?.meta) throw new Error("No chart result in response");

    const meta = result.meta;
    const price = meta.regularMarketPrice ?? 0;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const change = price - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    logs.push({ ticker, market: "US", status: "ok", msg: `$${price} (${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%)`, ts });

    return {
      ticker, current_price: price, prev_close: prevClose,
      price_change: change, price_change_pct: Math.round(changePct * 100) / 100,
      week52_high: meta.fiftyTwoWeekHigh ?? 0, week52_low: meta.fiftyTwoWeekLow ?? 0,
      volume: meta.regularMarketVolume ?? 0,
      news_1: `전일 대비 ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}% ${changePct > 0 ? "상승" : changePct < 0 ? "하락" : "보합"}`,
      news_2: meta.fiftyTwoWeekHigh ? `52주 범위: $${meta.fiftyTwoWeekLow?.toFixed(2)} ~ $${meta.fiftyTwoWeekHigh?.toFixed(2)}` : null,
    };
  } catch (e) {
    logs.push({ ticker, market: "US", status: "fail", msg: `Chart+crumb: ${(e as Error).message}`, ts });
  }

  // Method 2: v8 chart WITHOUT crumb (sometimes works)
  try {
    const url2 = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
    const resp2 = await fetch(url2, { headers: { "User-Agent": UA, "Accept": "application/json" } });

    if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);

    const data2 = await resp2.json();
    const result2 = data2?.chart?.result?.[0];
    if (!result2?.meta) throw new Error("No result");

    const m = result2.meta;
    const p = m.regularMarketPrice ?? 0;
    const pc = m.previousClose ?? p;
    const ch = p - pc;
    const cp = pc > 0 ? (ch / pc) * 100 : 0;

    logs.push({ ticker, market: "US", status: "ok", msg: `Fallback OK: $${p}`, ts });
    return {
      ticker, current_price: p, prev_close: pc, price_change: ch,
      price_change_pct: Math.round(cp * 100) / 100,
      week52_high: m.fiftyTwoWeekHigh ?? 0, week52_low: m.fiftyTwoWeekLow ?? 0,
      volume: m.regularMarketVolume ?? 0,
      news_1: `전일 대비 ${cp > 0 ? "+" : ""}${cp.toFixed(2)}%`, news_2: null,
    };
  } catch (e2) {
    logs.push({ ticker, market: "US", status: "fail", msg: `No-crumb: ${(e2 as Error).message}`, ts });
  }

  return null;
}

// ==================== Naver Finance (KR) ====================
function parseKRNum(val: any): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val.replace(/,/g, "")) || 0;
  return 0;
}

async function fetchKRStock(code: string, logs: LogEntry[]): Promise<StockResult | null> {
  const ts = new Date().toISOString();

  // Method 1: Naver mobile API
  try {
    const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, "Referer": "https://m.stock.naver.com/", "Accept": "application/json" },
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 150)}`);
    }

    const d = await resp.json();
    const price = parseKRNum(d.closePrice || d.currentPrice);
    const change = parseKRNum(d.compareToPreviousClosePrice);
    const changePct = parseFloat(String(d.fluctuationsRatio || "0"));
    const h52 = parseKRNum(d.high52wPrice);
    const l52 = parseKRNum(d.low52wPrice);

    if (price === 0) throw new Error("Price is 0");

    logs.push({ ticker: code, market: "KR", status: "ok", msg: `₩${price.toLocaleString()} (${changePct > 0 ? "+" : ""}${changePct}%)`, ts });

    return {
      ticker: code, current_price: price, prev_close: price - change,
      price_change: change, price_change_pct: changePct,
      week52_high: h52, week52_low: l52, volume: 0,
      news_1: `전일 대비 ${changePct > 0 ? "+" : ""}${changePct}% ${changePct > 0 ? "상승" : changePct < 0 ? "하락" : "보합"}`,
      news_2: h52 ? `52주 범위: ₩${l52.toLocaleString()} ~ ₩${h52.toLocaleString()}` : null,
    };
  } catch (e) {
    logs.push({ ticker: code, market: "KR", status: "fail", msg: `Naver basic: ${(e as Error).message}`, ts });
  }

  // Method 2: Naver polling API
  try {
    const url2 = `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`;
    const resp2 = await fetch(url2, { headers: { "User-Agent": UA } });

    if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);

    const d2 = await resp2.json();
    const item = d2?.datas?.[0];
    if (!item) throw new Error("No data in polling response");

    const price = parseKRNum(item.closePrice || item.nowVal);
    const prevClose = parseKRNum(item.basePrice || item.quant);
    const change = price - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    logs.push({ ticker: code, market: "KR", status: "ok", msg: `Polling: ₩${price.toLocaleString()}`, ts });
    return {
      ticker: code, current_price: price, prev_close: prevClose,
      price_change: change, price_change_pct: Math.round(changePct * 100) / 100,
      week52_high: 0, week52_low: 0, volume: 0,
      news_1: `전일 대비 ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%`, news_2: null,
    };
  } catch (e2) {
    logs.push({ ticker: code, market: "KR", status: "fail", msg: `Polling: ${(e2 as Error).message}`, ts });
  }

  return null;
}

// ==================== Analysis ====================
function calcSignal(pct: number): string {
  if (pct > 3) return "positive";
  if (pct >= -1) return "hold";
  if (pct >= -3) return "watch";
  return "caution";
}

function calcSectorTrends(snapshots: any[], stocks: any[]): Record<string, { trend: string; avg: number }> {
  const sectorPcts: Record<string, number[]> = {};
  for (const snap of snapshots) {
    const stock = stocks.find((s: any) => s.ticker === snap.ticker);
    if (!stock) continue;
    if (!sectorPcts[stock.sector]) sectorPcts[stock.sector] = [];
    sectorPcts[stock.sector].push(snap.price_change_pct || 0);
  }
  const result: Record<string, { trend: string; avg: number }> = {};
  for (const [sector, pcts] of Object.entries(sectorPcts)) {
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    result[sector] = { trend: avg > 1 ? "▲ 강세" : avg < -1 ? "▼ 조정" : "— 혼조", avg: Math.round(avg * 100) / 100 };
  }
  return result;
}

function generateInsights(snapshots: any[], stocks: any[]): any {
  const withInfo = snapshots.map((s: any) => {
    const info = stocks.find((st: any) => st.ticker === s.ticker) || {};
    return { ...s, ...info };
  });

  const sorted = [...withInfo].sort((a, b) => (b.price_change_pct || 0) - (a.price_change_pct || 0));
  const topGainers = sorted.slice(0, 3).filter((s) => (s.price_change_pct || 0) > 0)
    .map((s) => ({ ticker: s.ticker, company: s.company_name, change: s.price_change_pct }));
  const topLosers = sorted.slice(-3).filter((s) => (s.price_change_pct || 0) < 0)
    .map((s) => ({ ticker: s.ticker, company: s.company_name, change: s.price_change_pct }));

  const sectorTrends = calcSectorTrends(snapshots, stocks);
  const bestSector = Object.entries(sectorTrends).sort((a, b) => b[1].avg - a[1].avg)[0];
  const worstSector = Object.entries(sectorTrends).sort((a, b) => a[1].avg - b[1].avg)[0];

  return {
    top_gainers: topGainers,
    top_losers: topLosers,
    sector_leaders: bestSector ? `${bestSector[0]} (${bestSector[1].avg > 0 ? "+" : ""}${bestSector[1].avg}%)` : "",
    sector_laggards: worstSector ? `${worstSector[0]} (${worstSector[1].avg > 0 ? "+" : ""}${worstSector[1].avg}%)` : "",
  };
}

// ==================== Main Handler ====================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "true";
  const testTicker = url.searchParams.get("test");
  const logs: LogEntry[] = [];

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    logs.push({ ticker: "-", market: "-", status: "ok", msg: "Supabase client initialized", ts: new Date().toISOString() });

    // ===== Test mode: single stock =====
    if (testTicker) {
      const isKR = /^\d{6}$/.test(testTicker);
      let result: StockResult | null = null;

      if (isKR) {
        result = await fetchKRStock(testTicker, logs);
      } else {
        try {
          const { crumb, cookie } = await getYahooCrumb(logs);
          result = await fetchUSStock(testTicker, crumb, cookie, logs);
        } catch (crumbErr) {
          logs.push({ ticker: testTicker, market: "US", status: "fail", msg: `Crumb error: ${(crumbErr as Error).message}`, ts: new Date().toISOString() });
        }
      }

      return new Response(JSON.stringify({ mode: "test", ticker: testTicker, result, logs }, null, 2), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ===== Normal mode: fetch all stocks =====
    const { data: stocks, error: stockErr } = await supabase.from("portfolio_stocks").select("*");
    if (stockErr) throw new Error(`DB read error: ${stockErr.message}`);
    if (!stocks || stocks.length === 0) throw new Error("No stocks found in portfolio_stocks table");

    logs.push({ ticker: "-", market: "-", status: "ok", msg: `Found ${stocks.length} stocks in DB`, ts: new Date().toISOString() });

    const usStocks = stocks.filter((s: any) => s.market === "US");
    const krStocks = stocks.filter((s: any) => s.market === "KR");

    // Get Yahoo crumb for US stocks
    let crumb = "", cookie = "";
    if (usStocks.length > 0) {
      try {
        const crumbData = await getYahooCrumb(logs);
        crumb = crumbData.crumb;
        cookie = crumbData.cookie;
      } catch (crumbErr) {
        logs.push({ ticker: "-", market: "US", status: "fail", msg: `Crumb failed: ${(crumbErr as Error).message}`, ts: new Date().toISOString() });
      }
    }

    // Fetch all stocks in parallel
    const usPromises = usStocks.map((s: any) => fetchUSStock(s.ticker, crumb, cookie, logs));
    const krPromises = krStocks.map((s: any) => fetchKRStock(s.stock_code || s.ticker, logs));

    const allResults = await Promise.allSettled([...usPromises, ...krPromises]);

    // Process results
    const snapshots: any[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < allResults.length; i++) {
      const r = allResults[i];
      const stock = i < usStocks.length ? usStocks[i] : krStocks[i - usStocks.length];

      if (r.status === "fulfilled" && r.value) {
        const data = r.value;
        snapshots.push({
          ticker: stock.ticker,
          report_date: TODAY,
          current_price: data.current_price,
          prev_close: data.prev_close,
          price_change: data.price_change,
          price_change_pct: data.price_change_pct,
          week52_high: data.week52_high,
          week52_low: data.week52_low,
          volume: data.volume,
          signal: calcSignal(data.price_change_pct),
          signal_reason: data.news_1 || "",
          news_1: data.news_1,
          news_2: data.news_2,
        });
        successCount++;
      } else {
        failCount++;
      }
    }

    logs.push({ ticker: "-", market: "-", status: "ok", msg: `Fetched: ${successCount} OK, ${failCount} failed`, ts: new Date().toISOString() });

    // Save to DB: daily_snapshots (upsert per ticker+date)
    if (snapshots.length > 0) {
      // Delete existing snapshots for today first, then insert
      await supabase.from("daily_snapshots").delete().eq("report_date", TODAY);
      const { error: insertErr } = await supabase.from("daily_snapshots").insert(snapshots);
      if (insertErr) {
        logs.push({ ticker: "-", market: "-", status: "fail", msg: `Snapshot insert error: ${insertErr.message}`, ts: new Date().toISOString() });
      } else {
        logs.push({ ticker: "-", market: "-", status: "ok", msg: `Inserted ${snapshots.length} snapshots`, ts: new Date().toISOString() });
      }
    }

    // Calculate summary
    const insights = generateInsights(snapshots, stocks);
    const sectorTrends = calcSectorTrends(snapshots, stocks);

    const usAvg = snapshots.filter((s) => usStocks.some((u: any) => u.ticker === s.ticker))
      .reduce((sum, s) => sum + (s.price_change_pct || 0), 0) / (usStocks.length || 1);
    const krAvg = snapshots.filter((s) => krStocks.some((k: any) => k.ticker === s.ticker))
      .reduce((sum, s) => sum + (s.price_change_pct || 0), 0) / (krStocks.length || 1);

    const overallAvg = (usAvg + krAvg) / 2;
    const overallSignal = overallAvg > 1 ? "bullish" : overallAvg < -1 ? "bearish" : "mixed";

    const summaryRow = {
      report_date: TODAY,
      overall_signal: overallSignal,
      us_market_trend: usAvg > 1 ? "미국 강세" : usAvg < -1 ? "미국 약세" : "미국 혼조",
      kr_market_trend: krAvg > 1 ? "한국 강세" : krAvg < -1 ? "한국 약세" : "한국 혼조",
      insights,
      action_guide: `성공 ${successCount}종목 / 실패 ${failCount}종목 수집. ${overallSignal === "bullish" ? "시장 강세 — 코어 성장 ETF 비중 유지" : overallSignal === "bearish" ? "시장 약세 — 안전자산 비중 확대 고려" : "혼조세 — 관망 및 분할 매수 전략 유지"}`,
      sector_trends: sectorTrends,
      fetch_logs: debug ? logs : undefined,
      total_fetched: successCount,
      total_failed: failCount,
    };

    // Upsert daily_summary
    await supabase.from("daily_summary").delete().eq("report_date", TODAY);
    const { error: sumErr } = await supabase.from("daily_summary").insert(summaryRow);
    if (sumErr) {
      logs.push({ ticker: "-", market: "-", status: "fail", msg: `Summary insert error: ${sumErr.message}`, ts: new Date().toISOString() });
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: TODAY,
        fetched: successCount,
        failed: failCount,
        signal: overallSignal,
        logs: debug ? logs : logs.filter((l) => l.status !== "ok"),
      }, null, 2),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    logs.push({ ticker: "-", market: "-", status: "fatal", msg: (error as Error).message, ts: new Date().toISOString() });
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message, logs }, null, 2),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
