import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './foundation/supabaseClient';
import { signOut } from './foundation/auth';
import { buildDirectoryEntries } from './foundation/directory';
import type {
  DirectoryEntry,
  MemberAffiliationRow,
  MemberRow,
  MgrAssignmentRow,
  PermissionRow,
  TeamRow,
} from './foundation/types';
import { LoginView } from './foundation/LoginView';
import { DirectoryView } from './foundation/DirectoryView';
import {
  AppLayout,
  canAccessRoute,
  parseHashRoute,
  type RouteKey,
} from './components/layout/AppLayout';
import { NoticeBox } from './components/ui';
import { HomePage } from './features/home';
import { KartePage } from './features/karte';
import { AdminMembersPage } from './features/admin/members';
import { AdminPermissionsPage } from './features/admin/permissions';
import { RoleplayRecordPage } from './features/roleplay/record';
import { RoleplayTalksPage } from './features/roleplay/talks';
import { RoleplaySeminarPage } from './features/roleplay/seminar';
import { KpiTargetsPage } from './features/kpi/targets';
import { KpiAlertsPage } from './features/kpi/alerts';
import { KpiImportPage } from './features/kpi/import';
import { SubordinateMemoPage } from './features/memo';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [selfEntry, setSelfEntry] = useState<DirectoryEntry | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [route, setRoute] = useState<RouteKey>(() =>
    typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : 'directory',
  );

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setSelfEntry(null);
      setIsAdmin(false);
      setEntries([]);
      return;
    }

    let cancelled = false;

    async function loadDirectory(currentSession: Session) {
      setDataLoading(true);
      const [membersRes, teamsRes, affRes, mgrRes, permRes] = await Promise.all([
        supabase.from('members').select('*'),
        supabase.from('teams').select('*'),
        supabase.from('member_affiliations').select('*'),
        supabase.from('mgr_assignments').select('*'),
        supabase.from('permissions').select('*'),
      ]);

      if (cancelled) return;

      const members = (membersRes.data ?? []) as MemberRow[];
      const teams = (teamsRes.data ?? []) as TeamRow[];
      const affiliations = (affRes.data ?? []) as MemberAffiliationRow[];
      const mgrAssignments = (mgrRes.data ?? []) as MgrAssignmentRow[];
      const permissions = (permRes.data ?? []) as PermissionRow[];

      const built = buildDirectoryEntries(members, teams, affiliations, mgrAssignments);
      const selfRow = members.find((m) => m.auth_user_id === currentSession.user.id);
      const foundSelf = selfRow ? (built.find((e) => e.id === selfRow.id) ?? null) : null;

      if (!foundSelf || !selfRow) {
        setSelfEntry(null);
        setIsAdmin(false);
        setEntries([]);
      } else {
        const hasAdmin = permissions.some(
          (p) => p.member_id === selfRow.id && p.kind === 'admin' && p.revoked_at === null,
        );
        setSelfEntry(foundSelf);
        setIsAdmin(hasAdmin);
        setEntries(built);

        // ログインした直後（アドレスに #/… がないとき）：リーダー・MGR・代表はホーム、メンバーは名簿の確認
        if (typeof window !== 'undefined') {
          const hashPath = window.location.hash.replace(/^#\/?/, '').trim();
          if (hashPath === '') {
            if (
              foundSelf.role === 'leader' ||
              foundSelf.role === 'mgr' ||
              foundSelf.role === 'ceo'
            ) {
              setRoute('home');
            } else {
              setRoute('directory');
            }
          }
        }
      }
      setDataLoading(false);
    }

    loadDirectory(session);

    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleSignOut = async () => {
    await signOut(supabase);
  };

  if (!authReady || (session && dataLoading)) {
    return (
      <main className="page-container">
        <section className="panel">
          <p className="lead-text">読み込み中...</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return <LoginView />;
  }

  if (!selfEntry) {
    return (
      <DirectoryView
        selfEntry={null}
        entries={[]}
        onSignOut={handleSignOut}
      />
    );
  }

  const allowed = canAccessRoute(route, selfEntry.role, isAdmin);

  return (
    <AppLayout
      activeRoute={route}
      selfEntry={selfEntry}
      isAdmin={isAdmin}
      onSignOut={handleSignOut}
    >
      {!allowed ? (
        <section className="panel">
          <NoticeBox title="この画面は使えません" tone="warn" role="alert">
            この画面は使えません。現在の役割・権限では開くことができません。
          </NoticeBox>
        </section>
      ) : (
        <>
          {route === 'home' && <HomePage />}
          {route === 'karte' && <KartePage />}
          {route === 'directory' && (
            <DirectoryView selfEntry={selfEntry} entries={entries} onSignOut={handleSignOut} />
          )}
          {route === 'roleplay' && <RoleplayRecordPage mode="roleplay" />}
          {route === 'themes' && <RoleplayRecordPage mode="themes" />}
          {route === 'talks' && <RoleplayTalksPage />}
          {route === 'seminar' && <RoleplaySeminarPage />}
          {route === 'kpi-targets' && <KpiTargetsPage />}
          {route === 'kpi-alerts' && <KpiAlertsPage />}
          {route === 'kpi-import' && <KpiImportPage />}
          {route === 'memo' && <SubordinateMemoPage />}
          {route === 'admin-members' && <AdminMembersPage />}
          {route === 'admin-permissions' && <AdminPermissionsPage />}
        </>
      )}
    </AppLayout>
  );
}

export default App;
