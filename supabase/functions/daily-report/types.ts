// ==================== Types ====================

export interface StockResult {
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

export interface LogEntry {
  ticker: string;
  market: string;
  status: string;
  msg: string;
  ts: string;
}

export interface SnapshotRow {
  ticker: string;
  report_date: string;
  current_price: number;
  prev_close: number;
  price_change: number;
  price_change_pct: number;
  week52_high: number;
  week52_low: number;
  volume: number;
  signal: string;
  signal_reason: string;
  news_1: string | null;
  news_2: string | null;
}

export interface SectorTrend {
  trend: string;
  avg: number;
}

export interface InsightData {
  top_gainers: { ticker: string; company: string; change: number }[];
  top_losers: { ticker: string; company: string; change: number }[];
  sector_leaders: string;
  sector_laggards: string;
}
