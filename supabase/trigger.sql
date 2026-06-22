-- SQL script to be run in Supabase SQL Editor

-- 1. Create the trigger function
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public."User" (id, email, kyc_verified, "updatedAt")
  values (
    new.id, 
    new.email, 
    false, -- Everyone starts as unverified
    now()
  );
  return new;
end;
$$ language plpgsql security definer;

-- 2. Create the trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
