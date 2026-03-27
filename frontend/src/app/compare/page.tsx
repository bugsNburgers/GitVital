"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const API = 'http://localhost:8080';

interface RepoMetrics {
  healthScore?: { overall?: number; velocity?: number };
  busFactor?: { score?: number };
  prMetrics?: { avgMergeTimeDays?: number };
  timeline?: { weeklyCommits?: number[] };
}

interface ComparisonEntry {
  owner: string;
  repo: string;
  metrics: RepoMetrics | null;
}

// Static fallback sparkline data per slot
const FALLBACK_SPARKLINES = [
  [42, 55, 48, 61, 74, 69, 83, 77, 88, 82, 91, 85],
  [38, 44, 51, 47, 60, 58, 65, 72, 68, 75, 71, 81],
];

const DEFAULT_REPOS = ["facebook/react", "vuejs/core", "sveltejs/svelte"];

// Orange-family palette — no cyan
const REPO_COLORS = [
  {
    dot: "bg-[#FF5E00]",
    border: "border-[rgba(255,94,0,0.2)]",
    text: "text-[#FF5E00]",
    label: "react.sys",
    fill: "rgba(255,94,0,0.15)",
    stroke: "#FF5E00",
    points: "200,40 350,150 290,320 110,320 60,150",
    pointFill: "#FF5E00",
  },
  {
    dot: "bg-[#FFA066]",
    border: "border-[rgba(255,160,102,0.2)]",
    text: "text-[#FFA066]",
    label: "vue.sys",
    fill: "rgba(255,160,102,0.12)",
    stroke: "#FFA066",
    points: "200,90 310,165 260,280 140,280 90,165",
    pointFill: "#FFA066",
  },
  {
    dot: "bg-[#FFDACC]",
    border: "border-[rgba(255,218,204,0.2)]",
    text: "text-[#FFDACC]",
    label: "svelte.sys",
    fill: "rgba(255,218,204,0.08)",
    stroke: "#FFDACC",
    points: "200,130 270,180 230,240 170,240 130,180",
    pointFill: "#FFDACC",
  },
];

export default function RepoComparePage() {
  const router = useRouter();
  const [repos, setRepos] = useState(DEFAULT_REPOS);
  const [comparison, setComparison] = useState<ComparisonEntry[]>([]);
  const [loadingComparison, setLoadingComparison] = useState(false);

  const fetchComparison = useCallback(async (repoList: string[]) => {
    const valid = repoList.filter(r => r.includes('/') && r.split('/').every(Boolean));
    if (valid.length < 2) return;
    setLoadingComparison(true);
    try {
      const res = await fetch(`${API}/api/compare?repos=${valid.join(',')}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as { comparisons: ComparisonEntry[] };
        setComparison(data.comparisons ?? []);
      }
    } catch { /* backend offline — keep showing fallback */ }
    finally { setLoadingComparison(false); }
  }, []);

  useEffect(() => { fetchComparison(repos); }, [repos, fetchComparison]);

  function updateRepo(idx: number, val: string) {
    setRepos((prev) => prev.map((r, i) => (i === idx ? val : r)));
  }

  function clearRepo(idx: number) {
    setRepos((prev) => prev.filter((_, i) => i !== idx));
  }

  function addRepo() {
    if (repos.length < 4) setRepos((prev) => [...prev, ""]);
  }

  // Helpers to extract live or fallback values
  function getHealth(entry: ComparisonEntry | undefined) {
    return entry?.metrics?.healthScore?.overall ?? null;
  }
  function getVelocity(entry: ComparisonEntry | undefined) {
    return entry?.metrics?.healthScore?.velocity ?? null;
  }
  function getBusFactor(entry: ComparisonEntry | undefined) {
    return entry?.metrics?.busFactor?.score ?? null;
  }
  function getPRSpeed(entry: ComparisonEntry | undefined) {
    const d = entry?.metrics?.prMetrics?.avgMergeTimeDays;
    return d != null ? `${d.toFixed(1)}d` : null;
  }
  function getSparkline(entry: ComparisonEntry | undefined, idx: number): number[] {
    const raw = entry?.metrics?.timeline?.weeklyCommits;
    if (raw && raw.length >= 6) return raw.slice(-12);
    return FALLBACK_SPARKLINES[idx] ?? FALLBACK_SPARKLINES[0];
  }
  function sparkPath(data: number[]): string {
    const max = Math.max(...data, 1);
    const w = 100 / (data.length - 1);
    return data.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * w).toFixed(1)},${(40 - (v / max) * 36).toFixed(1)}`).join(' ');
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
          --orange: #FF5E00;
          --orange-light: #FFA066;
          --orange-pale: #FFDACC;
          --orange-dim: rgba(255,94,0,0.12);
          --font: 'Inter', system-ui, sans-serif;
          --mono: 'Geist Mono', monospace;
        }

        body { font-family: var(--font); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }

        /* ── NAV ── */
        .cmp-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: 58px; display: flex; align-items: center; padding: 0 24px;
          background: rgba(8,9,9,0.80); backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .cmp-nav-inner {
          width: 100%; max-width: 1120px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .cmp-logo {
          display: flex; align-items: center; gap: 8px; cursor: pointer;
          text-decoration: none; color: var(--text);
          font-size: 15px; font-weight: 700; letter-spacing: -0.02em;
        }
        .cmp-logo img { height: 36px; width: auto; }
        .nav-links {
          display: flex; align-items: center; gap: 2px; list-style: none;
        }
        .nav-links a {
          color: var(--text-muted); text-decoration: none;
          font-size: 13.5px; font-weight: 450; padding: 5px 11px;
          border-radius: 6px; transition: color 0.15s, background 0.15s;
          display: flex; align-items: center; gap: 6px;
        }
        .nav-links a:hover { color: var(--text); background: rgba(255,255,255,0.04); }
        .nav-links a.active { color: var(--text); }
        .btn-ghost {
          font-family: var(--font); font-size: 13px; font-weight: 500;
          color: var(--text-secondary); background: none;
          border: 1px solid var(--border); border-radius: 20px;
          padding: 5px 14px; cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          display: inline-flex; align-items: center; gap: 6px;
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
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── PAGE ── */
        .cmp-page { background: var(--bg); min-height: 100vh; padding-top: 58px; }
        .cmp-main { max-width: 1120px; margin: 0 auto; padding: 40px 24px 120px; }

        /* ── SECTION HEADING ── */
        .cmp-heading { margin-bottom: 32px; }
        .cmp-heading h1 {
          font-size: clamp(28px, 3.5vw, 38px);
          font-weight: 800; letter-spacing: -0.04em; color: var(--text); margin-bottom: 6px;
        }
        .cmp-heading h1 span { color: var(--orange-light); }
        .cmp-heading p { font-size: 14px; color: var(--text-secondary); }

        /* ── INPUT CARDS ── */
        .input-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 32px; }
        .input-card {
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 10px; display: flex; align-items: center;
          padding: 8px 12px; gap: 8px;
          transition: border-color 0.2s;
        }
        .input-card:focus-within { border-color: rgba(255,94,0,0.4); box-shadow: 0 0 0 3px rgba(255,94,0,0.08); }
        .input-card input {
          flex: 1; background: none; border: none; outline: none;
          font-family: var(--mono); font-size: 12.5px; color: var(--text);
          min-width: 0;
        }
        .input-card input::placeholder { color: var(--text-muted); }
        .input-card-icon { color: var(--text-muted); flex-shrink: 0; font-size: 13px; }
        .input-card-clear {
          background: none; border: none; cursor: pointer;
          color: var(--text-muted); font-size: 14px; padding: 0;
          line-height: 1; transition: color 0.15s; flex-shrink: 0;
        }
        .input-card-clear:hover { color: var(--red); }
        .input-add {
          background: var(--bg-card); border: 1px dashed rgba(255,94,0,0.2);
          border-radius: 10px; display: flex; align-items: center; justify-content: center;
          gap: 6px; padding: 12px; cursor: pointer;
          color: var(--text-muted); font-size: 12px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.06em;
          transition: border-color 0.2s, color 0.2s;
        }
        .input-add:hover { border-color: rgba(255,94,0,0.5); color: var(--orange-light); }

        /* ── RADAR CARD ── */
        .radar-card {
          background: var(--bg-card); border: 1px solid rgba(255,94,0,0.15);
          border-radius: 16px; padding: 32px; margin-bottom: 16px;
          position: relative; overflow: hidden;
        }
        .radar-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,94,0,0.4), transparent);
        }
        /* Inline radar grid — no globals.css dependency */
        .radar-bg {
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(255,94,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,94,0,0.04) 1px, transparent 1px);
          background-size: 24px 24px;
          border-radius: 16px;
        }
        /* Scanner line — orange tinted */
        .radar-scanner {
          position: absolute; left: 0; right: 0; height: 35%;
          background: linear-gradient(to bottom, transparent, rgba(255,94,0,0.12), transparent);
          animation: scanLine 5s linear infinite;
          pointer-events: none;
        }
        @keyframes scanLine {
          0% { transform: translateY(-100%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(300%); opacity: 0; }
        }
        .radar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; position: relative; z-index: 1; }
        .radar-title { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; }
        .radar-pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--orange); animation: pulseOrange 2s ease-in-out infinite; }
        @keyframes pulseOrange { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .radar-sys-tag { font-family: var(--mono); font-size: 10px; color: rgba(255,94,0,0.5); letter-spacing: 0.1em; text-transform: uppercase; }

        .radar-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 28px; position: relative; z-index: 1; }
        .radar-legend-item {
          display: flex; align-items: center; gap: 8px;
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 8px; padding: 5px 12px;
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--text-muted);
        }
        .radar-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        /* ── TABLE CARD ── */
        .table-card {
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 16px; overflow: hidden; margin-bottom: 100px;
        }
        .table-card-header {
          padding: 20px 28px; border-bottom: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: center;
        }
        .table-card-header h3 { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
        .table-card-header span { font-family: var(--mono); font-size: 10px; color: var(--text-muted); letter-spacing: 0.06em; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: rgba(255,255,255,0.02); }
        th {
          padding: 12px 20px; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.1em;
          color: var(--text-muted); border-bottom: 1px solid var(--border); text-align: left;
        }
        td {
          padding: 14px 20px; border-bottom: 1px solid var(--border);
          font-family: var(--mono); font-size: 12.5px; color: var(--text-secondary);
        }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(255,255,255,0.015); }
        .td-metric { color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--font); }
        .repo-col-head { display: flex; align-items: center; gap: 8px; }
        .repo-col-icon {
          width: 28px; height: 28px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700;
        }
        .td-best { color: var(--green); }
        .td-worst { color: var(--red); }
        .td-mid { color: var(--text-secondary); }
        .best-bg { background: rgba(34,197,94,0.04); }
        .worst-bg { background: rgba(239,68,68,0.04); }
        .health-badge {
          font-size: 9px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em; padding: 2px 7px; border-radius: 4px;
          background: var(--green-dim); color: var(--green); border: 1px solid rgba(34,197,94,0.2);
          font-family: var(--font);
        }

        /* ── MINI COMPARISON CARDS ── */
        .mini-cards-section { margin-bottom: 32px; }
        .mini-cards-header { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-muted); margin-bottom: 12px; }
        .mini-cards-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 12px; }
        .mini-card {
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px 18px;
          transition: border-color 0.2s;
        }
        .mini-card:hover { border-color: var(--border-hover); }
        .mini-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
        .mini-card-repo { font-family: var(--mono); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 6px; }
        .mini-card-score { font-size: 38px; font-weight: 900; letter-spacing: -0.05em; line-height: 1; }
        .mini-card-score.green { color: var(--green); }
        .mini-card-score.yellow { color: var(--yellow); }
        .mini-card-score.na { color: var(--text-muted); font-size: 22px; }
        .mini-card-vel {
          font-size: 11px; font-weight: 700; padding: 3px 8px;
          border-radius: 6px; white-space: nowrap; margin-top: 4px;
        }
        .mini-card-vel.pos { background: var(--green-dim); color: var(--green); }
        .mini-card-vel.neg { background: var(--red-dim); color: var(--red); }
        .mini-card-vel.neu { background: rgba(255,255,255,0.04); color: var(--text-muted); }
        .mini-sparkline { width: 100%; height: 42px; margin: 4px 0 10px; }
        .mini-sparkline svg { width: 100%; height: 100%; overflow: visible; }
        .mini-pills { display: flex; gap: 6px; flex-wrap: wrap; }
        .mini-pill {
          font-family: var(--mono); font-size: 10.5px; font-weight: 600;
          padding: 3px 9px; border-radius: 20px;
          background: rgba(255,255,255,0.04); border: 1px solid var(--border);
          color: var(--text-muted);
        }
        .mini-pill.hi { background: rgba(255,94,0,0.08); border-color: rgba(255,94,0,0.2); color: var(--orange-light); }
        .mini-loading { opacity: 0.5; filter: blur(2px); pointer-events: none; transition: opacity 0.3s; }

        /* ── HEAD TO HEAD STRIP ── */
        .h2h-strip {
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 10px; padding: 12px 18px;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 12px; margin-bottom: 32px;
        }
        .h2h-tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); white-space: nowrap; }
        .h2h-metrics { display: flex; gap: 24px; flex-wrap: wrap; }
        .h2h-metric { display: flex; flex-direction: column; gap: 2px; }
        .h2h-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 600; }
        .h2h-val { font-size: 14px; font-weight: 700; letter-spacing: -0.02em; color: var(--green); font-family: var(--mono); }
        .h2h-val.neutral { color: var(--yellow); }

        /* ── FLOATING FOOTER BAR ── */
        .float-bar {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          width: calc(100% - 48px); max-width: 680px; z-index: 50;
          background: var(--bg-card); border: 1px solid rgba(255,94,0,0.2);
          border-radius: 14px; padding: 14px 20px;
          display: flex; align-items: center; justify-content: space-between;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px var(--border), 0 0 30px rgba(255,94,0,0.12);
        }
        .float-bar-left { display: flex; align-items: center; gap: 12px; }
        .float-bar-icon {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg, var(--orange), var(--orange-light));
          display: flex; align-items: center; justify-content: center; position: relative;
        }
        .float-bar-icon::after {
          content: ''; position: absolute; top: -2px; right: -2px;
          width: 6px; height: 6px; background: var(--red); border-radius: 50%;
          animation: pingDot 1.2s ease-in-out infinite;
        }
        @keyframes pingDot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.6; } }
        .float-bar-tag { font-family: var(--mono); font-size: 9px; color: var(--orange-light); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3px; }
        .float-bar-text { font-size: 13px; color: var(--text); }
        .float-bar-text strong { color: var(--orange-light); font-weight: 600; }
        .float-bar-btn {
          font-family: var(--font); font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.06em;
          color: var(--orange-light); background: rgba(255,94,0,0.1);
          border: 1px solid rgba(255,94,0,0.25); border-radius: 8px;
          padding: 7px 14px; cursor: pointer;
          transition: background 0.15s; white-space: nowrap;
        }
        .float-bar-btn:hover { background: rgba(255,94,0,0.18); }

        /* ── RESPONSIVE ── */
        @media (max-width: 900px) {
          .input-grid { grid-template-columns: 1fr 1fr; }
          .nav-links { display: none; }
        }
        @media (max-width: 600px) {
          .input-grid { grid-template-columns: 1fr; }
          .cmp-main { padding: 24px 16px 120px; }
          .float-bar { flex-direction: column; gap: 12px; text-align: center; bottom: 16px; }
        }
      ` }} />

      <div className="cmp-page">
        {/* ── NAVBAR ── */}
        <nav className="cmp-nav">
          <div className="cmp-nav-inner">
            <div className="cmp-logo" onClick={() => router.push("/")}>
              <img src="/gitvital_logo_fixed.svg" alt="GitVital" />
            </div>
            <ul className="nav-links">
              <li><a href="/">Dashboard</a></li>
              <li><a href="/compare" className="active">Compare</a></li>
              <li><a href="/leaderboard">Leaderboard</a></li>
            </ul>
            <button className="btn-primary" disabled={repos.length >= 4} onClick={addRepo}>
              + Add Repo
            </button>
          </div>
        </nav>

        <main className="cmp-main">
          {/* ── HEADING ── */}
          <div className="cmp-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1>Compare <span>Repositories</span></h1>
              <p>Benchmark performance and health across multiple projects simultaneously.</p>
            </div>
          </div>

          {/* ── MINI COMPARISON CARDS ── */}
          {repos.slice(0, 2).some(r => r.includes('/')) && (() => {
            const e0 = comparison[0];
            const e1 = comparison[1];
            const h0 = getHealth(e0); const h1 = getHealth(e1);
            const sp0 = getSparkline(e0, 0); const sp1 = getSparkline(e1, 1);
            const v0 = getVelocity(e0); const v1 = getVelocity(e1);
            const bf0 = getBusFactor(e0); const bf1 = getBusFactor(e1);
            const pr0 = getPRSpeed(e0); const pr1 = getPRSpeed(e1);
            const scoreColor = (s: number | null) => s == null ? 'na' : s >= 80 ? 'green' : 'yellow';
            const velLabel = (v: number | null) => v == null ? null : v > 0 ? `+${v.toFixed(0)}% vel` : `${v.toFixed(0)}% vel`;
            const velClass = (v: number | null) => v == null ? 'neu' : v > 0 ? 'pos' : 'neg';
            const mkPath = (data: number[], color: string) => (
              <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                <defs>
                  <linearGradient id={`sg${color.replace('#','')}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${sparkPath(data)} L100,40 L0,40 Z`} fill={`url(#sg${color.replace('#','')})`} />
                <path d={sparkPath(data)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            );
            return (
              <div className="mini-cards-section">
                <div className="mini-cards-header">Side-by-side snapshot</div>
                <div className={`mini-cards-grid${loadingComparison ? ' mini-loading' : ''}`}>
                  {[repos[0], repos[1]].map((r, i) => {
                    const h = i === 0 ? h0 : h1;
                    const sp = i === 0 ? sp0 : sp1;
                    const v = i === 0 ? v0 : v1;
                    const bf = i === 0 ? bf0 : bf1;
                    const pr = i === 0 ? pr0 : pr1;
                    const color = i === 0 ? '#22c55e' : '#eab308';
                    return (
                      <div key={i} className="mini-card">
                        <div className="mini-card-repo">{(r || '—').toUpperCase()}</div>
                        <div className="mini-card-top">
                          <div>
                            <div className={`mini-card-score ${scoreColor(h)}`}>{h ?? '—'}</div>
                          </div>
                          {velLabel(v) && <div className={`mini-card-vel ${velClass(v)}`}>{velLabel(v)}</div>}
                        </div>
                        <div className="mini-sparkline">{mkPath(sp, color)}</div>
                        <div className="mini-pills">
                          <span className="mini-pill hi">Bus {bf ?? '—'}</span>
                          <span className="mini-pill hi">PR {pr ?? '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Head-to-head strip */}
                <div className="h2h-strip">
                  <div className="h2h-tag">Head-to-head · {Math.min(repos.filter(r=>r.includes('/')).length, 4)} of 5 metrics</div>
                  <div className="h2h-metrics">
                    <div className="h2h-metric">
                      <div className="h2h-label">Health</div>
                      <div className="h2h-val">{h0 ?? '88'} {h0 != null && h1 != null && h0 >= h1 ? '✓' : '~'}</div>
                    </div>
                    <div className="h2h-metric">
                      <div className="h2h-label">Bus Factor</div>
                      <div className="h2h-val">{bf0 ?? '12'} {bf0 != null && bf1 != null && bf0 >= bf1 ? '✓' : '~'}</div>
                    </div>
                    <div className="h2h-metric">
                      <div className="h2h-label">PR Speed</div>
                      <div className="h2h-val">{pr0 ?? '1.2d'} {pr0 != null && pr1 != null && parseFloat(pr0) <= parseFloat(pr1) ? '✓' : '~'}</div>
                    </div>
                    <div className="h2h-metric">
                      <div className="h2h-label">Issues</div>
                      <div className="h2h-val neutral">642 ~</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── REPO INPUTS ── */}
          <div className="input-grid">
            {repos.map((repo, idx) => (
              <div key={idx} className="input-card">
                <span className="input-card-icon">⌕</span>
                <input
                  type="text"
                  placeholder="Organization/Repo"
                  value={repo}
                  onChange={(e) => updateRepo(idx, e.target.value)}
                />
                <button className="input-card-clear" onClick={() => clearRepo(idx)}>✕</button>
              </div>
            ))}
            {repos.length < 4 && (
              <div className="input-add" onClick={addRepo}>
                + Select Repo
              </div>
            )}
          </div>

          {/* ── RADAR CARD ── */}
          <div className="radar-card">
            <div className="radar-bg" />
            <div className="radar-scanner" />

            <div className="radar-header">
              <div className="radar-title">
                <div className="radar-pulse" />
                Multidimensional Health Analysis
              </div>
              <div className="radar-sys-tag">system_v2.0 // real-time_sync</div>
            </div>

            {/* Pentagon SVG — kept exactly, only colors changed to orange family */}
            <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '100%', maxWidth: 480, aspectRatio: '1', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg style={{ width: '100%', height: '100%' }} viewBox="0 0 400 400">
                  <defs>
                    <filter id="orangeGlow">
                      <feGaussianBlur result="coloredBlur" stdDeviation="2.5" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Grid rings — orange tinted */}
                  <path d="M200 20 L371 144 L306 345 L94 345 L29 144 Z" fill="none" stroke="rgba(255,94,0,0.18)" strokeWidth="1" />
                  <path d="M200 65 L328 158 L279 308 L121 308 L72 158 Z" fill="none" stroke="rgba(255,94,0,0.13)" strokeWidth="1" />
                  <path d="M200 110 L286 172 L253 271 L147 271 L114 172 Z" fill="none" stroke="rgba(255,94,0,0.09)" strokeWidth="1" />
                  <path d="M200 155 L243 186 L226 235 L174 235 L157 186 Z" fill="none" stroke="rgba(255,94,0,0.05)" strokeWidth="1" />

                  {/* Axes — dashed orange */}
                  <line stroke="rgba(255,94,0,0.25)" strokeWidth="1" strokeDasharray="4 2" x1="200" x2="200" y1="20" y2="200" />
                  <line stroke="rgba(255,94,0,0.25)" strokeWidth="1" strokeDasharray="4 2" x1="200" x2="371" y1="200" y2="144" />
                  <line stroke="rgba(255,94,0,0.25)" strokeWidth="1" strokeDasharray="4 2" x1="200" x2="306" y1="200" y2="345" />
                  <line stroke="rgba(255,94,0,0.25)" strokeWidth="1" strokeDasharray="4 2" x1="200" x2="94" y1="200" y2="345" />
                  <line stroke="rgba(255,94,0,0.25)" strokeWidth="1" strokeDasharray="4 2" x1="200" x2="29" y1="200" y2="144" />

                  {/* Repo polygons */}
                  {repos.slice(0, 3).map((_, i) => (
                    <polygon
                      key={i}
                      fill={REPO_COLORS[i].fill}
                      filter="url(#orangeGlow)"
                      points={REPO_COLORS[i].points}
                      stroke={REPO_COLORS[i].stroke}
                      strokeWidth="2"
                    />
                  ))}

                  {/* Glow dots on first repo vertices */}
                  {["200,40", "350,150", "290,320", "110,320", "60,150"].map((pt, i) => {
                    const [cx, cy] = pt.split(",");
                    return (
                      <circle
                        key={i} cx={cx} cy={cy}
                        r="3.5" fill={REPO_COLORS[0].pointFill}
                        style={{ filter: `drop-shadow(0 0 4px ${REPO_COLORS[0].stroke})` }}
                      />
                    );
                  })}
                </svg>

                {/* Axis labels */}
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -8px)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--orange-light)' }}>
                  <span style={{ background: 'rgba(255,94,0,0.1)', border: '1px solid rgba(255,94,0,0.25)', padding: '2px 8px', borderRadius: 4 }}>Health Score</span>
                </div>
                <div style={{ position: 'absolute', top: '25%', right: 0, transform: 'translate(48px, 0)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', textAlign: 'right', lineHeight: 1.5 }}>
                  Activity<br /><span style={{ color: 'var(--orange-light)', fontFamily: 'var(--mono)', background: 'rgba(255,94,0,0.08)', padding: '1px 5px' }}>98.2%</span>
                </div>
                <div style={{ position: 'absolute', bottom: '25%', right: 0, transform: 'translate(34px, 28px)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', textAlign: 'right', lineHeight: 1.5 }}>
                  PR Speed<br /><span style={{ color: 'var(--orange-light)', fontFamily: 'var(--mono)' }}>1.2d AVG</span>
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translate(-50%, 16px)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--text-muted)' }}>
                  Bus Factor
                </div>
                <div style={{ position: 'absolute', bottom: '25%', left: 0, transform: 'translate(-34px, 28px)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Issue<br />Velocity
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="radar-legend">
              {repos.slice(0, 3).map((repo, i) => (
                <div key={i} className="radar-legend-item">
                  <div className="radar-legend-dot" style={{ background: REPO_COLORS[i].stroke, boxShadow: `0 0 6px ${REPO_COLORS[i].stroke}` }} />
                  {(repo.split("/")[1] ?? REPO_COLORS[i].label).toUpperCase()}.sys
                </div>
              ))}
            </div>
          </div>

          {/* ── COMPARISON TABLE ── */}
          <div className="table-card">
            <div className="table-card-header">
              <h3>Metric Breakdown</h3>
              <span>SORT_BY: PERFORMANCE_INDEX</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    {repos.slice(0, 3).map((repo, i) => (
                      <th key={i}>
                        <div className="repo-col-head">
                          <div
                            className="repo-col-icon"
                            style={{ background: REPO_COLORS[i].fill, border: `1px solid ${REPO_COLORS[i].stroke}40`, color: REPO_COLORS[i].stroke }}
                          >
                            {(repo.split("/")[1] ?? "R").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>{repo.split("/")[1] ?? repo}</div>
                            <div className="health-badge">H_{98 - i * 6}</div>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "PR_AVG_VELOCITY", vals: ["1.2 days", "2.4 days", "4.8 days"], best: 0, worst: 2 },
                    { label: "COMMITS_WEEKLY",  vals: ["342", "128", "84"],                  best: 0, worst: -1 },
                    { label: "ISSUE_RESOLVE_RT", vals: ["82%", "91%", "45%"],               best: 1, worst: 2 },
                    { label: "BUS_FACTOR_INDX", vals: ["54", "12", "4"],                    best: 0, worst: 2 },
                  ].map((row) => (
                    <tr key={row.label}>
                      <td className="td-metric">{row.label}</td>
                      {row.vals.slice(0, repos.length).map((val, i) => (
                        <td
                          key={i}
                          className={i === row.best ? 'best-bg' : i === row.worst ? 'worst-bg' : ''}
                        >
                          <span className={i === row.best ? 'td-best' : i === row.worst ? 'td-worst' : 'td-mid'}>
                            {val}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        {/* ── FLOATING FOOTER BAR ── */}
        <div className="float-bar">
          <div className="float-bar-left">
            <div className="float-bar-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div>
              <div className="float-bar-tag">Git Vital Intelligence</div>
              <div className="float-bar-text">
                Enterprise pick: <strong>{repos[0]?.split("/")[1] ?? "React"}</strong> shows peak maintainability.
              </div>
            </div>
          </div>
          <button className="float-bar-btn">Access Data</button>
        </div>
      </div>
    </>
  );
}
