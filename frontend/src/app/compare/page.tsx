"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const API = "http://localhost:8080";

// ── Backend type mirrors (matches AllMetrics from backend/src/types/index.ts) ──
interface BusFactorResult { busFactor: number; topContributorPct: number; contributors: { login: string; count: number; pct: number }[]; }
interface PRMetricsResult { avgMergeHrs: number; medianMergeHrs: number; p90MergeHrs: number; totalPRs: number; avgMergeDays: number; }
interface ActivityMetricsResult { velocityChange: number; commitsLast30Days: number; weeklyBreakdown: { week: string; count: number }[]; totalWeeksActive: number; }
interface IssueMetricsResult { openIssueCount: number; avgIssueAgeDays: number; unrespondedIssuePct: number; }
interface ChurnMetricsResult { churnScore: number; avgWeeklyChurn: number; totalChurn: number; }
interface RiskFlag { level: "danger" | "warning" | "success" | "info"; title: string; detail: string; }

interface RepoMetrics {
  healthScore: number | null;
  busFactor: BusFactorResult | null;
  prMetrics: PRMetricsResult | null;
  activityMetrics: ActivityMetricsResult | null;
  issueMetrics: IssueMetricsResult | null;
  churnMetrics: ChurnMetricsResult | null;
  riskFlags: RiskFlag[] | null;
  metadata?: { stars?: number; forks?: number; language?: string | null; totalCommitCount?: number };
}

interface ComparisonEntry { owner: string; repo: string; metrics: RepoMetrics | null; }

// Per-slot fallback sparklines (weekly commit counts)
const FALLBACK_SPARKS = [
  [42,55,48,61,74,69,83,77,88,82,91,85,78,92],
  [38,44,51,47,60,58,65,72,68,75,71,81,74,88],
  [29,35,41,38,52,49,56,60,55,63,59,70,65,76],
  [18,25,22,31,28,35,32,40,38,45,42,50,47,55],
];

// Orange-family palette
const COLORS = ["#22c55e","#eab308","#FFA066","#FFDACC"];
const STROKES = ["rgba(34,197,94,0.18)","rgba(234,179,8,0.18)","rgba(255,160,102,0.18)","rgba(255,218,204,0.18)"];

// Pentagon vertex points per repo (shrinking)
const OUTER_PENTAGON = "200,20 371,144 306,345 94,345 29,144";
const PENTAGON_SCALES = [1, 0.76, 0.55, 0.38];
function scaledPentagon(scale: number): string {
  const pts = [[200,20],[371,144],[306,345],[94,345],[29,144]];
  return pts.map(([x,y]) => `${200+(x-200)*scale},${200+(y-200)*scale}`).join(" ");
}

// ── Metric helpers ──
function getHealth(e?: ComparisonEntry): number | null {
  const h = e?.metrics?.healthScore;
  return (h != null && !isNaN(Number(h))) ? Number(h) : null;
}
function getActivity(e?: ComparisonEntry): number | null {
  return e?.metrics?.activityMetrics?.velocityChange ?? null;
}
function getCommits30(e?: ComparisonEntry): number | null {
  return e?.metrics?.activityMetrics?.commitsLast30Days ?? null;
}
function getWeeklyActive(e?: ComparisonEntry): number | null {
  return e?.metrics?.activityMetrics?.totalWeeksActive ?? null;
}
function getBusFactor(e?: ComparisonEntry): number | null {
  return e?.metrics?.busFactor?.busFactor ?? null;
}
function getTopContrib(e?: ComparisonEntry): number | null {
  return e?.metrics?.busFactor?.topContributorPct ?? null;
}
function getContribCount(e?: ComparisonEntry): number | null {
  return e?.metrics?.busFactor?.contributors.length ?? null;
}
function getPRAvgDays(e?: ComparisonEntry): number | null {
  return e?.metrics?.prMetrics?.avgMergeDays ?? null;
}
function getPRMedianHrs(e?: ComparisonEntry): number | null {
  return e?.metrics?.prMetrics?.medianMergeHrs ?? null;
}
function getPRTotal(e?: ComparisonEntry): number | null {
  return e?.metrics?.prMetrics?.totalPRs ?? null;
}
function getOpenIssues(e?: ComparisonEntry): number | null {
  return e?.metrics?.issueMetrics?.openIssueCount ?? null;
}
function getIssueAge(e?: ComparisonEntry): number | null {
  return e?.metrics?.issueMetrics?.avgIssueAgeDays ?? null;
}
function getUnresponded(e?: ComparisonEntry): number | null {
  const v = e?.metrics?.issueMetrics?.unrespondedIssuePct;
  return v != null ? Math.round(v) : null;
}
function getChurnScore(e?: ComparisonEntry): number | null {
  return e?.metrics?.churnMetrics?.churnScore ?? null;
}
function getAvgChurn(e?: ComparisonEntry): number | null {
  const v = e?.metrics?.churnMetrics?.avgWeeklyChurn;
  return v != null ? Math.round(v) : null;
}
function getDangerFlags(e?: ComparisonEntry): number | null {
  const flags = e?.metrics?.riskFlags;
  if (!flags) return null;
  return flags.filter(f => f.level === "danger").length;
}
function getSparkline(e: ComparisonEntry | undefined, idx: number): number[] {
  const wb = e?.metrics?.activityMetrics?.weeklyBreakdown;
  if (wb && wb.length >= 6) return wb.slice(-14).map(w => w.count);
  return FALLBACK_SPARKS[idx] ?? FALLBACK_SPARKS[0];
}
// Normalize a value 0-100 for pentagon. "higherIsBetter" controls direction.
function normalize(val: number | null, min: number, max: number, higherIsBetter = true): number {
  if (val == null) return 50; // neutral fallback
  const clamped = Math.max(min, Math.min(max, val));
  const pct = (clamped - min) / (max - min);
  return higherIsBetter ? pct * 100 : (1 - pct) * 100;
}
// Pentagon SVG points for 5 axes given 5 scores 0-100
function pentagonPoints(scores: number[]): string {
  const angles = [-90, -90+72, -90+144, -90+216, -90+288].map(d => d * Math.PI / 180);
  const maxR = 155; // outer radius in viewBox (200 center, touches 20-380)
  return scores.map((s, i) => {
    const r = (s / 100) * maxR;
    const x = 200 + r * Math.cos(angles[i]);
    const y = 200 + r * Math.sin(angles[i]);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function sparkPath(data: number[]): string {
  const max = Math.max(...data, 1);
  const w = 100 / Math.max(data.length - 1, 1);
  return data.map((v,i) => `${i===0?'M':'L'}${(i*w).toFixed(1)},${(40-(v/max)*36).toFixed(1)}`).join(" ");
}

const DEFAULT_REPOS = ["facebook/react", "vuejs/core", "sveltejs/svelte"];

export default function RepoComparePage() {
  const router = useRouter();
  const [repos, setRepos] = useState(DEFAULT_REPOS);
  const [comparison, setComparison] = useState<ComparisonEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchComparison = useCallback(async (repoList: string[]) => {
    const valid = repoList.filter(r => r.includes("/") && r.split("/").filter(Boolean).length === 2);
    if (valid.length < 2) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/compare?repos=${valid.join(",")}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { comparisons: ComparisonEntry[] };
        setComparison(data.comparisons ?? []);
      }
    } catch { /* offline – show fallbacks */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchComparison(repos); }, [repos, fetchComparison]);

  function updateRepo(idx: number, val: string) {
    setRepos(prev => prev.map((r, i) => i === idx ? val : r));
  }
  function clearRepo(idx: number) {
    setRepos(prev => prev.filter((_, i) => i !== idx));
  }
  function addRepo() {
    if (repos.length < 4) setRepos(prev => [...prev, ""]);
  }

  const validRepos = repos.filter(r => r.includes("/") && r.split("/").filter(Boolean).length === 2);
  const slotCount = Math.max(validRepos.length, 2); // always show ≥2 slots for layout

  // Pentagon scores per repo: [Health, Activity, PR Speed, Bus Factor, Issue Health]
  const pentagonScores = comparison.map(e => [
    normalize(getHealth(e), 0, 100),
    normalize(getActivity(e), -50, 50),
    normalize(getPRAvgDays(e), 0, 14, false), // lower days = better
    normalize(getBusFactor(e), 1, 15),
    normalize(getOpenIssues(e), 0, 500, false), // fewer issues = better
  ]);

  // Runner-up pentagon (fallback ring sizes from PENTAGON_SCALES when no data)
  const useLivePentagon = comparison.length >= 2 && comparison.some(e => e.metrics !== null);

  // Comparison table rows: label, getter, unit, lowerIsBetter
  const TABLE_ROWS: { label: string; get: (e?: ComparisonEntry) => number | null; fmt?: (v: number) => string; lowerBetter?: boolean }[] = [
    { label: "HEALTH_SCORE",        get: getHealth,       fmt: v => v.toFixed(1) },
    { label: "BUS_FACTOR",          get: getBusFactor },
    { label: "TOP_CONTRIB_%",       get: getTopContrib,   fmt: v => `${v.toFixed(1)}%`, lowerBetter: true },
    { label: "CONTRIBUTORS",        get: getContribCount },
    { label: "COMMITS_30D",         get: getCommits30 },
    { label: "WEEKS_ACTIVE",        get: getWeeklyActive },
    { label: "PR_AVG_DAYS",         get: getPRAvgDays,    fmt: v => `${v.toFixed(1)}d`, lowerBetter: true },
    { label: "PR_MEDIAN_HRS",       get: getPRMedianHrs,  fmt: v => `${v.toFixed(0)}h`, lowerBetter: true },
    { label: "TOTAL_PRS",           get: getPRTotal },
    { label: "OPEN_ISSUES",         get: getOpenIssues,   lowerBetter: true },
    { label: "ISSUE_AGE_AVG_DAYS",  get: getIssueAge,     fmt: v => `${v.toFixed(0)}d`, lowerBetter: true },
    { label: "UNRESPONDED_ISSUES%", get: getUnresponded,  fmt: v => `${v}%`, lowerBetter: true },
    { label: "CHURN_SCORE",         get: getChurnScore,   lowerBetter: true },
    { label: "AVG_WEEKLY_CHURN",    get: getAvgChurn,     lowerBetter: true },
    { label: "DANGER_FLAGS",        get: getDangerFlags,  lowerBetter: true },
  ];

  // For best/worst coloring per row
  function rowBest(row: typeof TABLE_ROWS[0]): number {
    const vals = comparison.slice(0, validRepos.length).map(e => row.get(e));
    const nums = vals.filter((v): v is number => v !== null);
    if (!nums.length) return -1;
    const extreme = row.lowerBetter ? Math.min(...nums) : Math.max(...nums);
    return vals.findIndex(v => v === extreme);
  }
  function rowWorst(row: typeof TABLE_ROWS[0]): number {
    const vals = comparison.slice(0, validRepos.length).map(e => row.get(e));
    const nums = vals.filter((v): v is number => v !== null);
    if (nums.length < 2) return -1;
    const extreme = row.lowerBetter ? Math.max(...nums) : Math.min(...nums);
    return vals.findIndex(v => v === extreme);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
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
        .cmp-nav-inner { width: 100%; max-width: 1120px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .cmp-logo { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
        .cmp-logo img { height: 36px; }
        .nav-links { display: flex; align-items: center; gap: 2px; list-style: none; }
        .nav-links a { color: var(--text-muted); text-decoration: none; font-size: 13.5px; font-weight: 450; padding: 5px 11px; border-radius: 6px; transition: color 0.15s, background 0.15s; }
        .nav-links a:hover { color: var(--text); background: rgba(255,255,255,0.04); }
        .nav-links a.active { color: var(--text); }
        .btn-primary {
          font-family: var(--font); font-size: 13px; font-weight: 600; color: #fff;
          background: var(--orange); border: 1px solid rgba(255,94,0,0.5); border-radius: 20px;
          padding: 5px 16px; cursor: pointer; transition: background 0.15s, box-shadow 0.15s;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-primary:hover { background: #D94E00; box-shadow: 0 0 20px rgba(255,94,0,0.35); }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

        /* PAGE */
        .cmp-page { background: var(--bg); min-height: 100vh; padding-top: 58px; }
        .cmp-main { max-width: 1120px; margin: 0 auto; padding: 40px 24px 120px; }
        .section-gap { display: flex; flex-direction: column; gap: 16px; }

        /* HEADING */
        .cmp-heading h1 { font-size: clamp(26px,3.5vw,36px); font-weight: 800; letter-spacing: -0.04em; margin-bottom: 4px; }
        .cmp-heading h1 span { color: var(--orange-light); }
        .cmp-heading p { font-size: 14px; color: var(--text-secondary); }

        /* INPUT CARDS */
        .input-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .input-card {
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
          display: flex; align-items: center; padding: 8px 12px; gap: 8px; transition: border-color 0.2s;
        }
        .input-card:focus-within { border-color: rgba(255,94,0,0.4); box-shadow: 0 0 0 3px rgba(255,94,0,0.08); }
        .input-card input { flex: 1; background: none; border: none; outline: none; font-family: var(--mono); font-size: 12.5px; color: var(--text); min-width: 0; }
        .input-card input::placeholder { color: var(--text-muted); }
        .input-card-clear { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 14px; transition: color 0.15s; }
        .input-card-clear:hover { color: var(--red); }
        .input-add {
          background: var(--bg-card); border: 1px dashed rgba(255,94,0,0.2); border-radius: 10px;
          display: flex; align-items: center; justify-content: center; gap: 6px; padding: 12px;
          cursor: pointer; color: var(--text-muted); font-size: 12px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.06em; transition: border-color 0.2s, color 0.2s;
        }
        .input-add:hover { border-color: rgba(255,94,0,0.5); color: var(--orange-light); }

        /* COMMIT SPARKLINE CARDS - dynamic grid */
        .spark-section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-muted); margin-bottom: 10px; }
        .spark-grid { display: grid; gap: 10px; }
        .spark-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; transition: border-color 0.2s; }
        .spark-card:hover { border-color: var(--border-hover); }
        .spark-card-repo { font-family: var(--mono); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 4px; }
        .spark-card-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
        .spark-card-commits { font-size: 24px; font-weight: 800; letter-spacing: -0.04em; color: var(--text); }
        .spark-card-sub { font-size: 11px; color: var(--text-muted); }
        .spark-chart { width: 100%; height: 44px; }
        .spark-chart svg { width: 100%; height: 100%; overflow: visible; }
        .spark-loading { opacity: 0.45; filter: blur(1.5px); pointer-events: none; }

        /* RADAR CARD */
        .radar-card {
          background: var(--bg-card); border: 1px solid rgba(255,94,0,0.15); border-radius: 16px; padding: 32px;
          position: relative; overflow: hidden;
        }
        .radar-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,94,0,0.4), transparent); }
        .radar-bg { position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(rgba(255,94,0,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,94,0,0.04) 1px,transparent 1px); background-size: 24px 24px; border-radius: 16px; }
        .radar-scanner { position: absolute; left: 0; right: 0; height: 35%; background: linear-gradient(to bottom,transparent,rgba(255,94,0,0.10),transparent); animation: scanLine 5s linear infinite; pointer-events: none; }
        @keyframes scanLine { 0%{transform:translateY(-100%);opacity:0} 50%{opacity:1} 100%{transform:translateY(300%);opacity:0} }
        .radar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; position: relative; z-index: 1; }
        .radar-title { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; }
        .radar-pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--orange); animation: pulseOrg 2s ease-in-out infinite; }
        @keyframes pulseOrg { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .radar-sys-tag { font-family: var(--mono); font-size: 10px; color: rgba(255,94,0,0.5); letter-spacing: 0.1em; text-transform: uppercase; }
        .radar-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 24px; position: relative; z-index: 1; }
        .radar-legend-item { display: flex; align-items: center; gap: 8px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 5px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
        .radar-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        /* TABLE CARD */
        .table-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
        .table-card-header { padding: 18px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .table-card-header h3 { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
        .table-card-header span { font-family: var(--mono); font-size: 10px; color: var(--text-muted); letter-spacing: 0.06em; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: rgba(255,255,255,0.02); }
        th { padding: 11px 18px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); border-bottom: 1px solid var(--border); text-align: left; }
        td { padding: 12px 18px; border-bottom: 1px solid rgba(255,255,255,0.03); font-family: var(--mono); font-size: 12.5px; color: var(--text-secondary); }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(255,255,255,0.012); }
        .td-metric { font-family: var(--font); font-size: 10.5px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
        .repo-col-head { display: flex; align-items: center; gap: 8px; }
        .repo-col-icon { width: 26px; height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
        .td-best { color: var(--green); }
        .td-worst { color: var(--red); }
        .td-mid { color: var(--text-secondary); }
        .td-null { color: var(--text-muted); }
        .best-bg { background: rgba(34,197,94,0.04); }
        .worst-bg { background: rgba(239,68,68,0.04); }

        /* FLOAT BAR */
        .float-bar {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          width: calc(100% - 48px); max-width: 680px; z-index: 50;
          background: var(--bg-card); border: 1px solid rgba(255,94,0,0.2); border-radius: 14px;
          padding: 14px 20px; display: flex; align-items: center; justify-content: space-between;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(255,94,0,0.12);
        }
        .float-bar-left { display: flex; align-items: center; gap: 12px; }
        .float-bar-icon { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg,var(--orange),var(--orange-light)); display: flex; align-items: center; justify-content: center; position: relative; }
        .float-bar-icon::after { content: ''; position: absolute; top: -2px; right: -2px; width: 6px; height: 6px; background: var(--red); border-radius: 50%; animation: pingDot 1.2s ease-in-out infinite; }
        @keyframes pingDot { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.6} }
        .float-bar-tag { font-family: var(--mono); font-size: 9px; color: var(--orange-light); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3px; }
        .float-bar-text { font-size: 13px; color: var(--text); }
        .float-bar-text strong { color: var(--orange-light); }
        .float-bar-btn { font-family: var(--font); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--orange-light); background: rgba(255,94,0,0.1); border: 1px solid rgba(255,94,0,0.25); border-radius: 8px; padding: 7px 14px; cursor: pointer; transition: background 0.15s; white-space: nowrap; }
        .float-bar-btn:hover { background: rgba(255,94,0,0.18); }

        /* RESPONSIVE */
        @media (max-width: 900px) { .input-grid { grid-template-columns: 1fr 1fr; } .nav-links { display: none; } }
        @media (max-width: 600px) { .input-grid { grid-template-columns: 1fr; } .cmp-main { padding: 24px 16px 120px; } .float-bar { flex-direction: column; gap: 12px; bottom: 16px; } }
      ` }} />

      <div className="cmp-page">
        {/* NAV */}
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
          <div className="section-gap">
            {/* HEADING */}
            <div className="cmp-heading">
              <h1>Compare <span>Repositories</span></h1>
              <p>Full metric breakdown across {validRepos.length} repos — health, activity, bus factor, PR speed, issue health, churn.</p>
            </div>

            {/* INPUT CARDS */}
            <div className="input-grid">
              {repos.map((repo, idx) => (
                <div key={idx} className="input-card">
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>⌕</span>
                  <input type="text" placeholder="owner/repo" value={repo} onChange={e => updateRepo(idx, e.target.value)} />
                  <button className="input-card-clear" onClick={() => clearRepo(idx)}>✕</button>
                </div>
              ))}
              {repos.length < 4 && (
                <div className="input-add" onClick={addRepo}>+ Add Repo</div>
              )}
            </div>

            {/* DYNAMIC COMMIT SPARKLINE CARDS — one per repo */}
            {validRepos.length >= 1 && (() => {
              const cols = Math.min(validRepos.length, 4);
              const gridCols = cols === 1 ? "1fr" : cols === 2 ? "1fr 1fr" : cols === 3 ? "1fr 1fr 1fr" : "1fr 1fr 1fr 1fr";
              return (
                <div>
                  <div className="spark-section-label">Weekly Commit Activity</div>
                  <div className="spark-grid" style={{ gridTemplateColumns: gridCols }}>
                    {repos.slice(0, 4).map((r, idx) => {
                      if (!r.includes("/")) return null;
                      const entry = comparison[idx];
                      const data = getSparkline(entry, idx);
                      const commits30 = getCommits30(entry);
                      const velocity = getActivity(entry);
                      const color = COLORS[idx];
                      const path = sparkPath(data);
                      const areaPath = `${path} L100,40 L0,40 Z`;
                      const gradId = `sg${idx}`;
                      return (
                        <div key={idx} className={`spark-card${loading ? " spark-loading" : ""}`}>
                          <div className="spark-card-repo">{r.toUpperCase()}</div>
                          <div className="spark-card-meta">
                            <span className="spark-card-commits">{commits30 ?? "—"}</span>
                            <span className="spark-card-sub">commits/30d</span>
                            {velocity != null && (
                              <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 4, color: velocity >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                {velocity >= 0 ? "+" : ""}{velocity.toFixed(0)}% vel
                              </span>
                            )}
                          </div>
                          <div className="spark-chart">
                            <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                              <defs>
                                <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
                                  <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                                </linearGradient>
                              </defs>
                              <path d={areaPath} fill={`url(#${gradId})`} />
                              <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* RADAR PENTAGON */}
            <div className="radar-card">
              <div className="radar-bg" />
              <div className="radar-scanner" />
              <div className="radar-header">
                <div className="radar-title"><div className="radar-pulse" /> Multidimensional Health Analysis</div>
                <div className="radar-sys-tag">5-axis // real-time_sync</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ width: '100%', maxWidth: 440, aspectRatio: '1', position: 'relative' }}>
                  <svg style={{ width: '100%', height: '100%' }} viewBox="0 0 400 400">
                    <defs>
                      <filter id="oglow"><feGaussianBlur result="blur" stdDeviation="2.5" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                    </defs>

                    {/* Grid pentagons */}
                    {[1, 0.75, 0.5, 0.25].map((s, i) => (
                      <polygon key={i} points={scaledPentagon(s)} fill="none" stroke={`rgba(255,94,0,${0.18 - i*0.04})`} strokeWidth="1" />
                    ))}

                    {/* Axes */}
                    {[[200,20],[371,144],[306,345],[94,345],[29,144]].map(([x,y], i) => (
                      <line key={i} x1="200" y1="200" x2={x} y2={y} stroke="rgba(255,94,0,0.2)" strokeWidth="1" strokeDasharray="3 3" />
                    ))}

                    {/* Data polygons — live if available, else concentric fallback */}
                    {useLivePentagon
                      ? pentagonScores.slice(0, validRepos.length).map((scores, i) => (
                          <polygon key={i} points={pentagonPoints(scores)}
                            fill={STROKES[i]} stroke={COLORS[i]} strokeWidth="2" filter="url(#oglow)" />
                        ))
                      : repos.slice(0, 4).map((r, i) => r.includes("/") ? (
                          <polygon key={i} points={scaledPentagon(PENTAGON_SCALES[i])}
                            fill={STROKES[i]} stroke={COLORS[i]} strokeWidth="2" />
                        ) : null)
                    }

                    {/* Vertex dots (first repo) */}
                    {[[200,20],[371,144],[306,345],[94,345],[29,144]].map(([x,y], i) => (
                      <circle key={i} cx={x} cy={y} r="4" fill={COLORS[0]}
                        style={{ filter: `drop-shadow(0 0 5px ${COLORS[0]})` }} />
                    ))}
                  </svg>

                  {/* Axis labels */}
                  <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%,-10px)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                    <span style={{ background: 'rgba(255,94,0,0.1)', border: '1px solid rgba(255,94,0,0.25)', padding: '2px 7px', borderRadius: 4, color: 'var(--orange-light)' }}>Health</span>
                  </div>
                  <div style={{ position: 'absolute', top: '28%', right: 0, transform: 'translate(44px,0)', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', lineHeight: 1.5 }}>
                    Activity<br /><span style={{ color: 'var(--orange-light)', fontFamily: 'var(--mono)' }}>vel Δ</span>
                  </div>
                  <div style={{ position: 'absolute', bottom: '28%', right: 0, transform: 'translate(38px,22px)', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', lineHeight: 1.5 }}>
                    PR Speed<br /><span style={{ color: 'var(--orange-light)', fontFamily: 'var(--mono)' }}>avg days</span>
                  </div>
                  <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translate(-50%,16px)', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Bus Factor</div>
                  <div style={{ position: 'absolute', bottom: '28%', left: 0, transform: 'translate(-38px,22px)', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'left', lineHeight: 1.5 }}>
                    Issue<br /><span style={{ color: 'var(--orange-light)', fontFamily: 'var(--mono)' }}>health</span>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="radar-legend">
                {repos.slice(0, 4).map((r, i) => r.includes("/") ? (
                  <div key={i} className="radar-legend-item">
                    <div className="radar-legend-dot" style={{ background: COLORS[i], boxShadow: `0 0 6px ${COLORS[i]}` }} />
                    {(r.split("/")[1] ?? r).toUpperCase()}.sys
                  </div>
                ) : null)}
              </div>
            </div>

            {/* METRIC TABLE */}
            <div className="table-card">
              <div className="table-card-header">
                <h3>Full Metric Breakdown</h3>
                <span>15 METRICS // {validRepos.length} REPOS</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      {repos.slice(0, 4).map((r, i) => !r.includes("/") ? null : (
                        <th key={i}>
                          <div className="repo-col-head">
                            <div className="repo-col-icon" style={{ background: `${STROKES[i]}`, border: `1px solid ${COLORS[i]}55`, color: COLORS[i] }}>
                              {(r.split("/")[1] ?? "R").charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{r.split("/")[1] ?? r}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TABLE_ROWS.map((row, ri) => {
                      const best = rowBest(row);
                      const worst = rowWorst(row);
                      return (
                        <tr key={ri}>
                          <td className="td-metric">{row.label}</td>
                          {comparison.slice(0, validRepos.length).map((e, ci) => {
                            const v = row.get(e);
                            const fmted = v != null ? (row.fmt ? row.fmt(v) : String(v)) : "—";
                            const cls = v == null ? "td-null" : ci === best ? "td-best" : ci === worst ? "td-worst" : "td-mid";
                            const bgCls = v == null ? "" : ci === best ? "best-bg" : ci === worst ? "worst-bg" : "";
                            return (
                              <td key={ci} className={bgCls}>
                                <span className={cls}>{fmted}</span>
                              </td>
                            );
                          })}
                          {/* Fill empty columns when backend hasn't returned data yet */}
                          {Array.from({ length: Math.max(0, validRepos.length - comparison.length) }).map((_, ci) => (
                            <td key={`empty-${ci}`}><span className="td-null">—</span></td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>

        {/* FLOAT BAR */}
        <div className="float-bar">
          <div className="float-bar-left">
            <div className="float-bar-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div>
              <div className="float-bar-tag">Git Vital Intelligence</div>
              <div className="float-bar-text">
                Comparing <strong>{validRepos.length} repos</strong> across 15 metrics.
                {loading ? " Fetching live data…" : " Data from cache."}
              </div>
            </div>
          </div>
          <button className="float-bar-btn" onClick={() => fetchComparison(repos)}>↻ Refresh</button>
        </div>
      </div>
    </>
  );
}
