// ==================== News Fetching + Translation ====================

import { UA } from "./constants.ts";
import { LogEntry } from "./types.ts";

// ===== Yahoo Finance 뉴스 (US 종목) =====
export async function fetchYahooNews(
  ticker: string,
  crumb: string,
  cookie: string,
  logs: LogEntry[]
): Promise<string | null> {
  const ts = new Date().toISOString();

  try {
    // Yahoo Finance v2 뉴스 API
    const url = `https://query2.finance.yahoo.com/v2/finance/news?symbols=${ticker}&count=3&crumb=${encodeURIComponent(crumb)}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, "Cookie": cookie, "Accept": "application/json" },
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    const items = data?.items?.result ?? data?.news ?? [];

    if (items.length === 0) throw new Error("No news items");

    // 가장 최근 뉴스 제목 반환
    const title = items[0]?.title ?? items[0]?.headline ?? null;
    if (!title) throw new Error("No title in news");

    logs.push({ ticker, market: "US", status: "ok", msg: `News: ${title.slice(0, 40)}...`, ts });
    return title;
  } catch (e) {
    logs.push({ ticker, market: "US", status: "warn", msg: `Yahoo news v2: ${(e as Error).message}`, ts });
  }

  // Fallback: Yahoo Finance search API
  try {
    const url2 = `https://query1.finance.yahoo.com/v1/finance/search?q=${ticker}&newsCount=3&quotesCount=0&crumb=${encodeURIComponent(crumb)}`;
    const resp2 = await fetch(url2, {
      headers: { "User-Agent": UA, "Cookie": cookie, "Accept": "application/json" },
    });

    if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);

    const data2 = await resp2.json();
    const news = data2?.news ?? [];
    if (news.length === 0) throw new Error("No news");

    const title = news[0]?.title ?? null;
    if (!title) throw new Error("No title");

    logs.push({ ticker, market: "US", status: "ok", msg: `News(search): ${title.slice(0, 40)}...`, ts });
    return title;
  } catch (e2) {
    logs.push({ ticker, market: "US", status: "warn", msg: `Yahoo news search: ${(e2 as Error).message}`, ts });
  }

  return null;
}

// ===== Naver 금융 뉴스 (KR 종목) =====
export async function fetchNaverNews(
  code: string,
  logs: LogEntry[]
): Promise<string | null> {
  const ts = new Date().toISOString();

  try {
    const url = `https://m.stock.naver.com/api/stock/${code}/news?pageSize=3&page=1`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://m.stock.naver.com/",
        "Accept": "application/json",
      },
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    const items = data?.newsList ?? data?.list ?? data?.result ?? [];

    if (items.length === 0) throw new Error("No news items");

    const title = items[0]?.title ?? items[0]?.headline ?? null;
    if (!title) throw new Error("No title");

    logs.push({ ticker: code, market: "KR", status: "ok", msg: `News: ${title.slice(0, 30)}...`, ts });
    return title;
  } catch (e) {
    logs.push({ ticker: code, market: "KR", status: "warn", msg: `Naver news: ${(e as Error).message}`, ts });
  }

  // Fallback: Naver 금융 뉴스 RSS 방식
  try {
    const url2 = `https://finance.naver.com/item/news_news.naver?code=${code}&page=1&sm=title_entity_id.basic&clusterId=`;
    const resp2 = await fetch(url2, {
      headers: { "User-Agent": UA, "Referer": "https://finance.naver.com/" },
    });

    if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);

    const html = await resp2.text();
    // 뉴스 제목 파싱 (td.title > a)
    const match = html.match(/<td class="title">\s*<a[^>]+>([^<]+)<\/a>/);
    if (!match) throw new Error("No title in HTML");

    const title = match[1].trim();
    logs.push({ ticker: code, market: "KR", status: "ok", msg: `News(HTML): ${title.slice(0, 30)}...`, ts });
    return title;
  } catch (e2) {
    logs.push({ ticker: code, market: "KR", status: "warn", msg: `Naver news HTML: ${(e2 as Error).message}`, ts });
  }

  return null;
}

// ===== Claude API로 영문 뉴스 한글 번역 =====
export async function translateToKorean(
  text: string,
  ticker: string,
  logs: LogEntry[]
): Promise<string> {
  const ts = new Date().toISOString();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!apiKey) {
    logs.push({ ticker, market: "US", status: "warn", msg: "ANTHROPIC_API_KEY not set, skipping translation", ts });
    return text;
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `다음 금융 뉴스 제목을 자연스러운 한국어로 번역해줘. 번역문만 출력하고 다른 말은 하지 마.\n\n"${text}"`,
        }],
      }),
    });

    if (!resp.ok) throw new Error(`Claude API HTTP ${resp.status}`);

    const data = await resp.json();
    const translated = data?.content?.[0]?.text?.trim() ?? text;

    logs.push({ ticker, market: "US", status: "ok", msg: `Translated: ${translated.slice(0, 40)}...`, ts });
    return translated;
  } catch (e) {
    logs.push({ ticker, market: "US", status: "warn", msg: `Translation failed: ${(e as Error).message}`, ts });
    return text; // 번역 실패 시 원문 반환
  }
}
