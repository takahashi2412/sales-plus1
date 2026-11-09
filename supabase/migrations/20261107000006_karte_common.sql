-- カルテ第1版①：共通（plan_karte-common_v1）
-- 1. 退職した人の記録を読める範囲の拡張・退職者を対象にした新しい記録の禁止
-- 2. ロープレの過去の記録の印（is_legacy・legacy_source）
-- 3. 最後の1人の管理者は外せない・退職させられない
-- 4. 役割を「代表（ceo）」にする・「代表」から外すのは代表（かつ管理者）だけ
-- 5. チーム（teams）の追加・変更の許可（管理者のみ）
-- 6. 土台4表（members・member_affiliations・mgr_assignments・teams）の監査ログ

-- ============================================================================
-- 1. 判定用の関数（private スキーマ、security definer、set search_path = ''）
-- ============================================================================

-- 指定した member_id が退職日を過ぎた人（retired_on < today_jst()）か
create or replace function private.is_retired_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.id = p_member_id
      and m.retired_on is not null
      and m.retired_on < private.today_jst()
  );
$$;

-- その人の退職日（members.retired_on）が今日（日本時間、private.today_jst()）より前なら、
-- その人の所属の履歴（member_affiliations）のうち start_date がいちばん新しい行の team_id を返す。
-- 退職していなければ private.member_team_now(target) を返す
create or replace function private.member_supervision_team(target uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_retired_on date;
  v_team uuid;
begin
  if target is null then
    return null;
  end if;

  select m.retired_on into v_retired_on
  from public.members m
  where m.id = target;

  if not found then
    return null;
  end if;

  if v_retired_on is not null and v_retired_on < private.today_jst() then
    select ma.team_id into v_team
    from public.member_affiliations ma
    where ma.member_id = target
    order by ma.start_date desc
    limit 1;
    return v_team;
  end if;

  return private.member_team_now(target);
end;
$$;

-- private.can_supervise_member(target) が真なら真。
-- そうでなく、target が退職していて（retired_on < today_jst()）、
-- 見る人が「今のチーム ＝ member_supervision_team(target) のリーダー」か
-- 「member_supervision_team(target) を今担当している MGR」なら真。自分自身は偽
create or replace function private.can_read_records_of(target uuid)
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
  v_retired_on date;
  v_my_team uuid;
  v_sup_team uuid;
begin
  v_me := private.current_member_id();
  if v_me is null or target is null or target = v_me then
    return false;
  end if;

  if private.can_supervise_member(target) then
    return true;
  end if;

  v_today := private.today_jst();
  select m.retired_on into v_retired_on
  from public.members m
  where m.id = target;

  if not found or v_retired_on is null or v_retired_on >= v_today then
    return false;
  end if;

  v_sup_team := private.member_supervision_team(target);
  if v_sup_team is null then
    return false;
  end if;

  v_role := private.current_member_role();
  if v_role = 'leader' then
    v_my_team := private.current_team_id();
    return v_my_team is not null and v_my_team = v_sup_team;
  end if;

  if v_role = 'mgr' then
    return exists (
      select 1
      from public.mgr_assignments ma
      where ma.mgr_member_id = v_me
        and ma.team_id = v_sup_team
        and ma.start_date <= v_today
        and (ma.end_date is null or ma.end_date >= v_today)
    );
  end if;

  return false;
end;
$$;

-- 指定した member_id の行を読めるか（今の判定に private.can_read_records_of を追加）
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

  if private.can_read_records_of(p_target_member_id) then
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

-- 部下メモを読めるか（最後の対象者判定を private.can_read_records_of に置きかえ）
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
      and private.can_read_records_of(smt.member_id)
  );
end;
$$;

revoke all on function private.is_retired_member(uuid) from public, anon;
revoke all on function private.member_supervision_team(uuid) from public, anon;
revoke all on function private.can_read_records_of(uuid) from public, anon;
revoke all on function private.can_read_member(uuid) from public, anon;
revoke all on function private.can_read_memo(uuid) from public, anon;

grant execute on function private.is_retired_member(uuid) to authenticated, service_role;
grant execute on function private.member_supervision_team(uuid) to authenticated, service_role;
grant execute on function private.can_read_records_of(uuid) to authenticated, service_role;
grant execute on function private.can_read_member(uuid) to authenticated, service_role;
grant execute on function private.can_read_memo(uuid) to authenticated, service_role;

-- ============================================================================
-- 2. ロープレの過去の記録の印（is_legacy・legacy_source）
-- ============================================================================
alter table public.roleplays
  add column is_legacy boolean not null default false,
  add column legacy_source jsonb;

-- ============================================================================
-- 3. トリガーの関数（security definer、set search_path = ''、実行許可を外す）
-- ============================================================================

-- roleplays：退職した人を対象にした新しい記録の禁止 ＆ 過去の記録の印の保護
create or replace function private.check_roleplay_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    if private.is_retired_member(new.member_id) then
      raise exception 'cannot create roleplays for a retired member';
    end if;
    if new.is_legacy is distinct from false or new.legacy_source is not null then
      raise exception 'cannot set legacy fields on roleplays';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.member_id is distinct from old.member_id and private.is_retired_member(new.member_id) then
    raise exception 'cannot change roleplays member_id to a retired member';
  end if;

  if new.is_legacy is distinct from old.is_legacy
     or new.legacy_source is distinct from old.legacy_source then
    raise exception 'cannot change legacy fields of roleplays';
  end if;

  return new;
end;
$$;

-- member_themes：種類の確かめ ＆ 退職した人を対象にした追加・member_id変更の禁止
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

  if (select auth.role()) <> 'service_role' then
    if (TG_OP = 'INSERT' or new.member_id is distinct from old.member_id)
       and private.is_retired_member(new.member_id) then
      raise exception 'cannot assign member_themes to a retired member';
    end if;
  end if;

  return new;
end;
$$;

-- subordinate_memo_targets：対象者の確かめ ＆ 退職した人を対象にした追加・復元の禁止
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

  if (
    TG_OP = 'INSERT'
    or new.member_id is distinct from old.member_id
    or (old.removed_at is not null and new.removed_at is null)
  ) and private.is_retired_member(new.member_id) then
    raise exception 'cannot target a retired member in subordinate_memo_targets';
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

-- seminar_members：退職した人を対象にした追加・member_id変更・復元の禁止
create or replace function private.check_seminar_member_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if (
    TG_OP = 'INSERT'
    or new.member_id is distinct from old.member_id
    or (old.removed_at is not null and new.removed_at is null)
  ) and private.is_retired_member(new.member_id) then
    raise exception 'cannot add a retired member to seminar_members';
  end if;

  return new;
end;
$$;

-- permissions：変更の制限 ＆ 最後の1人の管理者は外せない
create or replace function private.check_permission_update()
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
     or new.member_id is distinct from old.member_id
     or new.kind is distinct from old.kind
     or new.granted_by is distinct from old.granted_by
     or new.granted_at is distinct from old.granted_at then
    raise exception 'cannot change immutable columns of permissions';
  end if;

  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'cannot restore revoked permission';
  end if;

  if old.kind = 'admin' and old.revoked_at is null and new.revoked_at is not null then
    -- 有効な管理者の行を for update で押さえてから判定する
    perform 1
    from public.permissions p
    where p.kind = 'admin'
      and p.revoked_at is null
    for update;

    if not exists (
      select 1
      from public.permissions p
      join public.members m on m.id = p.member_id
      where p.kind = 'admin'
        and p.revoked_at is null
        and p.id <> old.id
        and (m.retired_on is null or m.retired_on >= private.today_jst())
    ) then
      raise exception 'cannot revoke last admin';
    end if;
  end if;

  return new;
end;
$$;

-- members：代表（ceo）役割の変更制限 ＆ 最後の1人の管理者の退職制限
create or replace function private.check_member_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    if new.role = 'ceo' and not (private.is_ceo() and private.is_admin()) then
      raise exception 'only ceo with admin permission can set role to ceo';
    end if;
    return new;
  end if;

  -- UPDATE：role を ceo にする・ceo からほかに変えるのは代表かつ管理者のときだけ
  if new.role is distinct from old.role and (new.role = 'ceo' or old.role = 'ceo') then
    if not (private.is_ceo() and private.is_admin()) then
      raise exception 'only ceo with admin permission can change ceo role';
    end if;
  end if;

  -- UPDATE：退職日を今日以前の日にするとき、その人が有効な管理者でほかに有効な管理者がいなければ止める
  v_today := private.today_jst();
  if new.retired_on is not null
     and new.retired_on <= v_today
     and (old.retired_on is null or old.retired_on > v_today) then
    if exists (
      select 1
      from public.permissions p
      where p.member_id = old.id
        and p.kind = 'admin'
        and p.revoked_at is null
    ) then
      perform 1
      from public.permissions p
      where p.kind = 'admin'
        and p.revoked_at is null
      for update;

      if not exists (
        select 1
        from public.permissions p
        join public.members m on m.id = p.member_id
        where p.kind = 'admin'
          and p.revoked_at is null
          and m.id <> old.id
          and (m.retired_on is null or m.retired_on >= v_today)
      ) then
        raise exception 'cannot retire last admin';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.check_roleplay_write() from public, anon, authenticated;
revoke all on function private.check_member_theme_kind() from public, anon, authenticated;
revoke all on function private.check_subordinate_memo_target_write() from public, anon, authenticated;
revoke all on function private.check_seminar_member_write() from public, anon, authenticated;
revoke all on function private.check_permission_update() from public, anon, authenticated;
revoke all on function private.check_member_write() from public, anon, authenticated;

-- トリガーの設定
drop trigger if exists check_roleplay_write_trigger on public.roleplays;
create trigger check_roleplay_write_trigger
  before insert or update on public.roleplays
  for each row execute function private.check_roleplay_write();

drop trigger if exists check_seminar_member_write_trigger on public.seminar_members;
create trigger check_seminar_member_write_trigger
  before insert or update on public.seminar_members
  for each row execute function private.check_seminar_member_write();

drop trigger if exists check_permission_update_trigger on public.permissions;
create trigger check_permission_update_trigger
  before update on public.permissions
  for each row execute function private.check_permission_update();

drop trigger if exists check_member_write_trigger on public.members;
create trigger check_member_write_trigger
  before insert or update on public.members
  for each row execute function private.check_member_write();

-- 土台4表の監査ログトリガー
drop trigger if exists audit_members_trigger on public.members;
create trigger audit_members_trigger
  after insert or update or delete on public.members
  for each row execute function private.record_audit_log();

drop trigger if exists audit_member_affiliations_trigger on public.member_affiliations;
create trigger audit_member_affiliations_trigger
  after insert or update or delete on public.member_affiliations
  for each row execute function private.record_audit_log();

drop trigger if exists audit_mgr_assignments_trigger on public.mgr_assignments;
create trigger audit_mgr_assignments_trigger
  after insert or update or delete on public.mgr_assignments
  for each row execute function private.record_audit_log();

drop trigger if exists audit_teams_trigger on public.teams;
create trigger audit_teams_trigger
  after insert or update or delete on public.teams
  for each row execute function private.record_audit_log();

-- ============================================================================
-- 4. teams の追加・変更の許可と RLS ポリシー、および読む決まりの置きかえ
-- ============================================================================

grant insert, update on table public.teams to authenticated;

drop policy if exists teams_insert_policy on public.teams;
create policy teams_insert_policy
  on public.teams
  for insert
  to authenticated
  with check (private.is_admin());

drop policy if exists teams_update_policy on public.teams;
create policy teams_update_policy
  on public.teams
  for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- roleplays_select_policy（003 の 658行）：can_supervise_member → can_read_records_of
drop policy if exists roleplays_select_policy on public.roleplays;
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
          or private.can_read_records_of(member_id)
        )
      )
    )
  );

-- kpi_entries_select_policy（005 の 957行）：can_supervise_member → can_read_records_of
drop policy if exists kpi_entries_select_policy on public.kpi_entries;
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
          or private.can_read_records_of(member_id)
          or (select private.is_admin())
        )
      )
      or private.is_my_pending_import(import_log_id)
    )
  );

-- kpi_targets_select_policy（005 の 986行）：can_supervise_member → can_read_records_of
drop policy if exists kpi_targets_select_policy on public.kpi_targets;
create policy kpi_targets_select_policy
  on public.kpi_targets
  for select
  to authenticated
  using (
    (select private.current_member_id()) is not null
    and (
      member_id = (select private.current_member_id())
      or private.can_read_records_of(member_id)
      or (select private.is_admin())
    )
  );
