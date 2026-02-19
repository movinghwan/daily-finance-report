# 🔐 Daily Finance Report — 보안 체크리스트

> 심각도: 🔴 높음 / 🟡 중간 / 🟢 낮음

---

## 1. 프론트엔드 (index.html)

### 🔴 Supabase Anon Key 하드코딩
- **위치**: `index.html` 843~844번째 줄
- **문제**: `SUPABASE_KEY`가 소스코드에 직접 노출되어 누구나 확인 가능
- **위험**: 악의적 사용자가 키를 이용해 DB에 대량 조회 요청 가능 (DDoS)
- **해결**: Vercel 환경변수로 이동 (빌드 도구 필요) 또는 RLS 강화로 피해 최소화
- **현재 상태**: RLS로 SELECT만 허용 중 → 당장 치명적이진 않으나 노출 자체는 위험
- [ ] 해결 완료

---

### 🔴 관리자 비밀번호 평문 하드코딩
- **위치**: `index.html` 988번째 줄
- **문제**: `if (adminPassword !== "0649")` — 비밀번호가 소스코드에 그대로 노출
- **위험**: 누구나 소스보기로 비밀번호 확인 후 데이터 수집 버튼 무제한 실행 가능
- **해결**: 
  - 클라이언트 비밀번호 검증 자체를 제거하고
  - Edge Function에서 별도 secret 토큰으로 인증 처리
- [ ] 해결 완료

---

### 🔴 Supabase Project URL 하드코딩
- **위치**: `index.html` 842번째 줄
- **문제**: `SUPABASE_URL`이 소스코드에 노출
- **위험**: 프로젝트 구조 파악 및 타겟 공격에 활용 가능
- **해결**: 환경변수로 이동
- [ ] 해결 완료

---

### 🟡 console.log에 민감 데이터 출력
- **위치**: `index.html` 890~895번째 줄 (`changeDate` 함수)
- **문제**: `console.log`로 날짜 정보가 브라우저 콘솔에 출력
- **위험**: 직접적 위협은 낮으나 운영 환경에서 불필요한 정보 노출
- **해결**: 운영 배포 전 `console.log` 제거
- [ ] 해결 완료

---

### 🟡 XSS (Cross-Site Scripting) 취약점
- **위치**: `index.html` `renderStockTable`, `renderInsights` 함수 내 `innerHTML` 사용
- **문제**: DB에서 가져온 데이터를 `innerHTML`로 직접 삽입
- **위험**: DB 데이터가 오염될 경우 악성 스크립트 실행 가능
- **해결**: `innerHTML` 대신 `textContent` 사용 또는 DOMPurify 라이브러리로 sanitize
- [ ] 해결 완료

---

### 🟢 HTTPS 미강제
- **위치**: `index.html` 전반
- **문제**: HTTP로 접근 시 키 탈취 가능
- **해결**: Vercel/GitHub Pages 배포 시 자동 HTTPS 적용됨 → 배포 플랫폼에서 HTTP 리다이렉트 설정
- [ ] 해결 완료

---

## 2. Edge Function (index.ts)

### 🔴 인증 없는 공개 엔드포인트
- **위치**: `index.ts` 272~310번째 줄
- **문제**: `?test=NVDA`, `?debug=true` 파라미터가 인증 없이 누구나 호출 가능
- **위험**: 
  - `?debug=true` → 내부 수집 로그 전체 노출
  - `?test=NVDA` → 외부에서 무제한 API 호출 유발 가능
- **해결**: test/debug 모드에 secret 토큰 검증 추가
  ```ts
  const secret = req.headers.get("x-secret-token");
  if (secret !== Deno.env.get("SECRET_TOKEN")) {
    return new Response("Unauthorized", { status: 401 });
  }
  ```
- [ ] 해결 완료

---

### 🟡 에러 메시지 상세 노출
- **위치**: `index.ts` 429~435번째 줄
- **문제**: `error.message`를 응답에 그대로 반환
- **위험**: DB 구조, 환경변수명 등 내부 정보가 외부에 노출될 수 있음
- **해결**: 운영 환경에서는 에러 메시지를 일반화하여 반환
  ```ts
  // 개발
  { error: error.message }
  // 운영
  { error: "Internal server error" }
  ```
- [ ] 해결 완료

---

### 🟡 Rate Limiting 없음
- **위치**: `index.ts` 전반
- **문제**: Edge Function 호출에 횟수 제한 없음
- **위험**: 반복 호출로 Yahoo/Naver API 차단 유발, Supabase 사용량 초과
- **해결**: Supabase Edge Function에서 IP 기반 rate limit 추가 또는 GitHub Actions 외 호출 차단
- [ ] 해결 완료

---

### 🟢 CORS 전체 허용
- **위치**: `index.ts` 5~9번째 줄
- **문제**: `Access-Control-Allow-Origin: *` — 모든 도메인에서 호출 가능
- **위험**: 타 사이트에서 Edge Function 무단 호출 가능
- **해결**: 본인 도메인만 허용
  ```ts
  "Access-Control-Allow-Origin": "https://your-domain.vercel.app"
  ```
- [ ] 해결 완료

---

## 3. GitHub

### 🔴 GitHub Actions Secrets 미설정 시 키 노출
- **위치**: `.github/workflows/daily-report.yml`
- **문제**: `${{ secrets.SUPABASE_KEY }}` 미등록 시 워크플로우 실패 및 로그 노출 가능
- **해결**: Secrets 등록 여부 확인 (이미 완료했다면 ✅)
- [ ] 해결 완료

---

### 🟡 저장소가 Public일 경우 워크플로우 노출
- **위치**: `.github/workflows/daily-report.yml`
- **문제**: 워크플로우 파일이 공개되면 호출 구조가 노출됨
- **해결**: 저장소를 Private으로 유지
- [ ] 해결 완료

---

## 4. Supabase DB

### 🟡 RLS 정책 과도하게 허용
- **위치**: `001_create_tables.sql`
- **문제**: `service_all_*` 정책이 `USING (true)` — service_role은 모든 작업 허용
- **위험**: service_role key 탈취 시 전체 데이터 삭제/변조 가능
- **해결**: service_role key를 Edge Function 환경변수에서만 사용하고 절대 외부 노출 금지
- [ ] 해결 완료

---

### 🟢 불필요한 컬럼 SELECT
- **위치**: `index.html` `loadData` 함수
- **문제**: `.select("*")`로 모든 컬럼 조회
- **위험**: 직접적 보안 위협은 낮으나 불필요한 데이터 노출
- **해결**: 필요한 컬럼만 명시적으로 선택
  ```js
  .select("ticker, current_price, price_change_pct, signal, news_1")
  ```
- [ ] 해결 완료

---

## 우선순위 요약

| 우선순위 | 항목 | 난이도 |
|---------|------|--------|
| 1순위 🔴 | 관리자 비밀번호 평문 하드코딩 | 중 |
| 2순위 🔴 | test/debug 엔드포인트 인증 없음 | 하 |
| 3순위 🔴 | Anon Key / URL 하드코딩 | 상 |
| 4순위 🟡 | XSS 취약점 (innerHTML) | 중 |
| 5순위 🟡 | 에러 메시지 상세 노출 | 하 |
| 6순위 🟡 | Rate Limiting 없음 | 중 |
| 7순위 🟢 | console.log 운영 노출 | 하 |
| 8순위 🟢 | CORS 전체 허용 | 하 |
| 9순위 🟢 | select(*) 과다 조회 | 하 |
