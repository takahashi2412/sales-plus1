import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../foundation/supabaseClient';
import type { MemberRow } from '../../../foundation/types';
import type { SeminarMemberRow, SeminarRow } from '../shared';
import { planSeminarMemberMutations, planSingleParticipantAdd } from './logic';

export interface CreateSeminarInput {
  date: string;
  theme: string;
  lecturer: string;
  minutes: number;
  content: string;
  created_by: string;
}

export interface UpdateSeminarInput {
  date: string;
  theme: string;
  lecturer: string;
  minutes: number;
  content: string;
}

export async function fetchMembersForSeminars(
  client: SupabaseClient = supabase,
): Promise<MemberRow[]> {
  const { data, error } = await client
    .from('members')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MemberRow[];
}

export async function fetchAllSeminarMembers(
  client: SupabaseClient = supabase,
): Promise<SeminarMemberRow[]> {
  const { data, error } = await client.from('seminar_members').select('*');
  if (error) throw error;
  return (data ?? []) as SeminarMemberRow[];
}

export async function createSeminarWithMembers(
  input: CreateSeminarInput,
  participantMemberIds: string[],
  client: SupabaseClient = supabase,
): Promise<SeminarRow> {
  const { data: created, error: seminarErr } = await client
    .from('seminars')
    .insert({
      date: input.date,
      theme: input.theme.trim(),
      lecturer: input.lecturer.trim(),
      minutes: input.minutes,
      content: input.content.trim(),
      created_by: input.created_by,
    })
    .select('*')
    .single();

  if (seminarErr) throw seminarErr;
  const seminar = created as SeminarRow;

  const uniqueMemberIds = Array.from(new Set(participantMemberIds));
  if (uniqueMemberIds.length > 0) {
    const rows = uniqueMemberIds.map((memberId) => ({
      seminar_id: seminar.id,
      member_id: memberId,
      removed_at: null,
    }));
    const { error: memberErr } = await client.from('seminar_members').insert(rows);
    if (memberErr) throw memberErr;
  }

  return seminar;
}

export async function applySeminarMemberMutations(
  seminarId: string,
  existingRows: SeminarMemberRow[],
  selectedMemberIds: string[],
  client: SupabaseClient = supabase,
): Promise<void> {
  const plan = planSeminarMemberMutations(existingRows, selectedMemberIds);
  const nowIso = new Date().toISOString();

  if (plan.toInsert.length > 0) {
    const insertRows = plan.toInsert.map((memberId) => ({
      seminar_id: seminarId,
      member_id: memberId,
      removed_at: null,
    }));
    const { error } = await client.from('seminar_members').insert(insertRows);
    if (error) throw error;
  }

  for (const memberId of plan.toRestore) {
    const { error } = await client
      .from('seminar_members')
      .update({ removed_at: null })
      .eq('seminar_id', seminarId)
      .eq('member_id', memberId);
    if (error) throw error;
  }

  for (const memberId of plan.toRemove) {
    const { error } = await client
      .from('seminar_members')
      .update({ removed_at: nowIso })
      .eq('seminar_id', seminarId)
      .eq('member_id', memberId);
    if (error) throw error;
  }
}

export async function updateSeminarWithMembers(
  seminarId: string,
  input: UpdateSeminarInput,
  existingRows: SeminarMemberRow[],
  selectedMemberIds: string[],
  client: SupabaseClient = supabase,
): Promise<SeminarRow> {
  const { data, error } = await client
    .from('seminars')
    .update({
      date: input.date,
      theme: input.theme.trim(),
      lecturer: input.lecturer.trim(),
      minutes: input.minutes,
      content: input.content.trim(),
    })
    .eq('id', seminarId)
    .select('*')
    .single();

  if (error) throw error;

  await applySeminarMemberMutations(seminarId, existingRows, selectedMemberIds, client);
  return data as SeminarRow;
}

export async function addOrRestoreSeminarParticipant(
  seminarId: string,
  memberId: string,
  existingRowsForSeminar: SeminarMemberRow[],
  client: SupabaseClient = supabase,
): Promise<void> {
  const action = planSingleParticipantAdd(existingRowsForSeminar, memberId);
  if (action === 'insert') {
    const { error } = await client.from('seminar_members').insert({
      seminar_id: seminarId,
      member_id: memberId,
      removed_at: null,
    });
    if (error) throw error;
  } else if (action === 'restore') {
    const { error } = await client
      .from('seminar_members')
      .update({ removed_at: null })
      .eq('seminar_id', seminarId)
      .eq('member_id', memberId);
    if (error) throw error;
  }
}

export async function removeSeminarParticipant(
  seminarId: string,
  memberId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('seminar_members')
    .update({ removed_at: new Date().toISOString() })
    .eq('seminar_id', seminarId)
    .eq('member_id', memberId);
  if (error) throw error;
}

export async function hideSeminar(
  seminarId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('seminars')
    .update({ hidden_at: new Date().toISOString() })
    .eq('id', seminarId);
  if (error) throw error;
}
