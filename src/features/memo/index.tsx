import { NoticeBox, Tag } from '../../components/ui';

export function SubordinateMemoPage() {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <Tag tone="navy">KPI・部下メモ③で作成</Tag>
          <h1 className="section-title">部下メモ</h1>
        </div>
      </div>
      <NoticeBox title="準備中" tone="info">
        部下メモの入力・確認画面は、次の計画（plan_memo_v1）で作成します。
      </NoticeBox>
    </section>
  );
}

export default SubordinateMemoPage;
