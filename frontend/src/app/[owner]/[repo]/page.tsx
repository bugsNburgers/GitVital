"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE, AUTH_URL } from "@/config";

// ── Types matching backend AllMetrics + metadata ──
interface BusFactorResult {
  busFactor: number;
  topContributorPct: number;
  contributors: Array<{ login: string; count: number; pct: number }>;
}
interface PRMetricsResult {
  avgMergeHrs: number;
  medianMergeHrs: number;
  p90MergeHrs: number;
  totalPRs: number;
  avgMergeDays: number;
}
interface ActivityMetricsResult {
  velocityChange: number;
  commitsLast30Days: number;
  weeklyBreakdown: Array<{ week: string; count: number }>;
  totalWeeksActive: number;
}
interface IssueMetricsResult {
  openIssueCount: number;
  avgIssueAgeDays: number;
  unrespondedIssuePct: number;
}
interface ChurnMetricsResult {
  churnScore: number;
  avgWeeklyChurn: number;
  totalChurn: number;
}
interface RiskFlag {
  level: "danger" | "warning" | "success" | "info";
  title: string;
  detail: string;
}
interface RepoMetadata {
  stars: number;
  forks: number;
  language: string | null;
  isArchived: boolean;
  isFork: boolean;
  totalCommitCount: number;
}
interface RepoMetrics {
  healthScore: number;
  busFactor: BusFactorResult | null;
  prMetrics: PRMetricsResult | null;
  activityMetrics: ActivityMetricsResult | null;
  issueMetrics: IssueMetricsResult | null;
  churnMetrics: ChurnMetricsResult | null;
  riskFlags: RiskFlag[];
  aiAdvice: string | null;
  aiAdviceSource?: string | null;
  metadata?: RepoMetadata;
}

type LoadState = "idle" | "checking" | "queuing" | "polling" | "done" | "error";

// ── Helper to format numbers ──
function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function healthLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs Attention";
}

function healthDesc(score: number, owner: string, repo: string): string {
  if (score >= 80) return `${owner}/${repo} is in excellent health with active maintainers and controlled technical debt.`;
  if (score >= 60) return `${owner}/${repo} is in good health but has some areas that could use attention.`;
  if (score >= 40) return `${owner}/${repo} needs some work — consider improving contribution diversity and PR velocity.`;
  return `${owner}/${repo} is in poor health. Multiple signals suggest maintenance issues.`;
}

function velocityLabel(v: number): string {
  if (v > 20) return "↑ Accelerating";
  if (v > 5) return "↑ Growing";
  if (v < -20) return "↓ Declining";
  if (v < -5) return "↓ Slowing";
  return "→ Stable";
}

function prVelocityLabel(days: number): string {
  if (days < 1) return "Excellent";
  if (days < 3) return "Fast";
  if (days < 7) return "Moderate";
  if (days < 14) return "Slow";
  return "Very Slow";
}

function issueHealthLabel(pct: number, openCount: number): string {
  if (openCount === 0) return "Clean";
  if (pct < 10) return "Healthy";
  if (pct < 30) return "Moderate";
  return "Needs Work";
}

function churnLabel(churnScore: number): string {
  if (churnScore < 30) return "Low";
  if (churnScore < 60) return "Moderate";
  return "High";
}

function flagCardClass(level: string): string {
  if (level === "danger") return "flag-card danger";
  if (level === "warning") return "flag-card warn";
  if (level === "success") return "flag-card success";
  return "flag-card info";
}
function flagIconClass(level: string): string {
  if (level === "danger") return "flag-icon danger";
  if (level === "warning") return "flag-icon warn";
  if (level === "success") return "flag-icon success";
  return "flag-icon info";
}
function flagTitleClass(level: string): string {
  if (level === "danger") return "flag-title danger";
  if (level === "warning") return "flag-title warn";
  if (level === "success") return "flag-title success";
  return "flag-title info";
}
function flagEmoji(level: string): string {
  if (level === "danger") return "⚠";
  if (level === "warning") return "!";
  if (level === "success") return "✓";
  return "ℹ";
}

// ── Commit chart helpers ──
function buildSparkPath(points: number[], width = 1200, height = 160): string {
  if (points.length === 0) return "";
  const max = Math.max(...points, 1);
  const step = width / (points.length - 1 || 1);
  const coords = points.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - 20) - 10;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return "M" + coords.join(" L");
}

export default function RepoDashboardPage() {
  const params = useParams<{ owner: string; repo: string }>();
  const owner = params?.owner ?? "facebook";
  const repo = params?.repo ?? "react";
  const router = useRouter();

  const [activeRange, setActiveRange] = useState<"12M" | "6M" | "30D">("12M");
  const [copyDone, setCopyDone] = useState(false);
  const [user, setUser] = useState<{ loggedIn: boolean; githubUsername?: string } | null>(null);
  const [metrics, setMetrics] = useState<RepoMetrics | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("checking");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch current user ──
  useEffect(() => {
    fetch(`${API_BASE}/api/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUser(d))
      .catch(() => setUser({ loggedIn: false }));
  }, []);

  // ── Poll job until done ──
  const startPolling = useCallback((jid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setLoadState("polling");
    setJobId(jid);

    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/status/${jid}`);
        const data = await r.json();
        if (data.progress) setJobProgress(Number(data.progress));

        if (data.status === "done") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          // Fetch fresh metrics now
          const mr = await fetch(`${API_BASE}/api/repo/${owner}/${repo}`);
          if (mr.ok) {
            const m = await mr.json();
            setMetrics(m);
            setLoadState("done");
          } else {
            setErrorMsg("Analysis completed but failed to load metrics.");
            setLoadState("error");
          }
        } else if (data.status === "failed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setErrorMsg(data.error || "Analysis failed. Please try again.");
          setLoadState("error");
        }
      } catch {
        // network blip — keep polling
      }
    }, 3000);
  }, [owner, repo]);

  // ── Initial load: check cache → queue if missing ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoadState("checking");
      try {
        // 1. Try to get cached metrics
        const r = await fetch(`${API_BASE}/api/repo/${owner}/${repo}`);
        if (r.ok) {
          const m = await r.json();
          if (!cancelled) { setMetrics(m); setLoadState("done"); }
          return;
        }

        // 2. No cache — queue analysis
        if (!cancelled) setLoadState("queuing");
        const qr = await fetch(`${API_BASE}/api/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ owner, repo }),
        });

        if (!qr.ok) {
          const err = await qr.json();
          if (!cancelled) { setErrorMsg(err.error || "Failed to start analysis."); setLoadState("error"); }
          return;
        }

        const q = await qr.json();

        // If already cached (hit in analyze endpoint), load directly
        if (q.status === "done" && q.metrics) {
          if (!cancelled) { setMetrics(q.metrics); setLoadState("done"); }
          return;
        }

        // Guard: if jobId is missing something went wrong server-side
        if (!q.jobId) {
          if (!cancelled) { setErrorMsg(q.error || "Failed to create analysis job. Please try again."); setLoadState("error"); }
          return;
        }

        if (!cancelled) startPolling(q.jobId);
      } catch (e) {
        if (!cancelled) { setErrorMsg("Could not connect to the GitVital API."); setLoadState("error"); }
      }
    }

    init();
    return () => {
      cancelled = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [owner, repo, startPolling]);

  // ── Re-analyze button ──
  function reanalyze() {
    if (pollRef.current) clearInterval(pollRef.current);
    setMetrics(null);
    setErrorMsg(null);
    setJobProgress(0);
    setLoadState("queuing");

    fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ owner, repo }),
    })
      .then((r) => r.json())
      .then((q) => {
        if (q.status === "done" && q.metrics) { 
          setMetrics(q.metrics); 
          setLoadState("done"); 
        } else if (q.jobId) {
          startPolling(q.jobId);
        } else {
          setErrorMsg(q.error || "Failed to create analysis job. Please try again.");
          setLoadState("error");
        }
      })
      .catch(() => { setErrorMsg("Failed to start analysis."); setLoadState("error"); });
  }

  function copyBadge() {
    const md = `[![Git Vital](${API_BASE}/badge/${owner}/${repo}.svg)](https://1pi.gitvital.com/${owner}/${repo})`;
    navigator.clipboard.writeText(md).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  }

  // ── Derived data ──
  const score = metrics?.healthScore ?? 0;
  const circumference = 427.26;
  const dashOffset = circumference * (1 - score / 100);
  const meta = metrics?.metadata;
  const activity = metrics?.activityMetrics;
  const busf = metrics?.busFactor;
  const pr = metrics?.prMetrics;
  const issue = metrics?.issueMetrics;
  const churn = metrics?.churnMetrics;
  const flags = metrics?.riskFlags ?? [];

  // Weekly breakdown for chart
  const weeklyData = activity?.weeklyBreakdown ?? [];
  const allWeeks = weeklyData.map((w) => w.count);

  // Filter by range
  const rangeWeeks =
    activeRange === "30D" ? allWeeks.slice(-4) :
    activeRange === "6M" ? allWeeks.slice(-26) :
    allWeeks.slice(-52);

  const chartPath = buildSparkPath(rangeWeeks.length > 1 ? rangeWeeks : [0, 0]);
  const chartMax = Math.max(...rangeWeeks, 1);
  const areaPath = chartPath
    ? `${chartPath} L${((rangeWeeks.length - 1) * (1200 / (rangeWeeks.length - 1 || 1))).toFixed(1)},160 L0,160 Z`
    : "M0,160 L1200,160 L1200,160 L0,160 Z";

  const isLoading = loadState !== "done" && loadState !== "error";
  const reanalyzing = loadState === "queuing" || loadState === "polling";

  // Parse AI advice into summary + recommendations
  let aiSummary = metrics?.aiAdvice ?? null;
  const aiSource = metrics?.aiAdviceSource;
  let aiRecs: string[] = [];
  if (aiSummary) {
    const recs: string[] = [];
    const lines = aiSummary.split("\n").filter(Boolean);
    const summaryLines: string[] = [];
    for (const line of lines) {
      const m = line.match(/^\d+\.\s+(.+)/);
      if (m) recs.push(m[1]);
      else summaryLines.push(line);
    }
    aiSummary = summaryLines.join(" ").trim() || aiSummary;
    aiRecs = recs.slice(0, 4);
  }

  // Issue closed pct
  const issueClosedPct = issue
    ? Math.max(0, Math.min(100, Math.round(100 - issue.unrespondedIssuePct)))
    : 0;
  const issueDashOffset = 125.66 * (1 - issueClosedPct / 100);

  // Bus factor bar data
  const busBarHeights = busf
    ? busf.contributors.slice(0, 6).map((c) => c.pct)
    : [20, 35, 15, 50, 70, 40];

  const maintenance = score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";

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

        .dash-page { background: var(--bg); min-height: 100vh; padding-top: 58px; }
        .dash-main { max-width: 1120px; margin: 0 auto; padding: 40px 24px 80px; display: flex; flex-direction: column; gap: 16px; }

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

        /* Loading / status banner */
        .status-banner {
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
          padding: 48px 28px; text-align: center; display: flex;
          flex-direction: column; align-items: center; gap: 16px;
        }
        .status-banner h2 { font-size: 18px; font-weight: 700; }
        .status-banner p { font-size: 14px; color: var(--text-muted); max-width: 420px; }
        .progress-bar-wrap {
          width: 100%; max-width: 400px; height: 4px;
          background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden;
        }
        .progress-bar-fill {
          height: 100%; border-radius: 2px;
          background: linear-gradient(90deg, var(--orange), var(--orange-light));
          transition: width 0.5s ease;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner {
          width: 32px; height: 32px; border: 2px solid rgba(255,255,255,0.08);
          border-top-color: var(--orange); border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        /* Skeleton shimmer */
        @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        .skel {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
          background-size: 800px 100%;
          animation: shimmer 1.6s infinite;
          border-radius: 6px;
        }

        /* Health section */
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
        .hstat-sub.muted { color: var(--text-muted); }

        .meta-pill {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 12px; color: var(--text-muted);
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 20px; padding: 3px 10px;
        }

        .metrics-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .metric-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
        .metric-card-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
        .metric-card-val { font-size: 22px; font-weight: 700; letter-spacing: -0.03em; color: var(--text); }
        .metric-card-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
        .metric-card-bars { display: flex; align-items: flex-end; gap: 3px; height: 48px; margin: 12px 0; }
        .metric-card-bars span { flex: 1; border-radius: 3px 3px 0 0; background: rgba(255,94,0,0.2); transition: background 0.2s; }
        .metric-card-bars span.hi { background: var(--orange); }
        .metric-card-bars span.md { background: rgba(255,94,0,0.5); }
        .metric-chart { height: 48px; margin: 12px 0; }
        .metric-chart svg { width: 100%; height: 100%; }
        .metric-donut { display: flex; align-items: center; justify-content: center; height: 48px; margin: 12px 0; }

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

        .flags-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .flag-card { border-radius: 10px; padding: 14px 16px; display: flex; align-items: flex-start; gap: 10px; }
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

        .ai-panel { border-left: 3px solid var(--orange); }
        .ai-panel-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .ai-icon-box {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg, var(--orange), var(--orange-light));
          display: flex; align-items: center; justify-content: center;
        }
        .ai-panel h3 { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
        .ai-text { font-size: 14px; color: var(--text-secondary); line-height: 1.65; margin-bottom: 20px; }
        .ai-text strong { color: var(--text); }
        .ai-recs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ai-rec { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
        .ai-rec-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--orange-light); margin-bottom: 6px; }
        .ai-rec p { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }

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
          padding: 12px 64px 12px 14px; font-family: var(--mono); font-size: 11.5px;
          color: var(--text-muted); line-height: 1.5; word-break: break-all;
        }
        .badge-copy-btn {
          position: absolute; top: 8px; right: 8px;
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 6px; padding: 4px 8px; cursor: pointer;
          font-size: 11px; color: var(--text-muted);
          transition: color 0.15s, border-color 0.15s;
        }
        .badge-copy-btn:hover { color: var(--text); border-color: var(--border-hover); }

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
        {/* NAV */}
        <nav className="dash-nav">
          <div className="dash-nav-inner">
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div className="dash-logo" onClick={() => router.push("/")}>
                <img src="/gitvital_logo_fixed.svg" alt="GitVital" />
              </div>
              <div className="dash-breadcrumb">
                <span className="sep">/</span>
                <span className="crumb">{owner}</span>
                <span className="sep">/</span>
                <span style={{ color: "var(--text)" }}>{repo}</span>
              </div>
            </div>
            <div className="dash-nav-right">
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginRight: "12px" }}>
                <a href="/leaderboard" style={{ color: "var(--text-muted)", fontSize: "13px", textDecoration: "none" }}>Leaderboard</a>
                {user?.loggedIn ? (
                  <a href={`/${user.githubUsername}`} style={{ color: "var(--orange)", fontSize: "13px", textDecoration: "none", fontWeight: "bold" }}>View Profile</a>
                ) : (
                  <a href={AUTH_URL} style={{ color: "var(--text-muted)", fontSize: "13px", textDecoration: "none" }}>Login</a>
                )}
              </div>
              {/* Stars / Forks from real data */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", marginRight: "8px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                {meta ? fmt(meta.stars) : "—"}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8 }}><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
                {meta ? fmt(meta.forks) : "—"}
              </div>
              <button className="btn-ghost" onClick={() => router.push("/compare")}>⇄ Compare</button>
              <button className="btn-primary" onClick={reanalyze} disabled={reanalyzing}>
                {reanalyzing ? "Analyzing…" : "↻ Re-analyze"}
              </button>
              <button className="btn-icon" onClick={() => navigator.clipboard.writeText(window.location.href)} title="Copy link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
            </div>
          </div>
        </nav>

        <main className="dash-main">

          {/* ── LOADING / ERROR STATE ── */}
          {isLoading && (
            <div className="status-banner card">
              <div className="spinner" />
              <h2>
                {loadState === "checking" && "Checking for existing analysis…"}
                {loadState === "queuing" && "Queueing analysis…"}
                {loadState === "polling" && "Analyzing repository…"}
              </h2>
              <p>
                {loadState === "polling"
                  ? `We're fetching commits, PRs, issues, and computing your health score. This takes about 30–60 seconds.`
                  : `Connecting to GitVital API…`}
              </p>
              {loadState === "polling" && (
                <div className="progress-bar-wrap">
                  <div className="progress-bar-fill" style={{ width: `${Math.max(jobProgress, 5)}%` }} />
                </div>
              )}
              {loadState === "polling" && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {jobProgress}% complete {jobId ? `· Job ${jobId}` : ""}
                </div>
              )}
            </div>
          )}

          {loadState === "error" && (
            <div className="status-banner card">
              <span style={{ fontSize: 32 }}>⚠️</span>
              <h2>Analysis Failed</h2>
              <p>{errorMsg}</p>
              <button className="btn-primary" onClick={reanalyze}>↻ Try Again</button>
            </div>
          )}

          {/* ── METRICS (only when data loaded) ── */}
          {loadState === "done" && metrics && (<>

            {/* HEALTH SCORE CARD */}
            <div className="card card-top-line card-pad">
              <div className="health-section">
                <div className="score-ring-wrap">
                  <svg viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r="68" stroke="rgba(255,255,255,0.06)" strokeWidth="10" fill="none" />
                    <circle
                      cx="80" cy="80" r="68"
                      stroke="url(#scoreGrad)" strokeWidth="10" fill="none"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
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
                    <span className="score-big">{Math.round(score)}</span>
                    <span className="score-of">/ 100</span>
                  </div>
                </div>

                <div className="health-meta">
                  <h2>Repository Health Score — {healthLabel(score)}</h2>
                  <p>{healthDesc(score, owner, repo)}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                    {meta?.language && <span className="meta-pill">🔵 {meta.language}</span>}
                    {meta?.isArchived && <span className="meta-pill" style={{ color: "var(--yellow)" }}>📦 Archived</span>}
                    {meta?.isFork && <span className="meta-pill">🍴 Fork</span>}
                    {meta?.totalCommitCount != null && <span className="meta-pill">📊 {fmt(meta.totalCommitCount)} commits</span>}
                  </div>
                  <div className="health-stats">
                    <div>
                      <div className="hstat-label">Bus Factor</div>
                      <div className="hstat-val">{busf?.busFactor ?? "—"}</div>
                      <div className={`hstat-sub ${busf && busf.busFactor >= 3 ? "" : "orange"}`}>
                        {busf ? (busf.busFactor >= 3 ? "Stable" : "At Risk") : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="hstat-label">Velocity</div>
                      <div className="hstat-val">
                        {activity ? (activity.velocityChange >= 0 ? "+" : "") + Math.round(activity.velocityChange) + "%" : "—"}
                      </div>
                      <div className={`hstat-sub ${activity && activity.velocityChange < 0 ? "orange" : ""}`}>
                        {activity ? velocityLabel(activity.velocityChange) : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="hstat-label">Maintenance</div>
                      <div className="hstat-val">{maintenance}</div>
                      <div className={`hstat-sub ${maintenance === "High" ? "" : "orange"}`}>
                        {maintenance === "High" ? "Healthy" : maintenance === "Medium" ? "Moderate" : "Poor"}
                      </div>
                    </div>
                    {activity && (
                      <div>
                        <div className="hstat-label">30-Day Commits</div>
                        <div className="hstat-val">{activity.commitsLast30Days}</div>
                        <div className="hstat-sub muted">recent activity</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 4 METRIC CARDS */}
            <div className="metrics-4">
              {/* Bus Factor */}
              <div className="metric-card">
                <div className="metric-card-label">Bus Factor</div>
                <div className="metric-card-bars">
                  {(busf ? busf.contributors.slice(0, 6).map((c) => c.pct) : busBarHeights).map((h, i) => (
                    <span key={i} style={{ height: `${Math.min(h, 100)}%` }}
                      className={h >= 60 ? "hi" : h >= 35 ? "md" : ""} />
                  ))}
                </div>
                <div className="metric-card-val">{busf ? busf.busFactor : "—"}</div>
                <div className="metric-card-sub">
                  {busf ? `Top contributor: ${Math.round(busf.topContributorPct)}% of commits` : "Insufficient data"}
                </div>
              </div>

              {/* PR Velocity */}
              <div className="metric-card">
                <div className="metric-card-label">PR Velocity</div>
                <div className="metric-chart">
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                    {pr && (
                      <path
                        d={`M0,35 Q25,${35 - Math.min(pr.avgMergeDays * 2, 30)} 50,${35 - Math.min(pr.medianMergeHrs / 24 * 3, 30)} T100,${35 - Math.min(pr.avgMergeDays * 2, 30)}`}
                        fill="none" stroke="#FF5E00" strokeWidth="2" strokeLinecap="round"
                      />
                    )}
                    {!pr && <path d="M0,35 Q10,5 20,25 T40,15 T60,30 T80,5 T100,20" fill="none" stroke="rgba(255,94,0,0.3)" strokeWidth="2" strokeLinecap="round" />}
                  </svg>
                </div>
                <div className="metric-card-val">{pr ? prVelocityLabel(pr.avgMergeDays) : "N/A"}</div>
                <div className="metric-card-sub" style={{ color: pr && pr.avgMergeDays < 3 ? "var(--green)" : "var(--text-muted)" }}>
                  {pr ? `Avg ${pr.avgMergeDays.toFixed(1)}d merge · ${pr.totalPRs} PRs` : "No PR workflow detected"}
                </div>
              </div>

              {/* Issue Health */}
              <div className="metric-card">
                <div className="metric-card-label">Issue Health</div>
                <div className="metric-donut">
                  <div style={{ position: "relative", width: 52, height: 52 }}>
                    <svg style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }} viewBox="0 0 52 52">
                      <circle cx="26" cy="26" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                      <circle cx="26" cy="26" r="20" fill="none" stroke="#FF5E00" strokeWidth="6"
                        strokeDasharray="125.66"
                        strokeDashoffset={issue ? issueDashOffset : 62.83}
                        strokeLinecap="round" />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--text)" }}>
                      {issue ? `${issueClosedPct}%` : "—"}
                    </div>
                  </div>
                </div>
                <div className="metric-card-val">{issue ? issueHealthLabel(issue.unrespondedIssuePct, issue.openIssueCount) : "N/A"}</div>
                <div className="metric-card-sub">
                  {issue ? `${issue.openIssueCount} open · avg ${issue.avgIssueAgeDays.toFixed(0)}d age` : "No issue data"}
                </div>
              </div>

              {/* Code Churn */}
              <div className="metric-card">
                <div className="metric-card-label">Code Churn</div>
                <div className="metric-chart">
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                    {churn && (
                      <>
                        <path d={`M0,40 L0,${40 - churn.churnScore * 0.3} Q50,${40 - churn.churnScore * 0.25} 100,${40 - churn.churnScore * 0.2} L100,40 Z`} fill="rgba(255,94,0,0.08)" />
                        <path d={`M0,${40 - churn.churnScore * 0.3} Q50,${40 - churn.churnScore * 0.25} 100,${40 - churn.churnScore * 0.2}`} fill="none" stroke="#FFA066" strokeWidth="2" strokeLinecap="round" />
                      </>
                    )}
                    {!churn && (
                      <>
                        <path d="M0,40 L0,30 Q20,35 40,25 T80,35 T100,20 L100,40 Z" fill="rgba(255,94,0,0.08)" />
                        <path d="M0,30 Q20,35 40,25 T80,35 T100,20" fill="none" stroke="rgba(255,160,102,0.4)" strokeWidth="2" strokeLinecap="round" />
                      </>
                    )}
                  </svg>
                </div>
                <div className="metric-card-val">{churn ? churnLabel(churn.churnScore) : "—"}</div>
                <div className="metric-card-sub" style={{ color: churn && churn.churnScore < 30 ? "var(--green)" : "var(--text-muted)" }}>
                  {churn ? `Avg ${Math.round(churn.avgWeeklyChurn)} lines/wk churn` : "No data"}
                </div>
              </div>
            </div>

            {/* COMMITS TIMELINE */}
            <div className="card card-pad">
              <div className="commits-header">
                <div>
                  <h3>Commits per Week</h3>
                  <p>Developer activity over the last {activeRange}
                    {activity ? ` · ${activity.totalWeeksActive} active weeks` : ""}
                  </p>
                </div>
                <div className="range-btns">
                  {(["12M", "6M", "30D"] as const).map((r) => (
                    <button key={r} className={`range-btn${activeRange === r ? " active" : ""}`} onClick={() => setActiveRange(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="commits-chart">
                {rangeWeeks.length > 1 ? (
                  <svg viewBox="0 0 1200 160" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="commitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#FF5E00" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#FF5E00" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={areaPath} fill="url(#commitGrad)" />
                    <path d={chartPath} fill="none" stroke="#FF5E00" strokeWidth="2.5" strokeLinecap="round" />
                    {/* Y-axis grid lines */}
                    {[0.25, 0.5, 0.75].map((p, i) => (
                      <line key={i} x1="0" y1={160 - p * 140} x2="1200" y2={160 - p * 140}
                        stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                    ))}
                  </svg>
                ) : (
                  <svg viewBox="0 0 1200 160" preserveAspectRatio="none">
                    <text x="600" y="88" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontFamily="system-ui" fontSize="14">
                      No commit data available for this range
                    </text>
                  </svg>
                )}
              </div>
              {/* Dynamic labels */}
              <div className="commits-labels">
                {activeRange === "30D"
                  ? ["Week 1", "Week 2", "Week 3", "Week 4"].map((l) => <span key={l}>{l}</span>)
                  : activeRange === "6M"
                  ? ["6M ago", "5M", "4M", "3M", "2M", "1M", "Now"].map((l) => <span key={l}>{l}</span>)
                  : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m) => <span key={m}>{m}</span>)
                }
              </div>
            </div>

            {/* RISK FLAGS */}
            {flags.length > 0 && (
              <div className="flags-grid">
                {flags.slice(0, 8).map((f, i) => (
                  <div key={i} className={flagCardClass(f.level)}>
                    <span className={flagIconClass(f.level)}>{flagEmoji(f.level)}</span>
                    <div>
                      <div className={flagTitleClass(f.level)}>{f.title}</div>
                      <div className="flag-desc">{f.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AI ANALYSIS */}
            <div className="card card-pad ai-panel">
              <div className="ai-panel-header">
                <div className="ai-icon-box">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3>AI Deep Analysis</h3>
                  {aiSource && (
                    <span style={{ 
                      fontSize: '11px', 
                      padding: '3px 8px', 
                      borderRadius: '12px', 
                      backgroundColor: aiSource === 'gemini' ? 'rgba(66, 133, 244, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      color: aiSource === 'gemini' ? '#8ab4f8' : 'var(--text-muted)',
                      border: '1px solid',
                      borderColor: aiSource === 'gemini' ? 'rgba(66, 133, 244, 0.3)' : 'var(--border)',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {aiSource === 'gemini' ? '✨ Gemini 1.5 Pro' : '⚙️ Fallback Engine'}
                    </span>
                  )}
                </div>
              </div>
              {aiSummary ? (
                <>
                  <p className="ai-text">{aiSummary}</p>
                  {aiRecs.length > 0 && (
                    <div className="ai-recs">
                      {aiRecs.map((rec, i) => (
                        <div key={i} className="ai-rec">
                          <div className="ai-rec-label">Recommendation {i + 1}</div>
                          <p>{rec}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="ai-text" style={{ color: "var(--text-muted)" }}>
                  AI analysis was not available at analysis time (timeout or service unavailable). Re-analyze to try again.
                </p>
              )}
            </div>

            {/* VITAL BADGES */}
            <div className="card card-pad">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>Vital Badges</span>
              </div>
              <div className="badge-section-grid">
                <div>
                  <div className="badge-section-label">Preview</div>
                  <div className="badge-preview">
                    <div className="badge-pill">
                      <span className="badge-pill-left">GIT VITAL</span>
                      <span className="badge-pill-right">HEALTH {Math.round(score)}/100</span>
                    </div>
                    {busf && (
                      <div className="badge-pill">
                        <span className="badge-pill-left">GIT VITAL</span>
                        <span className="badge-pill-right orange">{busf.busFactor} MAINTAINERS</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="badge-section-label">Embed in README</div>
                  <div className="badge-code-wrap">
                    <div className="badge-code">{`[![Git Vital](${API_BASE}/badge/${owner}/${repo}.svg)](https://1pi.gitvital.com/${owner}/${repo})`}</div>
                    <button className="badge-copy-btn" onClick={copyBadge}>{copyDone ? "✓ Copied" : "Copy"}</button>
                  </div>
                </div>
              </div>
            </div>

          </>)}
        </main>

        <footer style={{ borderTop: "1px solid var(--border)", padding: "24px", maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12.5px", color: "var(--text-muted)", flexWrap: "wrap", gap: 12 }}>
          <span>© 2024 Git Vital Analytics</span>
          <div style={{ display: "flex", gap: 20 }}>
            <a href="#" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Documentation</a>
            <a href="#" style={{ color: "var(--text-muted)", textDecoration: "none" }}>API</a>
            <a href="#" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Status</a>
            <a href="#" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Terms</a>
          </div>
        </footer>
      </div>
    </>
  );
}