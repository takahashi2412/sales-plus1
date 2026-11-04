import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../foundation/supabaseClient';
import type { MemberRow, TeamRow } from '../../../foundation/types';
import type { TalkRow, TalkStatus } from '../shared';

export interface CreateTalkInput {
  code: string;
  scene_id: string | null;
  industry_id: string | null;
  list_type_id: string | null;
  their_words: string;
  wording: string;
  aim: string;
  team_id: string | null;
  created_by: string;
}

export interface UpdateTalkInput {
  scene_id: string | null;
  industry_id: string | null;
  list_type_id: string | null;
  their_words: string;
  wording: string;
  aim: string;
  team_id: string | null;
}

export async function fetchTeamsForTalks(
  client: SupabaseClient = supabase,
): Promise<TeamRow[]> {
  const { data, error } = await client
    .from('teams')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TeamRow[];
}

export async function fetchMembersForTalks(
  client: SupabaseClient = supabase,
): Promise<MemberRow[]> {
  const { data, error } = await client
    .from('members')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MemberRow[];
}

export async function createTalk(
  input: CreateTalkInput,
  client: SupabaseClient = supabase,
): Promise<TalkRow> {
  const payload = {
    code: input.code,
    scene_id: input.scene_id,
    industry_id: input.industry_id,
    list_type_id: input.list_type_id,
    their_words: input.their_words.trim(),
    wording: input.wording.trim(),
    aim: input.aim.trim(),
    team_id: input.team_id,
    created_by: input.created_by,
    status: 'pending' as TalkStatus,
  };

  const { data, error } = await client.from('talks').insert(payload).select('*').single();
  if (error) throw error;
  return data as TalkRow;
}

export async function updateTalkStatus(
  talkId: string,
  nextStatus: 'trial' | 'standard',
  client: SupabaseClient = supabase,
): Promise<TalkRow> {
  const { data, error } = await client
    .from('talks')
    .update({ status: nextStatus })
    .eq('id', talkId)
    .select('*')
    .single();
  if (error) throw error;
  return data as TalkRow;
}

export async function updateTalkContent(
  talkId: string,
  input: UpdateTalkInput,
  client: SupabaseClient = supabase,
): Promise<TalkRow> {
  const payload = {
    scene_id: input.scene_id,
    industry_id: input.industry_id,
    list_type_id: input.list_type_id,
    their_words: input.their_words.trim(),
    wording: input.wording.trim(),
    aim: input.aim.trim(),
    team_id: input.team_id,
  };

  const { data, error } = await client
    .from('talks')
    .update(payload)
    .eq('id', talkId)
    .select('*')
    .single();
  if (error) throw error;
  return data as TalkRow;
}

export async function hideTalk(
  talkId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('talks')
    .update({ hidden_at: new Date().toISOString() })
    .eq('id', talkId);
  if (error) throw error;
}
