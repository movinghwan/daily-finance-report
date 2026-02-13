-- =============================================
-- 포트폴리오 데일리 리포트 DB 스키마
-- =============================================

-- 1. portfolio_stocks: 모니터링 종목 목록
CREATE TABLE IF NOT EXISTS portfolio_stocks (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(20) NOT NULL UNIQUE,
  company_name VARCHAR(100) NOT NULL,
  market VARCHAR(10) NOT NULL CHECK (market IN ('US', 'KR')),
  sector VARCHAR(50) NOT NULL CHECK (sector IN ('AI반도체', '로봇자율주행', '바이오헬스케어', '우주방산', '양자에너지')),
  stock_code VARCHAR(20),
  allocation_pct DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. daily_snapshots: 일별 종목 데이터
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(20) NOT NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  current_price DECIMAL(14,2),
  prev_close DECIMAL(14,2),
  price_change DECIMAL(14,2),
  price_change_pct DECIMAL(8,2),
  week52_high DECIMAL(14,2),
  week52_low DECIMAL(14,2),
  volume BIGINT DEFAULT 0,
  signal VARCHAR(20) CHECK (signal IN ('positive', 'hold', 'watch', 'caution')),
  signal_reason TEXT,
  news_1 TEXT,
  news_2 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker, report_date)
);

-- 3. daily_summary: 일별 종합 분석
CREATE TABLE IF NOT EXISTS daily_summary (
  id SERIAL PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  overall_signal VARCHAR(20),
  us_market_trend VARCHAR(50),
  kr_market_trend VARCHAR(50),
  insights JSONB,
  action_guide TEXT,
  sector_trends JSONB,
  fetch_logs JSONB,
  total_fetched INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== 인덱스 =====
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON daily_snapshots(report_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_ticker ON daily_snapshots(ticker);
CREATE INDEX IF NOT EXISTS idx_summary_date ON daily_summary(report_date);

-- ===== RLS 정책 =====
ALTER TABLE portfolio_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary ENABLE ROW LEVEL SECURITY;

-- anon 사용자: SELECT만 허용
CREATE POLICY "anon_read_stocks" ON portfolio_stocks FOR SELECT USING (true);
CREATE POLICY "anon_read_snapshots" ON daily_snapshots FOR SELECT USING (true);
CREATE POLICY "anon_read_summary" ON daily_summary FOR SELECT USING (true);

-- service_role: 모든 작업 허용
CREATE POLICY "service_all_stocks" ON portfolio_stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_snapshots" ON daily_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_summary" ON daily_summary FOR ALL USING (true) WITH CHECK (true);

-- ===== 종목 시드 데이터 =====
-- US 주식 (11종목)
INSERT INTO portfolio_stocks (ticker, company_name, market, sector, stock_code) VALUES
  ('NVDA',  'NVIDIA',                  'US', 'AI반도체',       'NVDA'),
  ('AMD',   'Advanced Micro Devices',  'US', 'AI반도체',       'AMD'),
  ('MU',    'Micron Technology',       'US', 'AI반도체',       'MU'),
  ('TSLA',  'Tesla',                   'US', '로봇자율주행',   'TSLA'),
  ('ISRG',  'Intuitive Surgical',      'US', '로봇자율주행',   'ISRG'),
  ('LLY',   'Eli Lilly',              'US', '바이오헬스케어', 'LLY'),
  ('ABBV',  'AbbVie',                 'US', '바이오헬스케어', 'ABBV'),
  ('LMT',   'Lockheed Martin',        'US', '우주방산',       'LMT'),
  ('RTX',   'RTX Corporation',        'US', '우주방산',       'RTX'),
  ('IONQ',  'IonQ',                   'US', '양자에너지',     'IONQ'),
  ('QBTS',  'D-Wave Quantum',         'US', '양자에너지',     'QBTS')
ON CONFLICT (ticker) DO NOTHING;

-- KR 주식 (10종목)
INSERT INTO portfolio_stocks (ticker, company_name, market, sector, stock_code) VALUES
  ('005930', '삼성전자',           'KR', 'AI반도체',       '005930'),
  ('000660', 'SK하이닉스',         'KR', 'AI반도체',       '000660'),
  ('454910', '두산로보틱스',       'KR', '로봇자율주행',   '454910'),
  ('277810', '레인보우로보틱스',   'KR', '로봇자율주행',   '277810'),
  ('207940', '삼성바이오로직스',   'KR', '바이오헬스케어', '207940'),
  ('068270', '셀트리온',           'KR', '바이오헬스케어', '068270'),
  ('012450', '한화에어로스페이스', 'KR', '우주방산',       '012450'),
  ('079550', 'LIG넥스원',         'KR', '우주방산',       '079550'),
  ('034020', '두산에너빌리티',     'KR', '양자에너지',     '034020'),
  ('267260', 'HD현대일렉트릭',     'KR', '양자에너지',     '267260')
ON CONFLICT (ticker) DO NOTHING;
