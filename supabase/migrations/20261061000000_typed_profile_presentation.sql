-- Frequently rendered profile presentation fields belong in typed columns,
-- not compatibility JSON documents or durable presence records.
alter table public.profiles
  add column if not exists stickman_status_id text not null default 'available',
  add column if not exists stickman_status_updated_at timestamptz,
  add column if not exists stickman_accessory_id text not null default 'none',
  add column if not exists stickman_animation_id text not null default 'idle',
  add column if not exists stickman_customization_updated_at timestamptz;

alter table public.profiles drop constraint if exists profiles_stickman_status_check;
alter table public.profiles add constraint profiles_stickman_status_check check (
  stickman_status_id in ('available','sleeping','watching-tv','studying','gaming','working','music','eating','gym','commuting','partying','chilling','coffee')
);
alter table public.profiles drop constraint if exists profiles_stickman_accessory_check;
alter table public.profiles add constraint profiles_stickman_accessory_check check (
  stickman_accessory_id in ('none','shades','beanie','crown','horns','headphones','halo','flower','bandana','star')
);
alter table public.profiles drop constraint if exists profiles_stickman_animation_check;
alter table public.profiles add constraint profiles_stickman_animation_check check (
  stickman_animation_id in ('idle','wave','bounce','dance','swagger','sleepy','spin','hype','float','sit')
);

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; when undefined_object then null;
end $$;
