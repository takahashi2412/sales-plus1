import { NoticeBox } from '../../../components/ui';

export interface RoleplayRecordEntryProps {
  mode?: 'roleplay' | 'themes';
}

export function RoleplayRecordPage({ mode = 'roleplay' }: RoleplayRecordEntryProps) {
  const title = mode === 'themes' ? 'テーマ表' : 'ロープレ';
  return (
    <section className="panel" aria-label={title}>
      <h2 className="section-title">{title}</h2>
      <NoticeBox tone="info" title="準備中">
        この画面は現在準備中です。
      </NoticeBox>
    </section>
  );
}

export default RoleplayRecordPage;
