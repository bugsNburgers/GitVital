"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { API_BASE, AUTH_URL } from "@/config";

export default function RepoDashboardPage() {
  const params = useParams<{ owner: string; repo: string }>();
  const owner = params?.owner ?? "facebook";
  const repo = params?.repo ?? "react";
  const router = useRouter();

  const [activeRange, setActiveRange] = useState<"12M" | "6M" | "30D">("12M");
  const [copyDone, setCopyDone] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [user, setUser] = useState<{ loggedIn: boolean; githubUsername?: string } | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/me`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setUser(data))
      .catch(() => setUser({ loggedIn: false }));
  }, []);

  function copyBadge() {
    const md = `[![Git Vital](https://gitvital.com/badge/${owner}/${repo}.svg)](https://gitvital.com/repo/${owner}/${repo})`;
    navigator.clipboard.writeText(md).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  }

  function reanalyze() {
    setReanalyzing(true);
    setTimeout(() => setReanalyzing(false), 2000);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #080909;
          --bg-surface: #0f1011;
          --bg-card: #111314;
          --bg-card-hover: #161819;
          --border: rgba(255,255,255,0.055);
          --border-hover: rgba(255,255,255,0.12);
          --text: #f4f4f5;
          --text-secondary: #a1a1aa;
          --text-muted: #52525b;
          --green: #22c55e;
          --green-dim: rgba(34,197,94,0.12);
          --red: #ef4444;
          --red-dim: rgba(239,68,68,0.12);
          --yellow: #eab308;
          --yellow-dim: rgba(234,179,8,0.12);
          --orange: #FF5E00;
          --orange-light: #FFA066;
          --orange-dim: rgba(255,94,0,0.12);
          --font: 'Inter', system-ui, sans-serif;
          --mono: 'Geist Mono', monospace;
        }

        body { font-family: var(--font); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }

        /* ── NAV ── */
        .dash-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: 58px; display: flex; align-items: center; padding: 0 24px;
          background: rgba(8,9,9,0.80); backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .dash-nav-inner {
          width: 100%; max-width: 1120px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .dash-logo {
          display: flex; align-items: center; gap: 8px;
          text-decoration: none; color: var(--text);
          font-size: 15px; font-weight: 700; letter-spacing: -0.02em; cursor: pointer;
        }
        .dash-logo img { height: 36px; width: auto; }
        .dash-breadcrumb {
          display: flex; align-items: center; gap: 8px;
          font-family: var(--mono); font-size: 13px; color: var(--text-muted);
        }
        .dash-breadcrumb .sep { color: var(--border-hover); }
        .dash-breadcrumb .crumb { color: var(--text-secondary); }
        .dash-nav-right { display: flex; align-items: center; gap: 8px; }
        .btn-ghost {
          font-family: var(--font); font-size: 13px; font-weight: 500;
          color: var(--text-secondary); background: none;
          border: 1px solid var(--border); border-radius: 20px;
          padding: 5px 14px; cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-ghost:hover { color: var(--text); border-color: var(--border-hover); }
        .btn-primary {
          font-family: var(--font); font-size: 13px; font-weight: 600;
          color: #fff; background: var(--orange);
          border: 1px solid rgba(255,94,0,0.5); border-radius: 20px;
          padding: 5px 16px; cursor: pointer;
          transition: background 0.15s, box-shadow 0.15s;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-primary:hover { background: #D94E00; box-shadow: 0 0 20px rgba(255,94,0,0.35); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-icon {
          font-family: var(--font); font-size: 13px; font-weight: 500;
          color: var(--text-muted); background: none;
          border: 1px solid var(--border); border-radius: 8px;
          padding: 5px 10px; cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          display: inline-flex; align-items: center;
        }
        .btn-icon:hover { color: var(--text-secondary); border-color: var(--border-hover); }

        /* ── PAGE ── */
        .dash-page { background: var(--bg); min-height: 100vh; padding-top: 58px; }
        .dash-main { max-width: 1120px; margin: 0 auto; padding: 40px 24px 80px; display: flex; flex-direction: column; gap: 16px; }

        /* ── CARD BASE ── */
        .card {
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 14px; position: relative; overflow: hidden;
          transition: border-color 0.2s;
        }
        .card:hover { border-color: var(--border-hover); }
        .card-pad { padding: 28px; }
        .card-top-line::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0;
          height: 1px; background: linear-gradient(90deg, transparent, rgba(255,94,0,0.35), transparent);
        }

        /* ── HEALTH SCORE SECTION ── */
        .health-section { display: flex; align-items: center; gap: 48px; flex-wrap: wrap; }
        .score-ring-wrap { flex-shrink: 0; position: relative; width: 160px; height: 160px; }
        .score-ring-wrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .score-ring-center {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .score-big { font-size: 44px; font-weight: 900; letter-spacing: -0.05em; color: var(--text); line-height: 1; }
        .score-of { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .health-meta { flex: 1; min-width: 240px; }
        .health-meta h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.025em; margin-bottom: 6px; }
        .health-meta p { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px; max-width: 400px; }
        .health-stats { display: flex; gap: 32px; flex-wrap: wrap; }
        .hstat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 4px; }
        .hstat-val { font-size: 22px; font-weight: 700; letter-spacing: -0.03em; color: var(--text); }
        .hstat-sub { font-size: 12px; color: var(--green); margin-top: 2px; }
        .hstat-sub.orange { color: var(--orange-light); }

        /* ── META ROW (stars/forks) ── */
        .meta-pill {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 12px; color: var(--text-muted);
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 20px; padding: 3px 10px;
        }

        /* ── 4-COL METRIC CARDS ── */
        .metrics-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .metric-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
        .metric-card-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
        .metric-card-val { font-size: 22px; font-weight: 700; letter-spacing: -0.03em; color: var(--text); }
        .metric-card-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
        .metric-card-bars { display: flex; align-items: flex-end; gap: 3px; height: 48px; margin: 12px 0; }
        .metric-card-bars span {
          flex: 1; border-radius: 3px 3px 0 0;
          background: rgba(255,94,0,0.2);
          transition: background 0.2s;
        }
        .metric-card-bars span.hi { background: var(--orange); }
        .metric-card-bars span.md { background: rgba(255,94,0,0.5); }
        .metric-chart { height: 48px; margin: 12px 0; }
        .metric-chart svg { width: 100%; height: 100%; }
        .metric-donut { display: flex; align-items: center; justify-content: center; height: 48px; margin: 12px 0; }

        /* ── COMMITS TIMELINE ── */
        .commits-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
        .commits-header h3 { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
        .commits-header p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
        .range-btns { display: flex; gap: 3px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
        .range-btn {
          font-family: var(--font); font-size: 12px; font-weight: 500;
          color: var(--text-muted); background: none; border: none;
          padding: 5px 12px; border-radius: 5px; cursor: pointer;
          transition: color 0.15s, background 0.15s;
        }
        .range-btn:hover { color: var(--text-secondary); }
        .range-btn.active { color: var(--text); background: rgba(255,255,255,0.07); }
        .commits-chart { height: 180px; }
        .commits-chart svg { width: 100%; height: 100%; }
        .commits-labels { display: flex; justify-content: space-between; padding: 8px 0 0; }
        .commits-labels span { font-size: 10px; color: var(--text-muted); font-family: var(--mono); text-transform: uppercase; }

        /* ── RISK FLAGS ── */
        .flags-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .flag-card {
          border-radius: 10px; padding: 14px 16px;
          display: flex; align-items: flex-start; gap: 10px;
        }
        .flag-card.danger { background: var(--red-dim); border: 1px solid rgba(239,68,68,0.2); }
        .flag-card.warn { background: var(--yellow-dim); border: 1px solid rgba(234,179,8,0.2); }
        .flag-card.success { background: var(--green-dim); border: 1px solid rgba(34,197,94,0.2); }
        .flag-card.info { background: var(--orange-dim); border: 1px solid rgba(255,94,0,0.2); }
        .flag-icon { font-size: 16px; margin-top: 1px; flex-shrink: 0; }
        .flag-icon.danger { color: var(--red); }
        .flag-icon.warn { color: var(--yellow); }
        .flag-icon.success { color: var(--green); }
        .flag-icon.info { color: var(--orange-light); }
        .flag-title { font-size: 12px; font-weight: 700; margin-bottom: 2px; }
        .flag-title.danger { color: var(--red); }
        .flag-title.warn { color: var(--yellow); }
        .flag-title.success { color: var(--green); }
        .flag-title.info { color: var(--orange-light); }
        .flag-desc { font-size: 11px; line-height: 1.45; color: var(--text-muted); }

        /* ── AI PANEL ── */
        .ai-panel { border-left: 3px solid var(--orange); }
        .ai-panel-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .ai-icon-box {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg, var(--orange), var(--orange-light));
          display: flex; align-items: center; justify-content: center;
        }
        .ai-panel h3 { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
        .ai-text { font-size: 14px; color: var(--text-secondary); line-height: 1.65; margin-bottom: 20px; }
        .ai-text strong { color: var(--text); font-style: normal; }
        .ai-recs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ai-rec {
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 10px; padding: 14px;
        }
        .ai-rec-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--orange-light); margin-bottom: 6px; }
        .ai-rec p { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }

        /* ── BADGE SECTION ── */
        .badge-section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .badge-section-label { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 12px; }
        .badge-preview { display: flex; gap: 10px; flex-wrap: wrap; }
        .badge-pill {
          display: inline-flex; align-items: center;
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 6px; overflow: hidden;
          font-family: var(--mono); font-size: 11px;
        }
        .badge-pill-left { padding: 4px 10px; color: var(--text-muted); background: rgba(255,255,255,0.03); border-right: 1px solid var(--border); }
        .badge-pill-right { padding: 4px 10px; color: var(--green); font-weight: 600; }
        .badge-pill-right.orange { color: var(--orange-light); }
        .badge-code-wrap { position: relative; }
        .badge-code {
          background: #0a0a0b; border: 1px solid var(--border); border-radius: 8px;
          padding: 12px 14px; font-family: var(--mono); font-size: 11.5px;
          color: var(--text-muted); line-height: 1.5; overflow-x: auto;
          white-space: nowrap;
        }
        .badge-copy-btn {
          position: absolute; top: 8px; right: 8px;
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 6px; padding: 4px 8px; cursor: pointer;
          font-size: 11px; color: var(--text-muted);
          transition: color 0.15s, border-color 0.15s;
        }
        .badge-copy-btn:hover { color: var(--text); border-color: var(--border-hover); }

        /* ── FOOTER ── */
        .dash-footer {
          border-top: 1px solid var(--border); padding: 24px;
          max-width: 1120px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between;
          font-size: 12.5px; color: var(--text-muted);
        }
        .dash-footer a { color: var(--text-muted); text-decoration: none; transition: color 0.15s; }
        .dash-footer a:hover { color: var(--text-secondary); }
        .footer-links { display: flex; gap: 20px; }

        /* ── RESPONSIVE ── */
        @media (max-width: 900px) {
          .metrics-4 { grid-template-columns: 1fr 1fr; }
          .flags-grid { grid-template-columns: 1fr 1fr; }
          .ai-recs { grid-template-columns: 1fr; }
          .badge-section-grid { grid-template-columns: 1fr; }
          .health-section { gap: 28px; }
        }
        @media (max-width: 600px) {
          .metrics-4 { grid-template-columns: 1fr; }
          .flags-grid { grid-template-columns: 1fr; }
          .dash-main { padding: 24px 16px 60px; }
          .dash-breadcrumb { display: none; }
        }
      ` }} />

      <div className="dash-page">
        {/* ── NAVBAR ── */}
        <nav className="dash-nav">
          <div className="dash-nav-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="dash-logo" onClick={() => router.push("/")}>
                <img src="/gitvital_logo_fixed.svg" alt="GitVital" />
              </div>
              <div className="dash-breadcrumb">
                <span className="sep">/</span>
                <span className="crumb">{owner}</span>
                <span className="sep">/</span>
                <span style={{ color: 'var(--text)' }}>{repo}</span>
              </div>
            </div>
            <div className="dash-nav-right">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginRight: '12px' }}>
                <a href="/leaderboard" style={{ color: 'var(--text-muted)', fontSize: '13px', textDecoration: 'none' }}>Leaderboard</a>
                {user?.loggedIn ? (
                  <a href={`/${user.githubUsername}`} style={{ color: 'var(--orange)', fontSize: '13px', textDecoration: 'none', fontWeight: 'bold' }}>View Profile</a>
                ) : (
                  <a href={AUTH_URL} style={{ color: 'var(--text-muted)', fontSize: '13px', textDecoration: 'none' }}>Login</a>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginRight: '8px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                215k
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8 }}><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
                44k
              </div>
              <button className="btn-ghost" onClick={() => router.push("/compare")}>
                ⇄ Compare
              </button>
              <button className="btn-primary" onClick={reanalyze} disabled={reanalyzing}>
                {reanalyzing ? "Analyzing…" : "↻ Re-analyze"}
              </button>
              <button className="btn-icon" onClick={() => navigator.clipboard.writeText(window.location.href)} title="Copy link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
            </div>
          </div>
        </nav>

        {/* ── MAIN ── */}
        <main className="dash-main">

          {/* ── HEALTH SCORE CARD ── */}
          <div className="card card-top-line card-pad">
            <div className="health-section">
              {/* Ring */}
              <div className="score-ring-wrap">
                <svg viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="68" stroke="rgba(255,255,255,0.06)" strokeWidth="10" fill="none" />
                  <circle
                    cx="80" cy="80" r="68"
                    stroke="url(#scoreGrad)" strokeWidth="10" fill="none"
                    strokeDasharray="427.26"
                    strokeDashoffset={427.26 * (1 - 0.89)}
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#FF5E00" />
                      <stop offset="100%" stopColor="#FFA066" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="score-ring-center">
                  <span className="score-big">89</span>
                  <span className="score-of">/ 100</span>
                </div>
              </div>

              {/* Meta */}
              <div className="health-meta">
                <h2>Repository Health Score</h2>
                <p>Your repository is in excellent condition. Maintainers are active and technical debt is under control.</p>
                <div className="health-stats">
                  <div>
                    <div className="hstat-label">Bus Factor</div>
                    <div className="hstat-val">12</div>
                    <div className="hstat-sub">Stable</div>
                  </div>
                  <div>
                    <div className="hstat-label">Velocity</div>
                    <div className="hstat-val">+23%</div>
                    <div className="hstat-sub">↑ Higher</div>
                  </div>
                  <div>
                    <div className="hstat-label">Maintenance</div>
                    <div className="hstat-val">High</div>
                    <div className="hstat-sub orange">Healthy</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 4 METRIC CARDS ── */}
          <div className="metrics-4">
            {/* Bus Factor */}
            <div className="metric-card">
              <div className="metric-card-label">Bus Factor</div>
              <div className="metric-card-bars">
                {[40, 60, 45, 80, 95, 70].map((h, i) => (
                  <span key={i} style={{ height: `${h}%` }} className={h >= 80 ? 'hi' : h >= 55 ? 'md' : ''} />
                ))}
              </div>
              <div className="metric-card-val">High</div>
              <div className="metric-card-sub">Last 30 days</div>
            </div>

            {/* PR Velocity */}
            <div className="metric-card">
              <div className="metric-card-label">PR Velocity</div>
              <div className="metric-chart">
                <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path d="M0,35 Q10,5 20,25 T40,15 T60,30 T80,5 T100,20" fill="none" stroke="#FF5E00" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="metric-card-val">Stable</div>
              <div className="metric-card-sub" style={{ color: 'var(--green)' }}>+12% avg</div>
            </div>

            {/* Issue Health */}
            <div className="metric-card">
              <div className="metric-card-label">Issue Health</div>
              <div className="metric-donut">
                <div style={{ position: 'relative', width: 52, height: 52 }}>
                  <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox="0 0 52 52">
                    <circle cx="26" cy="26" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                    <circle cx="26" cy="26" r="20" fill="none" stroke="#FF5E00" strokeWidth="6"
                      strokeDasharray="125.66" strokeDashoffset="18.85" strokeLinecap="round" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>85%</div>
                </div>
              </div>
              <div className="metric-card-val">Healthy</div>
              <div className="metric-card-sub">2.4 day closure</div>
            </div>

            {/* Code Churn */}
            <div className="metric-card">
              <div className="metric-card-label">Code Churn</div>
              <div className="metric-chart">
                <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path d="M0,40 L0,30 Q20,35 40,25 T80,35 T100,20 L100,40 Z" fill="rgba(255,94,0,0.08)" />
                  <path d="M0,30 Q20,35 40,25 T80,35 T100,20" fill="none" stroke="#FFA066" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="metric-card-val">Low</div>
              <div className="metric-card-sub" style={{ color: 'var(--green)' }}>-5% risk</div>
            </div>
          </div>

          {/* ── COMMITS TIMELINE ── */}
          <div className="card card-pad">
            <div className="commits-header">
              <div>
                <h3>Commits per Week</h3>
                <p>Developer activity over the last {activeRange}</p>
              </div>
              <div className="range-btns">
                {(["12M", "6M", "30D"] as const).map((r) => (
                  <button key={r} className={`range-btn${activeRange === r ? ' active' : ''}`} onClick={() => setActiveRange(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div className="commits-chart">
              <svg viewBox="0 0 1200 180" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="commitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FF5E00" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#FF5E00" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,140 Q100,80 200,110 T400,70 T600,100 T800,50 T1000,90 L1200,30 L1200,180 L0,180 Z" fill="url(#commitGrad)" />
                <path d="M0,140 Q100,80 200,110 T400,70 T600,100 T800,50 T1000,90 L1200,30" fill="none" stroke="#FF5E00" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="commits-labels">
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => <span key={m}>{m}</span>)}
            </div>
          </div>

          {/* ── RISK FLAGS ── */}
          <div className="flags-grid">
            <div className="flag-card danger">
              <span className="flag-icon danger">⚠</span>
              <div>
                <div className="flag-title danger">Critical Risk</div>
                <div className="flag-desc">Unmaintained dependencies detected.</div>
              </div>
            </div>
            <div className="flag-card warn">
              <span className="flag-icon warn">!</span>
              <div>
                <div className="flag-title warn">Attention Needed</div>
                <div className="flag-desc">Security scan pending for 3 PRs.</div>
              </div>
            </div>
            <div className="flag-card success">
              <span className="flag-icon success">✓</span>
              <div>
                <div className="flag-title success">Code Quality</div>
                <div className="flag-desc">Zero linting errors in latest master.</div>
              </div>
            </div>
            <div className="flag-card info">
              <span className="flag-icon info">ℹ</span>
              <div>
                <div className="flag-title info">Community</div>
                <div className="flag-desc">High engagement on Discussion board.</div>
              </div>
            </div>
          </div>

          {/* ── AI ANALYSIS ── */}
          <div className="card card-pad ai-panel">
            <div className="ai-panel-header">
              <div className="ai-icon-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <h3>AI Deep Analysis</h3>
            </div>
            <p className="ai-text">
              Based on recent commit patterns, <strong>{owner}/{repo}</strong> is currently optimizing for memory efficiency in concurrent rendering. We noticed a <strong style={{ color: 'var(--green)' }}>15% reduction</strong> in object allocation churn over the last 14 days.
            </p>
            <div className="ai-recs">
              <div className="ai-rec">
                <div className="ai-rec-label">Recommendation 1</div>
                <p>Expand unit tests for the new Scheduler hooks to maintain high coverage before next release.</p>
              </div>
              <div className="ai-rec">
                <div className="ai-rec-label">Recommendation 2</div>
                <p>Invite more community maintainers to the &apos;documentation&apos; tag to reduce PR wait times.</p>
              </div>
            </div>
          </div>

          {/* ── VITAL BADGES ── */}
          <div className="card card-pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Vital Badges</span>
            </div>
            <div className="badge-section-grid">
              <div>
                <div className="badge-section-label">Preview</div>
                <div className="badge-preview">
                  <div className="badge-pill">
                    <span className="badge-pill-left">GIT VITAL</span>
                    <span className="badge-pill-right">HEALTH 89/100</span>
                  </div>
                  <div className="badge-pill">
                    <span className="badge-pill-left">GIT VITAL</span>
                    <span className="badge-pill-right orange">12 MAINTAINERS</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="badge-section-label">Embed in README</div>
                <div className="badge-code-wrap">
                  <div className="badge-code">{`[![Git Vital](https://gitvital.com/badge/${owner}/${repo}.svg)](https://gitvital.com/repo/${owner}/${repo})`}</div>
                  <button className="badge-copy-btn" onClick={copyBadge}>{copyDone ? "✓ Copied" : "Copy"}</button>
                </div>
              </div>
            </div>
          </div>

        </main>

        {/* ── FOOTER ── */}
        <footer style={{ borderTop: '1px solid var(--border)', padding: '24px', maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-muted)', flexWrap: 'wrap', gap: 12 }}>
          <span>© 2024 Git Vital Analytics</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="#" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Documentation</a>
            <a href="#" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>API</a>
            <a href="#" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Status</a>
            <a href="#" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Terms</a>
          </div>
        </footer>
      </div>
    </>
  );
}