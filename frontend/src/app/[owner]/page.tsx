"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE, AUTH_URL } from "@/config";

type BadgeTone = "orange" | "secondary" | "emerald" | "orange-light";
type LoadState = "checking" | "queuing" | "polling" | "done" | "error";

interface ProfileBadge {
  title: string;
  desc: string;
  level: string;
  icon: string;
  tone: BadgeTone;
}

interface ProfileRepo {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  healthScore: number | null;
  url: string;
}

interface UserProfileResponse {
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  twitterUsername: string | null;
  profileUrl: string;
  joinedAt: string;
  followers: number;
  following: number;
  publicRepos: number;
  topLanguage: string | null;
  developerScore: number;
  reliabilityPct: number;
  percentile: string;
  needsAnalysis: boolean;
  contribution: {
    externalPRCount: number;
    externalMergedPRCount: number;
    contributionAcceptanceRate: number;
    analyzedAt: string | null;
  };
  badges: ProfileBadge[];
  repos: ProfileRepo[];
  lastAnalyzedAt: string | null;
}

interface AnalyzeResponse {
  status?: "queued" | "processing" | "done" | "failed";
  jobId?: string;
  error?: string;
}

interface UserJobStatusResponse {
  status?: "queued" | "processing" | "done" | "failed";
  progress?: number;
  error?: string | null;
}

const COLORS = {
  orange: "#FF5E00",
  green: "#22c55e",
  secondary: "#0ea5e9",
};

const FALLBACK_SPARKS = [
  [65, 72, 68, 85, 92, 88, 98],
  [40, 55, 48, 70, 75, 82, 94],
  [80, 82, 85, 83, 88, 87, 89],
  [90, 92, 95, 94, 96, 98, 97],
  [60, 65, 72, 70, 85, 88, 92],
];

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatJoinedLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Joined recently";
  }
  return `Joined ${date.getUTCFullYear()}`;
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const delta = Date.now() - date.getTime();
  if (Number.isNaN(date.getTime()) || delta < 0) {
    return "just now";
  }

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < hour) return `${Math.max(1, Math.floor(delta / minute))}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  if (delta < day * 30) return `${Math.floor(delta / day)}d ago`;
  return date.toLocaleDateString();
}

function sparkPath(data: number[]): string {
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 100 / Math.max(data.length - 1, 1);
  return data
    .map((value, index) => {
      const command = index === 0 ? "M" : "L";
      const x = (index * width).toFixed(1);
      const y = (40 - ((value - min) / range) * 36).toFixed(1);
      return `${command}${x},${y}`;
    })
    .join(" ");
}

function toneClass(tone: BadgeTone): string {
  if (tone === "secondary") return "tone-secondary";
  if (tone === "emerald") return "tone-emerald";
  if (tone === "orange-light") return "tone-orange-light";
  return "tone-orange";
}

function languageClass(language: string | null): string {
  const lower = (language || "").toLowerCase();
  if (lower.includes("typescript")) return "lang-typescript";
  if (lower.includes("javascript")) return "lang-javascript";
  if (lower.includes("python")) return "lang-python";
  if (lower.includes("go")) return "lang-go";
  if (lower.includes("rust")) return "lang-rust";
  return "lang-default";
}

function repoIcon(language: string | null): string {
  const lower = (language || "").toLowerCase();
  if (lower.includes("typescript") || lower.includes("javascript")) return "terminal";
  if (lower.includes("python")) return "smart_toy";
  if (lower.includes("go") || lower.includes("rust")) return "settings_suggest";
  return "description";
}

function sparkSeriesForRepo(repo: ProfileRepo, index: number): number[] {
  const fallback = FALLBACK_SPARKS[index % FALLBACK_SPARKS.length];
  if (repo.healthScore === null) return fallback;

  const seed = Math.round(repo.healthScore) + (repo.stars % 10) + (repo.forks % 7);
  return fallback.map((value, i) => Math.max(8, value + ((seed + i * 3) % 11) - 5));
}

function sortRepos(repos: ProfileRepo[], sortKey: "health" | "activity" | "stars"): ProfileRepo[] {
  const list = [...repos];

  if (sortKey === "health") {
    list.sort((a, b) => {
      if (a.healthScore === null && b.healthScore !== null) return 1;
      if (a.healthScore !== null && b.healthScore === null) return -1;
      if (a.healthScore !== null && b.healthScore !== null) return b.healthScore - a.healthScore;
      return b.stars - a.stars;
    });
    return list;
  }

  if (sortKey === "stars") {
    list.sort((a, b) => b.stars - a.stars);
    return list;
  }

  list.sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });
  return list;
}

export default function UserProfilePage() {
  const params = useParams<{ owner: string }>();
  const ownerParam = params?.owner ?? "octocat";
  const owner = decodeURIComponent(ownerParam);
  const router = useRouter();

  const [user, setUser] = useState<{ loggedIn: boolean; githubUsername?: string } | null>(null);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [repoSort, setRepoSort] = useState<"health" | "activity" | "stars">("health");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const score = Math.round(profile?.developerScore ?? 0);
  const scoreDashOffset = 113 * (1 - clamp(score) / 100);
  const reliability = Math.round(profile?.reliabilityPct ?? 0);

  const sortedRepos = useMemo(() => sortRepos(profile?.repos ?? [], repoSort), [profile?.repos, repoSort]);

  const fetchProfile = useCallback(async (): Promise<UserProfileResponse | null> => {
    const response = await fetch(`${API_BASE}/api/user/${encodeURIComponent(owner)}`, { credentials: "include" });

    if (!response.ok) {
      let message = `Failed to load profile (HTTP ${response.status}).`;
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) {
          message = payload.error;
        }
      } catch {
        // Keep generic message if JSON parse fails.
      }
      throw new Error(message);
    }

    const payload = (await response.json()) as UserProfileResponse;
    setProfile(payload);
    return payload;
  }, [owner]);

  const startPolling = useCallback(
    (targetJobId: string) => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }

      setLoadState("polling");
      setJobId(targetJobId);
      setJobProgress(5);

      pollRef.current = setInterval(async () => {
        try {
          const statusResponse = await fetch(`${API_BASE}/api/user/status/${targetJobId}`, {
            credentials: "include",
          });

          if (!statusResponse.ok) {
            return;
          }

          const statusPayload = (await statusResponse.json()) as UserJobStatusResponse;
          if (typeof statusPayload.progress === "number") {
            setJobProgress(clamp(statusPayload.progress));
          }

          if (statusPayload.status === "done") {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }

            await fetchProfile();
            setJobProgress(100);
            setLoadState("done");
            setErrorMsg(null);
            return;
          }

          if (statusPayload.status === "failed") {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setErrorMsg(statusPayload.error || "User analysis failed. Please try again.");
            setLoadState("error");
          }
        } catch {
          // Ignore transient polling failures and keep retrying.
        }
      }, 3000);
    },
    [fetchProfile],
  );

  useEffect(() => {
    fetch(`${API_BASE}/api/me`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setUser(data))
      .catch(() => setUser({ loggedIn: false }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      setLoadState("checking");
      setErrorMsg(null);
      setJobProgress(0);
      setJobId(null);

      try {
        const profilePayload = await fetchProfile();
        if (cancelled || !profilePayload) {
          return;
        }

        if (!profilePayload.needsAnalysis) {
          setLoadState("done");
          return;
        }

        setLoadState("queuing");
        const analyzeResponse = await fetch(`${API_BASE}/api/user/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username: owner }),
        });

        const payload = (await analyzeResponse.json()) as AnalyzeResponse;

        if (!analyzeResponse.ok) {
          setErrorMsg(payload.error || `Failed to start analysis (HTTP ${analyzeResponse.status}).`);
          setLoadState("error");
          return;
        }

        if (payload.status === "done") {
          await fetchProfile();
          setLoadState("done");
          return;
        }

        if (payload.jobId) {
          startPolling(payload.jobId);
          return;
        }

        setErrorMsg("Failed to create user analysis job.");
        setLoadState("error");
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : `Could not connect to the GitVital API at ${API_BASE}.`;
        setErrorMsg(message);
        setLoadState("error");
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [owner, fetchProfile, startPolling]);

  const reanalyzeProfile = useCallback(async () => {
    setErrorMsg(null);
    setJobProgress(0);
    setLoadState("queuing");

    try {
      const analyzeResponse = await fetch(`${API_BASE}/api/user/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: owner, force: true }),
      });

      const payload = (await analyzeResponse.json()) as AnalyzeResponse;

      if (!analyzeResponse.ok) {
        setErrorMsg(payload.error || `Failed to start analysis (HTTP ${analyzeResponse.status}).`);
        setLoadState("error");
        return;
      }

      if (payload.status === "done") {
        await fetchProfile();
        setLoadState("done");
        return;
      }

      if (payload.jobId) {
        startPolling(payload.jobId);
        return;
      }

      setErrorMsg("Failed to create user analysis job.");
      setLoadState("error");
    } catch {
      setErrorMsg("Failed to start user analysis.");
      setLoadState("error");
    }
  }, [owner, fetchProfile, startPolling]);

  const busy = loadState === "queuing" || loadState === "polling";
  const loadingOnly = loadState === "checking" && !profile;
  const hardError = loadState === "error" && !profile;
  const lastAnalyzed = profile?.lastAnalyzedAt ? formatRelativeTime(profile.lastAnalyzedAt) : "Not analyzed yet";

  const statusTitle = loadState === "queuing"
    ? "Queueing profile analysis"
    : loadState === "polling"
      ? "Analyzing open-source contributions"
      : "";

  function renderSpark(data: number[], color: string, index: number) {
    const line = sparkPath(data);
    const areaPath = `${line} L100,40 L0,40 Z`;
    const gradientId = `profile-spark-${index}-${color.replace("#", "")}`;

    return (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="spark-svg">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #080909; --bg-surface: #0f1011; --bg-card: #111314; --bg-card-hover: #161819;
          --border: rgba(255,255,255,0.055); --border-hover: rgba(255,255,255,0.12);
          --text: #f4f4f5; --text-secondary: #a1a1aa; --text-muted: #52525b;
          --green: #22c55e; --yellow: #eab308; --red: #ef4444;
          --orange: #FF5E00; --orange-light: #FFA066; --orange-dim: rgba(255,94,0,0.12);
          --font: 'Inter', system-ui, sans-serif; --mono: 'Geist Mono', monospace;
        }
        body { font-family: var(--font); background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }

        .cmp-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: 58px;
          display: flex; align-items: center; padding: 0 24px;
          background: rgba(8,9,9,0.80); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .cmp-nav-inner { width: 100%; max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .cmp-logo { display: flex; align-items: center; cursor: pointer; }
        .cmp-logo img { height: 36px; }
        .nav-search { flex: 1; max-width: 400px; position: relative; }
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
        .nav-user {
          display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px;
          background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 20px;
        }
        .nav-avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--orange-dim); color: var(--orange); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
        .nav-username { font-size: 12px; font-weight: 600; }

        .profile-root { background: var(--bg); min-height: 100vh; font-family: var(--font); color: var(--text); }
        .page-main { max-width: 1200px; margin: 0 auto; padding: 90px 24px 60px; display: flex; flex-direction: column; gap: 24px; }

        .status-banner {
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
          padding: 18px 20px; display: flex; flex-direction: column; gap: 10px;
        }
        .status-banner h3 { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
        .status-banner p { font-size: 13px; color: var(--text-secondary); }
        .status-banner.error { border-color: rgba(239,68,68,0.35); }
        .progress-track { width: 100%; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, var(--orange), #ff9d66); transition: width 0.4s ease; }

        .profile-hdr {
          position: relative; background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 24px; padding: 34px; overflow: hidden;
          display: flex; gap: 34px; align-items: center;
        }
        .profile-glow {
          position: absolute; top: 0; right: 0; width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(255,94,0,0.1) 0%, transparent 70%);
          transform: translate(30%, -30%); pointer-events: none;
        }
        .profile-avatar-wrapper { position: relative; flex-shrink: 0; }
        .profile-avatar-img { width: 140px; height: 140px; border-radius: 50%; object-fit: cover; border: 4px solid var(--bg); box-shadow: 0 0 0 2px var(--orange-dim); }
        .profile-score-badge { position: absolute; bottom: -5px; right: -5px; background: var(--bg); border-radius: 50%; padding: 4px; }
        .score-circle { width: 48px; height: 48px; position: relative; }
        .score-circle svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .score-circle circle.bg { stroke: rgba(255,255,255,0.1); fill: none; stroke-width: 3.5; }
        .score-circle circle.fg { stroke: var(--orange); fill: none; stroke-width: 3.5; stroke-linecap: round; transition: stroke-dashoffset 0.5s ease; }
        .score-circle span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: var(--orange); }

        .profile-info { flex: 1; }
        .profile-name { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }
        .profile-name h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.04em; }
        .profile-tag { background: var(--orange-dim); color: var(--orange-light); border: 1px solid rgba(255,94,0,0.2); padding: 2px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
        .profile-title { font-size: 15px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5; }
        .profile-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
        .meta-item { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; }

        .profile-actions { display: flex; gap: 12px; flex-wrap: wrap; }
        .btn-primary {
          background: var(--orange); color: #fff; border: 1px solid rgba(255,94,0,0.5);
          border-radius: 12px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
          transition: background 0.2s, box-shadow 0.2s; text-decoration: none;
        }
        .btn-primary:hover { background: #D94E00; box-shadow: 0 0 20px rgba(255,94,0,0.3); }
        .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
        .btn-secondary {
          background: rgba(255,255,255,0.04); color: var(--text); border: 1px solid var(--border);
          border-radius: 12px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
          transition: background 0.2s;
        }
        .btn-secondary:hover { background: rgba(255,255,255,0.08); }

        .profile-score-summary {
          text-align: center; padding: 18px 24px; background: rgba(255,255,255,0.02);
          border: 1px solid var(--border); border-radius: 16px; min-width: 170px;
        }
        .score-summary-th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 4px; display: block; }
        .score-summary-val { font-size: 44px; font-weight: 800; line-height: 1; letter-spacing: -0.05em; color: var(--orange); margin-bottom: 10px; display: block; }
        .score-reliability-row { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .score-reliability-label { color: var(--text-muted); }
        .score-reliability-value { color: var(--orange-light); }
        .score-summary-bar { width: 104px; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; margin: 0 auto; }
        .score-summary-bar-fill { height: 100%; background: var(--orange); transition: width 0.3s ease; }

        .section-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
        .section-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
        .section-title .material-symbols-outlined { color: var(--orange); }

        .achievements-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; overflow-x: auto; padding-bottom: 8px; }
        .badge-card {
          background: var(--bg-card); border: 1px solid var(--border); border-top: 2px solid var(--orange);
          border-radius: 16px; padding: 20px; display: flex; flex-direction: column; align-items: center; text-align: center;
          transition: border-color 0.2s, transform 0.2s; min-width: 200px;
        }
        .badge-card:hover { border-color: var(--border-hover); transform: translateY(-2px); }
        .badge-icon-wrapper { width: 56px; height: 56px; border-radius: 50%; background: var(--orange-dim); color: var(--orange); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .badge-icon-wrapper .material-symbols-outlined { font-size: 28px; }
        .badge-title { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
        .badge-desc { font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; }
        .badge-level { font-family: var(--mono); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
        .tone-orange { border-top-color: #FF5E00; }
        .tone-secondary { border-top-color: #0ea5e9; }
        .tone-emerald { border-top-color: #10b981; }
        .tone-orange-light { border-top-color: #FFA066; }

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
        .repo-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .repo-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
        .repo-health { display: flex; flex-direction: column; align-items: flex-end; }
        .repo-health-lbl { font-family: var(--mono); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .repo-health-val { font-size: 18px; font-weight: 800; color: var(--green); }
        .repo-health-val.na { color: var(--text-muted); }
        .repo-name { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
        .repo-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 14px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 38px; }
        .repo-spark { height: 40px; margin-bottom: 14px; }
        .repo-foot { display: flex; justify-content: space-between; align-items: center; }
        .repo-lang { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; }
        .repo-lang-dot { width: 10px; height: 10px; border-radius: 50%; }
        .lang-typescript { background-color: #3b82f6; }
        .lang-javascript { background-color: #eab308; }
        .lang-python { background-color: #4f46e5; }
        .lang-go { background-color: #06b6d4; }
        .lang-rust { background-color: #fb923c; }
        .lang-default { background-color: #94a3b8; }
        .repo-stars { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-muted); }

        .section-empty {
          background: rgba(255,255,255,0.02); border: 1px dashed var(--border);
          border-radius: 14px; padding: 22px; color: var(--text-secondary); font-size: 14px;
        }

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

        .spark-svg { width: 100%; height: 100%; overflow: visible; }

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
      `,
        }}
      />

      <div className="profile-root">
        <nav className="cmp-nav">
          <div className="cmp-nav-inner">
            <div className="cmp-logo" onClick={() => router.push("/") }>
              <img src="/gitvital_logo_fixed.svg" alt="GitVital" />
            </div>

            <div className="nav-search">
              <span className="material-symbols-outlined">search</span>
              <input
                type="text"
                placeholder="Search developers or repos..."
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const value = (event.currentTarget.value || "").trim();
                  if (!value) return;
                  router.push(`/${value}`);
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
          {loadingOnly && (
            <section className="status-banner">
              <h3>Loading developer profile</h3>
              <p>Contacting GitVital backend and fetching live GitHub profile data.</p>
            </section>
          )}

          {hardError && (
            <section className="status-banner error">
              <h3>Profile unavailable</h3>
              <p>{errorMsg || "Could not load this user profile."}</p>
            </section>
          )}

          {profile && busy && (
            <section className="status-banner">
              <h3>{statusTitle}</h3>
              <p>
                {loadState === "queuing"
                  ? "Preparing user analysis job."
                  : "Computing external contribution metrics from merged pull requests."}
              </p>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.max(8, jobProgress)}%` }} />
              </div>
              <p>{Math.max(8, jobProgress)}% complete {jobId ? `- Job ${jobId}` : ""}</p>
            </section>
          )}

          {profile && loadState === "error" && errorMsg && (
            <section className="status-banner error">
              <h3>Analysis warning</h3>
              <p>{errorMsg}</p>
            </section>
          )}

          {profile && (
            <>
              <section className="profile-hdr">
                <div className="profile-glow" />

                <div className="profile-avatar-wrapper">
                  <img
                    alt={`${profile.username} avatar`}
                    className="profile-avatar-img"
                    src={profile.avatarUrl}
                  />
                  <div className="profile-score-badge">
                    <div className="score-circle">
                      <svg viewBox="0 0 40 40">
                        <circle className="bg" cx="20" cy="20" r="18" />
                        <circle
                          className="fg"
                          cx="20"
                          cy="20"
                          r="18"
                          strokeDasharray="113"
                          strokeDashoffset={scoreDashOffset}
                        />
                      </svg>
                      <span>{score}%</span>
                    </div>
                  </div>
                </div>

                <div className="profile-info">
                  <div className="profile-name">
                    <h1>{profile.displayName}</h1>
                    <span className="profile-tag">{profile.percentile}</span>
                  </div>
                  <p className="profile-title">{profile.bio || "GitHub developer profile with live contribution analytics."}</p>

                  <div className="profile-meta">
                    <div className="meta-item"><span className="material-symbols-outlined">code</span> {profile.topLanguage || "Polyglot"}</div>
                    {profile.location && (
                      <div className="meta-item"><span className="material-symbols-outlined">location_on</span> {profile.location}</div>
                    )}
                    <div className="meta-item"><span className="material-symbols-outlined">calendar_today</span> {formatJoinedLabel(profile.joinedAt)}</div>
                    <div className="meta-item"><span className="material-symbols-outlined">groups</span> {compactNumber(profile.followers)} followers</div>
                    <div className="meta-item"><span className="material-symbols-outlined">merge</span> {profile.contribution.externalPRCount} external merged PRs</div>
                  </div>

                  <div className="profile-actions">
                    <a href={profile.profileUrl} target="_blank" rel="noreferrer" className="btn-primary">View GitHub</a>
                    <button className="btn-secondary" onClick={reanalyzeProfile} disabled={busy}>Re-analyze Profile</button>
                    <button className="btn-secondary" onClick={() => router.push("/compare")}>Compare Repos</button>
                  </div>
                </div>

                <div className="profile-score-summary">
                  <span className="score-summary-th">Developer Score</span>
                  <span className="score-summary-val">{score}</span>
                  <div className="score-reliability-row">
                    <span className="score-reliability-label">Reliability</span>
                    <span className="score-reliability-value">{reliability}%</span>
                  </div>
                  <div className="score-summary-bar">
                    <div className="score-summary-bar-fill" style={{ width: `${reliability}%` }} />
                  </div>
                </div>
              </section>

              <section>
                <div className="section-header">
                  <h3 className="section-title"><span className="material-symbols-outlined">military_tech</span> Achievement Badges</h3>
                  <button className="btn-secondary" onClick={reanalyzeProfile} disabled={busy}>
                    {profile.needsAnalysis ? "Generate Insights" : "Refresh Badges"}
                  </button>
                </div>

                {profile.badges.length === 0 ? (
                  <div className="section-empty">No badge data yet. Run profile analysis to generate achievements.</div>
                ) : (
                  <div className="achievements-grid">
                    {profile.badges.map((badge) => (
                      <div key={`${badge.title}-${badge.level}`} className={`badge-card ${toneClass(badge.tone)}`}>
                        <div className="badge-icon-wrapper">
                          <span className="material-symbols-outlined">{badge.icon}</span>
                        </div>
                        <h4 className="badge-title">{badge.title}</h4>
                        <p className="badge-desc">{badge.desc}</p>
                        <span className="badge-level">{badge.level}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="section-header">
                  <h3 className="section-title"><span className="material-symbols-outlined">data_object</span> Repositories</h3>
                  <div className="repo-controls">
                    <span className="repo-last-analyzed">Last analyzed: {lastAnalyzed}</span>
                    <select
                      aria-label="Sort repositories"
                      title="Sort repositories"
                      value={repoSort}
                      onChange={(event) => setRepoSort(event.target.value as "health" | "activity" | "stars")}
                    >
                      <option value="health">Health Score</option>
                      <option value="activity">Recent Activity</option>
                      <option value="stars">Stars</option>
                    </select>
                  </div>
                </div>

                {sortedRepos.length === 0 ? (
                  <div className="section-empty">No repositories found for this developer.</div>
                ) : (
                  <div className="repo-grid">
                    {sortedRepos.map((repo, index) => {
                      const healthText = repo.healthScore !== null ? repo.healthScore.toFixed(1) : "--";
                      const healthClass = repo.healthScore !== null ? "repo-health-val" : "repo-health-val na";
                      const sparkColor = repo.healthScore !== null && repo.healthScore >= 75
                        ? COLORS.green
                        : repo.healthScore !== null && repo.healthScore >= 50
                          ? COLORS.secondary
                          : COLORS.orange;

                      return (
                        <div key={repo.fullName} className="repo-card" onClick={() => router.push(`/${repo.owner}/${repo.name}`)}>
                          <div className="repo-card-top">
                            <div className="repo-icon"><span className="material-symbols-outlined">{repoIcon(repo.language)}</span></div>
                            <div className="repo-health">
                              <span className="repo-health-lbl">Health</span>
                              <span className={healthClass}>{healthText}</span>
                            </div>
                          </div>

                          <h4 className="repo-name">{repo.name}</h4>
                          <p className="repo-desc">{repo.description || "No repository description available."}</p>

                          <div className="repo-spark">
                            {renderSpark(sparkSeriesForRepo(repo, index), sparkColor, index)}
                          </div>

                          <div className="repo-foot">
                            <div className="repo-lang">
                              <span className={`repo-lang-dot ${languageClass(repo.language)}`} />
                              {repo.language || "Unknown"}
                            </div>
                            <div className="repo-stars">
                              <span className="material-symbols-outlined">star</span>
                              {compactNumber(repo.stars)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </main>

        <footer className="site-footer">
          <div className="footer-left">
            <div className="footer-icon"><span className="material-symbols-outlined">pulse_alert</span></div>
            <span className="footer-text">© 2026 Git Vital Analytics. Build with integrity.</span>
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
