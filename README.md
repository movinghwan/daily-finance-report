# 포트폴리오 데일리 대시보드

고배당 ETF + 미래 먹거리 포트폴리오를 매일 자동으로 모니터링하는 웹 대시보드입니다.

## 구조

```
portfolio-dashboard/
├── frontend/
│   └── index.html              ← 웹 대시보드 (이 파일만 브라우저에서 열면 됨)
├── supabase/
│   ├── migrations/
│   │   ├── 001_create_tables.sql  ← DB 테이블 + 시드 데이터
│   │   └── 002_setup_cron.sql     ← 매일 8시 자동 실행 설정
│   └── functions/
│       └── daily-report/
│           └── index.ts           ← Edge Function (주가 수집 + DB 저장)
└── README.md
```

## 배포 가이드 (5단계)

### Step 1: Supabase 프로젝트 준비

1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. 프로젝트가 없으면 새로 생성 (Free tier로 충분)
3. **Settings > API** 에서 아래 2가지를 메모:
   - `Project URL` (예: https://abcdef.supabase.co)
   - `anon public key` (예: eyJhbG...)
   - `service_role key` (배포 시 필요)

### Step 2: 데이터베이스 테이블 생성

1. Supabase Dashboard > **SQL Editor** 클릭
2. `001_create_tables.sql` 파일 내용을 붙여넣고 실행
3. **Table Editor**에서 `portfolio_stocks`, `daily_snapshots`, `daily_summary` 3개 테이블이 생겼는지 확인
4. `portfolio_stocks`에 21개 종목이 들어있는지 확인

### Step 3: Edge Function 배포

로컬에 Supabase CLI가 설치되어 있어야 합니다.

```bash
# Supabase CLI 설치 (없다면)
npm install -g supabase

# 프로젝트 루트에서 로그인
supabase login

# 프로젝트 연결
supabase link --project-ref YOUR_PROJECT_REF

# Edge Function 배포
supabase functions deploy daily-report --no-verify-jwt
```

또는 Supabase Dashboard에서 직접:
1. **Edge Functions** > **New Function**
2. `daily-report` 이름으로 생성
3. `index.ts` 코드를 붙여넣기
4. **Deploy**

### Step 4: 자동 스케줄 설정 (pg_cron)

1. Supabase Dashboard > **SQL Editor**
2. `002_setup_cron.sql` 내용에서 **대안 섹션의 주석을 해제**하고:
   - `YOUR_PROJECT_REF`를 실제 프로젝트 ref로 교체
   - `YOUR_SERVICE_ROLE_KEY`를 실제 service role key로 교체
3. 실행

> pg_cron은 Pro 플랜 이상에서 사용 가능합니다.
> Free 플랜인 경우 대시보드의 "🔄 데이터 새로고침" 버튼을 수동으로 클릭하세요.

### Step 5: 대시보드 접속

1. `frontend/index.html`을 브라우저에서 열기
2. 처음 접속 시 **⚙️ 설정** 버튼 클릭
3. Supabase Project URL과 anon key 입력 후 저장
4. **🔄 데이터 새로고침** 버튼으로 첫 데이터 수집
5. 끝! 매일 자동으로 데이터가 업데이트됩니다

### 호스팅 (선택사항)

`index.html`은 단일 파일이므로 아무 곳에나 호스팅 가능합니다:
- **GitHub Pages** (무료)
- **Vercel** (무료)
- **Netlify** (무료)
- 또는 그냥 로컬에서 열어도 동작합니다

## 모니터링 종목 (21개)

| 섹터 | 미국 | 한국 |
|------|------|------|
| AI 반도체 | NVDA, AMD, MU | 삼성전자, SK하이닉스 |
| 로봇·자율주행 | TSLA, ISRG | 두산로보틱스, 레인보우로보틱스 |
| 바이오·헬스케어 | LLY, ABBV | 삼성바이오로직스, 셀트리온 |
| 우주·방산 | LMT, RTX | 한화에어로스페이스, LIG넥스원 |
| 양자·에너지 | IONQ, QBTS | 두산에너빌리티, HD현대일렉트릭 |

## 주의사항

- 본 대시보드는 교육/참고 목적이며, 투자 권유가 아닙니다
- 주가 데이터는 Yahoo Finance, Naver Finance API에서 수집됩니다
- 시그널은 단순 가격 변동 기반 규칙이며, 투자 판단의 근거로 사용하지 마세요
- API 호출 제한에 걸릴 수 있으며, 이 경우 데이터가 누락될 수 있습니다
