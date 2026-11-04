-- ロープレ①：土台の追加・ロープレと研修の表・権限・監査ログ（plan_roleplay-common_v1）

-- 1. 土台の判定関数の直し（退職日の反映）
-- 退職日（retired_on）が今日（private.today_jst()）より前の人には何も返さない（null）
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
    and (m.retired_on is null or m.retired_on >= private.today_jst())
  limit 1;
$$;

-- auth.uid() で直接引かず、where m.id = private.current_member_id() で引くように作り直す
create or replace function private.current_member_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.members m
  where m.id = private.current_member_id()
  limit 1;
$$;

-- 2. 判定の関数を足す（private スキーマ、security definer、set search_path = ''）

-- 指定した target が今所属しているチーム（今日が開始日〜終了日の中の所属）。なければ空
create or replace function private.member_team_now(target uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ma.team_id
  from public.member_affiliations ma
  where ma.member_id = target
    and ma.start_date <= private.today_jst()
    and (ma.end_date is null or ma.end_date >= private.today_jst())
  order by ma.start_date desc
  limit 1;
$$;

-- ログインしている人が今所属しているチーム（今日が開始日〜終了日の中の所属）。なければ空
create or replace function private.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.member_team_now(private.current_member_id());
$$;

-- 代表なら真。リーダーなら current_team_id() と member_team_now(target) が同じ（どちらも空でない）。
-- MGR なら今担当しているチームに target が今所属している。管理者の権限では真にしない。メンバーは偽
create or replace function private.can_supervise_member(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_role text;
  v_my_team uuid;
  v_target_team uuid;
  v_today date;
begin
  v_me := private.current_member_id();
  if v_me is null or target is null then
    return false;
  end if;

  v_role := private.current_member_role();
  if v_role = 'ceo' then
    return true;
  end if;

  if v_role = 'leader' then
    v_my_team := private.current_team_id();
    v_target_team := private.member_team_now(target);
    return v_my_team is not null and v_target_team is not null and v_my_team = v_target_team;
  end if;

  if v_role = 'mgr' then
    v_today := private.today_jst();
    return exists (
      select 1
      from public.mgr_assignments ma
      join public.member_affiliations target_aff
        on target_aff.team_id = ma.team_id
      where ma.mgr_member_id = v_me
        and ma.start_date <= v_today
        and (ma.end_date is null or ma.end_date >= v_today)
        and target_aff.member_id = target
        and target_aff.start_date <= v_today
        and (target_aff.end_date is null or target_aff.end_date >= v_today)
    );
  end if;

  return false;
end;
$$;

-- リーダーで今その team に所属している、または MGR で今その team を担当している（team が空なら偽）
create or replace function private.is_supervisor_of_team(team uuid)
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
  if team is null then
    return false;
  end if;

  v_me := private.current_member_id();
  if v_me is null then
    return false;
  end if;

  v_role := private.current_member_role();
  if v_role = 'leader' then
    return private.current_team_id() = team;
  end if;

  if v_role = 'mgr' then
    v_today := private.today_jst();
    return exists (
      select 1
      from public.mgr_assignments ma
      where ma.mgr_member_id = v_me
        and ma.team_id = team
        and ma.start_date <= v_today
        and (ma.end_date is null or ma.end_date >= v_today)
    );
  end if;

  return false;
end;
$$;

-- 3. 表の作成

-- 土台の追加の表：masters・settings・audit_logs
create table public.masters (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('scene', 'industry', 'list_type')),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create index masters_kind_sort_idx on public.masters (kind, sort_order);

create table public.settings (
  key text primary key,
  value jsonb not null,
  reason text not null check (length(btrim(reason)) > 0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_member_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  row_id text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_table_row_idx on public.audit_logs (table_name, row_id);

-- ロープレと研修の表
create table public.roleplay_themes (
  id uuid primary key default gen_random_uuid(),
  no integer not null,
  stage integer not null check (stage between 1 and 6),
  name text not null,
  kind text not null check (kind in ('apo', 'sales')),
  pass_example text not null default '',
  is_active boolean not null default true
);

create index roleplay_themes_kind_stage_no_idx on public.roleplay_themes (kind, stage, no);

create table public.member_themes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  theme_id uuid not null references public.roleplay_themes(id),
  kind text not null check (kind in ('apo', 'sales')),
  started_on date not null,
  pass_line text not null default '',
  status text not null check (status in ('practicing', 'graduated')),
  graduated_on date,
  check_on date,
  created_by uuid not null references public.members(id),
  hidden_at timestamptz
);

-- 練習中はアポと営業で1つずつまで（member_id・kind の組で status = 'practicing' かつ hidden_at が空の行は1つまで）
create unique index member_themes_active_practicing_idx
  on public.member_themes (member_id, kind)
  where status = 'practicing' and hidden_at is null;

create index member_themes_member_id_idx on public.member_themes (member_id);

create table public.talks (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code like 'OUT-%' or code like 'SC-%'),
  scene_id uuid references public.masters(id),
  industry_id uuid references public.masters(id),
  list_type_id uuid references public.masters(id),
  their_words text not null default '',
  wording text not null default '',
  aim text not null default '',
  team_id uuid references public.teams(id),
  created_by uuid not null references public.members(id),
  status text not null check (status in ('pending', 'trial', 'standard')),
  hidden_at timestamptz
);

create index talks_status_idx on public.talks (status);
create index talks_team_id_idx on public.talks (team_id);

create table public.roleplays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  runner_member_id uuid not null references public.members(id),
  member_id uuid not null references public.members(id),
  time_slot text not null,
  kind text not null check (kind in ('apo', 'sales')),
  theme_id uuid not null references public.roleplay_themes(id),
  used_talk_id uuid references public.talks(id),
  minutes integer,
  homework_result text check (homework_result in ('o', 'd', 'x')),
  repeat_count integer not null default 1,
  pass_result text check (pass_result in ('o', 'd', 'x')),
  next_homework text,
  fixed_point text not null default '',
  note text,
  purpose text,
  result_ap numeric,
  result_rate numeric,
  submitted_at timestamptz,
  hidden_at timestamptz,
  check (
    submitted_at is null
    or (
      length(btrim(fixed_point)) > 0
      and minutes is not null
      and pass_result is not null
    )
  )
);

create index roleplays_member_id_date_idx on public.roleplays (member_id, date);
create index roleplays_runner_member_id_idx on public.roleplays (runner_member_id);
create index roleplays_used_talk_id_idx on public.roleplays (used_talk_id);

create table public.seminars (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  theme text not null,
  lecturer text not null,
  minutes integer not null,
  content text not null default '',
  created_by uuid not null references public.members(id),
  hidden_at timestamptz
);

create index seminars_date_idx on public.seminars (date);

create table public.seminar_members (
  seminar_id uuid not null references public.seminars(id),
  member_id uuid not null references public.members(id),
  removed_at timestamptz,
  primary key (seminar_id, member_id)
);

create index seminar_members_member_id_idx on public.seminar_members (member_id);

-- 研修の判定関数（seminars と seminar_members の表作成後に定義）
-- ログインしている人が、その研修の seminar_members にいて removed_at が空
create or replace function private.is_seminar_participant(seminar uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seminar_members sm
    where sm.seminar_id = seminar
      and sm.member_id = private.current_member_id()
      and sm.removed_at is null
  );
$$;

-- その研修の created_by が、ログインしている人
create or replace function private.is_seminar_creator(seminar uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seminars s
    where s.id = seminar
      and s.created_by = private.current_member_id()
  );
$$;

-- 判定関数の実行許可を明示（anon と public からは外し、authenticated と service_role に許可）
revoke all on function private.current_team_id() from public, anon;
revoke all on function private.member_team_now(uuid) from public, anon;
revoke all on function private.can_supervise_member(uuid) from public, anon;
revoke all on function private.is_supervisor_of_team(uuid) from public, anon;
revoke all on function private.is_seminar_participant(uuid) from public, anon;
revoke all on function private.is_seminar_creator(uuid) from public, anon;

grant execute on function private.current_team_id() to authenticated, service_role;
grant execute on function private.member_team_now(uuid) to authenticated, service_role;
grant execute on function private.can_supervise_member(uuid) to authenticated, service_role;
grant execute on function private.is_supervisor_of_team(uuid) to authenticated, service_role;
grant execute on function private.is_seminar_participant(uuid) to authenticated, service_role;
grant execute on function private.is_seminar_creator(uuid) to authenticated, service_role;

-- 4. トリガーの関数（private スキーマ、実行許可を public, anon, authenticated から外す）

-- 監査ログのトリガー関数（masters・settings・permissions の追加・変更・削除を audit_logs に残す）
create or replace function private.record_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_row_id text;
  v_before jsonb;
  v_after jsonb;
begin
  v_action := lower(TG_OP);

  if TG_OP = 'INSERT' then
    v_before := null;
    v_after := to_jsonb(new);
    if TG_TABLE_NAME = 'settings' then
      v_row_id := new.key;
    else
      v_row_id := new.id::text;
    end if;
  elsif TG_OP = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    if TG_TABLE_NAME = 'settings' then
      v_row_id := new.key;
    else
      v_row_id := new.id::text;
    end if;
  elsif TG_OP = 'DELETE' then
    v_before := to_jsonb(old);
    v_after := null;
    if TG_TABLE_NAME = 'settings' then
      v_row_id := old.key;
    else
      v_row_id := old.id::text;
    end if;
  end if;

  insert into public.audit_logs (
    actor_member_id,
    action,
    table_name,
    row_id,
    before,
    after
  ) values (
    private.current_member_id(),
    v_action,
    TG_TABLE_NAME,
    v_row_id,
    v_before,
    v_after
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- テーマ表の種類の確かめ（member_themes.kind は roleplay_themes.kind と必ず同じ）
create or replace function private.check_member_theme_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_theme_kind text;
begin
  select rt.kind into v_theme_kind
  from public.roleplay_themes rt
  where rt.id = new.theme_id;

  if v_theme_kind is null or v_theme_kind <> new.kind then
    raise exception 'member_themes.kind must match roleplay_themes.kind';
  end if;

  return new;
end;
$$;

-- トークの状態と中身変更の確かめ
create or replace function private.check_talk_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_can_edit_always boolean;
begin
  -- 管理用の鍵（service_role 等で current_member_id が空かつ auth.uid が空のとき）は素通し
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  v_me := private.current_member_id();
  if v_me is null then
    raise exception 'not authorized to update talks';
  end if;

  -- created_by の書き換えは不可
  if new.created_by is distinct from old.created_by then
    raise exception 'cannot change created_by of talks';
  end if;

  -- 状態の変更がある場合
  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status = 'trial' then
      if old.team_id is null then
        if not private.is_ceo() then
          raise exception 'only ceo can move teamless talk from pending to trial';
        end if;
      else
        if not private.is_supervisor_of_team(old.team_id) then
          raise exception 'only team supervisor can move talk from pending to trial';
        end if;
      end if;
    elsif old.status = 'trial' and new.status = 'standard' then
      if not private.has_active_permission('talk_owner') then
        raise exception 'only talk_owner can move talk from trial to standard';
      end if;
    else
      raise exception 'invalid talk status transition from % to %', old.status, new.status;
    end if;
  end if;

  -- 状態以外の項目（中身や hidden_at）が変更されている場合
  if (new.code is distinct from old.code)
     or (new.scene_id is distinct from old.scene_id)
     or (new.industry_id is distinct from old.industry_id)
     or (new.list_type_id is distinct from old.list_type_id)
     or (new.their_words is distinct from old.their_words)
     or (new.wording is distinct from old.wording)
     or (new.aim is distinct from old.aim)
     or (new.team_id is distinct from old.team_id)
     or (new.hidden_at is distinct from old.hidden_at)
  then
    v_can_edit_always := (
      private.is_supervisor_of_team(old.team_id)
      or private.has_active_permission('talk_owner')
      or private.is_ceo()
    );
    if not v_can_edit_always then
      if not (old.created_by = v_me and old.status = 'pending' and new.status = 'pending') then
        raise exception 'not authorized to edit talk content';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.record_audit_log() from public, anon, authenticated;
revoke all on function private.check_member_theme_kind() from public, anon, authenticated;
revoke all on function private.check_talk_update() from public, anon, authenticated;

-- トリガーの設定
drop trigger if exists audit_masters_trigger on public.masters;
create trigger audit_masters_trigger
  after insert or update or delete on public.masters
  for each row execute function private.record_audit_log();

drop trigger if exists audit_settings_trigger on public.settings;
create trigger audit_settings_trigger
  after insert or update or delete on public.settings
  for each row execute function private.record_audit_log();

drop trigger if exists audit_permissions_trigger on public.permissions;
create trigger audit_permissions_trigger
  after insert or update or delete on public.permissions
  for each row execute function private.record_audit_log();

drop trigger if exists check_member_theme_kind_trigger on public.member_themes;
create trigger check_member_theme_kind_trigger
  before insert or update on public.member_themes
  for each row execute function private.check_member_theme_kind();

drop trigger if exists check_talk_update_trigger on public.talks;
create trigger check_talk_update_trigger
  before update on public.talks
  for each row execute function private.check_talk_update();

-- 5. すべての新しい表で RLS を明示してオンにする
alter table public.masters enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.roleplay_themes enable row level security;
alter table public.member_themes enable row level security;
alter table public.roleplays enable row level security;
alter table public.talks enable row level security;
alter table public.seminars enable row level security;
alter table public.seminar_members enable row level security;

-- 6. 表ごとの許可（GRANT）の明示（既定の許可を外してから必要な操作だけ grant）
revoke all on table public.masters from public, anon, authenticated;
revoke all on table public.settings from public, anon, authenticated;
revoke all on table public.audit_logs from public, anon, authenticated;
revoke all on table public.roleplay_themes from public, anon, authenticated;
revoke all on table public.member_themes from public, anon, authenticated;
revoke all on table public.roleplays from public, anon, authenticated;
revoke all on table public.talks from public, anon, authenticated;
revoke all on table public.seminars from public, anon, authenticated;
revoke all on table public.seminar_members from public, anon, authenticated;

grant select, insert, update on table public.masters to authenticated;
grant select, insert, update on table public.settings to authenticated;
grant select on table public.audit_logs to authenticated;
grant select, insert, update on table public.roleplay_themes to authenticated;
grant select, insert, update on table public.member_themes to authenticated;
grant select, insert, update on table public.roleplays to authenticated;
grant select, insert, update on table public.talks to authenticated;
grant select, insert, update on table public.seminars to authenticated;
grant select, insert, update on table public.seminar_members to authenticated;

grant select, insert, update, delete on table
  public.masters,
  public.settings,
  public.audit_logs,
  public.roleplay_themes,
  public.member_themes,
  public.roleplays,
  public.talks,
  public.seminars,
  public.seminar_members
to service_role;

-- 7. 行ごとの読み書きの決まり（RLS ポリシー）

-- masters：読める＝名簿にいる人、書ける＝管理者の権限がある人だけ
create policy masters_select_policy
  on public.masters
  for select
  to authenticated
  using (private.current_member_id() is not null);

create policy masters_insert_policy
  on public.masters
  for insert
  to authenticated
  with check (private.is_admin());

create policy masters_update_policy
  on public.masters
  for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- settings：読める＝名簿にいる人、書ける＝管理者の権限がある人だけ
create policy settings_select_policy
  on public.settings
  for select
  to authenticated
  using (private.current_member_id() is not null);

create policy settings_insert_policy
  on public.settings
  for insert
  to authenticated
  with check (private.is_admin());

create policy settings_update_policy
  on public.settings
  for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- roleplay_themes：読める＝名簿にいる人、書ける＝管理者の権限がある人だけ
create policy roleplay_themes_select_policy
  on public.roleplay_themes
  for select
  to authenticated
  using (private.current_member_id() is not null);

create policy roleplay_themes_insert_policy
  on public.roleplay_themes
  for insert
  to authenticated
  with check (private.is_admin());

create policy roleplay_themes_update_policy
  on public.roleplay_themes
  for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- audit_logs：読める＝代表と管理者の権限がある人、書ける＝ログインした人はだれも書けない
create policy audit_logs_select_policy
  on public.audit_logs
  for select
  to authenticated
  using (private.is_ceo() or private.is_admin());

-- roleplays
-- 読める：書いた人（runner_member_id が自分）は書きかけも。
-- 送った記録（submitted_at あり）は、課員本人（member_id が自分）と、private.can_supervise_member(member_id) が真の人
create policy roleplays_select_policy
  on public.roleplays
  for select
  to authenticated
  using (
    private.current_member_id() is not null
    and (
      runner_member_id = private.current_member_id()
      or (
        submitted_at is not null
        and (
          member_id = private.current_member_id()
          or private.can_supervise_member(member_id)
        )
      )
    )
  );

-- 書ける（追加）：名簿にいる人が、自分を実行者にして、課員が「上席として見ている人」か「今同じチームの人」の分だけ
create policy roleplays_insert_policy
  on public.roleplays
  for insert
  to authenticated
  with check (
    private.current_member_id() is not null
    and runner_member_id = private.current_member_id()
    and (
      private.can_supervise_member(member_id)
      or (
        private.current_team_id() is not null
        and private.current_team_id() = private.member_team_now(member_id)
      )
    )
  );

-- 書ける（変更）：書いた人だけ。変更のあとも追加と同じ条件を満たすこと
create policy roleplays_update_policy
  on public.roleplays
  for update
  to authenticated
  using (
    private.current_member_id() is not null
    and runner_member_id = private.current_member_id()
  )
  with check (
    private.current_member_id() is not null
    and runner_member_id = private.current_member_id()
    and (
      private.can_supervise_member(member_id)
      or (
        private.current_team_id() is not null
        and private.current_team_id() = private.member_team_now(member_id)
      )
    )
  );

-- member_themes
-- 読める：課員本人と、private.can_supervise_member(member_id) が真の人
create policy member_themes_select_policy
  on public.member_themes
  for select
  to authenticated
  using (
    private.current_member_id() is not null
    and (
      member_id = private.current_member_id()
      or private.can_supervise_member(member_id)
    )
  );

-- 書ける（追加・変更）：private.can_supervise_member(member_id) が真の人（代表・リーダー・MGR）だけ
create policy member_themes_insert_policy
  on public.member_themes
  for insert
  to authenticated
  with check (
    private.current_member_id() is not null
    and created_by = private.current_member_id()
    and private.can_supervise_member(member_id)
  );

create policy member_themes_update_policy
  on public.member_themes
  for update
  to authenticated
  using (
    private.current_member_id() is not null
    and private.can_supervise_member(member_id)
  )
  with check (
    private.current_member_id() is not null
    and private.can_supervise_member(member_id)
  );

-- talks
-- 読める：名簿にいる人は trial と standard。pending は作った人・is_supervisor_of_team(team_id) が真の人・トーク責任者・代表
create policy talks_select_policy
  on public.talks
  for select
  to authenticated
  using (
    private.current_member_id() is not null
    and (
      status in ('trial', 'standard')
      or (
        status = 'pending'
        and (
          created_by = private.current_member_id()
          or private.is_supervisor_of_team(team_id)
          or private.has_active_permission('talk_owner')
          or private.is_ceo()
        )
      )
    )
  );

-- 書ける（追加）：名簿にいる人が status = 'pending'・created_by が自分の行だけ。
-- team_id は current_team_id() と同じ、または is_supervisor_of_team(team_id) が真、または代表
create policy talks_insert_policy
  on public.talks
  for insert
  to authenticated
  with check (
    private.current_member_id() is not null
    and status = 'pending'
    and created_by = private.current_member_id()
    and (
      (
        team_id is not null
        and (
          team_id = private.current_team_id()
          or private.is_supervisor_of_team(team_id)
        )
      )
      or private.is_ceo()
    )
  );

-- 書ける（変更）：状態遷移および中身の変更権限の詳細は check_talk_update トリガーでも検証
create policy talks_update_policy
  on public.talks
  for update
  to authenticated
  using (
    private.current_member_id() is not null
    and (
      (created_by = private.current_member_id() and status = 'pending')
      or private.is_supervisor_of_team(team_id)
      or private.has_active_permission('talk_owner')
      or private.is_ceo()
    )
  )
  with check (
    private.current_member_id() is not null
    and (
      (created_by = private.current_member_id() and status = 'pending')
      or private.is_supervisor_of_team(team_id)
      or private.has_active_permission('talk_owner')
      or private.is_ceo()
    )
  );

-- seminars
-- 読める：参加した本人（private.is_seminar_participant(id)）と、リーダー・MGR・代表
create policy seminars_select_policy
  on public.seminars
  for select
  to authenticated
  using (
    private.current_member_id() is not null
    and (
      private.is_seminar_participant(id)
      or private.current_member_role() in ('leader', 'mgr', 'ceo')
    )
  );

-- 書ける（追加）：リーダー・MGR（created_by が自分）
create policy seminars_insert_policy
  on public.seminars
  for insert
  to authenticated
  with check (
    private.current_member_id() is not null
    and created_by = private.current_member_id()
    and private.current_member_role() in ('leader', 'mgr')
  );

-- 書ける（変更）：作った人だけ（private.is_seminar_creator(id)）
create policy seminars_update_policy
  on public.seminars
  for update
  to authenticated
  using (
    private.current_member_id() is not null
    and private.is_seminar_creator(id)
  )
  with check (
    private.current_member_id() is not null
    and created_by = private.current_member_id()
  );

-- seminar_members
-- 読める：自分の行（removed_at が空）と、リーダー・MGR・代表
create policy seminar_members_select_policy
  on public.seminar_members
  for select
  to authenticated
  using (
    private.current_member_id() is not null
    and (
      (member_id = private.current_member_id() and removed_at is null)
      or private.current_member_role() in ('leader', 'mgr', 'ceo')
    )
  );

-- 書ける（追加・変更）：その研修を作った人だけ（private.is_seminar_creator(seminar_id)）
create policy seminar_members_insert_policy
  on public.seminar_members
  for insert
  to authenticated
  with check (
    private.current_member_id() is not null
    and private.is_seminar_creator(seminar_id)
  );

create policy seminar_members_update_policy
  on public.seminar_members
  for update
  to authenticated
  using (
    private.current_member_id() is not null
    and private.is_seminar_creator(seminar_id)
  )
  with check (
    private.current_member_id() is not null
    and private.is_seminar_creator(seminar_id)
  );
