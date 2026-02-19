// ==================== Yahoo Finance (US) ====================

import { UA } from "./constants.ts";
import { LogEntry, StockResult } from "./types.ts";
import { fetchYahooNews, translateToKorean } from "./news.ts";

let _crumbCache: { cookie: string; crumb: string } | null = null;

function extractCookies(resp: Response): string {
  const parts: string[] = [];
  try {
    const sc = (resp.headers as any).getSetCookie?.();
    if (Array.isArray(sc)) sc.forEach((c: string) => parts.push(c.split(";")[0]));
  } catch (_) { /* ignore */ }
  if (parts.length === 0) {
    const raw = resp.headers.get("set-cookie");
    if (raw) raw.split(",").forEach((p) => {
      const t = p.trim();
      if (t.includes("=")) parts.push(t.split(";")[0]);
    });
  }
  return parts.join("; ");
}

export async function getYahooCrumb(logs: LogEntry[]): Promise<{ cookie: string; crumb: string }> {
  if (_crumbCache) return _crumbCache;
  const ts = new Date().toISOString();

  // Step 1: Get cookies from Yahoo
  const r1 = await fetch("https://fc.yahoo.com/", {
    redirect: "follow",
    headers: { "User-Agent": UA },
  });
  let cookie = extractCookies(r1);

  // Fallback: try finance.yahoo.com
  if (!cookie) {
    const r1b = await fetch("https://finance.yahoo.com/", {
      redirect: "follow",
      headers: { "User-Agent": UA },
    });
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

export async function fetchUSStock(
  ticker: string,
  crumb: string,
  cookie: string,
  logs: LogEntry[]
): Promise<StockResult | null> {
  const ts = new Date().toISOString();

  // Method 1: v8 chart with crumb
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d&crumb=${encodeURIComponent(crumb)}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, "Cookie": cookie, "Accept": "application/json" },
    });

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

    // 뉴스 크롤링 + 번역
    const rawNews = await fetchYahooNews(ticker, crumb, cookie, logs);
    const newsTitle = rawNews ? await translateToKorean(rawNews, ticker, logs) : `전일 대비 ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}% ${changePct > 0 ? "상승" : changePct < 0 ? "하락" : "보합"}`;

    return {
      ticker,
      current_price: price,
      prev_close: prevClose,
      price_change: change,
      price_change_pct: Math.round(changePct * 100) / 100,
      week52_high: meta.fiftyTwoWeekHigh ?? 0,
      week52_low: meta.fiftyTwoWeekLow ?? 0,
      volume: meta.regularMarketVolume ?? 0,
      news_1: newsTitle,
      news_2: meta.fiftyTwoWeekHigh ? `52주 범위: $${meta.fiftyTwoWeekLow?.toFixed(2)} ~ $${meta.fiftyTwoWeekHigh?.toFixed(2)}` : null,
    };
  } catch (e) {
    logs.push({ ticker, market: "US", status: "fail", msg: `Chart+crumb: ${(e as Error).message}`, ts });
  }

  // Method 2: v8 chart WITHOUT crumb (fallback)
  try {
    const url2 = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
    const resp2 = await fetch(url2, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
    });

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

    // 뉴스 크롤링 + 번역 (fallback에서도 시도)
    const rawNews2 = await fetchYahooNews(ticker, crumb, cookie, logs);
    const newsTitle2 = rawNews2 ? await translateToKorean(rawNews2, ticker, logs) : `전일 대비 ${cp > 0 ? "+" : ""}${cp.toFixed(2)}%`;

    return {
      ticker,
      current_price: p,
      prev_close: pc,
      price_change: ch,
      price_change_pct: Math.round(cp * 100) / 100,
      week52_high: m.fiftyTwoWeekHigh ?? 0,
      week52_low: m.fiftyTwoWeekLow ?? 0,
      volume: m.regularMarketVolume ?? 0,
      news_1: newsTitle2,
      news_2: null,
    };
  } catch (e2) {
    logs.push({ ticker, market: "US", status: "fail", msg: `No-crumb: ${(e2 as Error).message}`, ts });
  }

  return null;
}
