-- Habilita los cambios que el dashboard escucha por WebSocket.
-- Ejecutar una vez en el SQL Editor de Supabase.

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['fact_sales', 'orders', 'products', 'fact_inventory']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;

-- FULL permite que el cliente reciba el cambio completo y recalcule los KPIs
-- incluso cuando la fila cambia de estado.
ALTER TABLE public.fact_sales REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.fact_inventory REPLICA IDENTITY FULL;
