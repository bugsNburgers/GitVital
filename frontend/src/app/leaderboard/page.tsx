"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, AUTH_URL } from "@/config";

type LeaderboardEntry = {
  rank: number;
  name: string;
  handle: string;
  score: number;
  lang: string;
  repos: number;
  percentile: string;
  tier: "gold" | "silver" | "bronze" | "other";
  img: string;
};

type LeaderboardStats = {
  totalDevelopers: number;
  totalRepos: number;
};

type LeaderboardApiResponse = {
  leaderboard: LeaderboardEntry[];
  filter: string;
  updatedAt: string | null;
  stats: LeaderboardStats | null;
};

const PAGE_SIZE = 10;

function formatRelative(iso: string | null): string {
  if (!iso) return "unknown";
  const delta = Date.now() - new Date(iso).getTime();
  if (delta < 0) return "just now";
  const h = Math.floor(delta / 3_600_000);
  const m = Math.floor((delta % 3_600_000) / 60_000);
  if (h === 0) return `${m}m ago`;
  if (h < 24) return `${h}h ${m}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [langFilter, setLangFilter] = useState("All Languages");
  const [currentPage, setCurrentPage] = useState(1);
  const [user, setUser] = useState<{ loggedIn: boolean; githubUsername?: string } | null>(null);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUser(d))
      .catch(() => setUser({ loggedIn: false }));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = langFilter !== "All Languages"
      ? `${API_BASE}/api/leaderboard?lang=${encodeURIComponent(langFilter)}`
      : `${API_BASE}/api/leaderboard`;
    fetch(url, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<LeaderboardApiResponse>;
      })
      .then((data) => {
        setLeaders(Array.isArray(data.leaderboard) ? data.leaderboard : []);
        setUpdatedAt(data.updatedAt ?? null);
        setStats(data.stats ?? null);
      })
      .catch((e) => setError(e.message ?? "Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }, [langFilter]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return leaders.filter(
      (l) => l.name.toLowerCase().includes(q) || l.handle.toLowerCase().includes(q),
    );
  }, [leaders, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const userInLeaderboard = user?.loggedIn && user.githubUsername
    ? leaders.some((l) => l.handle.replace("@", "").toLowerCase() === user.githubUsername!.toLowerCase())
    : false;

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #080909; --bg-surface: #0f1011; --bg-card: #111314;
          --border: rgba(255,255,255,0.055); --border-hover: rgba(255,255,255,0.12);
          --text: #f4f4f5; --text-secondary: #a1a1aa; --text-muted: #52525b;
          --orange: #FF5E00; --orange-light: #FFA066; --orange-dim: rgba(255,94,0,0.12);
          --green: #22c55e; --blue: #3b82f6;
          --font: 'Inter', system-ui, sans-serif; --mono: 'Geist Mono', monospace;
        }
        body { font-family: var(--font); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }

        /* NAV */
        .lb-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 58px; display: flex; align-items: center; padding: 0 24px; background: rgba(8,9,9,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
        .lb-nav-inner { width: 100%; max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .lb-logo { display: flex; align-items: center; cursor: pointer; }
        .lb-logo img { height: 36px; }
        .lb-nav-links { display: flex; align-items: center; gap: 24px; }
        .lb-nav-links a { color: var(--text-muted); font-size: 13px; font-weight: 600; text-decoration: none; transition: color 0.2s; }
        .lb-nav-links a:hover { color: var(--text); }
        .lb-nav-links a.active { color: var(--orange); border-bottom: 2px solid var(--orange); padding-bottom: 2px; }
        .lb-nav-search { position: relative; }
        .lb-nav-search input { background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 8px; padding: 6px 14px 6px 36px; color: var(--text); font-size: 13px; width: 220px; transition: border-color 0.2s; outline: none; }
        .lb-nav-search input:focus { border-color: rgba(255,94,0,0.4); }
        .lb-nav-search span { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 17px; }

        /* LAYOUT */
        .lb-root { background: var(--bg); min-height: 100vh; color: var(--text); font-family: var(--font); }
        .lb-main { max-width: 1200px; margin: 0 auto; padding: 84px 24px 60px; }
        .lb-profile-link { color: var(--orange) !important; }

        /* HERO */
        .lb-hero { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 24px; margin-bottom: 40px; }
        .lb-hero-title { font-size: clamp(32px, 5vw, 48px); font-weight: 800; letter-spacing: -0.04em; line-height: 1.1; }
        .lb-hero-title span { color: var(--orange); }
        .lb-hero-sub { font-size: 15px; color: var(--text-secondary); margin-top: 10px; max-width: 520px; line-height: 1.6; }
        .lb-hero-meta { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; color: var(--text-muted); }
        .lb-hero-meta span.material-symbols-outlined { font-size: 14px; }
        .lb-filter { display: flex; flex-direction: column; gap: 6px; min-width: 200px; }
        .lb-filter label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .lb-filter select { background: var(--bg-card); border: 1px solid var(--border); color: var(--text); border-radius: 10px; padding: 9px 36px 9px 14px; font-size: 13px; font-weight: 500; appearance: none; outline: none; cursor: pointer; transition: border-color 0.2s; }
        .lb-filter select:focus { border-color: rgba(255,94,0,0.4); }
        .lb-filter-wrap { position: relative; }
        .lb-filter-wrap span { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; font-size: 18px; }

        /* STAT CARDS */
        .lb-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
        .lb-stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 20px 24px; display: flex; align-items: center; gap: 16px; }
        .lb-stat-icon { width: 48px; height: 48px; border-radius: 12px; background: var(--orange-dim); display: flex; align-items: center; justify-content: center; color: var(--orange); flex-shrink: 0; }
        .lb-stat-icon span { font-size: 22px; }
        .lb-stat-val { font-size: 22px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 2px; }
        .lb-stat-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .lb-stat-skel { width: 80px; height: 24px; border-radius: 6px; background: rgba(255,255,255,0.06); animation: lb-pulse 1.4s ease-in-out infinite; }
        @keyframes lb-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

        /* JOIN CTA */
        .lb-join-cta { background: linear-gradient(135deg, rgba(255,94,0,0.08), rgba(255,160,102,0.04)); border: 1px solid rgba(255,94,0,0.25); border-radius: 16px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
        .lb-join-cta-text { font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px; }
        .lb-join-cta-text span { font-size: 16px; color: var(--orange); }
        .lb-join-btn { background: var(--orange); color: #fff; border: none; border-radius: 10px; padding: 8px 18px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.2s; text-decoration: none; display: inline-block; }
        .lb-join-btn:hover { background: #D94E00; }

        /* TABLE */
        .lb-table-wrap { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; }
        .lb-table-scroll { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border); }
        thead th { padding: 14px 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); text-align: left; white-space: nowrap; }
        thead th:last-child { text-align: right; }
        tbody tr { border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s; }
        tbody tr:last-child { border-bottom: none; }
        tbody tr:hover { background: rgba(255,94,0,0.04); }
        td { padding: 18px 20px; font-size: 14px; vertical-align: middle; }

        /* SKELETON ROWS */
        .lb-skel-row td { padding: 20px; }
        .lb-skel-avatar { width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.07); animation: lb-pulse 1.4s ease-in-out infinite; display: inline-block; margin-right: 14px; vertical-align: middle; }
        .lb-skel-text { display: inline-block; height: 14px; border-radius: 6px; background: rgba(255,255,255,0.07); animation: lb-pulse 1.4s ease-in-out infinite; vertical-align: middle; }

        .td-rank { width: 72px; }
        .rank-medal { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .rank-medal span { font-size: 20px; }
        .rank-medal.rank-gold { background: rgba(234,179,8,0.12); }
        .rank-medal.rank-silver { background: rgba(148,163,184,0.12); }
        .rank-medal.rank-bronze { background: rgba(234,88,12,0.12); }
        .rank-medal.rank-gold span { color: #eab308; }
        .rank-medal.rank-silver span { color: #94a3b8; }
        .rank-medal.rank-bronze span { color: #ea580c; }
        .rank-num { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; font-family: var(--mono); color: var(--text-muted); }

        .td-dev { min-width: 200px; }
        .dev-row { display: flex; align-items: center; gap: 14px; }
        .dev-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .dev-avatar.tier-gold { border: 2px solid rgba(234,179,8,0.4); }
        .dev-avatar.tier-silver { border: 2px solid rgba(148,163,184,0.4); }
        .dev-avatar.tier-bronze { border: 2px solid rgba(234,88,12,0.4); }
        .dev-avatar.tier-other { border: 2px solid transparent; }
        .dev-name { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
        .dev-handle { font-size: 12px; color: var(--text-muted); }

        .td-score { font-family: var(--mono); font-size: 16px; font-weight: 800; color: var(--orange); white-space: nowrap; }
        .lang-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; background: var(--orange-dim); border: 1px solid rgba(255,94,0,0.2); color: var(--orange-light); font-size: 11px; font-weight: 700; }
        .td-repos { color: var(--text-secondary); font-weight: 600; }
        .td-pct { text-align: right; }
        .pct-badge { display: inline-block; padding: 3px 10px; border-radius: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .pct-gold   { background: rgba(234,179,8,0.15);  color: #eab308; border: 1px solid rgba(234,179,8,0.3); }
        .pct-silver { background: rgba(148,163,184,0.1); color: #94a3b8; border: 1px solid rgba(148,163,184,0.25); }
        .pct-bronze { background: rgba(234,88,12,0.1);  color: #ea580c; border: 1px solid rgba(234,88,12,0.25); }
        .pct-other  { background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid var(--border); }

        /* EMPTY STATE */
        .lb-empty { text-align: center; padding: 64px 24px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
        .lb-empty-icon { font-size: 48px; color: var(--text-muted); }
        .lb-empty h3 { font-size: 20px; font-weight: 700; }
        .lb-empty p { font-size: 14px; color: var(--text-secondary); max-width: 340px; line-height: 1.6; }

        /* ERROR */
        .lb-error { background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.25); border-radius: 14px; padding: 20px 24px; font-size: 14px; color: #fca5a5; margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }

        /* PAGINATION */
        .lb-pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-top: 28px; padding: 0 4px; }
        .lb-info { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
        .pg-controls { display: flex; align-items: center; gap: 8px; }
        .pg-btn { padding: 7px 16px; border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; transition: color 0.2s, border-color 0.2s; }
        .pg-btn:hover:not(:disabled) { color: var(--orange); border-color: rgba(255,94,0,0.3); }
        .pg-btn:disabled { opacity: 0.3; cursor: default; }
        .pg-num { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.15s, color 0.15s; }
        .pg-num.active { background: var(--orange); color: #fff; }
        .pg-num:not(.active):hover { background: rgba(255,255,255,0.06); }

        /* FOOTER */
        .lb-footer { margin-top: 60px; border-top: 1px solid var(--border); padding: 28px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; max-width: 1200px; margin-left: auto; margin-right: auto; }
        .lb-footer-text { font-size: 13px; color: var(--text-muted); }
        .lb-footer-links { display: flex; gap: 24px; }
        .lb-footer-links a { font-size: 13px; color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
        .lb-footer-links a:hover { color: var(--orange-light); }

        @media (max-width: 900px) { .lb-stats { grid-template-columns: 1fr; } .lb-nav-links { display: none; } .td-repos { display: none; } }
        @media (max-width: 600px) { .lb-nav-search { display: none; } .lang-badge { display: none; } .lb-hero { flex-direction: column; align-items: flex-start; } }
        ` }} />

      <div className="lb-root">
        {/* NAV */}
        <nav className="lb-nav">
          <div className="lb-nav-inner">
            <div className="lb-logo" onClick={() => router.push("/")}>
              <img src="/gitvital_logo_fixed.svg" alt="GitVital" />
            </div>
            <div className="lb-nav-links">
              <a href="/">Explore</a>
              <a href="/leaderboard" className="active">Leaderboard</a>
              <a href="/compare">Compare</a>
              {user?.loggedIn ? (
                <a href={`/${user.githubUsername}`} className="lb-profile-link">View Profile</a>
              ) : (
                <a href={AUTH_URL}>Login</a>
              )}
            </div>
            <div className="lb-nav-search">
              <span className="material-symbols-outlined">search</span>
              <input
                ref={searchRef}
                type="text"
                placeholder="Search developers..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </div>
        </nav>

        <main className="lb-main">
          {/* HERO */}
          <div className="lb-hero">
            <div>
              <h1 className="lb-hero-title">Developer <span>Leaderboard</span></h1>
              <p className="lb-hero-sub">Recognizing the world&apos;s most impactful open-source contributors based on verified repo health, velocity, and community impact.</p>
              <div className="lb-hero-meta">
                <span className="material-symbols-outlined">update</span>
                {loading ? "Loading…" : updatedAt
                  ? `Updated daily at 3 AM · Last refresh: ${formatRelative(updatedAt)}`
                  : "Scores updated nightly · Analyze your repos to appear here"}
              </div>
            </div>
            <div className="lb-filter">
              <label>Filter by Language</label>
              <div className="lb-filter-wrap">
                <select
                  value={langFilter}
                  onChange={(e) => { setLangFilter(e.target.value); setCurrentPage(1); }}
                  aria-label="Filter developers by language"
                  title="Filter developers by language"
                >
                  <option>All Languages</option>
                  <option>TypeScript</option>
                  <option>JavaScript</option>
                  <option>Python</option>
                  <option>Rust</option>
                  <option>Go</option>
                  <option>Vue</option>
                  <option>React</option>
                  <option>CSS</option>
                  <option>Java</option>
                  <option>C++</option>
                </select>
                <span className="material-symbols-outlined">expand_more</span>
              </div>
            </div>
          </div>

          {/* STAT CARDS */}
          <div className="lb-stats">
            {[
              {
                icon: "groups",
                val: loading ? null : stats ? compactNum(stats.totalDevelopers) : "—",
                lbl: "Ranked Developers",
              },
              {
                icon: "code_blocks",
                val: loading ? null : stats ? compactNum(stats.totalRepos) : "—",
                lbl: "Repos Analyzed",
              },
              {
                icon: "bolt",
                val: loading ? null : updatedAt ? "Daily" : "Nightly",
                lbl: "Update Frequency",
              },
            ].map((s) => (
              <div key={s.lbl} className="lb-stat-card">
                <div className="lb-stat-icon"><span className="material-symbols-outlined">{s.icon}</span></div>
                <div>
                  {s.val === null
                    ? <div className="lb-stat-skel" />
                    : <div className="lb-stat-val">{s.val}</div>
                  }
                  <div className="lb-stat-lbl">{s.lbl}</div>
                </div>
              </div>
            ))}
          </div>

          {/* JOIN CTA — only when logged in but not in leaderboard yet */}
          {user?.loggedIn && !loading && leaders.length > 0 && !userInLeaderboard && (
            <div className="lb-join-cta">
              <div className="lb-join-cta-text">
                <span className="material-symbols-outlined">emoji_events</span>
                You&apos;re not on the leaderboard yet — analyze your repos to get your developer score.
              </div>
              <a href={`/${user.githubUsername}`} className="lb-join-btn">Go to my profile →</a>
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div className="lb-error">
              <span className="material-symbols-outlined">error</span>
              {error}
            </div>
          )}

          {/* TABLE */}
          <div className="lb-table-wrap">
            <div className="lb-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="td-rank">Rank</th>
                    <th>Developer</th>
                    <th>Score</th>
                    <th>Language</th>
                    <th className="td-repos">Repos</th>
                    <th>Percentile</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    // Skeleton rows
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="lb-skel-row">
                        <td><div className="lb-skel-text" style={{ width: 36, height: 36, borderRadius: "50%" }} /></td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <span className="lb-skel-avatar" />
                            <div>
                              <div className="lb-skel-text" style={{ width: 120, marginBottom: 6 }} />
                              <div className="lb-skel-text" style={{ width: 80, height: 10 }} />
                            </div>
                          </div>
                        </td>
                        <td><div className="lb-skel-text" style={{ width: 50 }} /></td>
                        <td><div className="lb-skel-text" style={{ width: 70 }} /></td>
                        <td className="td-repos"><div className="lb-skel-text" style={{ width: 30 }} /></td>
                        <td><div className="lb-skel-text" style={{ width: 60, marginLeft: "auto" }} /></td>
                      </tr>
                    ))
                  ) : paged.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="lb-empty">
                          <span className="material-symbols-outlined lb-empty-icon">leaderboard</span>
                          <h3>{leaders.length === 0 ? "Leaderboard is building" : "No results"}</h3>
                          <p>
                            {leaders.length === 0
                              ? "Scores are computed nightly. Analyze your repos and check back tomorrow — or be the first!"
                              : "No developers match your search or filter."}
                          </p>
                          {leaders.length === 0 && user?.loggedIn && (
                            <a href={`/${user.githubUsername}`} className="lb-join-btn" style={{ marginTop: 8 }}>
                              Analyze my repos
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paged.map((leader) => (
                      <tr key={leader.handle} onClick={() => router.push(`/${leader.handle.replace("@", "")}`)}>
                        <td className="td-rank">
                          {leader.tier !== "other" ? (
                            <div className={`rank-medal rank-${leader.tier}`}>
                              <span className="material-symbols-outlined">workspace_premium</span>
                            </div>
                          ) : (
                            <div className="rank-num">{leader.rank}</div>
                          )}
                        </td>
                        <td className="td-dev">
                          <div className="dev-row">
                            <img alt={leader.name} className={`dev-avatar tier-${leader.tier}`} src={leader.img} />
                            <div>
                              <div className="dev-name">{leader.name}</div>
                              <div className="dev-handle">{leader.handle}</div>
                            </div>
                          </div>
                        </td>
                        <td className="td-score">{leader.score}</td>
                        <td><span className="lang-badge">{leader.lang}</span></td>
                        <td className="td-repos">{leader.repos}</td>
                        <td className="td-pct">
                          <span className={`pct-badge pct-${leader.tier}`}>{leader.percentile}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* PAGINATION */}
          {!loading && filtered.length > PAGE_SIZE && (
            <div className="lb-pagination">
              <div className="lb-info">
                <span className="material-symbols-outlined">info</span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </div>
              <div className="pg-controls">
                <button className="pg-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>Previous</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                  <div key={p} className={`pg-num ${currentPage === p ? "active" : ""}`} onClick={() => setCurrentPage(p)}>{p}</div>
                ))}
                <button className="pg-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>Next</button>
              </div>
            </div>
          )}
        </main>

        <footer className="lb-footer">
          <span className="lb-footer-text">© 2024 GitVital Analytics. Scores computed server-side from verified GitHub data.</span>
          <div className="lb-footer-links">
            {["Privacy Policy", "Terms of Service", "Documentation"].map((l) => (
              <a key={l} href="#">{l}</a>
            ))}
          </div>
        </footer>
      </div>
    </>
  );
}
