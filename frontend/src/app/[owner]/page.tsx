"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { API_BASE, AUTH_URL } from "@/config";

// Orange-family palette (matches landing and compare pages)
const COLORS = {
  orange: "#FF5E00",
  orangeLight: "#FFA066",
  green: "#22c55e",
  emerald: "#10b981",
  secondary: "#0ea5e9", // Keeping blue for secondary accents
};

export default function UserProfilePage() {
  const params = useParams<{ owner: string }>();
  const owner = params?.owner ?? "octocat";
  const router = useRouter();

  const [following, setFollowing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [user, setUser] = useState<{ loggedIn: boolean; githubUsername?: string } | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/me`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setUser(data))
      .catch(() => setUser({ loggedIn: false }));
  }, []);

  // Fallback sparklines for repo cards
  const sparklineData = [
    [65, 72, 68, 85, 92, 88, 98],
    [40, 55, 48, 70, 75, 82, 94],
    [80, 82, 85, 83, 88, 87, 89],
    [90, 92, 95, 94, 96, 98, 97],
    [60, 65, 72, 70, 85, 88, 92]
  ];

  function sparkPath(data: number[]): string {
    const max = Math.max(...data, 1);
    const min = Math.min(...data);
    const range = max - min || 1;
    const w = 100 / Math.max(data.length - 1, 1);
    return data.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * w).toFixed(1)},${(40 - ((v - min) / range) * 36).toFixed(1)}`).join(' ');
  }

  function mkSpark(data: number[], color: string) {
    const path = sparkPath(data);
    const areaPath = `${path} L100,40 L0,40 Z`;
    const gradId = `sg-${color.replace('#', '')}-${Math.random().toString(36).substr(2, 5)}`;

    return (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="spark-svg">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #080909; --bg-surface: #0f1011; --bg-card: #111314; --bg-card-hover: #161819;
          --border: rgba(255,255,255,0.055); --border-hover: rgba(255,255,255,0.12);
          --text: #f4f4f5; --text-secondary: #a1a1aa; --text-muted: #52525b;
          --green: #22c55e; --green-dim: rgba(34,197,94,0.12);
          --yellow: #eab308; --yellow-dim: rgba(234,179,8,0.12);
          --red: #ef4444; --red-dim: rgba(239,68,68,0.12);
          --orange: #FF5E00; --orange-light: #FFA066; --orange-dim: rgba(255,94,0,0.12);
          --font: 'Inter', system-ui, sans-serif; --mono: 'Geist Mono', monospace;
        }
        body { font-family: var(--font); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }

        /* NAV */
        .cmp-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 58px;
          display: flex; align-items: center; padding: 0 24px;
          background: rgba(8,9,9,0.80); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .cmp-nav-inner { width: 100%; max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .cmp-logo { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
        .cmp-logo img { height: 36px; }
        .nav-search {
          flex: 1; max-width: 400px; position: relative;
        }
        .nav-search input {
          width: 100%; background: rgba(255,255,255,0.04); border: 1px solid var(--border);
          border-radius: 8px; padding: 6px 14px 6px 36px; color: var(--text); font-size: 13px;
          transition: border-color 0.2s;
        }
        .nav-search input:focus { outline: none; border-color: rgba(255,94,0,0.4); }
        .nav-search span { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 16px; }
        
        .nav-icons { display: flex; align-items: center; gap: 16px; }
        .nav-links-inline { display: flex; gap: 20px; align-items: center; margin-right: 16px; }
        .nav-link { color: var(--text-muted); font-size: 13px; text-decoration: none; }
        .nav-link-profile { color: var(--orange); font-size: 13px; text-decoration: none; font-weight: 700; }
        .nav-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; position: relative; transition: color 0.2s; }
        .nav-btn:hover { color: var(--text); }
        .nav-btn-dot { position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; background: var(--orange); border-radius: 50%; }
        
        .nav-user {
          display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px;
          background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 20px;
          cursor: pointer; transition: background 0.2s;
        }
        .nav-user:hover { background: rgba(255,255,255,0.08); }
        .nav-avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--orange-dim); color: var(--orange); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
        .nav-username { font-size: 12px; font-weight: 600; }

        /* PAGE HEADER */
        .page-main { max-width: 1200px; margin: 0 auto; padding: 90px 24px 60px; display: flex; flex-direction: column; gap: 32px; }
        
        .profile-hdr {
          position: relative; background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 24px; padding: 40px; overflow: hidden;
          display: flex; gap: 40px; align-items: center;
        }
        .profile-glow {
          position: absolute; top: 0; right: 0; width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(255,94,0,0.1) 0%, transparent 70%);
          transform: translate(30%, -30%); pointer-events: none;
        }
        
        .profile-avatar-wrapper { position: relative; flex-shrink: 0; }
        .profile-avatar-img { width: 140px; height: 140px; border-radius: 50%; object-fit: cover; border: 4px solid var(--bg); box-shadow: 0 0 0 2px var(--orange-dim); }
        .profile-score-badge {
          position: absolute; bottom: -5px; right: -5px; background: var(--bg);
          border-radius: 50%; padding: 4px; display: flex; align-items: center; justify-content: center;
        }
        .score-circle { width: 48px; height: 48px; position: relative; }
        .score-circle svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .score-circle circle.bg { stroke: rgba(255,255,255,0.1); fill: none; stroke-width: 3.5; }
        .score-circle circle.fg { stroke: var(--orange); fill: none; stroke-width: 3.5; stroke-dasharray: 125; stroke-dashoffset: 2.5; stroke-linecap: round; }
        .score-circle span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: var(--orange); }

        .profile-info { flex: 1; }
        .profile-name { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .profile-name h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.04em; }
        .profile-tag { background: var(--orange-dim); color: var(--orange-light); border: 1px solid rgba(255,94,0,0.2); padding: 2px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
        .profile-title { font-size: 16px; color: var(--text-secondary); margin-bottom: 20px; }
        
        .profile-meta { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
        .meta-item { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; }
        .meta-item .material-symbols-outlined { font-size: 16px; }
        .icon-orange { color: #FF5E00; }
        .icon-secondary { color: #0ea5e9; }
        .icon-muted { color: #52525b; }

        .profile-actions { display: flex; gap: 12px; }
        .btn-primary {
          background: var(--orange); color: #fff; border: 1px solid rgba(255,94,0,0.5);
          border-radius: 12px; padding: 10px 24px; font-size: 14px; font-weight: 600; cursor: pointer;
          transition: background 0.2s, box-shadow 0.2s;
        }
        .btn-primary:hover { background: #D94E00; box-shadow: 0 0 20px rgba(255,94,0,0.3); }
        .btn-secondary {
          background: rgba(255,255,255,0.04); color: var(--text); border: 1px solid var(--border);
          border-radius: 12px; padding: 10px 24px; font-size: 14px; font-weight: 600; cursor: pointer;
          transition: background 0.2s;
        }
        .btn-secondary:hover { background: rgba(255,255,255,0.08); }

        .profile-score-summary {
          text-align: center; padding: 20px 30px; background: rgba(255,255,255,0.02);
          border: 1px solid var(--border); border-radius: 16px;
        }
        .score-summary-th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 4px; display: block; }
        .score-summary-val { font-size: 48px; font-weight: 800; line-height: 1; letter-spacing: -0.05em; color: var(--orange); margin-bottom: 12px; display: block; }
        .score-reliability-row { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .score-reliability-label { color: var(--text-muted); }
        .score-reliability-value { color: var(--orange-light); }
        .score-summary-bar { width: 100px; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; margin: 0 auto; }
        .score-summary-bar-fill { height: 100%; background: var(--orange); width: 98%; }

        /* ACHIEVEMENTS */
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .section-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
        .section-title .material-symbols-outlined { color: var(--orange); }
        .section-link { color: var(--orange-light); font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; }
        .section-link:hover { text-decoration: underline; }

        .achievements-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; overflow-x: auto; padding-bottom: 8px; }
        .badge-card {
          background: var(--bg-card); border: 1px solid var(--border); border-top: 2px solid var(--orange);
          border-radius: 16px; padding: 20px; display: flex; flex-direction: column; align-items: center; text-align: center;
          transition: border-color 0.2s, transform 0.2s; cursor: pointer; min-width: 200px;
        }
        .badge-card:hover { border-color: var(--border-hover); transform: translateY(-2px); }
        .badge-icon-wrapper { width: 56px; height: 56px; border-radius: 50%; background: var(--orange-dim); color: var(--orange); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .badge-icon-wrapper .material-symbols-outlined { font-size: 28px; }
        .badge-title { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
        .badge-desc { font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; }
        .badge-level { font-family: var(--mono); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--orange-light); }
        .badge-card.tone-orange { border-top-color: #FF5E00; }
        .badge-card.tone-secondary { border-top-color: #0ea5e9; }
        .badge-card.tone-emerald { border-top-color: #10b981; }
        .badge-card.tone-orange-light { border-top-color: #FFA066; }
        .badge-card.tone-orange .badge-icon-wrapper { color: #FF5E00; background: rgba(255,94,0,0.12); }
        .badge-card.tone-secondary .badge-icon-wrapper { color: #0ea5e9; background: rgba(14,165,233,0.12); }
        .badge-card.tone-emerald .badge-icon-wrapper { color: #10b981; background: rgba(16,185,129,0.12); }
        .badge-card.tone-orange-light .badge-icon-wrapper { color: #FFA066; background: rgba(255,160,102,0.12); }
        .badge-card.tone-orange .badge-level { color: #FF5E00; }
        .badge-card.tone-secondary .badge-level { color: #0ea5e9; }
        .badge-card.tone-emerald .badge-level { color: #10b981; }
        .badge-card.tone-orange-light .badge-level { color: #FFA066; }

        /* REPOSITORIES */
        .repo-controls { display: flex; gap: 12px; align-items: center; }
        .repo-last-analyzed { font-size: 13px; color: var(--text-muted); }
        .repo-controls select {
          background: var(--bg-card); border: 1px solid var(--border); color: var(--text);
          padding: 6px 12px; border-radius: 8px; font-size: 13px; outline: none; cursor: pointer;
        }
        .repo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .repo-card {
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px;
          padding: 24px; transition: border-color 0.2s; cursor: pointer;
        }
        .repo-card:hover { border-color: rgba(255,94,0,0.4); }
        
        .repo-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
        .repo-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
        .repo-health { display: flex; flex-direction: column; align-items: flex-end; }
        .repo-health-lbl { font-family: var(--mono); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .repo-health-val { font-size: 18px; font-weight: 800; color: var(--green); }
        
        .repo-name { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; transition: color 0.2s; }
        .repo-card:hover .repo-name { color: var(--orange-light); }
        .repo-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        
        .repo-spark { height: 40px; margin-bottom: 16px; }
        
        .repo-foot { display: flex; justify-content: space-between; align-items: center; }
        .repo-lang { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; }
        .repo-lang-dot { width: 10px; height: 10px; border-radius: 50%; }
        .lang-typescript { background-color: #3b82f6; }
        .lang-javascript { background-color: #eab308; }
        .lang-json { background-color: #94a3b8; }
        .lang-graphql { background-color: #ec4899; }
        .repo-stars { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-muted); }

        .repo-card-add {
          border: 1px dashed var(--border); background: transparent; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 12px; transition: border-color 0.2s, background 0.2s;
        }
        .repo-card-add:hover { border-color: var(--orange-dim); background: rgba(255,94,0,0.02); }
        .repo-add-icon { width: 48px; height: 48px; border-radius: 50%; background: var(--bg-surface); display: flex; align-items: center; justify-content: center; color: var(--text-muted); transition: color 0.2s; }
        .repo-card-add:hover .repo-add-icon { color: var(--orange); }
        .repo-add-text { font-size: 14px; font-weight: 600; color: var(--text-secondary); }

        /* FOOTER */
        .site-footer {
          margin-top: 60px; padding: 30px 24px; border-top: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;
        }
        .footer-left { display: flex; align-items: center; gap: 12px; }
        .footer-icon { width: 28px; height: 28px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--orange); }
        .footer-text { font-size: 13px; color: var(--text-muted); font-weight: 500; }
        .footer-links { display: flex; gap: 24px; }
        .footer-links a { color: var(--text-muted); font-size: 13px; text-decoration: none; transition: color 0.2s; }
        .footer-links a:hover { color: var(--orange-light); }

        /* TOOLTIP */
        .custom-tooltip {
          position: absolute; top: 100%; right: 0; transform: translateY(8px);
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
          padding: 8px 12px; font-size: 12px; color: var(--text); white-space: nowrap;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 200;
        }

        .spark-svg { width: 100%; height: 100%; overflow: visible; }
        .profile-root { background: var(--bg); min-height: 100vh; font-family: var(--font); color: var(--text); }

        @media (max-width: 900px) {
          .profile-hdr { flex-direction: column; text-align: center; gap: 24px; }
          .profile-info { display: flex; flex-direction: column; align-items: center; }
          .profile-meta { justify-content: center; }
          .achievements-grid { grid-template-columns: repeat(2, 1fr); }
          .repo-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .achievements-grid, .repo-grid { grid-template-columns: 1fr; }
          .nav-search { display: none; }
          .page-main { padding-top: 80px; }
        }
      ` }} />

      <div className="profile-root">

        {/* NAV */}
        <nav className="cmp-nav">
          <div className="cmp-nav-inner">
            <div className="cmp-logo" onClick={() => router.push("/")}>
              <img src="/gitvital_logo_fixed.svg" alt="GitVital" />
            </div>

            <div className="nav-search">
              <span className="material-symbols-outlined">search</span>
              <input
                type="text"
                placeholder="Search developers or repos..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = (e.currentTarget.value || "").trim();
                    if (v) router.push(`/${v}`);
                  }
                }}
              />
            </div>

            <div className="nav-icons">
              <div className="nav-links-inline">
                <a href="/" className="nav-link">Explore</a>
                <a href="/leaderboard" className="nav-link">Leaderboard</a>
                {user?.loggedIn ? (
                  <a href={`/${user.githubUsername}`} className="nav-link-profile">My Profile</a>
                ) : (
                  <a href={AUTH_URL} className="nav-link">Login</a>
                )}
              </div>
              <div className="nav-user">
                <div className="nav-avatar">{owner.charAt(0).toUpperCase()}</div>
                <span className="nav-username">{owner}</span>
              </div>
            </div>
          </div>
        </nav>

        <main className="page-main">
          {/* PROFILE HEADER */}
          <section className="profile-hdr">
            <div className="profile-glow" />

            <div className="profile-avatar-wrapper">
              <img
                alt={`${owner} Avatar`}
                className="profile-avatar-img"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBJRIpAZMrL1w0X_FCznbO5S5g5JJK02ZQHDV3U8vl4nItvTfY1E6az99HkNEGc8Oic_nuO1A9cQJzLcZK012pErefI7fCHwSJvhAxOPZfU4wqQdJWP5eMOtcWMz9OC-td-iAqbeCYiZKl5XH_2cQcFNbef0e-y9SqWgHYuOKumGJAAXGpyK-RJZL5R51As6rtruFS-_RWITUMBU8NvYov5DvOVq2ruXTdgErpMowYHQTCgZ9HszcUpi_xMxjlpWTSrByBB2jnJHsc"
              />
              <div className="profile-score-badge">
                <div className="score-circle">
                  <svg viewBox="0 0 40 40">
                    <circle className="bg" cx="20" cy="20" r="18" />
                    <circle className="fg" cx="20" cy="20" r="18" strokeDasharray="113" strokeDashoffset="2" />
                  </svg>
                  <span>98%</span>
                </div>
              </div>
            </div>

            <div className="profile-info">
              <div className="profile-name">
                <h1>{owner}</h1>
                <span className="profile-tag">Top 5% Global</span>
              </div>
              <p className="profile-title">Senior Full Stack Engineer @ GitHub</p>

              <div className="profile-meta">
                <div className="meta-item"><span className="material-symbols-outlined icon-orange">code</span> TypeScript Expert</div>
                <div className="meta-item"><span className="material-symbols-outlined icon-secondary">location_on</span> San Francisco, CA</div>
                <div className="meta-item"><span className="material-symbols-outlined icon-muted">calendar_today</span> Joined 2011</div>
              </div>
            </div>

            <div className="profile-score-summary hidden lg:block">
              <span className="score-summary-th">Developer Score</span>
              <span className="score-summary-val">98</span>
              <div className="score-reliability-row">
                <span className="score-reliability-label">Reliability</span>
                <span className="score-reliability-value">99%</span>
              </div>
              <div className="score-summary-bar">
                <div className="score-summary-bar-fill"></div>
              </div>
            </div>
          </section>

          {/* ACHIEVEMENTS */}
          <section>
            <div className="section-header">
              <h3 className="section-title"><span className="material-symbols-outlined">military_tech</span> Achievement Badges</h3>
              <a href="#" className="section-link">View all 24</a>
            </div>
            <div className="achievements-grid">
              {[
                { title: "Code Warrior", level: "Elite Level", icon: "terminal", tone: "orange", desc: "Merged 500+ Pull Requests in record time" },
                { title: "Speed Demon", level: "Legendary", icon: "bolt", tone: "secondary", desc: "Average issue resolution under 2 hours" },
                { title: "Team Player", level: "Community Pillar", icon: "groups", tone: "emerald", desc: "Contributed to 50+ open source projects" },
                { title: "Exterminator", level: "Veteran", icon: "bug_report", tone: "orange-light", desc: "Found and fixed 10 critical security bugs" },
              ].map((badge, i) => (
                <div key={i} className={`badge-card tone-${badge.tone}`}>
                  <div className="badge-icon-wrapper">
                    <span className="material-symbols-outlined">{badge.icon}</span>
                  </div>
                  <h4 className="badge-title">{badge.title}</h4>
                  <p className="badge-desc">{badge.desc}</p>
                  <span className="badge-level">{badge.level}</span>
                </div>
              ))}
            </div>
          </section>

          {/* REPOSITORIES */}
          <section>
            <div className="section-header">
              <h3 className="section-title"><span className="material-symbols-outlined">data_object</span> Analyzed Repositories</h3>
              <div className="repo-controls">
                <span className="repo-last-analyzed">Last analyzed: 12m ago</span>
                <select aria-label="Sort analyzed repositories" title="Sort analyzed repositories">
                  <option>Health Score</option>
                  <option>Recent Activity</option>
                  <option>Popularity</option>
                </select>
              </div>
            </div>

            <div className="repo-grid">
              {[
                { id: 0, icon: "description", health: "98.2", name: "Spoon-Knife", desc: "Learning fork/pull request workflow on GitHub.", lang: "TypeScript", langClass: "lang-typescript", stars: "12.4k" },
                { id: 1, icon: "settings_suggest", health: "94.5", name: "Octo-Core", desc: "Async engine for distributed systems.", lang: "JavaScript", langClass: "lang-javascript", stars: "2.1k" },
                { id: 2, icon: "auto_graph", health: "89.0", name: "Pulse-CLI", desc: "CLI for RepoPulse analytics and reporting.", lang: "TypeScript", langClass: "lang-typescript", stars: "845" },
                { id: 3, icon: "layers", health: "97.8", name: "Lighthouse-Config", desc: "Shared linting for enterprise scale applications.", lang: "JSON", langClass: "lang-json", stars: "3.4k" },
                { id: 4, icon: "api", health: "92.1", name: "Octo-Graph", desc: "GraphQL API wrapper for repository metadata.", lang: "GraphQL", langClass: "lang-graphql", stars: "560" },
              ].map((r) => (
                <div key={r.id} className="repo-card" onClick={() => router.push(`/${owner}/${r.name.toLowerCase()}`)}>
                  <div className="repo-card-top">
                    <div className="repo-icon"><span className="material-symbols-outlined">{r.icon}</span></div>
                    <div className="repo-health">
                      <span className="repo-health-lbl">Health</span>
                      <span className="repo-health-val">{r.health}</span>
                    </div>
                  </div>

                  <h4 className="repo-name">{r.name}</h4>
                  <p className="repo-desc">{r.desc}</p>

                  <div className="repo-spark">
                    {mkSpark(sparklineData[r.id % sparklineData.length], COLORS.orange)}
                  </div>

                  <div className="repo-foot">
                    <div className="repo-lang">
                      <span className={`repo-lang-dot ${r.langClass}`}></span>
                      {r.lang}
                    </div>
                    <div className="repo-stars">
                      <span className="material-symbols-outlined text-sm">star</span> {r.stars}
                    </div>
                  </div>
                </div>
              ))}

              <div className="repo-card repo-card-add">
                <div className="repo-add-icon"><span className="material-symbols-outlined">add</span></div>
                <div className="repo-add-text">Connect Repository</div>
              </div>
            </div>
          </section>
        </main>

        <footer className="site-footer">
          <div className="footer-left">
            <div className="footer-icon"><span className="material-symbols-outlined text-sm">pulse_alert</span></div>
            <span className="footer-text">© 2024 Git Vital Analytics. Build with integrity.</span>
          </div>
          <div className="footer-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Documentation</a>
          </div>
        </footer>
      </div>
    </>
  );
}
