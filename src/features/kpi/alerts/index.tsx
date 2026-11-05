import { NoticeBox, Tag } from '../../../components/ui';

export function KpiAlertsPage() {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <Tag tone="navy">KPI・部下メモ②で作成</Tag>
          <h1 className="section-title">未達の一覧</h1>
        </div>
      </div>
      <NoticeBox title="準備中" tone="info">
        未達の一覧と対応記録の画面は、次の計画（plan_kpi_v1）で作成します。
      </NoticeBox>
    </section>
  );
}

export default KpiAlertsPage;
