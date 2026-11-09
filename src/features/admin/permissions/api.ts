import { supabase } from '../../../foundation/supabaseClient';
import { fetchViewerContext, type ViewerContext } from '../../../foundation/viewer';
import type { MemberRow, PermissionKind, PermissionRow } from '../../../foundation/types';
import { formatAdminDbError } from '../shared';

export interface AdminPermissionsBundle {
  viewer: ViewerContext | null;
  members: MemberRow[];
  permissions: PermissionRow[];
}

export type PermissionApiResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; errorMessage: string };

export async function fetchAdminPermissionsBundle(): Promise<AdminPermissionsBundle> {
  const viewer = await fetchViewerContext(supabase);
  if (!viewer || (!viewer.isAdmin && !viewer.isCeo)) {
    return {
      viewer,
      members: [],
      permissions: [],
    };
  }

  const [membersRes, permRes] = await Promise.all([
    supabase.from('members').select('*').order('name', { ascending: true }),
    supabase.from('permissions').select('*').order('granted_at', { ascending: false }),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (permRes.error) throw permRes.error;

  return {
    viewer,
    members: (membersRes.data ?? []) as MemberRow[],
    permissions: (permRes.data ?? []) as PermissionRow[],
  };
}

export async function executeGrantPermission(insertPayload: {
  member_id: string;
  kind: PermissionKind;
  granted_by: string;
}): Promise<PermissionApiResult<PermissionRow>> {
  const { data, error } = await supabase
    .from('permissions')
    .insert(insertPayload)
    .select('*');

  if (error) {
    return { ok: false, errorMessage: formatAdminDbError(error) };
  }
  const created = (data ?? [])[0] as PermissionRow | undefined;
  if (!created) {
    return { ok: false, errorMessage: formatAdminDbError('権限を与えることができませんでした') };
  }

  return { ok: true, data: created };
}

export async function executeRevokePermission(updatePayload: {
  id: string;
  revoked_by: string;
  revoked_at: string;
}): Promise<PermissionApiResult<PermissionRow>> {
  const { data, error } = await supabase
    .from('permissions')
    .update({
      revoked_by: updatePayload.revoked_by,
      revoked_at: updatePayload.revoked_at,
    })
    .eq('id', updatePayload.id)
    .select('*');

  if (error) {
    return { ok: false, errorMessage: formatAdminDbError(error) };
  }
  const updated = (data ?? [])[0] as PermissionRow | undefined;
  if (!updated) {
    return { ok: false, errorMessage: formatAdminDbError('権限を外すことができませんでした') };
  }

  return { ok: true, data: updated };
}
