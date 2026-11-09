-- カルテ第1版④：過去の記録の取り込み（2026-11-09）
-- 1. roleplays の空欄と書き換えの禁止
-- 2. subordinate_memos の空欄と書き換えの禁止
-- 3. seminars に過去の記録の印（is_legacy, legacy_source）と書き換え禁止トリガーを足す

-- ============================================================
-- 1. roleplays の列・制約・トリガーの更新
-- ============================================================
alter table public.roleplays
  alter column theme_id drop not null,
  alter column time_slot drop not null;

alter table public.roleplays
  add constraint roleplays_legacy_required_check check (
    is_legacy or (theme_id is not null and time_slot is not null)
  );

alter table public.roleplays
  drop constraint roleplays_check;

alter table public.roleplays
  add constraint roleplays_check check (
    is_legacy
    or submitted_at is null
    or (
      length(btrim(fixed_point)) > 0
      and minutes is not null
      and pass_result is not null
    )
  );

create or replace function private.check_roleplay_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'authenticated' then
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
  if old.is_legacy then
    raise exception 'cannot update legacy roleplays';
  end if;

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

revoke all on function private.check_roleplay_write() from public, anon, authenticated;

-- ============================================================
-- 2. subordinate_memos / subordinate_memo_targets の制約・トリガーの更新
-- ============================================================
alter table public.subordinate_memos
  drop constraint subordinate_memos_check;

alter table public.subordinate_memos
  add constraint subordinate_memos_check check (
    submitted_at is null
    or (
      (is_legacy or (theme_id is not null and kind_id is not null))
      and (
        length(btrim(coalesce(noticed, ''))) > 0
        or length(btrim(coalesce(guidance, ''))) > 0
      )
    )
  );

create or replace function private.handle_subordinate_memo_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'authenticated' then
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
  if old.is_legacy then
    raise exception 'cannot update legacy subordinate_memos';
  end if;

  if new.is_legacy is distinct from old.is_legacy
     or new.legacy_source is distinct from old.legacy_source then
    raise exception 'cannot change legacy fields of subordinate_memos';
  end if;

  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
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

revoke all on function private.handle_subordinate_memo_write() from public, anon, authenticated;

create or replace function private.check_subordinate_memo_target_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_writer uuid;
  v_is_legacy boolean;
  v_new_team uuid;
begin
  if (select auth.role()) is distinct from 'authenticated' then
    return new;
  end if;

  if TG_OP = 'UPDATE' and old.memo_id is distinct from new.memo_id then
    raise exception 'cannot change memo_id of legacy or existing subordinate_memo_targets';
  end if;

  select sm.created_by, sm.is_legacy
    into v_writer, v_is_legacy
  from public.subordinate_memos sm
  where sm.id = new.memo_id;

  if v_writer is null then
    raise exception 'subordinate_memo not found';
  end if;

  if v_is_legacy then
    raise exception 'cannot modify targets of legacy subordinate_memos';
  end if;

  if (
    TG_OP = 'INSERT'
    or new.member_id is distinct from old.member_id
    or (old.removed_at is not null and new.removed_at is null)
  ) and private.is_retired_member(new.member_id) then
    raise exception 'cannot target a retired member in subordinate_memo_targets';
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

revoke all on function private.check_subordinate_memo_target_write() from public, anon, authenticated;

-- ============================================================
-- 3. seminars に過去の記録の印を足し、seminars / seminar_members トリガーを更新
-- ============================================================
alter table public.seminars
  add column is_legacy boolean not null default false,
  add column legacy_source jsonb;

create or replace function private.check_seminar_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated' then
    if TG_OP = 'INSERT' then
      if new.is_legacy is distinct from false or new.legacy_source is not null then
        raise exception 'cannot set legacy fields on seminars';
      end if;
    elsif TG_OP = 'UPDATE' then
      if old.is_legacy then
        raise exception 'cannot update legacy seminars';
      end if;
      if new.is_legacy is distinct from old.is_legacy
         or new.legacy_source is distinct from old.legacy_source then
        raise exception 'cannot change legacy fields of seminars';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.check_seminar_write() from public, anon, authenticated;

drop trigger if exists check_seminar_write_trigger on public.seminars;
create trigger check_seminar_write_trigger
  before insert or update on public.seminars
  for each row execute function private.check_seminar_write();

create or replace function private.check_seminar_member_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_legacy boolean;
begin
  if (select auth.role()) is distinct from 'authenticated' then
    return new;
  end if;

  if TG_OP = 'UPDATE' and old.seminar_id is distinct from new.seminar_id then
    raise exception 'cannot change seminar_id of legacy or existing seminar_members';
  end if;

  select s.is_legacy
    into v_is_legacy
  from public.seminars s
  where s.id = new.seminar_id;

  if v_is_legacy then
    raise exception 'cannot modify members of legacy seminars';
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

revoke all on function private.check_seminar_member_write() from public, anon, authenticated;
