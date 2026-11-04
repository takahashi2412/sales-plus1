-- ロープレの並列の前の準備：上席の判定から自分を外す・実行者と課員を別の人にする（plan_roleplay-prep_v1）

-- 1. private.can_supervise_member(target uuid) を作り直し、自分自身（target = private.current_member_id()）のときは偽にする
-- ほかの判定はロープレ①のまま（代表は真、リーダーは今同じチーム、MGR は担当のチーム、管理者の権限では真にしない、メンバーは偽）
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
  if v_me is null or target is null or target = v_me then
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

revoke all on function private.can_supervise_member(uuid) from public, anon;
grant execute on function private.can_supervise_member(uuid) to authenticated, service_role;

-- 2. roleplays の追加と変更の決まりに member_id <> private.current_member_id()（実行者と課員は別の人）を足す
drop policy if exists roleplays_insert_policy on public.roleplays;
create policy roleplays_insert_policy
  on public.roleplays
  for insert
  to authenticated
  with check (
    private.current_member_id() is not null
    and runner_member_id = private.current_member_id()
    and member_id <> private.current_member_id()
    and (
      private.can_supervise_member(member_id)
      or (
        private.current_team_id() is not null
        and private.current_team_id() = private.member_team_now(member_id)
      )
    )
  );

drop policy if exists roleplays_update_policy on public.roleplays;
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
    and member_id <> private.current_member_id()
    and (
      private.can_supervise_member(member_id)
      or (
        private.current_team_id() is not null
        and private.current_team_id() = private.member_team_now(member_id)
      )
    )
  );
