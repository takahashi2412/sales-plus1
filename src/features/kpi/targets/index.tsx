import { NoticeBox, Tag } from '../../../components/ui';

export function KpiTargetsPage() {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <Tag tone="navy">KPI・部下メモ②で作成</Tag>
          <h1 className="section-title">KPIの目標</h1>
        </div>
      </div>
      <NoticeBox title="準備中" tone="info">
        月初のKPI目標の入力・確認画面は、次の計画（plan_kpi_v1）で作成します。
      </NoticeBox>
    </section>
  );
}

export default KpiTargetsPage;
