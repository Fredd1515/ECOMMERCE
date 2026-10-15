-- Confirmación manual de pagos y descuento de stock.
-- Ejecutar una vez en Supabase SQL Editor.
--
-- Flujo:
-- 1) El cliente registra el pedido y el número de operación como PENDIENTE.
-- 2) El administrador valida el pago desde el panel.
-- 3) Solo confirm_order_payment descuenta el stock de forma atómica.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_verified_by UUID,
  ADD COLUMN IF NOT EXISTS payment_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_rejected_at TIMESTAMPTZ;

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
    subtotal,
    discount,
    shipping_cost,
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
    GREATEST(COALESCE((p_order->>'discount')::NUMERIC, 0), 0),
    GREATEST(COALESCE((p_order->>'shipping_cost')::NUMERIC, 0), 0),
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

REVOKE ALL ON FUNCTION public.create_order_pending(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_order_payment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_order_payment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_pending(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(UUID, TEXT) TO authenticated;
