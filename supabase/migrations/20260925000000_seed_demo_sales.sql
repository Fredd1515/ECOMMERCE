-- Genera datos de demostración para el panel de ventas.
-- La migración es idempotente: si se ejecuta nuevamente no duplica pedidos.

create extension if not exists "uuid-ossp";

-- Garantiza que los pedidos demo también descuenten inventario de forma atómica.
create or replace function public.decrement_stock_on_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product_id is null then
    raise exception using
      errcode = '22004',
      message = 'El artículo del pedido no tiene un producto asociado.';
  end if;

  if new.quantity is null or new.quantity <= 0 then
    raise exception using
      errcode = '22023',
      message = 'La cantidad del producto debe ser mayor que cero.';
  end if;

  update public.products
  set
    stock = stock - new.quantity,
    updated_at = now()
  where id = new.product_id
    and stock >= new.quantity;

  if not found then
    if not exists (
      select 1
      from public.products
      where id = new.product_id
    ) then
      raise exception using
        errcode = 'P0002',
        message = 'El producto del pedido no existe.';
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'Stock insuficiente para el producto solicitado.';
  end if;

  return new;
end;
$$;

revoke all on function public.decrement_stock_on_order_item() from public;

drop trigger if exists decrement_stock_on_order_item on public.order_items;

create trigger decrement_stock_on_order_item
before insert on public.order_items
for each row
execute function public.decrement_stock_on_order_item();

create temporary table demo_catalog (
  slot integer primary key,
  name varchar(255) not null,
  description text not null,
  price numeric(10,2) not null,
  category varchar(100) not null
) on commit drop;

insert into demo_catalog (slot, name, description, price, category)
values
  (1, 'Paracetamol 500 mg - 20 tabletas', 'Analgésico y antipirético de uso común.', 8.90, 'Analgésicos'),
  (2, 'Ibuprofeno 400 mg - 10 tabletas', 'Antiinflamatorio y analgésico.', 12.50, 'Analgésicos'),
  (3, 'Amoxicilina 500 mg - 21 cápsulas', 'Antibiótico de uso bajo prescripción médica.', 24.90, 'Antibióticos'),
  (4, 'Loratadina 10 mg - 10 tabletas', 'Antialérgico de acción prolongada.', 10.90, 'Antialérgicos'),
  (5, 'Omeprazol 20 mg - 14 cápsulas', 'Protector gástrico para el control de la acidez.', 15.90, 'Gastrointestinal'),
  (6, 'Losartán 50 mg - 30 tabletas', 'Medicamento para el control de la presión arterial.', 18.50, 'Cardiovascular'),
  (7, 'Azitromicina 500 mg - 3 tabletas', 'Antibiótico de uso bajo prescripción médica.', 28.90, 'Antibióticos'),
  (8, 'Metformina 850 mg - 30 tabletas', 'Medicamento para el control de la glucosa.', 22.90, 'Diabetes'),
  (9, 'Cetirizina 10 mg - 10 tabletas', 'Antialérgico para síntomas de rinitis y urticaria.', 9.90, 'Antialérgicos'),
  (10, 'Diclofenaco 50 mg - 20 tabletas', 'Antiinflamatorio para dolores musculares y articulares.', 14.90, 'Analgésicos'),
  (11, 'Ambroxol 30 mg/5 ml - 120 ml', 'Jarabe expectorante para aliviar la tos con flema.', 16.90, 'Respiratorio'),
  (12, 'Salbutamol 100 mcg - inhalador', 'Broncodilatador de alivio rápido.', 32.90, 'Respiratorio');

-- Inserta solamente los medicamentos que todavía no existen.
insert into public.products (name, description, price, stock, category, is_active, created_at, updated_at)
select
  c.name,
  c.description,
  c.price,
  1200,
  c.category,
  true,
  now(),
  now()
from demo_catalog c
where not exists (
  select 1
  from public.products p
  where lower(trim(p.name)) = lower(trim(c.name))
);

-- Asegura inventario suficiente para las ventas demo sin reducir existencias
-- de los demás productos del catálogo.
update public.products p
set
  stock = greatest(p.stock, 1200),
  is_active = true,
  updated_at = now()
where exists (
  select 1
  from demo_catalog c
  where lower(trim(c.name)) = lower(trim(p.name))
);

create temporary table demo_products on commit drop as
select
  c.slot,
  p.id,
  p.name,
  p.price
from demo_catalog c
cross join lateral (
  select p.id, p.name, p.price
  from public.products p
  where lower(trim(p.name)) = lower(trim(c.name))
  order by p.created_at nulls last, p.id
  limit 1
) p;

do $$
begin
  if (select count(*) from demo_products) <> 12 then
    raise exception 'No se pudieron preparar los 12 medicamentos demo.';
  end if;
end;
$$;

-- Crea los pedidos faltantes dentro de un rango de 365 días.
-- customer_id queda NULL para no asociar ventas demo a una cuenta real.
insert into public.orders (
  order_code,
  customer_id,
  customer_name,
  customer_email,
  customer_phone,
  shipping_address,
  total_amount,
  tax_amount,
  discount_amount,
  final_amount,
  status,
  payment_method,
  payment_status,
  shipping_method,
  notes,
  order_date,
  created_at,
  updated_at
)
select
  'DEMO-VENTA-' || lpad(g.sequence::text, 4, '0'),
  null,
  'Cliente demo ' || lpad(g.sequence::text, 4, '0'),
  'demo.ventas+' || lpad(g.sequence::text, 4, '0') || '@farmacia.test',
  '+51 900 ' || lpad(g.sequence::text, 4, '0'),
  'Av. Datos Demo 100, Lima',
  0,
  0,
  0,
  0,
  'pending',
  (array['card', 'yape', 'plin', 'cash'])[(g.sequence % 4) + 1],
  'completed',
  'delivery',
  'Pedido generado para poblar las métricas de demostración.',
  current_date
    - ((g.sequence * 13) % 365) * interval '1 day'
    + ((g.sequence * 37) % 86400) * interval '1 second',
  current_date
    - ((g.sequence * 13) % 365) * interval '1 day'
    + ((g.sequence * 37) % 86400) * interval '1 second',
  current_date
    - ((g.sequence * 13) % 365) * interval '1 day'
    + ((g.sequence * 37) % 86400) * interval '1 second'
from generate_series(1, 2000) as g(sequence)
where not exists (
  select 1
  from public.orders o
  where o.order_code = 'DEMO-VENTA-' || lpad(g.sequence::text, 4, '0')
);

create temporary table demo_orders on commit drop as
select
  o.id,
  g.sequence,
  o.order_date
from generate_series(1, 2000) as g(sequence)
join public.orders o
  on o.order_code = 'DEMO-VENTA-' || lpad(g.sequence::text, 4, '0');

-- Cada pedido demo tiene dos líneas de productos y sus cantidades se
-- distribuyen de forma determinista para que el resultado sea reproducible.
insert into public.order_items (
  order_id,
  product_id,
  product_name,
  quantity,
  unit_price,
  total_price,
  created_at
)
select
  d.id,
  p.id,
  p.name,
  line.quantity,
  p.price,
  round((p.price * line.quantity)::numeric, 2),
  d.order_date
from demo_orders d
cross join lateral (
  select
    ((d.sequence * 17) % 12) + 1 as slot,
    (d.sequence % 3) + 1 as quantity
  union all
  select
    ((d.sequence * 17 + 5) % 12) + 1 as slot,
    ((d.sequence + 1) % 3) + 1 as quantity
) line
join demo_products p on p.slot = line.slot
where not exists (
  select 1
  from public.order_items oi
  where oi.order_id = d.id
    and oi.product_id = p.id
);

-- Completa los importes y marca las ventas demo como entregadas.
-- El cambio de estado activa el sincronizador existente de fact_sales cuando
-- está instalado en la base de datos.
with order_totals as (
  select
    oi.order_id,
    round(sum(oi.total_price)::numeric, 2) as subtotal
  from public.order_items oi
  join demo_orders d on d.id = oi.order_id
  group by oi.order_id
)
update public.orders o
set
  total_amount = t.subtotal,
  tax_amount = round((t.subtotal * 0.18)::numeric, 2),
  discount_amount = 0,
  final_amount = round((t.subtotal * 1.18)::numeric, 2),
  status = 'delivered',
  payment_status = 'completed',
  updated_at = o.order_date
from order_totals t
where o.id = t.order_id;

analyze public.orders;
analyze public.order_items;
analyze public.products;

do $$
begin
  raise notice 'Ventas demo listas: % pedidos y % artículos.',
    (select count(*) from demo_orders),
    (select count(*) from public.order_items oi join demo_orders d on d.id = oi.order_id);
end;
$$;
