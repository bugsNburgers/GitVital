"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Script from "next/script";

declare global {
  interface Window {
    Swal: any;
    luxon: any;
    Chart: any;
    FloatingUI: any;
    AOS: any;
  }
}

export default function UserProfilePage() {
  const params = useParams<{ owner: string }>();
  const owner = params?.owner ?? "octocat";
  const router = useRouter();

  const [following, setFollowing] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState("a few moments ago");
  const [scriptsReady, setScriptsReady] = useState(0);

  // Initialise everything once all CDN scripts load
  useEffect(() => {
    if (scriptsReady < 5) return; // wait for all 5 scripts

    // AOS
    if (window.AOS) window.AOS.init({ duration: 800, once: true });

    // Luxon
    if (window.luxon) {
      const dt = window.luxon.DateTime;
      setLastAnalyzed("Last analyzed: " + dt.now().minus({ minutes: 12 }).toRelative());
    }

    // Chart.js mini sparklines
    if (window.Chart) {
      const chartConfig = (data: number[]) => ({
        type: "line",
        data: {
          labels: ["", "", "", "", "", "", ""],
          datasets: [{ data, borderColor: "#4ccaf0", borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } },
        },
      });
      const charts: { id: string; data: number[] }[] = [
        { id: "chart-spoon-knife", data: [65, 72, 68, 85, 92, 88, 98] },
        { id: "chart-octo-core", data: [40, 55, 48, 70, 75, 82, 94] },
        { id: "chart-pulse-cli", data: [80, 82, 85, 83, 88, 87, 89] },
        { id: "chart-lighthouse", data: [90, 92, 95, 94, 96, 98, 97] },
        { id: "chart-octo-graph", data: [60, 65, 72, 70, 85, 88, 92] },
      ];
      charts.forEach(({ id, data }) => {
        const el = document.getElementById(id) as HTMLCanvasElement | null;
        if (el) new window.Chart(el, chartConfig(data));
      });
    }

    // Floating UI tooltip for notification bell
    if (window.FloatingUI) {
      const tooltip = document.getElementById("tooltip");
      const btn = document.getElementById("notification-btn");
      if (tooltip && btn) {
        const update = () => {
          window.FloatingUI.computePosition(btn, tooltip, {
            placement: "bottom",
            middleware: [window.FloatingUI.offset(8), window.FloatingUI.shift()],
          }).then(({ x, y }: { x: number; y: number }) => {
            Object.assign(tooltip.style, { left: `${x}px`, top: `${y}px` });
          });
        };
        btn.addEventListener("mouseenter", () => {
          tooltip.textContent = "2 New Notifications";
          tooltip.classList.remove("hidden");
          update();
        });
        btn.addEventListener("mouseleave", () => tooltip.classList.add("hidden"));
      }
    }
  }, [scriptsReady]);

  function showBadgeDetails(title: string, level: string, icon: string, color: string, desc: string) {
    if (window.Swal) {
      window.Swal.fire({
        title: `<span style="color:var(--tw-${color})">${title}</span>`,
        html: `<div class="p-4"><p class="text-slate-400 mb-4">${desc}</p><span class="px-3 py-1 bg-slate-800 rounded-full text-xs font-bold uppercase tracking-widest">${level}</span></div>`,
        background: "#1a2a2f",
        color: "#fff",
        showConfirmButton: false,
        showCloseButton: true,
        customClass: { popup: "rounded-3xl border border-slate-700 glass" },
      });
    }
  }

  const onScriptLoad = () => setScriptsReady((n) => n + 1);

  return (
    <>
      {/* CDN Scripts */}
      <Script src="https://cdn.jsdelivr.net/npm/sweetalert2@11" onLoad={onScriptLoad} strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/luxon@3.4.4/build/global/luxon.min.js" onLoad={onScriptLoad} strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/chart.js" onLoad={onScriptLoad} strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/@floating-ui/core@1.6.0" onLoad={onScriptLoad} strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.6.3" onLoad={onScriptLoad} strategy="afterInteractive" />
      <link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet" />
      <Script src="https://unpkg.com/aos@2.3.1/dist/aos.js" onLoad={onScriptLoad} strategy="afterInteractive" />

      <body className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen">
        {/* Tooltip */}
        <div className="absolute hidden bg-slate-900 text-white text-xs py-1 px-2 rounded pointer-events-none z-[100] border border-slate-700 shadow-xl" id="tooltip"></div>

        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-50 glass border-b border-slate-200/10 px-4 md:px-8 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push("/")}>
              <img alt="GitVital logo" className="h-11 w-auto md:h-12" src="/gitvital_logo_fixed.svg" />
              <h2 className="text-2xl font-bold tracking-tight">Git Vital</h2>
            </div>
            <div className="flex flex-1 justify-center max-w-md mx-8">
              <div className="relative w-full group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">search</span>
                <input
                  className="w-full bg-slate-800/50 border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary transition-all placeholder:text-slate-500"
                  placeholder="Search developers or repos..."
                  type="text"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) router.push(`/${v}`);
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="p-2 rounded-xl hover:bg-slate-800 transition-colors relative" id="notification-btn">
                <span className="material-symbols-outlined">notifications</span>
                <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full"></span>
              </button>
              <div className="h-8 w-px bg-slate-700 mx-2"></div>
              <button className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-slate-800/50 hover:bg-slate-800 transition-all border border-slate-700">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">{owner.charAt(0).toUpperCase()}</div>
                <span className="text-xs font-semibold">{owner}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">
          {/* Profile Header Section */}
          <section className="glass rounded-3xl p-8 relative overflow-hidden" data-aos="fade-down">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] -z-10"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/5 blur-[120px] -z-10"></div>
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
              {/* Avatar and Score */}
              <div className="relative">
                <div className="relative p-1 rounded-full bg-gradient-to-tr from-primary to-secondary">
                  <img
                    alt="Octocat Profile Avatar"
                    className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-background-dark"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBJRIpAZMrL1w0X_FCznbO5S5g5JJK02ZQHDV3U8vl4nItvTfY1E6az99HkNEGc8Oic_nuO1A9cQJzLcZK012pErefI7fCHwSJvhAxOPZfU4wqQdJWP5eMOtcWMz9OC-td-iAqbeCYiZKl5XH_2cQcFNbef0e-y9SqWgHYuOKumGJAAXGpyK-RJZL5R51As6rtruFS-_RWITUMBU8NvYov5DvOVq2ruXTdgErpMowYHQTCgZ9HszcUpi_xMxjlpWTSrByBB2jnJHsc"
                  />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-background-dark p-1 rounded-full">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center relative">
                    <svg className="w-full h-full -rotate-90">
                      <circle className="text-slate-800" cx="28" cy="28" fill="transparent" r="24" stroke="currentColor" strokeWidth="4"></circle>
                      <circle className="text-primary" cx="28" cy="28" fill="transparent" r="24" stroke="currentColor" strokeDasharray="150" strokeDashoffset="30" strokeWidth="4"></circle>
                    </svg>
                    <span className="absolute text-[10px] font-bold text-primary">98%</span>
                  </div>
                </div>
              </div>
              {/* Info and Stats */}
              <div className="flex-1 text-center md:text-left space-y-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                    <h1 className="text-4xl font-extrabold text-slate-100 tracking-tight">{owner}</h1>
                    <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold uppercase tracking-wider italic">Top 5% Global</span>
                  </div>
                  <p className="text-slate-400 text-lg">Senior Full Stack Engineer @ GitHub</p>
                </div>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                  <div className="flex items-center gap-2 bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-700/50">
                    <span className="material-symbols-outlined text-primary text-lg">code</span>
                    <span className="text-sm font-medium">TypeScript Expert</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-700/50">
                    <span className="material-symbols-outlined text-secondary text-lg">location_on</span>
                    <span className="text-sm font-medium">San Francisco, CA</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-700/50">
                    <span className="material-symbols-outlined text-slate-400 text-lg">calendar_today</span>
                    <span className="text-sm font-medium">Joined 2011</span>
                  </div>
                </div>
                <div className="pt-4 flex items-center justify-center md:justify-start gap-4">
                  <button
                    className={`font-bold px-8 py-3 rounded-xl transition-all transform hover:scale-105 ${following ? "bg-slate-700 text-slate-200 hover:bg-slate-600" : "bg-primary hover:bg-primary/90 text-background-dark"}`}
                    onClick={() => setFollowing((f) => !f)}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                  <button className="glass hover:bg-slate-700/50 text-slate-100 font-bold px-8 py-3 rounded-xl transition-all border border-slate-700">Message</button>
                </div>
              </div>
              {/* Score Summary */}
              <div className="hidden lg:flex flex-col items-center justify-center glass rounded-2xl p-6 min-w-[200px]">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Developer Score</span>
                <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-primary to-secondary">98</span>
                <div className="mt-4 flex flex-col gap-1 w-full">
                  <div className="flex justify-between text-[10px] font-bold uppercase">
                    <span>Reliability</span>
                    <span className="text-primary">99%</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[99%]"></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Achievements Section */}
          <section className="space-y-4" data-aos="fade-up">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">military_tech</span>
                Achievement Badges
              </h3>
              <button className="text-primary text-sm font-semibold hover:underline">View all 24</button>
            </div>
            <div className="flex overflow-x-auto gap-4 pb-4 no-scrollbar">
              {[
                { title: "Code Warrior", level: "Elite Level", icon: "terminal", color: "primary", desc: "Merged 500+ Pull Requests in record time", borderColor: "border-t-primary/30", iconColor: "text-primary", bgColor: "bg-primary/20" },
                { title: "Speed Demon", level: "Legendary", icon: "bolt", color: "secondary", desc: "Average issue resolution under 2 hours", borderColor: "border-t-secondary/30", iconColor: "text-secondary", bgColor: "bg-secondary/20" },
                { title: "Team Player", level: "Community Pillar", icon: "groups", color: "emerald-500", desc: "Contributed to 50+ open source projects", borderColor: "border-t-emerald-500/30", iconColor: "text-emerald-500", bgColor: "bg-emerald-500/20" },
                { title: "Exterminator", level: "Veteran", icon: "bug_report", color: "orange-500", desc: "Found and fixed 10 critical security bugs", borderColor: "border-t-orange-500/30", iconColor: "text-orange-500", bgColor: "bg-orange-500/20" },
              ].map((badge) => (
                <div
                  key={badge.title}
                  className={`flex-none w-64 glass p-5 rounded-2xl flex flex-col items-center text-center gap-3 border-t-2 ${badge.borderColor} cursor-pointer hover:bg-white/5 transition-colors`}
                  onClick={() => showBadgeDetails(badge.title, badge.level, badge.icon, badge.color, badge.desc)}
                >
                  <div className={`w-16 h-16 ${badge.bgColor} rounded-full flex items-center justify-center`}>
                    <span className={`material-symbols-outlined text-3xl ${badge.iconColor}`}>{badge.icon}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100">{badge.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">{badge.desc.length > 30 ? badge.desc.substring(0, 30) + "..." : badge.desc}</p>
                  </div>
                  <span className={`text-[10px] font-bold ${badge.iconColor} tracking-widest uppercase`}>{badge.level}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Repository Grid Section */}
          <section className="space-y-6" data-aos="fade-up">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">data_object</span>
                Analyzed Repositories
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400 italic last-analyzed">{lastAnalyzed}</span>
                <select className="bg-slate-800 border-none rounded-lg text-sm focus:ring-1 focus:ring-primary py-1.5 pl-3 pr-8" aria-label="Sort repositories by">
                  <option>Health Score</option>
                  <option>Recent Activity</option>
                  <option>Popularity</option>
                </select>
                <button className="p-2 glass rounded-lg hover:bg-slate-800 transition-colors">
                  <span className="material-symbols-outlined text-lg">filter_list</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { id: "chart-spoon-knife", icon: "description", health: "98.2", healthColor: "text-emerald-400", name: "Spoon-Knife", desc: "Learning fork/pull request workflow on GitHub.", lang: "TypeScript", langColor: "bg-blue-500", stars: "12.4k" },
                { id: "chart-octo-core", icon: "settings_suggest", health: "94.5", healthColor: "text-emerald-400", name: "Octo-Core", desc: "Async engine for distributed systems.", lang: "JavaScript", langColor: "bg-yellow-500", stars: "2.1k" },
                { id: "chart-pulse-cli", icon: "auto_graph", health: "89.0", healthColor: "text-primary", name: "Pulse-CLI", desc: "CLI for RepoPulse analytics and reporting.", lang: "TypeScript", langColor: "bg-blue-500", stars: "845" },
                { id: "chart-lighthouse", icon: "layers", health: "97.8", healthColor: "text-emerald-400", name: "Lighthouse-Config", desc: "Shared linting for enterprise scale applications.", lang: "JSON", langColor: "bg-slate-400", stars: "3.4k" },
                { id: "chart-octo-graph", icon: "api", health: "92.1", healthColor: "text-emerald-400", name: "Octo-Graph", desc: "GraphQL API wrapper for repository metadata.", lang: "GraphQL", langColor: "bg-pink-500", stars: "560" },
              ].map((r) => (
                <div key={r.id} className="glass p-6 rounded-2xl hover:border-primary/40 transition-all group cursor-pointer relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      <span className="material-symbols-outlined">{r.icon}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black uppercase text-slate-500">Health</span>
                      <span className={`text-lg font-bold ${r.healthColor}`}>{r.health}</span>
                    </div>
                  </div>
                  <h4 className="text-lg font-bold group-hover:text-primary transition-colors">{r.name}</h4>
                  <p className="text-sm text-slate-400 mt-2 line-clamp-2">{r.desc}</p>
                  <div className="h-12 mt-4">
                    <canvas id={r.id}></canvas>
                  </div>
                  <div className="mt-4 flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <span className={`w-3 h-3 rounded-full ${r.langColor}`}></span>
                      <span className="text-xs font-medium">{r.lang}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className="material-symbols-outlined text-sm">star</span>
                      <span className="text-xs">{r.stars}</span>
                    </div>
                  </div>
                </div>
              ))}
              {/* Empty State */}
              <div className="border-2 border-dashed border-slate-700/50 p-6 rounded-2xl hover:border-primary/50 transition-all flex flex-col items-center justify-center gap-4 cursor-pointer group">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-primary">add</span>
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-400 group-hover:text-slate-200">Connect Repository</p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="max-w-7xl mx-auto px-4 md:px-8 py-12 border-t border-slate-800/50 mt-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-slate-800 p-1.5 rounded-lg text-primary">
              <span className="material-symbols-outlined block text-xl">pulse_alert</span>
            </div>
            <p className="text-sm text-slate-500 font-medium">© 2024 Git Vital Analytics. Build with integrity.</p>
          </div>
          <div className="flex gap-8">
            <a className="text-sm text-slate-400 hover:text-primary transition-colors" href="#">Privacy Policy</a>
            <a className="text-sm text-slate-400 hover:text-primary transition-colors" href="#">Terms of Service</a>
            <a className="text-sm text-slate-400 hover:text-primary transition-colors" href="#">Documentation</a>
          </div>
        </footer>
      </body>
    </>
  );
}
