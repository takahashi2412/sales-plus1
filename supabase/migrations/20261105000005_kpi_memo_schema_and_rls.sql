-- KPI・部下メモ①：KPIと部下メモの表・権限・トリガー・監査ログ（plan_kpi-memo-common_v1）

-- 1. masters の kind の決まり（check）に memo_theme と memo_kind を足す
alter table public.masters drop constraint if exists masters_kind_check;
alter table public.masters add constraint masters_kind_check
  check (kind in ('scene', 'industry', 'list_type', 'memo_theme', 'memo_kind'));

-- 2. 表の作成

-- CSVのチーム名の対応
create table public.cti_team_map (
  id uuid primary key default gen_random_uuid(),
  csv_team_name text not null,
  team_id uuid not null references public.teams(id),
  valid_from date not null,
  valid_to date,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);

create index cti_team_map_csv_team_name_idx on public.cti_team_map (csv_team_name);
create index cti_team_map_team_id_idx on public.cti_team_map (team_id);

-- 名前の対応（member_id が空なら「取り込まない名前」）
create table public.cti_member_map (
  id uuid primary key default gen_random_uuid(),
  cti_name text not null,
  member_id uuid references public.members(id),
  valid_from date not null,
  valid_to date,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);

create index cti_member_map_cti_name_idx on public.cti_member_map (cti_name);
create index cti_member_map_member_id_idx on public.cti_member_map (member_id);

-- 取り込みの記録
create table public.import_logs (
  id uuid primary key default gen_random_uuid(),
  target_date date not null,
  csv_team_name text not null,
  team_id uuid references public.teams(id),
  file_name text not null,
  row_count integer not null default 0,
  error_count integer not null default 0,
  totals_match boolean not null default true,
  notes jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'replaced')),
  imported_by uuid not null references public.members(id),
  imported_at timestamptz not null default now(),
  approved_by uuid references public.members(id),
  approved_at timestamptz,
  approval_kind text check (approval_kind in ('manual', 'auto')),
  replaced_at timestamptz,
  alerts_created_at timestamptz,
  alert_count integer
);

-- 同じ target_date と csv_team_name で、status が replaced でない行は1つまで
create unique index import_logs_active_target_team_idx
  on public.import_logs (target_date, csv_team_name)
  where status <> 'replaced';

create index import_logs_target_date_idx on public.import_logs (target_date);
create index import_logs_imported_by_idx on public.import_logs (imported_by);

-- 日々のKPI
create table public.kpi_entries (
  id uuid primary key default gen_random_uuid(),
  import_log_id uuid not null references public.import_logs(id),
  member_id uuid not null references public.members(id),
  date date not null,
  time_slot text not null check (
    time_slot in (
      '0_8',
      '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
      '21_23'
    )
  ),
  total integer not null default 0 check (total >= 0),
  connected integer not null default 0 check (connected >= 0),
  recall integer not null default 0 check (recall >= 0),
  owner integer not null default 0 check (owner >= 0),
  prospect integer not null default 0 check (prospect >= 0),
  apo integer not null default 0 check (apo >= 0),
  unique (import_log_id, member_id, time_slot)
);

create index kpi_entries_member_id_date_idx on public.kpi_entries (member_id, date);
create index kpi_entries_import_log_id_idx on public.kpi_entries (import_log_id);

-- 月の目標
create table public.kpi_targets (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  month date not null check (extract(day from month) = 1),
  goes_to_sales boolean not null default false,
  target_profit numeric,
  unit_price numeric,
  completion_rate numeric,
  rate_order numeric,
  apo_target integer,
  working_days integer not null check (working_days between 1 and 31),
  call_hours numeric not null,
  term numeric not null,
  rate_connected numeric not null,
  rate_recall numeric not null,
  rate_owner numeric not null,
  rate_prospect numeric not null,
  rate_apo_owner numeric not null,
  rate_adoption numeric not null,
  history jsonb not null default '[]'::jsonb,
  revised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, month),
  check (
    (
      goes_to_sales = true
      and target_profit is not null
      and unit_price is not null
      and completion_rate is not null
      and rate_order is not null
      and apo_target is null
    )
    or (
      goes_to_sales = false
      and target_profit is null
      and unit_price is null
      and completion_rate is null
      and rate_order is null
      and apo_target is not null
    )
  )
);

create index kpi_targets_member_id_month_idx on public.kpi_targets (member_id, month);

-- アラート
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  import_log_id uuid not null references public.import_logs(id),
  member_id uuid not null references public.members(id),
  date date not null,
  compare text not null check (compare in ('daily', 'pace')),
  item text not null check (
    item in ('total', 'connected', 'owner', 'apo_owner', 'apo', 'target_missing')
  ),
  target numeric,
  actual numeric,
  needs_response boolean not null default false,
  response text check (response in ('done', 'unneeded')),
  response_reason text,
  responded_by uuid references public.members(id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (import_log_id, member_id, compare, item),
  check (
    item <> 'target_missing'
    or (compare = 'daily' and target is null and actual is null)
  ),
  check (
    response is null
    or (response_reason is not null and length(btrim(response_reason)) > 0)
  )
);

create index alerts_member_id_date_idx on public.alerts (member_id, date);
create index alerts_import_log_id_idx on public.alerts (import_log_id);

-- 部下メモ
create table public.subordinate_memos (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  created_by uuid not null references public.members(id),
  theme_id uuid references public.masters(id),
  kind_id uuid references public.masters(id),
  noticed text not null default '',
  guidance text not null default '',
  next_check_on date,
  action_check text check (action_check in ('o', 'd', 'x')),
  result_check text check (result_check in ('o', 'd', 'x')),
  checked_on date,
  training_id uuid,
  is_legacy boolean not null default false,
  legacy_source jsonb,
  submitted_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    submitted_at is null
    or (
      theme_id is not null
      and kind_id is not null
      and (
        length(btrim(coalesce(noticed, ''))) > 0
        or length(btrim(coalesce(guidance, ''))) > 0
      )
    )
  )
);

create index subordinate_memos_created_by_idx on public.subordinate_memos (created_by);
create index subordinate_memos_date_idx on public.subordinate_memos (date);

-- 部下メモの対象者
create table public.subordinate_memo_targets (
  memo_id uuid not null references public.subordinate_memos(id),
  member_id uuid not null references public.members(id),
  removed_at timestamptz,
  primary key (memo_id, member_id)
);

create index subordinate_memo_targets_member_id_idx on public.subordinate_memo_targets (member_id);

-- 3. 判定の関数（private スキーマ、security definer、set search_path = ''）

-- その取り込みの記録の status が approved
create or replace function private.is_approved_import(log uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.import_logs il
    where il.id = log
      and il.status = 'approved'
  );
$$;

-- private.is_admin() が真で、その取り込みの記録の status が pending、imported_by がログインしている人
create or replace function private.is_my_pending_import(log uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and exists (
      select 1
      from public.import_logs il
      where il.id = log
        and il.status = 'pending'
        and il.imported_by = private.current_member_id()
    );
$$;

-- private.is_admin() が真で、その取り込みの記録の status が approved、imported_by がログインしている人
create or replace function private.is_my_approved_import(log uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    and exists (
      select 1
      from public.import_logs il
      where il.id = log
        and il.status = 'approved'
        and il.imported_by = private.current_member_id()
    );
$$;

-- その部下メモの created_by がログインしている人
create or replace function private.is_memo_writer(memo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subordinate_memos sm
    where sm.id = memo
      and sm.created_by = private.current_member_id()
  );
$$;

-- 書いた人なら真（書きかけ・見えなくしたものも）。
-- ほかの人は、送ってあり（submitted_at あり）・見えなくしていない（hidden_at が空）メモのうち、
-- ①対象者（removed_at が空の行）に自分が入っておらず、
-- ②対象者（removed_at が空の行）のだれかについて private.can_supervise_member(対象者) が真のとき
create or replace function private.can_read_memo(memo uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_created_by uuid;
  v_submitted_at timestamptz;
  v_hidden_at timestamptz;
begin
  v_me := private.current_member_id();
  if v_me is null or memo is null then
    return false;
  end if;

  select sm.created_by, sm.submitted_at, sm.hidden_at
    into v_created_by, v_submitted_at, v_hidden_at
  from public.subordinate_memos sm
  where sm.id = memo;

  if not found then
    return false;
  end if;

  if v_created_by = v_me then
    return true;
  end if;

  if v_submitted_at is null or v_hidden_at is not null then
    return false;
  end if;

  if exists (
    select 1
    from public.subordinate_memo_targets smt
    where smt.memo_id = memo
      and smt.removed_at is null
      and smt.member_id = v_me
  ) then
    return false;
  end if;

  return exists (
    select 1
    from public.subordinate_memo_targets smt
    where smt.memo_id = memo
      and smt.removed_at is null
      and private.can_supervise_member(smt.member_id)
  );
end;
$$;

revoke all on function private.is_approved_import(uuid) from public, anon;
revoke all on function private.is_my_pending_import(uuid) from public, anon;
revoke all on function private.is_my_approved_import(uuid) from public, anon;
revoke all on function private.is_memo_writer(uuid) from public, anon;
revoke all on function private.can_read_memo(uuid) from public, anon;

grant execute on function private.is_approved_import(uuid) to authenticated, service_role;
grant execute on function private.is_my_pending_import(uuid) to authenticated, service_role;
grant execute on function private.is_my_approved_import(uuid) to authenticated, service_role;
grant execute on function private.is_memo_writer(uuid) to authenticated, service_role;
grant execute on function private.can_read_memo(uuid) to authenticated, service_role;

-- 4. トリガーの関数（private スキーマ、実行許可を public, anon, authenticated から外す）

-- cti_team_map・cti_member_map の変更で created_by などを変えさせない
create or replace function private.check_cti_map_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'cannot change immutable columns of cti map';
  end if;

  return new;
end;
$$;

-- import_logs の変更の確かめ
create or replace function private.check_import_log_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  v_me := private.current_member_id();
  if v_me is null or not private.is_admin() then
    raise exception 'not authorized to update import_logs';
  end if;

  -- target_date・csv_team_name・file_name・imported_by・imported_at はいつも変えられない
  if new.id is distinct from old.id
     or new.target_date is distinct from old.target_date
     or new.csv_team_name is distinct from old.csv_team_name
     or new.file_name is distinct from old.file_name
     or new.imported_by is distinct from old.imported_by
     or new.imported_at is distinct from old.imported_at then
    raise exception 'cannot change immutable columns of import_logs';
  end if;

  -- approved_by・approved_at・approval_kind・replaced_at はトリガーが入れる値のほかにはできない
  if new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at
     or new.approval_kind is distinct from old.approval_kind
     or new.replaced_at is distinct from old.replaced_at then
    raise exception 'cannot directly set approval or replacement metadata';
  end if;

  -- team_id・row_count・error_count・totals_match・notes は pending の間だけ、取り込んだ人が変えられる
  if new.team_id is distinct from old.team_id
     or new.row_count is distinct from old.row_count
     or new.error_count is distinct from old.error_count
     or new.totals_match is distinct from old.totals_match
     or new.notes is distinct from old.notes then
    if old.status <> 'pending' or new.status <> 'pending' or old.imported_by <> v_me then
      raise exception 'only importer can update summary fields while pending';
    end if;
  end if;

  -- 状態の変化
  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status = 'approved' then
      if old.imported_by <> v_me then
        raise exception 'only the importer can approve import_logs';
      end if;

      -- その記録の日々のKPIに出てくる人が、同じ target_date のほかの承認済みの記録にも日々のKPIを持っていたら止める
      if exists (
        select 1
        from public.kpi_entries ke_this
        join public.kpi_entries ke_other
          on ke_other.member_id = ke_this.member_id
        join public.import_logs il_other
          on il_other.id = ke_other.import_log_id
        where ke_this.import_log_id = old.id
          and il_other.id <> old.id
          and il_other.target_date = old.target_date
          and il_other.status = 'approved'
      ) then
        raise exception 'duplicate member in approved import_logs for the same target_date';
      end if;

      new.approved_by := v_me;
      new.approved_at := now();
      new.approval_kind := 'manual';
    elsif old.status in ('pending', 'approved') and new.status = 'replaced' then
      new.replaced_at := now();
    else
      raise exception 'invalid import_logs status transition from % to %', old.status, new.status;
    end if;
  end if;

  -- alerts_created_at・alert_count：approved の記録に、取り込んだ人が、空のときに1回だけ入れられる
  if new.alerts_created_at is distinct from old.alerts_created_at
     or new.alert_count is distinct from old.alert_count then
    if old.imported_by <> v_me
       or new.status <> 'approved'
       or old.alerts_created_at is not null
       or old.alert_count is not null
       or new.alerts_created_at is null then
      raise exception 'alerts_created_at and alert_count can only be set once by importer on approved log';
    end if;
  end if;

  return new;
end;
$$;

-- kpi_entries の追加：date をその取り込みの記録の target_date にする
create or replace function private.prepare_kpi_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_date date;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  select il.target_date into v_target_date
  from public.import_logs il
  where il.id = new.import_log_id;

  if v_target_date is null then
    raise exception 'import_log not found for kpi_entries';
  end if;

  new.date := v_target_date;
  return new;
end;
$$;

-- kpi_targets の追加と変更
create or replace function private.handle_kpi_target_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goes_to_sales boolean;
  v_values_changed boolean;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    select m.goes_to_sales into v_goes_to_sales
    from public.members m
    where m.id = new.member_id;

    if v_goes_to_sales is null then
      raise exception 'member not found for kpi_targets';
    end if;

    new.goes_to_sales := v_goes_to_sales;
    new.history := '[]'::jsonb;
    new.revised_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE：member_id・month・goes_to_sales・history・revised_at・created_at は前の値に戻す
  new.id := old.id;
  new.member_id := old.member_id;
  new.month := old.month;
  new.goes_to_sales := old.goes_to_sales;
  new.history := old.history;
  new.revised_at := old.revised_at;
  new.created_at := old.created_at;
  new.updated_at := now();

  v_values_changed := (
    new.target_profit is distinct from old.target_profit
    or new.unit_price is distinct from old.unit_price
    or new.completion_rate is distinct from old.completion_rate
    or new.rate_order is distinct from old.rate_order
    or new.apo_target is distinct from old.apo_target
    or new.working_days is distinct from old.working_days
    or new.call_hours is distinct from old.call_hours
    or new.term is distinct from old.term
    or new.rate_connected is distinct from old.rate_connected
    or new.rate_recall is distinct from old.rate_recall
    or new.rate_owner is distinct from old.rate_owner
    or new.rate_prospect is distinct from old.rate_prospect
    or new.rate_apo_owner is distinct from old.rate_apo_owner
    or new.rate_adoption is distinct from old.rate_adoption
  );

  if v_values_changed and private.today_jst() >= old.month then
    new.history := coalesce(old.history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'changed_at', to_jsonb(now()),
        'values', jsonb_build_object(
          'target_profit', old.target_profit,
          'unit_price', old.unit_price,
          'completion_rate', old.completion_rate,
          'rate_order', old.rate_order,
          'apo_target', old.apo_target,
          'working_days', old.working_days,
          'call_hours', old.call_hours,
          'term', old.term,
          'rate_connected', old.rate_connected,
          'rate_recall', old.rate_recall,
          'rate_owner', old.rate_owner,
          'rate_prospect', old.rate_prospect,
          'rate_apo_owner', old.rate_apo_owner,
          'rate_adoption', old.rate_adoption
        )
      )
    );
    new.revised_at := now();
  end if;

  return new;
end;
$$;

-- alerts の追加と対応の記録
create or replace function private.handle_alert_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_date date;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    if new.response is not null
       or new.response_reason is not null
       or new.responded_by is not null
       or new.responded_at is not null then
      raise exception 'cannot insert alert with response fields set';
    end if;

    select il.target_date into v_target_date
    from public.import_logs il
    where il.id = new.import_log_id;

    if v_target_date is null then
      raise exception 'import_log not found for alerts';
    end if;

    new.date := v_target_date;
    return new;
  end if;

  -- UPDATE：対応の記録を入れる・直すとき
  if new.response is not null and length(btrim(coalesce(new.response_reason, ''))) = 0 then
    raise exception 'response_reason is required when response is set';
  end if;

  if new.response is null then
    new.response_reason := null;
    new.responded_by := null;
    new.responded_at := null;
  else
    new.responded_by := private.current_member_id();
    new.responded_at := now();
  end if;

  return new;
end;
$$;

-- subordinate_memos の一覧の種類と送るときの確かめ
create or replace function private.handle_subordinate_memo_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if new.theme_id is not null then
    if not exists (
      select 1
      from public.masters m
      where m.id = new.theme_id
        and m.kind = 'memo_theme'
    ) then
      raise exception 'theme_id must reference masters with kind = memo_theme';
    end if;
  end if;

  if new.kind_id is not null then
    if not exists (
      select 1
      from public.masters m
      where m.id = new.kind_id
        and m.kind = 'memo_kind'
    ) then
      raise exception 'kind_id must reference masters with kind = memo_kind';
    end if;
  end if;

  if TG_OP = 'INSERT' then
    if new.submitted_at is not null then
      raise exception 'cannot insert subordinate_memos with submitted_at set';
    end if;
    if new.is_legacy is distinct from false or new.legacy_source is not null then
      raise exception 'cannot set legacy fields on subordinate_memos';
    end if;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.is_legacy is distinct from old.is_legacy
     or new.legacy_source is distinct from old.legacy_source
     or new.created_at is distinct from old.created_at then
    raise exception 'cannot change immutable columns of subordinate_memos';
  end if;

  if new.submitted_at is not null then
    if not exists (
      select 1
      from public.subordinate_memo_targets smt
      where smt.memo_id = new.id
        and smt.removed_at is null
    ) then
      raise exception 'subordinate_memos must have at least one active target when submitted';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- subordinate_memo_targets の対象者の確かめ
create or replace function private.check_subordinate_memo_target_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_writer uuid;
  v_new_team uuid;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  select sm.created_by into v_writer
  from public.subordinate_memos sm
  where sm.id = new.memo_id;

  if v_writer is null then
    raise exception 'subordinate_memo not found';
  end if;

  -- 対象者を足す・戻す（removed_at を空にする）とき
  if new.removed_at is null then
    if new.member_id = v_writer then
      raise exception 'memo writer cannot be a target';
    end if;

    v_new_team := private.member_team_now(new.member_id);

    if exists (
      select 1
      from public.subordinate_memo_targets smt
      where smt.memo_id = new.memo_id
        and smt.member_id <> new.member_id
        and smt.removed_at is null
    ) then
      if v_new_team is null then
        raise exception 'teamless member cannot be combined with other targets';
      end if;

      if exists (
        select 1
        from public.subordinate_memo_targets smt
        where smt.memo_id = new.memo_id
          and smt.member_id <> new.member_id
          and smt.removed_at is null
          and private.member_team_now(smt.member_id) is distinct from v_new_team
      ) then
        raise exception 'all active targets of a memo must belong to the same current team';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.check_cti_map_update() from public, anon, authenticated;
revoke all on function private.check_import_log_update() from public, anon, authenticated;
revoke all on function private.prepare_kpi_entry_insert() from public, anon, authenticated;
revoke all on function private.handle_kpi_target_write() from public, anon, authenticated;
revoke all on function private.handle_alert_write() from public, anon, authenticated;
revoke all on function private.handle_subordinate_memo_write() from public, anon, authenticated;
revoke all on function private.check_subordinate_memo_target_write() from public, anon, authenticated;

-- トリガーの設定
drop trigger if exists check_cti_team_map_update_trigger on public.cti_team_map;
create trigger check_cti_team_map_update_trigger
  before update on public.cti_team_map
  for each row execute function private.check_cti_map_update();

drop trigger if exists check_cti_member_map_update_trigger on public.cti_member_map;
create trigger check_cti_member_map_update_trigger
  before update on public.cti_member_map
  for each row execute function private.check_cti_map_update();

drop trigger if exists audit_cti_team_map_trigger on public.cti_team_map;
create trigger audit_cti_team_map_trigger
  after insert or update or delete on public.cti_team_map
  for each row execute function private.record_audit_log();

drop trigger if exists audit_cti_member_map_trigger on public.cti_member_map;
create trigger audit_cti_member_map_trigger
  after insert or update or delete on public.cti_member_map
  for each row execute function private.record_audit_log();

drop trigger if exists check_import_log_update_trigger on public.import_logs;
create trigger check_import_log_update_trigger
  before update on public.import_logs
  for each row execute function private.check_import_log_update();

drop trigger if exists prepare_kpi_entry_insert_trigger on public.kpi_entries;
create trigger prepare_kpi_entry_insert_trigger
  before insert on public.kpi_entries
  for each row execute function private.prepare_kpi_entry_insert();

drop trigger if exists handle_kpi_target_write_trigger on public.kpi_targets;
create trigger handle_kpi_target_write_trigger
  before insert or update on public.kpi_targets
  for each row execute function private.handle_kpi_target_write();

drop trigger if exists handle_alert_write_trigger on public.alerts;
create trigger handle_alert_write_trigger
  before insert or update on public.alerts
  for each row execute function private.handle_alert_write();

drop trigger if exists handle_subordinate_memo_write_trigger on public.subordinate_memos;
create trigger handle_subordinate_memo_write_trigger
  before insert or update on public.subordinate_memos
  for each row execute function private.handle_subordinate_memo_write();

drop trigger if exists check_subordinate_memo_target_write_trigger on public.subordinate_memo_targets;
create trigger check_subordinate_memo_target_write_trigger
  before insert or update on public.subordinate_memo_targets
  for each row execute function private.check_subordinate_memo_target_write();

-- 5. すべての新しい表で RLS を明示してオンにする
alter table public.cti_team_map enable row level security;
alter table public.cti_member_map enable row level security;
alter table public.import_logs enable row level security;
alter table public.kpi_entries enable row level security;
alter table public.kpi_targets enable row level security;
alter table public.alerts enable row level security;
alter table public.subordinate_memos enable row level security;
alter table public.subordinate_memo_targets enable row level security;

-- 6. 表ごとの許可（GRANT）の明示（既定の許可を外してから必要な操作だけ grant）
revoke all on table public.cti_team_map from public, anon, authenticated;
revoke all on table public.cti_member_map from public, anon, authenticated;
revoke all on table public.import_logs from public, anon, authenticated;
revoke all on table public.kpi_entries from public, anon, authenticated;
revoke all on table public.kpi_targets from public, anon, authenticated;
revoke all on table public.alerts from public, anon, authenticated;
revoke all on table public.subordinate_memos from public, anon, authenticated;
revoke all on table public.subordinate_memo_targets from public, anon, authenticated;

grant select, insert, update on table public.cti_team_map to authenticated;
grant select, insert, update on table public.cti_member_map to authenticated;
grant select, insert, update on table public.import_logs to authenticated;
grant select, insert on table public.kpi_entries to authenticated;
grant select, insert, update on table public.kpi_targets to authenticated;
grant select, insert on table public.alerts to authenticated;
grant update (response, response_reason, responded_by, responded_at) on table public.alerts to authenticated;
grant select, insert, update on table public.subordinate_memos to authenticated;
grant select, insert on table public.subordinate_memo_targets to authenticated;
grant update (removed_at) on table public.subordinate_memo_targets to authenticated;

grant select, insert, update, delete on table
  public.cti_team_map,
  public.cti_member_map,
  public.import_logs,
  public.kpi_entries,
  public.kpi_targets,
  public.alerts,
  public.subordinate_memos,
  public.subordinate_memo_targets
to service_role;

-- 7. 行ごとの読み書きの決まり（RLS ポリシー）

-- cti_team_map
create policy cti_team_map_select_policy
  on public.cti_team_map
  for select
  to authenticated
  using ((select private.is_admin()));

create policy cti_team_map_insert_policy
  on public.cti_team_map
  for insert
  to authenticated
  with check (
    (select private.is_admin())
    and created_by = (select private.current_member_id())
  );

create policy cti_team_map_update_policy
  on public.cti_team_map
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- cti_member_map
create policy cti_member_map_select_policy
  on public.cti_member_map
  for select
  to authenticated
  using ((select private.is_admin()));

create policy cti_member_map_insert_policy
  on public.cti_member_map
  for insert
  to authenticated
  with check (
    (select private.is_admin())
    and created_by = (select private.current_member_id())
  );

create policy cti_member_map_update_policy
  on public.cti_member_map
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- import_logs
create policy import_logs_select_policy
  on public.import_logs
  for select
  to authenticated
  using ((select private.is_admin()));

create policy import_logs_insert_policy
  on public.import_logs
  for insert
  to authenticated
  with check (
    (select private.is_admin())
    and imported_by = (select private.current_member_id())
    and status = 'pending'
    and approved_by is null
    and approved_at is null
    and approval_kind is null
    and replaced_at is null
    and alerts_created_at is null
    and alert_count is null
  );

create policy import_logs_update_policy
  on public.import_logs
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- kpi_entries
create policy kpi_entries_select_policy
  on public.kpi_entries
  for select
  to authenticated
  using (
    (select private.current_member_id()) is not null
    and (
      (
        private.is_approved_import(import_log_id)
        and (
          member_id = (select private.current_member_id())
          or private.can_supervise_member(member_id)
          or (select private.is_admin())
        )
      )
      or private.is_my_pending_import(import_log_id)
    )
  );

create policy kpi_entries_insert_policy
  on public.kpi_entries
  for insert
  to authenticated
  with check (
    (select private.current_member_id()) is not null
    and private.is_my_pending_import(import_log_id)
  );

-- kpi_targets
create policy kpi_targets_select_policy
  on public.kpi_targets
  for select
  to authenticated
  using (
    (select private.current_member_id()) is not null
    and (
      member_id = (select private.current_member_id())
      or private.can_supervise_member(member_id)
      or (select private.is_admin())
    )
  );

create policy kpi_targets_insert_policy
  on public.kpi_targets
  for insert
  to authenticated
  with check (
    (select private.current_member_id()) is not null
    and member_id = (select private.current_member_id())
  );

create policy kpi_targets_update_policy
  on public.kpi_targets
  for update
  to authenticated
  using (
    (select private.current_member_id()) is not null
    and member_id = (select private.current_member_id())
  )
  with check (
    (select private.current_member_id()) is not null
    and member_id = (select private.current_member_id())
  );

-- alerts（管理者の権限では広げない）
create policy alerts_select_policy
  on public.alerts
  for select
  to authenticated
  using (
    (select private.current_member_id()) is not null
    and private.is_approved_import(import_log_id)
    and private.can_supervise_member(member_id)
  );

create policy alerts_insert_policy
  on public.alerts
  for insert
  to authenticated
  with check (
    (select private.current_member_id()) is not null
    and private.is_my_approved_import(import_log_id)
    and response is null
    and response_reason is null
    and responded_by is null
    and responded_at is null
  );

create policy alerts_update_policy
  on public.alerts
  for update
  to authenticated
  using (
    (select private.current_member_id()) is not null
    and private.is_approved_import(import_log_id)
    and (select private.current_member_role()) = 'leader'
    and member_id <> (select private.current_member_id())
    and (select private.current_team_id()) is not null
    and (select private.current_team_id()) = private.member_team_now(member_id)
  )
  with check (
    (select private.current_member_id()) is not null
    and private.is_approved_import(import_log_id)
    and (select private.current_member_role()) = 'leader'
    and member_id <> (select private.current_member_id())
    and (select private.current_team_id()) is not null
    and (select private.current_team_id()) = private.member_team_now(member_id)
  );

-- subordinate_memos（管理者の権限では広げない）
create policy subordinate_memos_select_policy
  on public.subordinate_memos
  for select
  to authenticated
  using (
    (select private.current_member_id()) is not null
    and (
      created_by = (select private.current_member_id())
      or private.can_read_memo(id)
    )
  );

create policy subordinate_memos_insert_policy
  on public.subordinate_memos
  for insert
  to authenticated
  with check (
    (select private.current_member_id()) is not null
    and (select private.current_member_role()) in ('leader', 'mgr', 'ceo')
    and created_by = (select private.current_member_id())
    and submitted_at is null
    and is_legacy = false
    and legacy_source is null
  );

create policy subordinate_memos_update_policy
  on public.subordinate_memos
  for update
  to authenticated
  using (
    (select private.current_member_id()) is not null
    and private.is_memo_writer(id)
  )
  with check (
    (select private.current_member_id()) is not null
    and created_by = (select private.current_member_id())
    and is_legacy = false
    and legacy_source is null
  );

-- subordinate_memo_targets（管理者の権限では広げない）
create policy subordinate_memo_targets_select_policy
  on public.subordinate_memo_targets
  for select
  to authenticated
  using (
    (select private.current_member_id()) is not null
    and private.can_read_memo(memo_id)
  );

create policy subordinate_memo_targets_insert_policy
  on public.subordinate_memo_targets
  for insert
  to authenticated
  with check (
    (select private.current_member_id()) is not null
    and private.is_memo_writer(memo_id)
    and member_id <> (select private.current_member_id())
    and private.can_supervise_member(member_id)
  );

create policy subordinate_memo_targets_update_policy
  on public.subordinate_memo_targets
  for update
  to authenticated
  using (
    (select private.current_member_id()) is not null
    and private.is_memo_writer(memo_id)
  )
  with check (
    (select private.current_member_id()) is not null
    and private.is_memo_writer(memo_id)
    and (
      removed_at is not null
      or (
        member_id <> (select private.current_member_id())
        and private.can_supervise_member(member_id)
      )
    )
  );
