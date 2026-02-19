// ==================== Analysis ====================

import { InsightData, SectorTrend } from "./types.ts";

export function calcSignal(pct: number): string {
  if (pct > 3) return "positive";
  if (pct >= -1) return "hold";
  if (pct >= -3) return "watch";
  return "caution";
}

export function calcSectorTrends(
  snapshots: any[],
  stocks: any[]
): Record<string, SectorTrend> {
  const sectorPcts: Record<string, number[]> = {};

  for (const snap of snapshots) {
    const stock = stocks.find((s: any) => s.ticker === snap.ticker);
    if (!stock) continue;
    if (!sectorPcts[stock.sector]) sectorPcts[stock.sector] = [];
    sectorPcts[stock.sector].push(snap.price_change_pct || 0);
  }

  const result: Record<string, SectorTrend> = {};
  for (const [sector, pcts] of Object.entries(sectorPcts)) {
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    result[sector] = {
      trend: avg > 1 ? "▲ 강세" : avg < -1 ? "▼ 조정" : "— 혼조",
      avg: Math.round(avg * 100) / 100,
    };
  }
  return result;
}

export function generateInsights(
  snapshots: any[],
  stocks: any[]
): InsightData {
  const withInfo = snapshots.map((s: any) => {
    const info = stocks.find((st: any) => st.ticker === s.ticker) || {};
    return { ...s, ...info };
  });

  const sorted = [...withInfo].sort(
    (a, b) => (b.price_change_pct || 0) - (a.price_change_pct || 0)
  );

  const topGainers = sorted
    .slice(0, 3)
    .filter((s) => (s.price_change_pct || 0) > 0)
    .map((s) => ({ ticker: s.ticker, company: s.company_name, change: s.price_change_pct }));

  const topLosers = sorted
    .slice(-3)
    .filter((s) => (s.price_change_pct || 0) < 0)
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

export function calcOverallSignal(usAvg: number, krAvg: number): string {
  const overallAvg = (usAvg + krAvg) / 2;
  if (overallAvg > 1) return "bullish";
  if (overallAvg < -1) return "bearish";
  return "mixed";
}
