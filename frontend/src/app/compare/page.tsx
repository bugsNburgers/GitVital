"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_REPOS = ["facebook/react", "vuejs/core", "sveltejs/svelte"];

const REPO_COLORS = [
  { dot: "bg-primary shadow-[0_0_8px_#4ccaf0]", border: "border-primary/10", text: "text-primary", label: "react.sys", fill: "rgba(76,202,240,0.15)", stroke: "#4ccaf0", points: "200,40 350,150 290,320 110,320 60,150", pointFill: "#4ccaf0" },
  { dot: "bg-orange-400 shadow-[0_0_8px_#FFB380]", border: "border-orange-500/10", text: "text-orange-300", label: "vue.sys", fill: "rgba(255,160,102,0.15)", stroke: "#FFB380", points: "200,90 310,165 260,280 140,280 90,165", pointFill: "#FFB380" },
  { dot: "bg-orange-400 shadow-[0_0_8px_#fb923c]", border: "border-orange-500/10", text: "text-orange-300", label: "svelte.sys", fill: "rgba(249,115,22,0.15)", stroke: "#fb923c", points: "200,130 270,180 230,240 170,240 130,180", pointFill: "#fb923c" },
];

export default function RepoComparePage() {
  const router = useRouter();
  const [repos, setRepos] = useState(DEFAULT_REPOS);
  const [showSlot, setShowSlot] = useState(repos.length < 4);

  function updateRepo(idx: number, val: string) {
    setRepos((prev) => prev.map((r, i) => (i === idx ? val : r)));
  }

  function clearRepo(idx: number) {
    setRepos((prev) => prev.filter((_, i) => i !== idx));
  }

  function addRepo() {
    if (repos.length < 4) {
      setRepos((prev) => [...prev, ""]);
      setShowSlot(false);
    }
  }

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen">
      <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
        {/* Top Navigation */}
        <header className="sticky top-0 z-50 w-full glass border-b border-primary/10 px-6 py-3 lg:px-20">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push("/")}>
              <img alt="GitVital logo" className="h-11 w-auto md:h-12" src="/gitvital_logo_fixed.svg" />
              <h2 className="text-2xl font-black tracking-tight text-slate-100 uppercase">Git Vital</h2>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <a className="text-sm font-semibold text-slate-400 hover:text-primary transition-colors flex items-center gap-2" href="/">
                <span className="material-symbols-outlined text-lg">grid_view</span> Dashboard
              </a>
              <a className="text-sm font-semibold text-primary flex items-center gap-2" href="/compare">
                <span className="material-symbols-outlined text-lg">compare_arrows</span> Compare
              </a>
              <a className="text-sm font-semibold text-slate-400 hover:text-primary transition-colors flex items-center gap-2" href="#">
                <span className="material-symbols-outlined text-lg">insights</span> Insights
              </a>
            </nav>
            <div className="flex items-center gap-3">
              <button className="p-2 rounded-xl glass hover:bg-primary/20 text-slate-100 transition-all">
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-primary to-blue-500 p-0.5">
                <div className="h-full w-full rounded-full bg-background-dark overflow-hidden">
                  <img alt="User Profile" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBjY5BtPreYQTK_7ho5n3BHpawIZ3xBJ560hrhXbMyITmzMDi44ujCTo7-X0xiIA9zEUb10VMEDMK29LBY3F2NoZ0JAu_Cb2fuM0G9wKnh12bmJliUOa8QouW2AekSUkm72ZtJUduaC764nab0p2Qfj8QVdHmGiSE0ZDL_0k7D_ewhVi9wCUiAHsiqpuPrAs3lFFzum3rglia9wffLy99B35MPn3i_VI1RfzTHxWcSboImFjcQTgDsKjzODIB4FxICuqZWy2kF3vVA" />
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 lg:px-20">
          {/* Comparison Inputs Section */}
          <section className="mb-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
              <div className="space-y-2">
                <h1 className="text-4xl font-black text-slate-100 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">Compare Repositories</h1>
                <p className="text-slate-400">Benchmark performance and health across multiple projects simultaneously.</p>
              </div>
              <button
                className="bg-primary hover:bg-primary/80 text-background-dark font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-40"
                disabled={repos.length >= 4}
                onClick={addRepo}
              >
                <span className="material-symbols-outlined">add_circle</span>
                Add Repository
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {repos.map((repo, idx) => (
                <div key={idx} className="glass p-1 rounded-xl group focus-within:ring-2 ring-primary/50">
                  <div className="flex items-center px-3 py-2">
                    <span className="material-symbols-outlined text-primary mr-2">search</span>
                    <input
                      className="bg-transparent border-none text-slate-100 focus:ring-0 w-full font-medium"
                      placeholder="Organization/Repo"
                      type="text"
                      value={repo}
                      onChange={(e) => updateRepo(idx, e.target.value)}
                    />
                    <button className="text-slate-500 hover:text-red-400 transition-colors" onClick={() => clearRepo(idx)}>
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                </div>
              ))}
              {repos.length < 4 && (
                <div
                  className="glass p-1 rounded-xl border-dashed border-primary/20 hover:border-primary/50 transition-all cursor-pointer flex items-center justify-center text-slate-500 hover:text-primary"
                  onClick={addRepo}
                >
                  <span className="material-symbols-outlined mr-2 text-sm">add</span>
                  <span className="text-sm font-semibold uppercase tracking-wider">Select Repo</span>
                </div>
              )}
            </div>
          </section>

          {/* Main Comparison Chart */}
          <section className="glass rounded-3xl p-8 mb-12 relative overflow-hidden border border-primary/20">
            <div className="absolute inset-0 radar-grid opacity-20 pointer-events-none"></div>
            <div className="scanner-line"></div>
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-full flex justify-between items-start mb-8">
                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <span className="size-2 bg-primary rounded-full animate-pulse"></span>
                  Multidimensional Health Analysis
                </h3>
                <div className="text-[10px] font-mono text-primary/60 tracking-widest uppercase">system_v2.0 // real-time_sync</div>
              </div>
              <div className="w-full max-w-2xl aspect-square relative flex items-center justify-center">
                {/* Techy Radar Chart */}
                <svg className="w-full h-full" viewBox="0 0 400 400">
                  <defs>
                    <filter id="glow">
                      <feGaussianBlur result="coloredBlur" stdDeviation="2.5"></feGaussianBlur>
                      <feMerge>
                        <feMergeNode in="coloredBlur"></feMergeNode>
                        <feMergeNode in="SourceGraphic"></feMergeNode>
                      </feMerge>
                    </filter>
                  </defs>
                  {/* Digital Grid Rings */}
                  <path d="M200 20 L371 144 L306 345 L94 345 L29 144 Z" fill="none" stroke="rgba(76, 202, 240, 0.2)" strokeWidth="1"></path>
                  <path d="M200 65 L328 158 L279 308 L121 308 L72 158 Z" fill="none" stroke="rgba(76, 202, 240, 0.15)" strokeWidth="1"></path>
                  <path d="M200 110 L286 172 L253 271 L147 271 L114 172 Z" fill="none" stroke="rgba(76, 202, 240, 0.1)" strokeWidth="1"></path>
                  <path d="M200 155 L243 186 L226 235 L174 235 L157 186 Z" fill="none" stroke="rgba(76, 202, 240, 0.05)" strokeWidth="1"></path>
                  {/* Neon Axes */}
                  <line className="cyber-axis" stroke="rgba(76, 202, 240, 0.3)" strokeWidth="1" x1="200" x2="200" y1="20" y2="200"></line>
                  <line className="cyber-axis" stroke="rgba(76, 202, 240, 0.3)" strokeWidth="1" x1="200" x2="371" y1="200" y2="144"></line>
                  <line className="cyber-axis" stroke="rgba(76, 202, 240, 0.3)" strokeWidth="1" x1="200" x2="306" y1="200" y2="345"></line>
                  <line className="cyber-axis" stroke="rgba(76, 202, 240, 0.3)" strokeWidth="1" x1="200" x2="94" y1="200" y2="345"></line>
                  <line className="cyber-axis" stroke="rgba(76, 202, 240, 0.3)" strokeWidth="1" x1="200" x2="29" y1="200" y2="144"></line>
                  {/* Repo polygons */}
                  {repos.slice(0, 3).map((_, i) => (
                    <polygon key={i} fill={REPO_COLORS[i].fill} filter="url(#glow)" points={REPO_COLORS[i].points} stroke={REPO_COLORS[i].stroke} strokeWidth="2"></polygon>
                  ))}
                  {/* Glow points for first repo */}
                  {["200,40", "350,150", "290,320", "110,320", "60,150"].map((pt, i) => {
                    const [cx, cy] = pt.split(",");
                    return <circle key={i} className="glow-point" cx={cx} cy={cy} fill={REPO_COLORS[0].pointFill} r="3"></circle>;
                  })}
                </svg>
                {/* Labels */}
                <div className="absolute top-0 transform -translate-y-4 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                  <span className="px-2 py-0.5 bg-primary/10 border border-primary/30">Health Score</span>
                </div>
                <div className="absolute top-1/4 right-0 transform translate-x-12 text-[10px] font-black uppercase tracking-widest text-slate-100 text-right">
                  Activity<br /><span className="text-primary font-mono bg-primary/10 px-1">98.2%</span>
                </div>
                <div className="absolute bottom-1/4 right-0 transform translate-x-8 translate-y-8 text-[10px] font-black uppercase tracking-widest text-slate-100 text-right">
                  PR Speed<br /><span className="text-primary font-mono">1.2d AVG</span>
                </div>
                <div className="absolute bottom-0 transform translate-y-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bus Factor</div>
                <div className="absolute bottom-1/4 left-0 transform -translate-x-8 translate-y-8 text-[10px] font-black uppercase tracking-widest text-slate-100">Issue<br />Velocity</div>
              </div>
              {/* Legend */}
              <div className="mt-12 flex flex-wrap justify-center gap-8">
                {repos.slice(0, 3).map((repo, i) => (
                  <div key={i} className={`flex items-center gap-3 bg-slate-900/50 px-4 py-2 rounded-lg border ${REPO_COLORS[i].border}`}>
                    <div className={`w-2 h-2 rounded-full ${REPO_COLORS[i].dot}`}></div>
                    <span className={`text-xs font-bold tracking-widest uppercase text-slate-300`}>{repo.split("/")[1] ?? REPO_COLORS[i].label}.sys</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Detailed Comparison Table */}
          <section className="glass rounded-3xl overflow-hidden mb-20 border border-primary/10">
            <div className="px-8 py-6 border-b border-primary/10 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-100 tracking-tight">Metric Breakdown</h3>
              <span className="text-[10px] font-mono text-slate-500">SORT_BY: PERFORMANCE_INDEX</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-primary/5">
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-primary/10">Metric Identifier</th>
                    {repos.slice(0, 3).map((repo, i) => (
                      <th key={i} className="px-8 py-5 border-b border-primary/10 min-w-[200px]">
                        <div className="flex items-center gap-3">
                          <div className={`size-8 rounded-lg flex items-center justify-center font-bold border text-xs`} style={{ background: `${REPO_COLORS[i].fill}`, border: `1px solid ${REPO_COLORS[i].stroke}50`, color: REPO_COLORS[i].stroke }}>
                            {(repo.split("/")[1] ?? "R").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-xs font-black uppercase text-slate-100 tracking-tighter">{repo.split("/")[1] ?? repo}</div>
                            <div className="inline-block px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase border border-emerald-500/20">H_{98 - i * 6}</div>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {[
                    { label: "PR_AVG_VELOCITY", vals: ["1.2 days", "2.4 days", "4.8 days"], best: 0, worst: 2 },
                    { label: "COMMITS_WEEKLY", vals: ["342", "128", "84"], best: 0, worst: -1 },
                    { label: "ISSUE_RESOLVE_RT", vals: ["82%", "91%", "45%"], best: 1, worst: 2 },
                    { label: "BUS_FACTOR_INDX", vals: ["54", "12", "4"], best: 0, worst: 2 },
                  ].map((row) => (
                    <tr key={row.label} className="hover:bg-primary/5 transition-colors">
                      <td className="px-8 py-4 text-xs text-slate-300 font-bold uppercase tracking-tight">{row.label}</td>
                      {row.vals.slice(0, repos.length).map((val, i) => (
                        <td key={i} className={`px-8 py-4 ${i === row.best ? "bg-emerald-500/5" : i === row.worst ? "bg-red-500/5" : ""}`}>
                          <span className={`font-mono font-bold text-sm ${i === row.best ? "text-emerald-400" : i === row.worst ? "text-red-400" : "text-slate-400"}`}>{val}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        {/* Floating Footer/Summary Bar */}
        <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-50">
          <div className="glass border border-primary/30 rounded-2xl px-6 py-4 flex items-center justify-between shadow-[0_0_30px_rgba(76,202,240,0.2)]">
            <div className="flex items-center gap-4">
              <div className="relative">
                <span className="material-symbols-outlined text-primary">auto_awesome</span>
                <span className="absolute -top-1 -right-1 size-1.5 bg-red-500 rounded-full animate-ping"></span>
              </div>
              <div>
                <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Git Vital Intelligence</div>
                <div className="text-sm text-slate-100 font-medium">Enterprise pick: <span className="text-primary font-bold">{repos[0]?.split("/")[1] ?? "React"}</span> shows peak maintainability.</div>
              </div>
            </div>
            <button className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
              Access Data
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
