# 포트폴리오 대시보드 — 수정된 Edge Function 배포 가이드

## 문제 원인
기존 Edge Function이 Yahoo Finance / Naver Finance API를 호출할 때 **인증 없이** 요청하여 403 (Forbidden) 에러가 발생했습니다.

## 수정 내용
1. **Yahoo Finance**: 크럼(crumb) 인증 + 쿠키 기반 2단계 인증 추가
2. **Naver Finance**: User-Agent + Referer 헤더 추가, 폴링 API 폴백
3. **병렬 처리**: 21개 종목을 동시에 fetching (타임아웃 방지)
4. **디버그 모드**: `?debug=true`로 상세 로그 확인 가능
5. **테스트 모드**: `?test=NVDA` 또는 `?test=005930`으로 개별 종목 테스트

---

## 배포 단계

### Step 1: 기존 Edge Function 삭제 후 재배포

터미널에서 프로젝트 폴더로 이동 후:

```bash
# Supabase CLI 로그인 (이미 했으면 생략)
npx supabase login

# 프로젝트 링크 (이미 했으면 생략)
npx supabase link --project-ref xqfvkhlfvctxokciuogd

# Edge Function 배포 (수정된 버전)
npx supabase functions deploy daily-report --no-verify-jwt
```

> `--no-verify-jwt` 옵션: 대시보드에서 anon key로 호출할 수 있게 합니다.

### Step 2: 개별 종목 테스트

배포 후 브라우저에서 직접 테스트:

```
# US 종목 테스트 (NVDA)
https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-report?test=NVDA

# KR 종목 테스트 (삼성전자)
https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-report?test=005930
```

결과 예시:
```json
{
  "mode": "test",
  "ticker": "NVDA",
  "result": {
    "ticker": "NVDA",
    "current_price": 135.50,
    "price_change_pct": 2.30,
    ...
  },
  "logs": [
    {"ticker": "-", "status": "ok", "msg": "Crumb obtained: abc123..."},
    {"ticker": "NVDA", "status": "ok", "msg": "$135.50 (+2.30%)"}
  ]
}
```

### Step 3: 전체 수집 테스트 (디버그 모드)

```
# 디버그 모드로 전체 수집
https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-report?debug=true
```

또는 curl:
```bash
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-report?debug=true' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

### Step 4: 대시보드에서 확인

`dashboard_v2.html`을 브라우저에서 열고 "🔄 데이터 새로고침" 버튼 클릭

---

## 트러블슈팅

### 여전히 데이터가 안 나올 때

1. **Edge Function 로그 확인**:
   - Supabase Dashboard → Edge Functions → daily-report → Logs

2. **테스트 모드로 개별 확인**:
   - `?test=NVDA` — Yahoo Finance 연결 확인
   - `?test=005930` — Naver Finance 연결 확인

3. **DB 테이블 확인**:
   - SQL Editor에서: `SELECT * FROM portfolio_stocks;` (21행이 있는지)
   - `SELECT * FROM daily_snapshots ORDER BY created_at DESC LIMIT 5;`

4. **Yahoo Finance가 완전히 차단된 경우**:
   - Supabase Edge Function의 IP가 Yahoo에 의해 차단될 수 있음
   - 이 경우 Alpha Vantage 등 대체 API 필요 (별도 문의)

### 에러 메시지별 해결

| 에러 | 원인 | 해결 |
|------|------|------|
| `Crumb failed: HTTP 403` | Yahoo 쿠키/크럼 인증 실패 | Edge Function 재배포, 로그 확인 |
| `No stocks found` | portfolio_stocks 테이블이 비어있음 | 001_create_tables.sql 재실행 |
| `Missing SUPABASE_URL` | 환경변수 미설정 | 자동 제공되므로 재배포 시도 |
| `Naver HTTP 403` | 네이버 API 지역 차단 | 폴링 API 폴백 자동 시도 |
