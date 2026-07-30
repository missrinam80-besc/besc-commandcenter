alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists pronouns text,
  add column if not exists bio text,
  add column if not exists location text,
  add column if not exists preferred_language text not null default 'nl',
  add column if not exists timezone text not null default 'Europe/Brussels',
  add column if not exists website_url text,
  add column if not exists discord_user_id text,
  add column if not exists discord_username text,
  add column if not exists discord_avatar_url text;

alter table public.profiles
  add constraint profiles_first_name_length check (first_name is null or char_length(first_name) <= 100),
  add constraint profiles_last_name_length check (last_name is null or char_length(last_name) <= 100),
  add constraint profiles_pronouns_length check (pronouns is null or char_length(pronouns) <= 80),
  add constraint profiles_bio_length check (bio is null or char_length(bio) <= 1200),
  add constraint profiles_location_length check (location is null or char_length(location) <= 180),
  add constraint profiles_preferred_language_allowed check (preferred_language in ('nl', 'fr', 'en')),
  add constraint profiles_timezone_length check (char_length(timezone) between 1 and 100),
  add constraint profiles_website_url_length check (website_url is null or char_length(website_url) <= 500),
  add constraint profiles_discord_user_id_length check (discord_user_id is null or char_length(discord_user_id) <= 100),
  add constraint profiles_discord_username_length check (discord_username is null or char_length(discord_username) <= 180),
  add constraint profiles_discord_avatar_url_length check (discord_avatar_url is null or char_length(discord_avatar_url) <= 500);

create unique index if not exists profiles_discord_user_id_unique_idx
  on public.profiles(discord_user_id)
  where discord_user_id is not null;
