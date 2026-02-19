// ==================== Constants ====================

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-secret-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// KST 기준 오늘 날짜 (UTC+9)
const KST = new Date(Date.now() + 9 * 60 * 60 * 1000);
export const TODAY = KST.toISOString().split("T")[0];
