import { useMemo, useState } from 'react';
import type { DirectoryEntry } from './types';
import {
  Button,
  DataTable,
  DateText,
  InputField,
  NoticeBox,
  SelectField,
  Tag,
  type TableColumn,
} from '../components/ui';

export interface DirectoryViewProps {
  selfEntry: DirectoryEntry | null;
  entries: DirectoryEntry[];
  onSignOut: () => void;
}

export function DirectoryView({ selfEntry, entries, onSignOut }: DirectoryViewProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const filteredEntries = useMemo(() => {
    const keyword = searchKeyword.trim();
    return entries.filter((entry) => {
      if (roleFilter && entry.role !== roleFilter) return false;
      if (
        keyword &&
        !entry.name.includes(keyword) &&
        !entry.currentTeamText.includes(keyword) &&
        !entry.currentBaseText.includes(keyword)
      ) {
        return false;
      }
      return true;
    });
  }, [entries, searchKeyword, roleFilter]);

  if (!selfEntry) {
    return (
      <main className="page-container">
        <header className="brand-header header-with-action">
          <div>
            <div className="brand-sub">SALES +1</div>
            <h1 className="brand-title">利用確認</h1>
          </div>
          <Button variant="secondary" onClick={onSignOut}>
            ログアウト
          </Button>
        </header>

        <section className="panel" role="alert">
          <NoticeBox tone="alert" title="利用確認">
            <p className="unregistered-message">
              名簿に登録されていません。管理者に連絡してください
            </p>
          </NoticeBox>
        </section>
      </main>
    );
  }

  const columns: TableColumn<DirectoryEntry>[] = [
    {
      key: 'name',
      header: '名前',
      className: 'col-name',
      render: (entry) => entry.name,
    },
    {
      key: 'role',
      header: '役割',
      render: (entry) => <Tag tone="navy">{entry.roleLabel}</Tag>,
    },
    {
      key: 'team',
      header: '今のチーム',
      render: (entry) => entry.currentTeamText,
    },
    {
      key: 'base',
      header: '拠点',
      render: (entry) => entry.currentBaseText,
    },
    {
      key: 'sales',
      header: '営業',
      render: (entry) => (
        <Tag tone={entry.goesToSales ? 'good' : 'plain'}>
          {entry.goesToSales ? '出る' : '出ない'}
        </Tag>
      ),
    },
    {
      key: 'hiredOn',
      header: '入社日',
      render: (entry) => <DateText value={entry.hiredOn} />,
    },
  ];

  return (
    <div className="directory-view">
      <NoticeBox tone="info" title="名簿の確認（権限に応じた表示範囲）">
        ログインしているあなたの役割と所属に応じて、閲覧できる名簿の範囲が自動で絞られています。
      </NoticeBox>

      <section className="panel" aria-label="ログイン中の利用者">
        <h2 className="section-title">自分の情報</h2>
        <dl className="profile-grid">
          <div className="profile-item">
            <dt>名前</dt>
            <dd>{selfEntry.name}</dd>
          </div>
          <div className="profile-item">
            <dt>役割</dt>
            <dd>
              <Tag tone="navy">{selfEntry.roleLabel}</Tag>
            </dd>
          </div>
          <div className="profile-item">
            <dt>今のチーム</dt>
            <dd>{selfEntry.currentTeamText}</dd>
          </div>
        </dl>
      </section>

      <section className="panel" aria-label="見られる名簿の一覧">
        <div className="section-header-row">
          <h2 className="section-title">自分が見られる名簿の一覧</h2>
          <span className="count-label">
            {filteredEntries.length}名（全{entries.length}名）
          </span>
        </div>

        <div className="filter-bar">
          <InputField
            id="directory-search"
            label="名前・チーム・拠点で探す"
            placeholder="キーワードを入力"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
          <SelectField
            id="directory-role-filter"
            label="役割で絞り込む"
            placeholder="すべての役割"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            options={[
              { value: 'member', label: 'メンバー' },
              { value: 'leader', label: 'リーダー' },
              { value: 'mgr', label: 'MGR' },
              { value: 'ceo', label: '代表' },
            ]}
          />
          {(searchKeyword || roleFilter) && (
            <div className="filter-bar-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchKeyword('');
                  setRoleFilter('');
                }}
              >
                条件をクリア
              </Button>
            </div>
          )}
        </div>

        <DataTable
          columns={columns}
          rows={filteredEntries}
          rowKey={(entry) => entry.id}
          emptyMessage="条件に一致する名簿の行はありません。"
        />
      </section>
    </div>
  );
}
