// ==================== DB Operations ====================

import { LogEntry, SnapshotRow } from "./types.ts";

export async function saveSnapshots(
  supabase: any,
  snapshots: SnapshotRow[],
  today: string,
  logs: LogEntry[]
): Promise<void> {
  if (snapshots.length === 0) return;

  // 오늘 데이터 삭제 후 재삽입
  await supabase.from("daily_snapshots").delete().eq("report_date", today);

  const { error } = await supabase.from("daily_snapshots").insert(snapshots);
  if (error) {
    logs.push({ ticker: "-", market: "-", status: "fail", msg: `Snapshot insert error: ${error.message}`, ts: new Date().toISOString() });
  } else {
    logs.push({ ticker: "-", market: "-", status: "ok", msg: `Inserted ${snapshots.length} snapshots`, ts: new Date().toISOString() });
  }
}

export async function saveSummary(
  supabase: any,
  summaryRow: any,
  today: string,
  logs: LogEntry[]
): Promise<void> {
  await supabase.from("daily_summary").delete().eq("report_date", today);

  const { error } = await supabase.from("daily_summary").insert(summaryRow);
  if (error) {
    logs.push({ ticker: "-", market: "-", status: "fail", msg: `Summary insert error: ${error.message}`, ts: new Date().toISOString() });
  } else {
    logs.push({ ticker: "-", market: "-", status: "ok", msg: `Summary saved`, ts: new Date().toISOString() });
  }
}
