-- Asegurarse de que user_profiles tenga columna role
alter table user_profiles
  add column if not exists role text default 'employee';

-- Desactivamos RLS para simplificar la lectura de rol
alter table user_profiles disable row level security;

-- Vista segura para que el frontend obtenga rol sin exponer toda la tabla
create or replace view my_profile as
  select id, role
  from user_profiles
  where id = auth.uid();

create or replace function get_my_role()
  returns text
  language sql
  security definer
as $$
  select role
  from user_profiles
  where id = auth.uid();
$$;
