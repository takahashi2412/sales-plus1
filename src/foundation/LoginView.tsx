import { useState } from 'react';
import { supabase } from './supabaseClient';
import { signInWithMicrosoft } from './auth';

export function LoginView() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    const { error } = await signInWithMicrosoft(supabase);
    if (error) {
      setErrorMsg('ログイン処理を開始できませんでした。時間をおいて再度お試しください。');
      setLoading(false);
    }
  };

  return (
    <main className="page-container">
      <header className="brand-header">
        <div className="brand-sub">株式会社Rush up 営業部</div>
        <h1 className="brand-title">SALES +1</h1>
      </header>

      <section className="panel login-panel" aria-label="ログイン">
        <h2 className="section-title">Microsoft 365 でログイン</h2>
        <p className="lead-text">
          会社の Microsoft 365 アカウントでログインしてください。
        </p>

        {errorMsg && (
          <div className="notice-box" role="alert">
            {errorMsg}
          </div>
        )}

        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? '移動中...' : 'Microsoft 365 でログイン'}
          </button>
        </div>
      </section>
    </main>
  );
}
