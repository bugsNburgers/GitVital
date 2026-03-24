"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function RepoDashboardPage() {
  const params = useParams<{ owner: string; repo: string }>();
  const owner = params?.owner ?? "facebook";
  const repo = params?.repo ?? "react";
  const router = useRouter();

  const [activeRange, setActiveRange] = useState<"12M" | "6M" | "30D">("12M");
  const [copyDone, setCopyDone] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  function copyBadge() {
    const md = `[![Git Vital](https://gitvital.io/badge/${owner}/${repo}.svg)](https://gitvital.io/repo/${owner}/${repo})`;
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
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen">
      {/* Top Bar */}
      <nav className="sticky top-0 z-50 border-b border-primary/10 bg-background-dark/80 backdrop-blur-md px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-primary cursor-pointer" onClick={() => router.push("/")}>
              <img alt="GitVital logo" className="h-11 w-auto md:h-12" src="/gitvital_logo_fixed.svg" />
              <h1 className="text-2xl font-extrabold tracking-tight">Git Vital</h1>
            </div>
            <div className="h-6 w-[1px] bg-primary/20 mx-2"></div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400">folder_open</span>
              <span className="font-semibold text-lg">{owner}/{repo}</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 text-sm font-medium text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">star</span>
                <span>215k</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">fork_right</span>
                <span>44k</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="bg-primary/10 hover:bg-primary/20 text-primary px-4 py-2 rounded-lg text-sm font-bold transition-all border border-primary/20 flex items-center gap-2"
                onClick={() => router.push("/compare")}
              >
                <span className="material-symbols-outlined text-sm">compare_arrows</span> Compare
              </button>
              <button
                className="bg-primary text-background-dark px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2"
                onClick={reanalyze}
                disabled={reanalyzing}
              >
                <span className={`material-symbols-outlined text-sm ${reanalyzing ? "animate-spin" : ""}`}>refresh</span>
                {reanalyzing ? "Analyzing..." : "Re-analyze"}
              </button>
              <button
                className="bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-700 transition-all"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                }}
              >
                <span className="material-symbols-outlined">share</span>
              </button>
              <button className="bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-700 transition-all">
                <span className="material-symbols-outlined">brand_awareness</span>
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Row 1: Massive Health Score Ring */}
        <section className="glass rounded-xl p-8 glow-cyan relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <span className="material-symbols-outlined text-[120px] text-primary">verified_user</span>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-12 relative z-10">
            <div className="relative flex items-center justify-center">
              <svg className="w-48 h-48 transform -rotate-90">
                <circle className="text-slate-800" cx="96" cy="96" fill="transparent" r="88" stroke="currentColor" strokeWidth="12"></circle>
                <circle className="text-primary" cx="96" cy="96" fill="transparent" r="88" stroke="currentColor" strokeDasharray="552.92" strokeDashoffset="60" strokeWidth="12"></circle>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-slate-100">89</span>
                <span className="text-slate-400 text-sm font-bold">/ 100</span>
              </div>
            </div>
            <div className="flex-1 space-y-4 text-center md:text-left">
              <div>
                <h2 className="text-3xl font-bold text-slate-100 mb-1">Repository Health Score</h2>
                <p className="text-slate-400 max-w-md">Your repository is in excellent condition. Maintainers are active and technical debt is under control.</p>
              </div>
              <div className="flex flex-wrap justify-center md:justify-start gap-8 pt-4">
                <div className="space-y-1">
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Bus Factor</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-slate-100">12</span>
                    <span className="text-emerald-400 text-sm font-medium flex items-center">Stable</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Velocity</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-slate-100">+23%</span>
                    <span className="text-emerald-400 text-sm font-medium flex items-center"><span className="material-symbols-outlined text-sm">trending_up</span> Higher</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Maintenance</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-slate-100">High</span>
                    <span className="text-primary text-sm font-medium flex items-center">Healthy</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Row 2: 4 Grid Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Bus Factor Bar Chart Card */}
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-start">
              <p className="text-slate-400 font-bold text-sm">Bus Factor</p>
              <span className="material-symbols-outlined text-primary text-xl">groups</span>
            </div>
            <div className="h-24 flex items-end gap-1.5 px-2">
              <div className="bg-primary/20 w-full h-[40%] rounded-t-sm"></div>
              <div className="bg-primary/30 w-full h-[60%] rounded-t-sm"></div>
              <div className="bg-primary/50 w-full h-[45%] rounded-t-sm"></div>
              <div className="bg-primary/70 w-full h-[80%] rounded-t-sm"></div>
              <div className="bg-primary w-full h-[95%] rounded-t-sm"></div>
              <div className="bg-primary/80 w-full h-[70%] rounded-t-sm"></div>
            </div>
            <div className="flex justify-between items-baseline">
              <p className="text-2xl font-bold text-slate-100">High</p>
              <p className="text-slate-500 text-xs">Last 30 days</p>
            </div>
          </div>
          {/* PR Velocity Sparkline Card */}
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-start">
              <p className="text-slate-400 font-bold text-sm">PR Velocity</p>
              <span className="material-symbols-outlined text-primary text-xl">speed</span>
            </div>
            <div className="h-24 py-2">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                <path className="text-primary" d="M0,35 Q10,5 20,25 T40,15 T60,30 T80,5 T100,20" fill="none" stroke="currentColor" strokeWidth="2"></path>
              </svg>
            </div>
            <div className="flex justify-between items-baseline">
              <p className="text-2xl font-bold text-slate-100">Stable</p>
              <p className="text-emerald-400 text-xs font-bold">+12% avg</p>
            </div>
          </div>
          {/* Issue Health Donut Card */}
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-start">
              <p className="text-slate-400 font-bold text-sm">Issue Health</p>
              <span className="material-symbols-outlined text-primary text-xl">error_circle_rounded</span>
            </div>
            <div className="h-24 flex items-center justify-center">
              <div className="relative w-20 h-20">
                <svg className="w-full h-full transform -rotate-90">
                  <circle className="text-slate-800" cx="40" cy="40" fill="transparent" r="32" stroke="currentColor" strokeWidth="8"></circle>
                  <circle className="text-primary" cx="40" cy="40" fill="transparent" r="32" stroke="currentColor" strokeDasharray="201" strokeDashoffset="30" strokeWidth="8"></circle>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-100">85%</div>
              </div>
            </div>
            <div className="flex justify-between items-baseline">
              <p className="text-2xl font-bold text-slate-100">Healthy</p>
              <p className="text-slate-500 text-xs">2.4 days closure</p>
            </div>
          </div>
          {/* Code Churn Area Chart Card */}
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-start">
              <p className="text-slate-400 font-bold text-sm">Code Churn</p>
              <span className="material-symbols-outlined text-primary text-xl">history_toggle_off</span>
            </div>
            <div className="h-24 py-2">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                <path className="text-primary/10" d="M0,40 L0,30 Q20,35 40,25 T80,35 T100,20 L100,40 Z" fill="currentColor"></path>
                <path className="text-primary" d="M0,30 Q20,35 40,25 T80,35 T100,20" fill="none" stroke="currentColor" strokeWidth="2"></path>
              </svg>
            </div>
            <div className="flex justify-between items-baseline">
              <p className="text-2xl font-bold text-slate-100">Low</p>
              <p className="text-emerald-400 text-xs font-bold">-5% risk</p>
            </div>
          </div>
        </section>
        {/* Row 3: Commits Activity Timeline */}
        <section className="glass rounded-xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-100">Commits per Week</h3>
              <p className="text-slate-400 text-sm">Developer activity over the last 12 months</p>
            </div>
            <div className="flex gap-2">
              {(["12M", "6M", "30D"] as const).map((r) => (
                <button
                  key={r}
                  className={`px-3 py-1 text-xs font-bold rounded transition-all ${activeRange === r
                    ? "bg-primary text-background-dark"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  onClick={() => setActiveRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64 relative">
            <svg className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gradient" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#4ccaf0" stopOpacity="0.3"></stop>
                  <stop offset="100%" stopColor="#4ccaf0" stopOpacity="0"></stop>
                </linearGradient>
              </defs>
              <path d="M0,180 Q100,120 200,150 T400,100 T600,140 T800,80 T1000,120 L1200,50 L1200,250 L0,250 Z" fill="url(#gradient)"></path>
              <path d="M0,180 Q100,120 200,150 T400,100 T600,140 T800,80 T1000,120 L1200,50" fill="none" stroke="#4ccaf0" strokeLinecap="round" strokeWidth="3"></path>
            </svg>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 pt-4 text-[10px] font-bold text-slate-500 tracking-widest uppercase">
              <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
            </div>
          </div>
        </section>
        {/* Row 4: Risk Flags */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg flex items-start gap-3">
            <span className="material-symbols-outlined text-red-400">warning</span>
            <div>
              <p className="text-red-400 font-bold text-sm">Critical Risk</p>
              <p className="text-xs text-red-300/70">Unmaintained dependencies detected.</p>
            </div>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-lg flex items-start gap-3">
            <span className="material-symbols-outlined text-orange-400">priority_high</span>
            <div>
              <p className="text-orange-400 font-bold text-sm">Attention Needed</p>
              <p className="text-xs text-orange-300/70">Security scan pending for 3 PRs.</p>
            </div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg flex items-start gap-3">
            <span className="material-symbols-outlined text-emerald-400">check_circle</span>
            <div>
              <p className="text-emerald-400 font-bold text-sm">Code Quality</p>
              <p className="text-xs text-emerald-300/70">Zero linting errors in latest master.</p>
            </div>
          </div>
          <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg flex items-start gap-3">
            <span className="material-symbols-outlined text-primary">info</span>
            <div>
              <p className="text-primary font-bold text-sm">Community</p>
              <p className="text-xs text-primary/70">High engagement on Discussion board.</p>
            </div>
          </div>
        </section>
        {/* Row 5: AI Analysis Panel */}
        <section className="glass rounded-xl p-6 border-l-4 border-l-primary relative overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/20 rounded-lg text-primary">
              <span className="material-symbols-outlined">auto_awesome</span>
            </div>
            <h3 className="text-xl font-bold text-slate-100">AI Deep Analysis</h3>
          </div>
          <div className="space-y-4">
            <p className="text-slate-300 leading-relaxed">
              Based on recent commit patterns, <span className="text-primary font-semibold">{owner}/{repo}</span> is currently optimizing for memory efficiency in concurrent rendering. We noticed a <span className="text-emerald-400 font-semibold">15% reduction</span> in object allocation churn over the last 14 days.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <p className="text-xs font-bold text-primary uppercase mb-2">Recommendation 1</p>
                <p className="text-sm text-slate-300">Expand unit tests for the new Scheduler hooks to maintain high coverage before next release.</p>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                <p className="text-xs font-bold text-primary uppercase mb-2">Recommendation 2</p>
                <p className="text-sm text-slate-300">Invite more community maintainers to the &apos;documentation&apos; tag to reduce PR wait times.</p>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-10 -right-10 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[200px]">auto_awesome</span>
          </div>
        </section>
        {/* Row 6: Embeddable Badge */}
        <section className="glass rounded-xl p-6 space-y-6">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-400">code</span>
            <h3 className="text-lg font-bold text-slate-100">Vital Badges</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <p className="text-sm text-slate-400 font-medium">Preview</p>
              <div className="flex items-center gap-4">
                <div className="bg-slate-900 px-3 py-1.5 rounded flex items-center gap-2 border border-slate-700">
                  <span className="material-symbols-outlined text-primary text-sm">pulse_alert</span>
                  <span className="text-[11px] font-bold tracking-tight border-r border-slate-700 pr-2 mr-2">GIT VITAL</span>
                  <span className="text-[11px] font-bold text-emerald-400">HEALTH 89/100</span>
                </div>
                <div className="bg-slate-900 px-3 py-1.5 rounded flex items-center gap-2 border border-slate-700">
                  <span className="text-[11px] font-bold tracking-tight border-r border-slate-700 pr-2 mr-2 uppercase">GIT VITAL</span>
                  <span className="text-[11px] font-bold text-primary">12 MAINTAINERS</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-slate-400 font-medium">Embed in README</p>
              <div className="relative group">
                <pre className="bg-slate-950 p-3 rounded-lg text-xs font-mono text-slate-400 overflow-x-auto border border-slate-800">{`[![Git Vital](https://gitvital.io/badge/${owner}/${repo}.svg)](https://gitvital.io/repo/${owner}/${repo})`}</pre>
                <button
                  className="absolute top-2 right-2 p-1.5 bg-slate-800 rounded hover:bg-slate-700 text-slate-400"
                  onClick={copyBadge}
                  title="Copy to clipboard"
                >
                  <span className="material-symbols-outlined text-sm">{copyDone ? "check" : "content_copy"}</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-primary/10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 opacity-60 grayscale">
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined">pulse_alert</span>
            <span className="font-bold">Git Vital AI © 2024</span>
          </div>
          <div className="flex gap-8 text-sm font-medium">
            <a className="hover:text-primary transition-colors" href="#">Documentation</a>
            <a className="hover:text-primary transition-colors" href="#">API</a>
            <a className="hover:text-primary transition-colors" href="#">Status</a>
            <a className="hover:text-primary transition-colors" href="#">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}