-- =============================================
-- pg_cron 자동 스케줄 설정
-- Supabase Pro 플랜 이상에서만 사용 가능
-- =============================================

-- pg_cron, pg_net 확장 활성화
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 기존 스케줄 삭제 (있으면)
SELECT cron.unschedule('daily-portfolio-report')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-portfolio-report'
);

-- 매일 23:00 UTC (한국시간 08:00 KST) 실행
SELECT cron.schedule(
  'daily-portfolio-report',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 참고: app.settings 대신 직접 URL을 넣어도 됩니다:
-- SELECT cron.schedule(
--   'daily-portfolio-report',
--   '0 23 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-report',
--     headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );
