-- Allow authenticated users to edit only their own profile row.
-- Row ownership remains enforced by profiles_update_self RLS USING and WITH CHECK.
-- Do not grant INSERT or DELETE to browser clients.
grant update (
  username,
  display_name,
  photo_path,
  pronouns,
  bio,
  interests,
  hobbies,
  languages,
  education,
  institution,
  graduation_year,
  city,
  connection_goals,
  website,
  instagram,
  linkedin,
  discoverable
) on table public.profiles to authenticated;
