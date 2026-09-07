-- Crea el perfil de cada usuario directamente en Supabase.
-- Ejecuta este archivo en Supabase SQL Editor o mediante Supabase CLI.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email varchar(255) not null,
  first_name varchar(100),
  last_name varchar(100),
  phone varchar(20),
  address text,
  city varchar(100),
  state varchar(100),
  postal_code varchar(20),
  country varchar(100) default 'Perú',
  role varchar(50) not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- El trigger usa SECURITY DEFINER, por lo que el alta funciona aunque
-- el usuario todavía no haya confirmado su correo electrónico.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    role,
    created_at,
    updated_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    'customer',
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Permite que el usuario autenticado consulte y actualice únicamente su perfil.
-- El INSERT no es necesario para el registro porque lo realiza el trigger.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);