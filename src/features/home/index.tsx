import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  NoticeBox,
  SelectField,
  Tag,
} from '../../components/ui'
import { ROLE_LABELS } from '../../foundation/directory'
import { pickSelectableKarteMembers } from '../karte/shared'
import {
  fetchHomePageDataset,
  formatHomeDbError,
  type HomePageDataset,
} from './api'
import { buildHomeSummary } from './shared'
import './styles.css'

export function HomePage() {
  const [dataset, setDataset] = useState<HomePageDataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedKarteMemberId, setSelectedKarteMemberId] = useState<string>('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const data = await fetchHomePageDataset()
      setDataset(data)
    } catch (err) {
      setErrorMessage(formatHomeDbError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const summary = useMemo(() => {
    if (!dataset?.viewer) return null
    return buildHomeSummary({
      viewer: dataset.viewer,
      todayJst: dataset.todayJst,
      alerts: dataset.alerts,
      approvedImportIds: dataset.approvedImportIds,
      memos: dataset.memos,
      memberThemes: dataset.memberThemes,
      roleplays: dataset.roleplays,
      roleplaySettings: dataset.settings.roleplaySettings,
      talks: dataset.talks,
      importLogs: dataset.importLogs,
    })
  }, [dataset])

  const selectableMembers = useMemo(() => {
    if (!dataset?.viewer) return []
    return pickSelectableKarteMembers(
      dataset.viewer,
      dataset.members,
      dataset.affiliations,
      dataset.teams,
      dataset.todayJst,
    )
  }, [dataset])

  const activeKarteMemberId = useMemo(() => {
    if (selectableMembers.length === 0) return ''
    if (
      selectedKarteMemberId &&
      selectableMembers.some((m) => m.member.id === selectedKarteMemberId)
    ) {
      return selectedKarteMemberId
    }
    return selectableMembers[0].member.id
  }, [selectableMembers, selectedKarteMemberId])

  const navigateToHash = (href: string) => {
    if (typeof window !== 'undefined') {
      window.location.hash = href
    }
  }

  const handleOpenKarte = (memberId: string) => {
    if (!memberId) return
    navigateToHash(`#/karte?member=${encodeURIComponent(memberId)}`)
  }

  if (loading) {
    return (
      <section className="panel" aria-label="ホーム（今日やること）">
        <h1 className="section-title">ホーム（今日やること）</h1>
        <p className="lead-text">読み込み中...</p>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section className="panel" aria-label="ホーム（今日やること）">
        <h1 className="section-title">ホーム（今日やること）</h1>
        <NoticeBox title="エラー" tone="alert" role="alert">
          {errorMessage}
        </NoticeBox>
        <div className="action-row">
          <Button variant="secondary" onClick={() => void loadData()}>
            再読み込み
          </Button>
        </div>
      </section>
    )
  }

  if (!dataset?.viewer || !summary) {
    return (
      <section className="panel" aria-label="ホーム（今日やること）">
        <h1 className="section-title">ホーム（今日やること）</h1>
        <NoticeBox title="この操作はできません" tone="alert" role="alert">
          この操作はできません（ログイン中の名簿情報が確認できません）。
        </NoticeBox>
      </section>
    )
  }

  const viewer = dataset.viewer
  const roleLabel = ROLE_LABELS[viewer.role] ?? viewer.role

  return (
    <div className="home-page">
      {dataset.settings.missingKeys.length > 0 && (
        <NoticeBox title="設定値が入っていません" tone="warn">
          設定値が入っていません（不足：{dataset.settings.missingKeys.join('・')}
          。初期の設定値を使って件数を計算しています）。
        </NoticeBox>
      )}

      {/* 1. 今日やること（役割ごとの件数つき項目） */}
      <section className="home-section" aria-label="今日やること">
        <div className="home-section-header">
          <div>
            <h1 className="home-section-title">ホーム（今日やること）</h1>
            <p className="lead-text" style={{ margin: '4px 0 0' }}>
              役割ごとの確認・対応項目です。押すとそれぞれの画面へ移ります（0件の項目も表示しています）。
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Tag tone="navy">役割：{roleLabel}</Tag>
            {viewer.isAdmin && <Tag tone="good">管理者</Tag>}
          </div>
        </div>

        {viewer.role === 'member' ? (
          <NoticeBox title="メンバー用ホームについて" tone="info">
            メンバー用のホームは一般日報の区切りで出ます。
          </NoticeBox>
        ) : (
          <div className="home-todo-grid" role="list" aria-label="やること一覧">
            {summary.items.map((item) => (
              <button
                key={item.key}
                type="button"
                className="home-todo-card"
                onClick={() => navigateToHash(item.href)}
              >
                <div>
                  <div className="home-todo-card-top">
                    <h2 className="home-todo-title">{item.title}</h2>
                    <span
                      className={`home-todo-count ${
                        item.count > 0 ? 'has-items' : 'is-zero'
                      }`}
                    >
                      {item.count}件
                    </span>
                  </div>
                  <p className="home-todo-desc">{item.description}</p>
                </div>

                <div className="home-todo-footer">
                  <span>画面を開く（{item.href}）</span>
                  {item.badgeNote && <Tag tone="plain">{item.badgeNote}</Tag>}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 2. まだない項目（これから出る区切りの予告枠） */}
      <section className="home-section" aria-label="これからの区切りで出る項目">
        <div className="home-section-header">
          <h2 className="home-section-title">
            これからの区切りで出る項目（予告）
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--sub)' }}>
            それぞれの区切りでホームに加わります
          </span>
        </div>

        <div className="home-future-grid">
          {summary.futureItems.map((future) => (
            <div key={future.key} className="home-future-box">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  marginBottom: '6px',
                }}
              >
                <h3 className="home-future-title" style={{ margin: 0 }}>
                  {future.title}
                </h3>
                <Tag tone="plain">
                  {future.roles.map((r) => ROLE_LABELS[r]).join('・')}
                </Tag>
              </div>
              <p className="home-future-note">{future.milestoneLabel}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 下部：メンバーカルテを開く */}
      <section className="home-section" aria-label="メンバーカルテを開く">
        <div className="home-section-header">
          <div>
            <h2 className="home-section-title">メンバーカルテを開く</h2>
            <p className="lead-text" style={{ margin: '4px 0 0' }}>
              選べる人の中から対象メンバーを選んで、メンバーカルテ（KPI・時間帯・推移・育成・タイムライン）を開きます。
            </p>
          </div>
          <Tag tone="navy">選べる人：{selectableMembers.length}人</Tag>
        </div>

        {selectableMembers.length === 0 ? (
          <NoticeBox title="選べるメンバーがいません" tone="info">
            現在カルテで選べる対象メンバーはいません。
          </NoticeBox>
        ) : (
          <>
            <div className="home-karte-launcher">
              <div style={{ flex: '1 1 280px' }}>
                <SelectField
                  id="home-karte-member-select"
                  label="対象メンバーを選ぶ（チームごと・名前順）"
                  value={activeKarteMemberId}
                  options={selectableMembers.map((m) => ({
                    value: m.member.id,
                    label: `${m.teamName}：${m.member.name}${
                      m.isRetired ? '（退職）' : ''
                    }`,
                  }))}
                  onChange={(e) => setSelectedKarteMemberId(e.target.value)}
                />
              </div>
              <Button
                variant="primary"
                onClick={() => handleOpenKarte(activeKarteMemberId)}
              >
                メンバーカルテを開く
              </Button>
            </div>

            <div
              className="home-karte-member-list"
              role="list"
              aria-label="メンバーを選んで直接カルテを開く"
            >
              {selectableMembers.map((m) => (
                <button
                  key={m.member.id}
                  type="button"
                  className="home-karte-member-btn"
                  onClick={() => handleOpenKarte(m.member.id)}
                >
                  <span>
                    {m.teamName}：{m.member.name}
                  </span>
                  {m.isRetired && <Tag tone="warn">退職</Tag>}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

export * from './shared'
export * from './api'
export default HomePage
