-- Confirmación manual de pagos y descuento de stock.
-- Ejecutar una vez en Supabase SQL Editor.
--
-- Flujo:
-- 1) El cliente registra el pedido y el número de operación como PENDIENTE.
-- 2) El administrador valida el pago desde el panel.
-- 3) Solo confirm_order_payment descuenta el stock de forma atómica.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS discount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_verified_by UUID,
  ADD COLUMN IF NOT EXISTS payment_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_rejected_at TIMESTAMPTZ;

-- Auth y profiles son tablas separadas. Este trigger garantiza que cada
-- registro nuevo aparezca también como cliente, incluso si el navegador no
-- llega a ejecutar el upsert de respaldo.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    'customer'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.profiles.email),
    first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), public.profiles.first_name),
    last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), public.profiles.last_name),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Repara usuarios creados antes de instalar el trigger.
INSERT INTO public.profiles (id, email, first_name, last_name, role)
SELECT
  u.id,
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data ->> 'first_name', ''),
  COALESCE(u.raw_user_meta_data ->> 'last_name', ''),
  'customer'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);

-- Elimina la función anterior si se había instalado durante una prueba.
DROP FUNCTION IF EXISTS public.create_order_with_stock(JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.create_order_pending(
  p_order JSONB,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order public.orders%ROWTYPE;
  v_item JSONB;
  v_product public.products%ROWTYPE;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC(10, 2);
  v_client_unit_price NUMERIC;
  v_order_code VARCHAR(50);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: debes iniciar sesión para comprar';
  END IF;

  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_ORDER: los datos del pedido no son válidos';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART: el carrito está vacío';
  END IF;

  v_order_code := NULLIF(TRIM(p_order->>'order_code'), '');
  IF v_order_code IS NULL OR EXISTS (
    SELECT 1 FROM public.orders WHERE order_code = v_order_code
  ) THEN
    v_order_code := 'ORD-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 12));
  END IF;

  INSERT INTO public.orders (
    customer_id,
    customer_name,
    customer_email,
    order_code,
    total_amount,
    subtotal,
    discount,
    discount_amount,
    shipping_cost,
    tax_amount,
    final_amount,
    status,
    payment_method,
    payment_status,
    payment_reference,
    shipping_address,
    order_date,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    NULLIF(TRIM(p_order->>'customer_name'), ''),
    NULLIF(TRIM(p_order->>'customer_email'), ''),
    v_order_code,
    GREATEST(COALESCE((p_order->>'subtotal')::NUMERIC, 0), 0),
    GREATEST(COALESCE((p_order->>'subtotal')::NUMERIC, 0), 0),
    GREATEST(COALESCE((p_order->>'discount')::NUMERIC, 0), 0),
    GREATEST(COALESCE((p_order->>'discount')::NUMERIC, 0), 0),
    GREATEST(COALESCE((p_order->>'shipping_cost')::NUMERIC, 0), 0),
    0,
    GREATEST(COALESCE((p_order->>'final_amount')::NUMERIC, 0), 0),
    'pending',
    NULLIF(TRIM(p_order->>'payment_method'), ''),
    'pending',
    NULLIF(TRIM(p_order->>'payment_reference'), ''),
    NULLIF(TRIM(p_order->>'shipping_address'), ''),
    COALESCE((p_order->>'order_date')::TIMESTAMPTZ, NOW()),
    NOW(),
    NOW()
  )
  RETURNING * INTO v_order;

  -- Solo se valida la disponibilidad. No se descuenta aún porque el pago
  -- todavía no fue revisado por un administrador.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_product_id := NULLIF(TRIM(v_item->>'product_id'), '')::UUID;
      v_quantity := (v_item->>'quantity')::INTEGER;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'INVALID_ITEM: producto o cantidad no válidos';
    END;

    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'INVALID_ITEM: producto o cantidad no válidos';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id
      AND is_active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE: el producto ya no está disponible';
    END IF;

    IF COALESCE(v_product.stock, 0) < v_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: stock insuficiente para % (disponibles: %, solicitadas: %)',
        v_product.name, COALESCE(v_product.stock, 0), v_quantity;
    END IF;

    BEGIN
      v_client_unit_price := (v_item->>'unit_price')::NUMERIC;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      v_client_unit_price := NULL;
    END;
    v_unit_price := LEAST(
      GREATEST(COALESCE(v_client_unit_price, v_product.price), 0),
      v_product.price
    );

    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      total_price,
      created_at
    )
    VALUES (
      v_order.id,
      v_product.id,
      v_product.name,
      v_quantity,
      v_unit_price,
      v_unit_price * v_quantity,
      NOW()
    );
  END LOOP;

  RETURN jsonb_build_object(
    'order', TO_JSONB(v_order),
    'order_items', COALESCE((
      SELECT JSONB_AGG(TO_JSONB(oi) ORDER BY oi.created_at)
      FROM public.order_items oi
      WHERE oi.order_id = v_order.id
    ), '[]'::JSONB)
  );
END;
$$;

-- Replica una orden pagada en el data warehouse. La función es idempotente:
-- repetir la confirmación actualiza las mismas filas y nunca duplica una venta.
-- Esto mantiene sincronizados orders, fact_sales, dim_customers y dim_products.
CREATE OR REPLACE FUNCTION public.sync_fact_sales_for_order(
  p_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_customer_key INTEGER;
  v_product_key INTEGER;
  v_date_key INTEGER;
  v_location_key INTEGER;
  v_order_date TIMESTAMPTZ;
  v_item_count INTEGER;
  v_item RECORD;
  v_unit_cost NUMERIC(10, 2);
  v_total_cost NUMERIC(12, 2);
  v_profit_amount NUMERIC(12, 2);
  v_profit_margin NUMERIC(10, 2);
  v_discount_per_item NUMERIC(10, 2);
  v_final_price NUMERIC(12, 2);
  v_delivery_method TEXT;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Algunas instalaciones llaman a esta columna shipping_method y otras
  -- delivery_method. Leer el registro como JSON evita fallar si una de las
  -- dos columnas no existe en la tabla orders.
  v_delivery_method := COALESCE(
    TO_JSONB(v_order) ->> 'shipping_method',
    TO_JSONB(v_order) ->> 'delivery_method'
  );

  -- Un pedido pendiente no es todavía una venta confirmada.
  IF COALESCE(v_order.payment_status, '') NOT IN ('completed', 'paid', 'pagado')
     AND COALESCE(v_order.status, '') NOT IN ('completed', 'delivered') THEN
    RETURN;
  END IF;

  v_order_date := COALESCE(v_order.order_date, v_order.created_at, NOW());
  v_date_key := TO_CHAR(v_order_date, 'YYYYMMDD')::INTEGER;

  INSERT INTO public.dim_calendar (
    date_key, full_date, year, quarter, month, month_name, week,
    day_of_year, day_of_month, day_of_week, day_name, is_weekend,
    is_holiday, fiscal_year, fiscal_quarter
  )
  VALUES (
    v_date_key,
    v_order_date::DATE,
    EXTRACT(YEAR FROM v_order_date)::INTEGER,
    EXTRACT(QUARTER FROM v_order_date)::INTEGER,
    EXTRACT(MONTH FROM v_order_date)::INTEGER,
    TO_CHAR(v_order_date, 'Month'),
    EXTRACT(WEEK FROM v_order_date)::INTEGER,
    EXTRACT(DOY FROM v_order_date)::INTEGER,
    EXTRACT(DAY FROM v_order_date)::INTEGER,
    EXTRACT(DOW FROM v_order_date)::INTEGER + 1,
    TO_CHAR(v_order_date, 'Day'),
    EXTRACT(DOW FROM v_order_date) IN (0, 6),
    FALSE,
    EXTRACT(YEAR FROM v_order_date)::INTEGER,
    EXTRACT(QUARTER FROM v_order_date)::INTEGER
  )
  ON CONFLICT (date_key) DO NOTHING;

  SELECT customer_key INTO v_customer_key
  FROM public.dim_customers
  WHERE user_id = v_order.customer_id
  LIMIT 1;

  IF v_customer_key IS NULL THEN
    INSERT INTO public.dim_customers (
      user_id, email, full_name, registration_date, is_active
    )
    VALUES (
      v_order.customer_id,
      COALESCE(v_order.customer_email, 'cliente@farmacia.pe'),
      COALESCE(v_order.customer_name, 'Cliente'),
      v_order_date::DATE,
      TRUE
    )
    RETURNING customer_key INTO v_customer_key;
  ELSE
    UPDATE public.dim_customers
    SET email = COALESCE(NULLIF(v_order.customer_email, ''), email),
        full_name = COALESCE(NULLIF(v_order.customer_name, ''), full_name),
        updated_at = NOW()
    WHERE customer_key = v_customer_key;
  END IF;

  SELECT COUNT(*) INTO v_item_count
  FROM public.order_items
  WHERE order_id = v_order.id;

  SELECT location_key INTO v_location_key
  FROM public.dim_locations
  ORDER BY location_key
  LIMIT 1;

  FOR v_item IN
    SELECT
      oi.id AS order_item_id,
      oi.product_id,
      oi.quantity,
      oi.unit_price,
      oi.total_price,
      p.name,
      p.category,
      p.is_active
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = v_order.id
    ORDER BY oi.created_at
  LOOP
    INSERT INTO public.dim_products (
      product_id, name, category_name, is_active, updated_at
    )
    VALUES (
      v_item.product_id,
      COALESCE(v_item.name, 'Producto'),
      COALESCE(v_item.category, 'General'),
      COALESCE(v_item.is_active, TRUE),
      NOW()
    )
    ON CONFLICT (product_id) DO UPDATE SET
      name = EXCLUDED.name,
      category_name = EXCLUDED.category_name,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING product_key INTO v_product_key;

    v_unit_cost := ROUND(COALESCE(v_item.unit_price, 0) * 0.70, 2);
    v_total_cost := ROUND(COALESCE(v_item.quantity, 0) * v_unit_cost, 2);
    v_discount_per_item := ROUND(
      COALESCE(NULLIF(v_order.discount, 0), v_order.discount_amount, 0)
      / NULLIF(v_item_count, 0),
      2
    );
    v_final_price := GREATEST(ROUND(COALESCE(v_item.total_price, 0) - v_discount_per_item, 2), 0);
    v_profit_amount := ROUND(v_final_price - v_total_cost, 2);
    v_profit_margin := CASE
      WHEN v_final_price > 0 THEN ROUND((v_profit_amount / v_final_price) * 100, 2)
      ELSE 0
    END;

    UPDATE public.fact_sales
    SET date_key = v_date_key,
        customer_key = v_customer_key,
        product_key = v_product_key,
        location_key = COALESCE(v_location_key, location_key),
        quantity_sold = v_item.quantity,
        unit_price = v_item.unit_price,
        total_price = v_item.total_price,
        discount_amount = v_discount_per_item,
        final_price = v_final_price,
        unit_cost = v_unit_cost,
        total_cost = v_total_cost,
        profit_margin = v_profit_margin,
        profit_amount = v_profit_amount,
        payment_method = v_order.payment_method,
        payment_status = v_order.payment_status,
        order_status = v_order.status,
        delivery_method = v_delivery_method,
        order_date = v_order_date,
        updated_at = NOW()
    WHERE order_id = v_order.id
      AND order_item_id = v_item.order_item_id;

    IF NOT FOUND THEN
      INSERT INTO public.fact_sales (
        order_id,
        order_item_id,
        date_key,
        customer_key,
        product_key,
        location_key,
        quantity_sold,
        unit_price,
        total_price,
        discount_amount,
        tax_amount,
        final_price,
        unit_cost,
        total_cost,
        profit_margin,
        profit_amount,
        payment_method,
        payment_status,
        order_status,
        delivery_method,
        order_date
      )
      VALUES (
        v_order.id,
        v_item.order_item_id,
        v_date_key,
        v_customer_key,
        v_product_key,
        v_location_key,
        v_item.quantity,
        v_item.unit_price,
        v_item.total_price,
        v_discount_per_item,
        COALESCE(v_order.tax_amount, 0) / NULLIF(v_item_count, 0),
        v_final_price,
        v_unit_cost,
        v_total_cost,
        v_profit_margin,
        v_profit_amount,
        v_order.payment_method,
        v_order.payment_status,
        v_order.status,
        v_delivery_method,
        v_order_date
      );
    END IF;
  END LOOP;

  UPDATE public.dim_customers
  SET total_orders = (
        SELECT COUNT(DISTINCT order_id)
        FROM public.fact_sales
        WHERE customer_key = v_customer_key
      ),
      total_spent = (
        SELECT COALESCE(SUM(final_price), 0)
        FROM public.fact_sales
        WHERE customer_key = v_customer_key
      ),
      updated_at = NOW()
  WHERE customer_key = v_customer_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_order public.orders%ROWTYPE;
  v_item RECORD;
  v_product public.products%ROWTYPE;
BEGIN
  IF v_admin_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_admin_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED: solo un administrador puede confirmar pagos';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: pedido no encontrado';
  END IF;

  IF v_order.status = 'cancelled' OR v_order.payment_status = 'rejected' THEN
    RAISE EXCEPTION 'ORDER_CLOSED: el pedido ya fue rechazado o cancelado';
  END IF;

  -- La operación es idempotente: repetir el clic no vuelve a descontar stock.
  IF v_order.payment_status IN ('completed', 'paid', 'pagado') THEN
    -- También repara pedidos confirmados antes de instalar este sincronizador.
    PERFORM public.sync_fact_sales_for_order(v_order.id);
    RETURN jsonb_build_object('order', TO_JSONB(v_order));
  END IF;

  FOR v_item IN
    SELECT product_id, quantity
    FROM public.order_items
    WHERE order_id = v_order.id
    ORDER BY created_at
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id
      AND is_active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE: un producto del pedido ya no está disponible';
    END IF;

    IF COALESCE(v_product.stock, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: stock insuficiente para % (disponibles: %, solicitadas: %)',
        v_product.name, COALESCE(v_product.stock, 0), v_item.quantity;
    END IF;

    UPDATE public.products
    SET stock = stock - v_item.quantity,
        updated_at = NOW()
    WHERE id = v_item.product_id;
  END LOOP;

  UPDATE public.orders
  SET payment_status = 'completed',
      status = 'processing',
      payment_verified_at = NOW(),
      payment_verified_by = v_admin_id,
      updated_at = NOW()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- La confirmación actualiza la operación y la venta en la misma transacción.
  PERFORM public.sync_fact_sales_for_order(v_order.id);

  RETURN jsonb_build_object(
    'order', TO_JSONB(v_order),
    'order_items', COALESCE((
      SELECT JSONB_AGG(TO_JSONB(oi) ORDER BY oi.created_at)
      FROM public.order_items oi
      WHERE oi.order_id = v_order.id
    ), '[]'::JSONB)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_order_payment(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'Pago no verificado por el administrador'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_admin_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_admin_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED: solo un administrador puede rechazar pagos';
  END IF;

  UPDATE public.orders
  SET payment_status = 'rejected',
      status = 'cancelled',
      payment_rejection_reason = COALESCE(NULLIF(TRIM(p_reason), ''), 'Pago no verificado por el administrador'),
      payment_rejected_at = NOW(),
      payment_verified_by = v_admin_id,
      updated_at = NOW()
  WHERE id = p_order_id
    AND payment_status NOT IN ('completed', 'paid', 'pagado')
    AND status <> 'cancelled'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_CLOSED: el pedido no existe o ya fue confirmado/cancelado';
  END IF;

  RETURN jsonb_build_object('order', TO_JSONB(v_order));
END;
$$;

-- También cubre confirmaciones hechas por otros procesos o desde SQL.
-- La función llamada es idempotente, por lo que no duplica registros.
CREATE OR REPLACE FUNCTION public.sync_fact_sales_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.payment_status, '') IN ('completed', 'paid', 'pagado')
     OR COALESCE(NEW.status, '') IN ('completed', 'delivered') THEN
    PERFORM public.sync_fact_sales_for_order(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_fact_sales ON public.orders;
DROP TRIGGER IF EXISTS sync_fact_sales_on_order_change_trigger ON public.orders;
CREATE TRIGGER sync_fact_sales_on_order_change_trigger
  AFTER INSERT OR UPDATE OF payment_status, status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_fact_sales_on_order_change();

-- También sincroniza si los ítems se insertan o corrigen después de que el
-- pedido ya quedó pagado. Esto evita perder la venta por el orden de llegada
-- de las escrituras.
CREATE OR REPLACE FUNCTION public.sync_fact_sales_on_order_item_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_status TEXT;
  v_order_status TEXT;
BEGIN
  SELECT payment_status, status
  INTO v_payment_status, v_order_status
  FROM public.orders
  WHERE id = NEW.order_id;

  IF COALESCE(v_payment_status, '') IN ('completed', 'paid', 'pagado')
     OR COALESCE(v_order_status, '') IN ('completed', 'delivered') THEN
    PERFORM public.sync_fact_sales_for_order(NEW.order_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_fact_sales_on_order_item_change_trigger ON public.order_items;
CREATE TRIGGER sync_fact_sales_on_order_item_change_trigger
  AFTER INSERT OR UPDATE OF product_id, quantity, unit_price, total_price ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_fact_sales_on_order_item_change();

-- Evita que un pedido pendiente avance manualmente a preparación sin validar pago.
CREATE OR REPLACE FUNCTION public.prevent_unverified_order_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.payment_status IN ('pending', 'processing')
     AND COALESCE(NEW.payment_status, 'pending') NOT IN ('completed', 'paid', 'pagado')
     AND NEW.status IN ('processing', 'shipped', 'delivered')
     AND NEW.payment_method IN ('yape', 'plin', 'card', 'cash') THEN
    RAISE EXCEPTION 'PAYMENT_CONFIRMATION_REQUIRED: confirma el pago antes de avanzar el pedido';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_unverified_order_progress_trigger ON public.orders;
CREATE TRIGGER prevent_unverified_order_progress_trigger
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unverified_order_progress();

-- Acceso consistente para el panel administrativo. Algunas instalaciones
-- antiguas tienen políticas que solo permiten ver el histórico o que usan una
-- función de administrador obsoleta; estas políticas permiten leer los datos
-- operativos actuales sin abrirlos a usuarios no autorizados.
CREATE OR REPLACE FUNCTION public.is_current_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dim_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dim_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS current_admin_read_profiles ON public.profiles;
CREATE POLICY current_admin_read_profiles ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_current_admin() OR id = auth.uid());

DROP POLICY IF EXISTS current_admin_read_orders ON public.orders;
CREATE POLICY current_admin_read_orders ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_current_admin() OR customer_id = auth.uid());

DROP POLICY IF EXISTS current_admin_read_order_items ON public.order_items;
CREATE POLICY current_admin_read_order_items ON public.order_items
  FOR SELECT TO authenticated
  USING (
    public.is_current_admin()
    OR EXISTS (
      SELECT 1
      FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS current_admin_read_customers ON public.dim_customers;
CREATE POLICY current_admin_read_customers ON public.dim_customers
  FOR SELECT TO authenticated
  USING (public.is_current_admin());

DROP POLICY IF EXISTS current_admin_read_dim_products ON public.dim_products;
CREATE POLICY current_admin_read_dim_products ON public.dim_products
  FOR SELECT TO authenticated
  USING (public.is_current_admin());

DROP POLICY IF EXISTS current_admin_read_fact_sales ON public.fact_sales;
CREATE POLICY current_admin_read_fact_sales ON public.fact_sales
  FOR SELECT TO authenticated
  USING (public.is_current_admin());

DROP POLICY IF EXISTS current_admin_read_fact_inventory ON public.fact_inventory;
CREATE POLICY current_admin_read_fact_inventory ON public.fact_inventory
  FOR SELECT TO authenticated
  USING (public.is_current_admin());

-- Backfill de pedidos que ya fueron confirmados antes de instalar esta versión.
-- Es seguro ejecutarlo varias veces porque la sincronización es idempotente.
DO $$
DECLARE
  v_order_id UUID;
BEGIN
  FOR v_order_id IN
    SELECT id
    FROM public.orders
    WHERE payment_status IN ('completed', 'paid', 'pagado')
       OR status IN ('completed', 'delivered')
  LOOP
    PERFORM public.sync_fact_sales_for_order(v_order_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_pending(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_fact_sales_for_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_fact_sales_on_order_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_fact_sales_on_order_item_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_order_payment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_order_payment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_pending(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(UUID, TEXT) TO authenticated;
