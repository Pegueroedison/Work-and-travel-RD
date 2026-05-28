-- V4045 - Nombre completo: solo máximo 22 caracteres
-- Ejecutar en Supabase si ya habías creado la regla anterior de espacios.

begin;

-- Quitar reglas anteriores relacionadas al nombre completo.
alter table public.user_profiles
  drop constraint if exists user_profiles_full_name_personal_check;

alter table public.user_profiles
  drop constraint if exists user_profiles_full_name_length_check;

alter table public.user_profiles
  drop constraint if exists user_profiles_full_name_single_space_check;

alter table public.user_profiles
  drop constraint if exists user_profiles_full_name_len_check;

alter table public.user_profiles
  drop constraint if exists user_profiles_full_name_max_22_check;

-- Crear la regla correcta: solo máximo 22 caracteres.
-- Los espacios están permitidos mientras el total no pase de 22 caracteres.
alter table public.user_profiles
  add constraint user_profiles_full_name_max_22_check
  check (
    full_name is null
    or char_length(trim(full_name)) <= 22
  );

commit;
