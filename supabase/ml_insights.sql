-- Persistencia de los resultados del entrenamiento automático.
-- Ejecutar una vez en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.ml_insights (
  id TEXT PRIMARY KEY,
  source_hash TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ml_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read ML insights" ON public.ml_insights;
CREATE POLICY "Admin read ML insights"
  ON public.ml_insights
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

ALTER TABLE public.ml_insights REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ml_insights'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ml_insights;
  END IF;
END $$;
