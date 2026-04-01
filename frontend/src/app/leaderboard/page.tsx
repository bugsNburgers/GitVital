"use client";

import { useState, useMemo, useEffect } from "react";
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

type LeaderboardApiResponse = {
  leaderboard: LeaderboardEntry[];
  filter: string;
};

const PAGE_SIZE = 6;

export default function LeaderboardPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [langFilter, setLangFilter] = useState("All Languages");
  const [currentPage, setCurrentPage] = useState(1);
  const [user, setUser] = useState<{ loggedIn: boolean; githubUsername?: string } | null>(null);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/me`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setUser(data))
      .catch(() => setUser({ loggedIn: false }));
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/leaderboard`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch leaderboard");
        }
        return res.json() as Promise<LeaderboardApiResponse>;
      })
      .then((data) => {
        setLeaders(Array.isArray(data.leaderboard) ? data.leaderboard : []);
      })
      .catch(() => {
        setLeaders([]);
      });
  }, []);

  const filtered = useMemo(() => {
    return leaders.filter((l) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = l.name.toLowerCase().includes(q) || l.handle.toLowerCase().includes(q);
      const matchesLang = langFilter === "All Languages" || l.lang === langFilter;
      return matchesSearch && matchesLang;
    });
  }, [leaders, searchQuery, langFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
          --font: 'Inter', system-ui, sans-serif; --mono: 'Geist Mono', monospace;
        }
        body { font-family: var(--font); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }

        /* NAV */
        .lb-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 58px;
          display: flex; align-items: center; padding: 0 24px;
          background: rgba(8,9,9,0.85); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .lb-nav-inner { width: 100%; max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .lb-logo { display: flex; align-items: center; cursor: pointer; }
        .lb-logo img { height: 36px; }
        .lb-nav-links { display: flex; align-items: center; gap: 24px; }
        .lb-nav-links a { color: var(--text-muted); font-size: 13px; font-weight: 600; text-decoration: none; transition: color 0.2s; }
        .lb-nav-links a:hover { color: var(--text); }
        .lb-nav-links a.active { color: var(--orange); border-bottom: 2px solid var(--orange); padding-bottom: 2px; }
        .lb-nav-search { position: relative; }
        .lb-nav-search input {
          background: rgba(255,255,255,0.04); border: 1px solid var(--border);
          border-radius: 8px; padding: 6px 14px 6px 36px; color: var(--text); font-size: 13px;
          width: 220px; transition: border-color 0.2s; outline: none;
        }
        .lb-nav-search input:focus { border-color: rgba(255,94,0,0.4); }
        .lb-nav-search span { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 17px; }

        /* PAGE LAYOUT */
        .lb-root { background: var(--bg); min-height: 100vh; color: var(--text); font-family: var(--font); }
        .lb-main { max-width: 1200px; margin: 0 auto; padding: 84px 24px 60px; }
        .lb-profile-link { color: var(--orange) !important; }

        /* HERO */
        .lb-hero { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 24px; margin-bottom: 40px; }
        .lb-hero-title { font-size: clamp(32px, 5vw, 48px); font-weight: 800; letter-spacing: -0.04em; line-height: 1.1; }
        .lb-hero-title span { color: var(--orange); }
        .lb-hero-sub { font-size: 15px; color: var(--text-secondary); margin-top: 10px; max-width: 520px; line-height: 1.6; }
        .lb-filter { display: flex; flex-direction: column; gap: 6px; min-width: 200px; }
        .lb-filter label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .lb-filter select {
          background: var(--bg-card); border: 1px solid var(--border); color: var(--text);
          border-radius: 10px; padding: 9px 36px 9px 14px; font-size: 13px; font-weight: 500;
          appearance: none; outline: none; cursor: pointer; transition: border-color 0.2s;
        }
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
        .lb-empty-row { text-align: center; padding: 48px; color: var(--text-muted); }

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
        .pct-gold   { background: rgba(234,179,8,0.15);  color: #eab308; border: 1px solid rgba(234,179,8,0.3);  }
        .pct-silver { background: rgba(148,163,184,0.1); color: #94a3b8; border: 1px solid rgba(148,163,184,0.25); }
        .pct-bronze { background: rgba(234,88,12,0.1);  color: #ea580c; border: 1px solid rgba(234,88,12,0.25); }
        .pct-other  { background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid var(--border); }

        /* PAGINATION */
        .lb-pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-top: 28px; padding: 0 4px; }
        .lb-info { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
        .lb-info span { font-size: 16px; }
        .pg-controls { display: flex; align-items: center; gap: 8px; }
        .pg-btn {
          padding: 7px 16px; border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border);
          color: var(--text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; transition: color 0.2s, border-color 0.2s;
        }
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

        @media (max-width: 900px) {
          .lb-stats { grid-template-columns: 1fr; }
          .lb-nav-links { display: none; }
          .td-repos { display: none; }
        }
        @media (max-width: 600px) {
          .lb-nav-search { display: none; }
          .lang-badge { display: none; }
          .lb-hero { flex-direction: column; align-items: flex-start; }
        }
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
              <p className="lb-hero-sub">Recognizing the world&apos;s most impactful open-source contributors based on code quality, velocity, and community impact.</p>
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
                </select>
                <span className="material-symbols-outlined">expand_more</span>
              </div>
            </div>
          </div>

          {/* STAT CARDS */}
          <div className="lb-stats">
            {[
              { icon: "groups", val: "12.4M", lbl: "Active Developers" },
              { icon: "code_blocks", val: "850K", lbl: "Repos Analyzed" },
              { icon: "bolt", val: "Real-time", lbl: "Update Frequency" },
            ].map((s) => (
              <div key={s.lbl} className="lb-stat-card">
                <div className="lb-stat-icon"><span className="material-symbols-outlined">{s.icon}</span></div>
                <div>
                  <div className="lb-stat-val">{s.val}</div>
                  <div className="lb-stat-lbl">{s.lbl}</div>
                </div>
              </div>
            ))}
          </div>

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
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="lb-empty-row">
                        No developers match your filter.
                      </td>
                    </tr>
                  ) : paged.map((leader) => {
                    return (
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
                            <img
                              alt={leader.name}
                              className={`dev-avatar tier-${leader.tier}`}
                              src={leader.img}
                            />
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PAGINATION */}
          <div className="lb-pagination">
            <div className="lb-info">
              <span className="material-symbols-outlined">info</span>
              Scores calculated from commits, PRs, and stars over the last 365 days.
            </div>
            <div className="pg-controls">
              <button className="pg-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>Previous</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <div key={p} className={`pg-num ${currentPage === p ? "active" : ""}`} onClick={() => setCurrentPage(p)}>{p}</div>
              ))}
              <button className="pg-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        </main>

        <footer className="lb-footer">
          <span className="lb-footer-text">© 2024 Git Vital Analytics. Build with integrity.</span>
          <div className="lb-footer-links">
            {["Privacy Policy", "Terms of Service", "Documentation"].map((l) => (
              <a key={l} href="#">
                {l}
              </a>
            ))}
          </div>
        </footer>
      </div>
    </>
  );
}
