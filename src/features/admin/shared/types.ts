import type {
  MemberAffiliationRow,
  MemberRole,
  MemberRow,
  MgrAssignmentRow,
  PermissionKind,
  PermissionRow,
  TeamRow,
} from '../../../foundation/types';

export const MEMBERS_CSV_HEADERS = [
  '名前',
  'メール',
  '役割',
  '営業に出る',
  '入社日',
  'チーム',
  '拠点',
  '所属の開始日',
] as const;

export interface RawMemberCsvRow {
  rowNumber: number; // 1-indexed file line number (header is 1, first data row is 2)
  name: string;
  email: string;
  roleText: string;
  goesToSalesText: string;
  hiredOnText: string;
  teamName: string;
  base: string;
  affiliationStartDateText: string;
}

export interface NormalizedMemberImportRow {
  rowNumber: number;
  name: string;
  email: string;
  role: Exclude<MemberRole, 'ceo'>;
  goesToSales: boolean;
  hiredOn: string;
  teamName: string | null;
  base: string | null;
  affiliationStartDate: string | null;
}

export interface MemberCsvRowValidation {
  rowNumber: number;
  raw: RawMemberCsvRow;
  errors: string[];
  missingTeamName: string | null;
  normalized: NormalizedMemberImportRow | null;
}

export interface MembersCsvValidationResult {
  headerErrors: string[];
  rows: MemberCsvRowValidation[];
  unknownTeamNames: string[];
  validCount: number;
  invalidCount: number;
  canImport: boolean;
  newTeamsToCreate: string[];
  importRows: NormalizedMemberImportRow[];
}

export interface TransferInput {
  memberId: string;
  newTeamId: string;
  newBase: string;
  newStartDate: string;
}

export interface TransferPlan {
  closeAffiliations: Array<{
    affiliationId: string;
    endDate: string;
  }>;
  insertAffiliation: {
    member_id: string;
    team_id: string;
    base: string;
    start_date: string;
    end_date: null;
  };
}

export type TransferPlanResult =
  | { ok: true; plan: TransferPlan }
  | { ok: false; errors: string[] };

export interface RetirementInput {
  member: MemberRow;
  retiredOn: string;
  revokedByMemberId: string;
  revokedAtIso?: string;
  affiliations: MemberAffiliationRow[];
  mgrAssignments: MgrAssignmentRow[];
  permissions: PermissionRow[];
}

export interface RetirementStep1RevokePermissions {
  step: 1;
  kind: 'revoke_permissions';
  permissionIds: string[];
  revokedBy: string;
  revokedAt: string;
}

export interface RetirementStep2ClosePeriods {
  step: 2;
  kind: 'close_affiliations_and_mgr_assignments';
  affiliationIds: string[];
  mgrAssignmentIds: string[];
  endDate: string;
}

export interface RetirementStep3SetRetiredOn {
  step: 3;
  kind: 'set_member_retired_on';
  memberId: string;
  retiredOn: string;
}

export type RetirementStep =
  | RetirementStep1RevokePermissions
  | RetirementStep2ClosePeriods
  | RetirementStep3SetRetiredOn;

export interface RetirementPlan {
  memberId: string;
  retiredOn: string;
  steps: [
    RetirementStep1RevokePermissions,
    RetirementStep2ClosePeriods,
    RetirementStep3SetRetiredOn,
  ];
}

export type RetirementPlanResult =
  | { ok: true; plan: RetirementPlan }
  | { ok: false; errors: string[] };

export interface GrantPermissionInput {
  memberId: string;
  kind: PermissionKind;
  grantedBy: string;
  existingPermissions: PermissionRow[];
}

export type GrantPermissionPlanResult =
  | {
      ok: true;
      alreadyGranted: false;
      insert: {
        member_id: string;
        kind: PermissionKind;
        granted_by: string;
      };
    }
  | {
      ok: true;
      alreadyGranted: true;
      existingPermissionId: string;
      message: string;
    }
  | {
      ok: false;
      error: string;
    };

export interface RevokePermissionInput {
  permissionId: string;
  revokedBy: string;
  revokedAtIso?: string;
  existingPermissions: PermissionRow[];
}

export type RevokePermissionPlanResult =
  | {
      ok: true;
      isSelfAdminRevoke: boolean;
      confirmationMessage: string | null;
      update: {
        id: string;
        revoked_by: string;
        revoked_at: string;
      };
    }
  | {
      ok: false;
      error: string;
    };

export interface AdminViewerRoleFlags {
  isAdmin: boolean;
  isCeo: boolean;
}

export type {
  MemberAffiliationRow,
  MemberRole,
  MemberRow,
  MgrAssignmentRow,
  PermissionKind,
  PermissionRow,
  TeamRow,
};
