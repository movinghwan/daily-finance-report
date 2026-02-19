// ==================== Naver Finance (KR) ====================

import { UA } from "./constants.ts";
import { LogEntry, StockResult } from "./types.ts";

function parseKRNum(val: any): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val.replace(/,/g, "")) || 0;
  return 0;
}

export async function fetchKRStock(
  code: string,
  logs: LogEntry[]
): Promise<StockResult | null> {
  const ts = new Date().toISOString();

  // Method 1: Naver mobile API
  try {
    const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://m.stock.naver.com/",
        "Accept": "application/json",
      },
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
      ticker: code,
      current_price: price,
      prev_close: price - change,
      price_change: change,
      price_change_pct: changePct,
      week52_high: h52,
      week52_low: l52,
      volume: 0,
      news_1: `전일 대비 ${changePct > 0 ? "+" : ""}${changePct}% ${changePct > 0 ? "상승" : changePct < 0 ? "하락" : "보합"}`,
      news_2: h52 ? `52주 범위: ₩${l52.toLocaleString()} ~ ₩${h52.toLocaleString()}` : null,
    };
  } catch (e) {
    logs.push({ ticker: code, market: "KR", status: "fail", msg: `Naver basic: ${(e as Error).message}`, ts });
  }

  // Method 2: Naver polling API (fallback)
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
      ticker: code,
      current_price: price,
      prev_close: prevClose,
      price_change: change,
      price_change_pct: Math.round(changePct * 100) / 100,
      week52_high: 0,
      week52_low: 0,
      volume: 0,
      news_1: `전일 대비 ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%`,
      news_2: null,
    };
  } catch (e2) {
    logs.push({ ticker: code, market: "KR", status: "fail", msg: `Polling: ${(e2 as Error).message}`, ts });
  }

  return null;
}
