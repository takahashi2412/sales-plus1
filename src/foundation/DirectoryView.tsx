import type { DirectoryEntry } from './types';

interface DirectoryViewProps {
  selfEntry: DirectoryEntry | null;
  entries: DirectoryEntry[];
  onSignOut: () => void;
}

export function DirectoryView({ selfEntry, entries, onSignOut }: DirectoryViewProps) {
  if (!selfEntry) {
    return (
      <main className="page-container">
        <header className="brand-header header-with-action">
          <div>
            <div className="brand-sub">SALES +1</div>
            <h1 className="brand-title">利用確認</h1>
          </div>
          <button type="button" className="secondary-button" onClick={onSignOut}>
            ログアウト
          </button>
        </header>

        <section className="panel" role="alert">
          <p className="unregistered-message">
            名簿に登録されていません。管理者に連絡してください
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-container">
      <header className="brand-header header-with-action">
        <div>
          <div className="brand-sub">SALES +1 ／ 1DAY +1</div>
          <h1 className="brand-title">名簿・権限の確認（土台）</h1>
        </div>
        <button type="button" className="secondary-button" onClick={onSignOut}>
          ログアウト
        </button>
      </header>

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
              <span className="role-tag">{selfEntry.roleLabel}</span>
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
          <span className="count-label">{entries.length}名</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>名前</th>
                <th>役割</th>
                <th>今のチーム</th>
                <th>拠点</th>
                <th>営業</th>
                <th>入社日</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="col-name">{entry.name}</td>
                  <td>
                    <span className="role-tag">{entry.roleLabel}</span>
                  </td>
                  <td>{entry.currentTeamText}</td>
                  <td>{entry.currentBaseText}</td>
                  <td>{entry.goesToSales ? '出る' : '出ない'}</td>
                  <td>{entry.hiredOn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
