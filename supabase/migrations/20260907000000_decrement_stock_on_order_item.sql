-- Descuenta el stock al registrar un artículo de pedido.
-- Se ejecuta dentro de la misma transacción del INSERT de order_items y
-- evita que los clientes necesiten permiso directo para actualizar products.

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
