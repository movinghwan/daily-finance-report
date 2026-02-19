import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { CORS, TODAY } from "./constants.ts";
import { LogEntry, SnapshotRow } from "./types.ts";
import { getYahooCrumb, fetchUSStock } from "./fetchUS.ts";
import { fetchKRStock } from "./fetchKR.ts";
import { calcSignal, calcSectorTrends, generateInsights, calcOverallSignal } from "./analysis.ts";
import { saveSnapshots, saveSummary } from "./db.ts";

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

    // ===== Secret Token 검증 (모든 요청 - test/debug 포함) =====
    const secretToken = Deno.env.get("SECRET_TOKEN");
    const requestToken = req.headers.get("x-secret-token");
    if (!secretToken || requestToken !== secretToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ===== Test mode: single stock =====
    if (testTicker) {
      const isKR = /^\d{6}$/.test(testTicker);
      let result = null;

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
    const snapshots: SnapshotRow[] = [];
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

    // Save snapshots to DB
    await saveSnapshots(supabase, snapshots, TODAY, logs);

    // Calculate summary
    const insights = generateInsights(snapshots, stocks);
    const sectorTrends = calcSectorTrends(snapshots, stocks);

    const usAvg = snapshots
      .filter((s) => usStocks.some((u: any) => u.ticker === s.ticker))
      .reduce((sum, s) => sum + (s.price_change_pct || 0), 0) / (usStocks.length || 1);
    const krAvg = snapshots
      .filter((s) => krStocks.some((k: any) => k.ticker === s.ticker))
      .reduce((sum, s) => sum + (s.price_change_pct || 0), 0) / (krStocks.length || 1);

    const overallSignal = calcOverallSignal(usAvg, krAvg);

    const summaryRow = {
      report_date: TODAY,
      overall_signal: overallSignal,
      us_market_trend: usAvg > 1 ? "미국 강세" : usAvg < -1 ? "미국 약세" : "미국 혼조",
      kr_market_trend: krAvg > 1 ? "한국 강세" : krAvg < -1 ? "한국 약세" : "한국 혼조",
      insights,
      action_guide: `성공 ${successCount}종목 / 실패 ${failCount}종목 수집. ${
        overallSignal === "bullish" ? "시장 강세 — 코어 성장 ETF 비중 유지" :
        overallSignal === "bearish" ? "시장 약세 — 안전자산 비중 확대 고려" :
        "혼조세 — 관망 및 분할 매수 전략 유지"
      }`,
      sector_trends: sectorTrends,
      fetch_logs: debug ? logs : undefined,
      total_fetched: successCount,
      total_failed: failCount,
    };

    // Save summary to DB
    await saveSummary(supabase, summaryRow, TODAY, logs);

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
