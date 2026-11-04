-- 土台（plan_foundation_v1）：表・ログイン結び付け・行ごとの読み書きの決まり（RLS）・許可（GRANT）

-- 1. 判定用の関数を置くスキーマ（外から直接呼ばせない）
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- 2. 表の作成
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique,
  name text not null,
  role text not null check (role in ('member', 'leader', 'mgr', 'ceo')),
  goes_to_sales boolean not null default false,
  hired_on date not null,
  retired_on date
);

create unique index members_email_lower_idx on public.members (lower(email));

create table public.member_affiliations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  team_id uuid not null references public.teams(id),
  base text not null,
  start_date date not null,
  end_date date
);

create index member_affiliations_member_id_idx on public.member_affiliations (member_id);
create index member_affiliations_team_id_idx on public.member_affiliations (team_id);

create table public.mgr_assignments (
  id uuid primary key default gen_random_uuid(),
  mgr_member_id uuid not null references public.members(id),
  team_id uuid not null references public.teams(id),
  start_date date not null,
  end_date date,
  assigned_by uuid references public.members(id)
);

create index mgr_assignments_mgr_member_id_idx on public.mgr_assignments (mgr_member_id);
create index mgr_assignments_team_id_idx on public.mgr_assignments (team_id);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  kind text not null check (kind in ('admin', 'talk_owner')),
  granted_by uuid references public.members(id),
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.members(id),
  revoked_at timestamptz
);

create index permissions_member_id_idx on public.permissions (member_id);

-- 3. すべての表で RLS を明示してオンにする
alter table public.teams enable row level security;
alter table public.members enable row level security;
alter table public.member_affiliations enable row level security;
alter table public.mgr_assignments enable row level security;
alter table public.permissions enable row level security;

-- 4. 表ごとの許可（GRANT）の明示（anon には何も許可しない。削除は authenticated には許可しない）
revoke all on table public.teams from public, anon, authenticated;
revoke all on table public.members from public, anon, authenticated;
revoke all on table public.member_affiliations from public, anon, authenticated;
revoke all on table public.mgr_assignments from public, anon, authenticated;
revoke all on table public.permissions from public, anon, authenticated;

grant select on table public.teams to authenticated;
grant select, insert, update on table public.members to authenticated;
grant select, insert, update on table public.member_affiliations to authenticated;
grant select, insert, update on table public.mgr_assignments to authenticated;
grant select, insert, update on table public.permissions to authenticated;

grant select, insert, update, delete on table
  public.teams,
  public.members,
  public.member_affiliations,
  public.mgr_assignments,
  public.permissions
to service_role;

-- 5. 判定用の関数（private スキーマ、security definer、search_path = ''）

-- 日本時間の「今日」
create or replace function private.today_jst()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone 'Asia/Tokyo')::date;
$$;

-- ログインしている人の member_id
create or replace function private.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members m
  where m.auth_user_id = (select auth.uid())
  limit 1;
$$;

-- ログインしている人の役割（member / leader / mgr / ceo）
create or replace function private.current_member_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.members m
  where m.auth_user_id = (select auth.uid())
  limit 1;
$$;

-- 代表かどうか
create or replace function private.is_ceo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_member_role() = 'ceo', false);
$$;

-- 指定した種類の有効な権限（revoked_at が空）を持っているか
create or replace function private.has_active_permission(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.permissions p
    where p.member_id = private.current_member_id()
      and p.kind = p_kind
      and p.revoked_at is null
  );
$$;

-- 管理者の権限（admin が有効）を持っているか
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_active_permission('admin');
$$;

-- 指定した member_id の行を読めるか
create or replace function private.can_read_member(p_target_member_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_role text;
  v_today date;
begin
  v_me := private.current_member_id();
  if v_me is null then
    return false;
  end if;

  if private.is_ceo() or private.is_admin() then
    return true;
  end if;

  if p_target_member_id = v_me then
    return true;
  end if;

  v_role := private.current_member_role();
  v_today := private.today_jst();

  if v_role in ('member', 'leader') then
    return exists (
      select 1
      from public.member_affiliations my_aff
      join public.member_affiliations target_aff
        on target_aff.team_id = my_aff.team_id
      where my_aff.member_id = v_me
        and my_aff.start_date <= v_today
        and (my_aff.end_date is null or my_aff.end_date >= v_today)
        and target_aff.member_id = p_target_member_id
        and target_aff.start_date <= v_today
        and (target_aff.end_date is null or target_aff.end_date >= v_today)
    );
  end if;

  if v_role = 'mgr' then
    return exists (
      select 1
      from public.mgr_assignments ma
      join public.member_affiliations target_aff
        on target_aff.team_id = ma.team_id
      where ma.mgr_member_id = v_me
        and ma.start_date <= v_today
        and (ma.end_date is null or ma.end_date >= v_today)
        and target_aff.member_id = p_target_member_id
        and target_aff.start_date <= v_today
        and (target_aff.end_date is null or target_aff.end_date >= v_today)
    );
  end if;

  return false;
end;
$$;

-- 指定した team_id の行を読めるか
create or replace function private.can_read_team(p_team_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_role text;
  v_today date;
begin
  v_me := private.current_member_id();
  if v_me is null then
    return false;
  end if;

  if private.is_ceo() or private.is_admin() then
    return true;
  end if;

  v_role := private.current_member_role();
  v_today := private.today_jst();

  if v_role in ('member', 'leader') then
    return exists (
      select 1
      from public.member_affiliations my_aff
      where my_aff.member_id = v_me
        and my_aff.team_id = p_team_id
        and my_aff.start_date <= v_today
        and (my_aff.end_date is null or my_aff.end_date >= v_today)
    );
  end if;

  if v_role = 'mgr' then
    return exists (
      select 1
      from public.mgr_assignments ma
      where ma.mgr_member_id = v_me
        and ma.team_id = p_team_id
        and ma.start_date <= v_today
        and (ma.end_date is null or ma.end_date >= v_today)
    );
  end if;

  return false;
end;
$$;

-- Microsoft（azure）でログインしメールが確認済みの利用者だけ、ログインのたびに auth_user_id が空の名簿の行と結ぶ
create or replace function private.handle_auth_user_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_azure boolean;
begin
  if new.last_sign_in_at is null or new.email is null or new.email_confirmed_at is null then
    return new;
  end if;

  v_is_azure := (
    coalesce(new.raw_app_meta_data->>'provider', '') = 'azure'
    or coalesce((new.raw_app_meta_data->'providers') ? 'azure', false)
    or exists (
      select 1
      from auth.identities i
      where i.user_id = new.id
        and i.provider = 'azure'
    )
  );

  if not v_is_azure then
    return new;
  end if;

  if exists (select 1 from public.members m where m.auth_user_id = new.id) then
    return new;
  end if;

  update public.members
  set auth_user_id = new.id
  where lower(email) = lower(new.email)
    and auth_user_id is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row
  execute function private.handle_auth_user_login();

-- 関数の実行許可を明示（anon と public からは外し、authenticated に許可）
revoke all on function private.today_jst() from public, anon;
revoke all on function private.current_member_id() from public, anon;
revoke all on function private.current_member_role() from public, anon;
revoke all on function private.is_ceo() from public, anon;
revoke all on function private.has_active_permission(text) from public, anon;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.can_read_member(uuid) from public, anon;
revoke all on function private.can_read_team(uuid) from public, anon;
revoke all on function private.handle_auth_user_login() from public, anon, authenticated;

grant execute on function private.today_jst() to authenticated, service_role;
grant execute on function private.current_member_id() to authenticated, service_role;
grant execute on function private.current_member_role() to authenticated, service_role;
grant execute on function private.is_ceo() to authenticated, service_role;
grant execute on function private.has_active_permission(text) to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.can_read_member(uuid) to authenticated, service_role;
grant execute on function private.can_read_team(uuid) to authenticated, service_role;

-- 6. 行ごとの読み書きの決まり（RLS ポリシー）

-- teams
create policy teams_select_policy
  on public.teams
  for select
  to authenticated
  using (private.can_read_team(id));

-- members
create policy members_select_policy
  on public.members
  for select
  to authenticated
  using (private.can_read_member(id));

create policy members_insert_policy
  on public.members
  for insert
  to authenticated
  with check (private.is_admin());

create policy members_update_policy
  on public.members
  for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- member_affiliations
create policy member_affiliations_select_policy
  on public.member_affiliations
  for select
  to authenticated
  using (private.can_read_member(member_id));

create policy member_affiliations_insert_policy
  on public.member_affiliations
  for insert
  to authenticated
  with check (private.is_admin());

create policy member_affiliations_update_policy
  on public.member_affiliations
  for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- mgr_assignments
create policy mgr_assignments_select_policy
  on public.mgr_assignments
  for select
  to authenticated
  using (private.can_read_member(mgr_member_id));

create policy mgr_assignments_insert_policy
  on public.mgr_assignments
  for insert
  to authenticated
  with check (private.is_admin());

create policy mgr_assignments_update_policy
  on public.mgr_assignments
  for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- permissions
create policy permissions_select_policy
  on public.permissions
  for select
  to authenticated
  using (
    private.is_ceo()
    or private.is_admin()
    or member_id = private.current_member_id()
  );

create policy permissions_insert_policy
  on public.permissions
  for insert
  to authenticated
  with check (private.is_ceo() or private.is_admin());

create policy permissions_update_policy
  on public.permissions
  for update
  to authenticated
  using (private.is_ceo() or private.is_admin())
  with check (private.is_ceo() or private.is_admin());
