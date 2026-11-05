import { NoticeBox, Tag } from '../../../components/ui';

export function KpiImportPage() {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <Tag tone="navy">KPI・部下メモ②で作成</Tag>
          <h1 className="section-title">CSV取り込み</h1>
        </div>
      </div>
      <NoticeBox title="準備中" tone="info">
        KPIのCSV取り込み・承認・名前の対応の画面は、次の計画（plan_kpi_v1）で作成します。
      </NoticeBox>
    </section>
  );
}

export default KpiImportPage;
