-- Asegurarse de que user_profiles tenga columna role
alter table user_profiles
  add column if not exists role text default 'employee';

-- RLS: el usuario solo puede leer su propio perfil
alter table user_profiles enable row level security;

create policy if not exists "Usuario lee su perfil"
  on user_profiles for select
  using (auth.uid() = id);

-- Vista segura para que el frontend obtenga rol sin exponer toda la tabla
create or replace view my_profile as
  select id, role
  from user_profiles
  where id = auth.uid();
