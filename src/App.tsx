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
  TeamRow,
} from './foundation/types';
import { LoginView } from './foundation/LoginView';
import { DirectoryView } from './foundation/DirectoryView';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [selfEntry, setSelfEntry] = useState<DirectoryEntry | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);

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
      setEntries([]);
      return;
    }

    let cancelled = false;

    async function loadDirectory(currentSession: Session) {
      setDataLoading(true);
      const [membersRes, teamsRes, affRes, mgrRes] = await Promise.all([
        supabase.from('members').select('*'),
        supabase.from('teams').select('*'),
        supabase.from('member_affiliations').select('*'),
        supabase.from('mgr_assignments').select('*'),
      ]);

      if (cancelled) return;

      const members = (membersRes.data ?? []) as MemberRow[];
      const teams = (teamsRes.data ?? []) as TeamRow[];
      const affiliations = (affRes.data ?? []) as MemberAffiliationRow[];
      const mgrAssignments = (mgrRes.data ?? []) as MgrAssignmentRow[];

      const built = buildDirectoryEntries(members, teams, affiliations, mgrAssignments);
      const selfRow = members.find((m) => m.auth_user_id === currentSession.user.id);
      const foundSelf = selfRow ? (built.find((e) => e.id === selfRow.id) ?? null) : null;

      if (!foundSelf) {
        setSelfEntry(null);
        setEntries([]);
      } else {
        setSelfEntry(foundSelf);
        setEntries(built);
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

  return (
    <DirectoryView
      selfEntry={selfEntry}
      entries={entries}
      onSignOut={handleSignOut}
    />
  );
}

export default App;
