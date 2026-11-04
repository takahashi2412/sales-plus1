import { useCallback, useEffect, useState } from 'react';
import { Button, NoticeBox } from '../../../components/ui';
import { fetchRoleplayRecordBundle, type RoleplayRecordBundle } from './api';
import { MemberThemesView } from './MemberThemesView';
import { RoleplayRecordView } from './RoleplayRecordView';
import './styles.css';

export interface RoleplayRecordEntryProps {
  mode?: 'roleplay' | 'themes';
}

export function RoleplayRecordPage({ mode = 'roleplay' }: RoleplayRecordEntryProps) {
  const [bundle, setBundle] = useState<RoleplayRecordBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchRoleplayRecordBundle();
      setBundle(data);
    } catch {
      setLoadError('データの読み込み中に問題が発生しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const title = mode === 'themes' ? 'テーマ表' : 'ロープレ';

  if (loading && !bundle) {
    return (
      <section className="panel" aria-label={title}>
        <h2 className="section-title">{title}</h2>
        <p className="lead-text">読み込み中...</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="panel" aria-label={title}>
        <h2 className="section-title">{title}</h2>
        <NoticeBox tone="alert" title="読み込みエラー" role="alert">
          {loadError}
        </NoticeBox>
        <div className="rp-record-button-row">
          <Button variant="secondary" onClick={loadData}>
            再読み込み
          </Button>
        </div>
      </section>
    );
  }

  if (!bundle || !bundle.viewer) {
    return (
      <section className="panel" aria-label={title}>
        <h2 className="section-title">{title}</h2>
        <NoticeBox tone="alert" title="利用確認" role="alert">
          この操作はできません（名簿の情報が確認できません）。
        </NoticeBox>
      </section>
    );
  }

  if (mode === 'themes') {
    return (
      <MemberThemesView
        viewer={bundle.viewer}
        writableMembers={bundle.writableMembers}
        memberMap={bundle.memberMap}
        settings={bundle.settings}
        themes={bundle.themes}
        memberThemes={bundle.memberThemes}
        roleplays={bundle.roleplays}
        onReload={loadData}
      />
    );
  }

  return (
    <RoleplayRecordView
      viewer={bundle.viewer}
      writableMembers={bundle.writableMembers}
      memberMap={bundle.memberMap}
      settings={bundle.settings}
      themes={bundle.themes}
      memberThemes={bundle.memberThemes}
      roleplays={bundle.roleplays}
      talks={bundle.talks}
      scenes={bundle.scenes}
      onReload={loadData}
    />
  );
}

export * from './logic';
export * from './api';
export default RoleplayRecordPage;
