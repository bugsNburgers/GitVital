"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function analyze() {
    const raw = query.trim().replace(/^https?:\/\/(www\.)?github\.com\//, "");
    const parts = raw.split("/").filter(Boolean);
    if (parts.length >= 2) {
      router.push(`/${parts[0]}/${parts[1]}`);
    } else if (parts.length === 1) {
      router.push(`/${parts[0]}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") analyze();
  }

  return (
    <body className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 antialiased">
      {/* Sticky Navbar */}
      <nav className="sticky top-0 z-50 w-full border-b border-primary/10 bg-background-dark/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-3xl">monitor_heart</span>
              <span className="text-xl font-bold tracking-tight text-slate-100">Git Vital</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a className="text-sm font-medium text-slate-400 hover:text-primary transition-colors" href="#metrics">Features</a>
              <a className="text-sm font-medium text-slate-400 hover:text-primary transition-colors" href="/compare">Compare</a>
              <a className="text-sm font-medium text-slate-400 hover:text-primary transition-colors" href="/leaderboard">Leaderboard</a>
            </div>
            <div className="flex items-center gap-4">
              <button
                className="bg-primary hover:bg-primary/90 text-background-dark px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                onClick={() => alert("GitHub OAuth coming soon!")}
              >
                <span className="material-symbols-outlined text-[20px]">terminal</span>
                Sign in with GitHub
              </button>
            </div>
          </div>
        </div>
      </nav>
      {/* Hero Section */}
      <main className="relative overflow-hidden pt-20 pb-16 lg:pt-32">
        {/* Background Glow Orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-blue-500/10 rounded-full blur-[100px]"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl lg:text-7xl font-black tracking-tight mb-6 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
            Know Your Repo&apos;s <span className="text-primary">Real Vitality</span>
          </h1>
           <p className="text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto mb-12">
           ThIs fronend is not functional yet, please visit back later !
          </p>
          <p className="text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto mb-12">
            AI-powered health scores and deep repository insights for engineering teams. Monitor codebase vitality, contributor dynamics, and merge velocity in real-time.
          </p>
          {/* Search Bar / Glass Card */}
          <div className="max-w-3xl mx-auto mb-8">
            <div className="glass p-2 rounded-2xl glow-cyan flex flex-col sm:flex-row items-center gap-2 shadow-2xl">
              <div className="flex flex-1 items-center gap-3 px-4 w-full">
                <span className="material-symbols-outlined text-slate-500">search</span>
                <input
                  className="bg-transparent border-none focus:ring-0 text-slate-100 placeholder:text-slate-500 w-full py-4 text-lg"
                  placeholder="Enter a GitHub repo URL (e.g. facebook/react)"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
              <button
                className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-background-dark px-10 py-4 rounded-xl font-bold text-lg transition-all shadow-lg shadow-primary/20"
                onClick={analyze}
              >
                Analyze
              </button>
            </div>
          </div>
          {/* Magic Redirect Feature Card */}
          <div className="max-w-xl mx-auto mb-20">
            <div className="glass border-primary/20 p-4 rounded-xl flex items-center justify-center gap-3 animate-pulse hover:animate-none transition-all cursor-default">
              <span className="material-symbols-outlined text-primary">auto_fix_high</span>
              <p className="text-sm text-slate-300">
                <span className="font-bold text-primary">Pro Tip:</span> Change any <span className="text-white font-mono">github.com</span> URL to <span className="text-white font-mono">gitvital.com</span> to jump straight into analytics.
              </p>
            </div>
          </div>
          {/* Metrics Row */}
          <div id="metrics" className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
            {/* Metric 1 */}
            <div className="glass p-8 rounded-2xl flex flex-col items-center text-center group hover:border-primary/30 transition-all">
              <div className="relative size-24 mb-4 flex items-center justify-center">
                <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                  <circle className="stroke-slate-800" cx="18" cy="18" fill="none" r="16" strokeWidth="3"></circle>
                  <circle className="stroke-primary" cx="18" cy="18" fill="none" r="16" strokeDasharray="87, 100" strokeLinecap="round" strokeWidth="3"></circle>
                </svg>
                <span className="absolute text-xl font-bold">87</span>
              </div>
              <h3 className="text-slate-400 font-medium mb-1">Health Score</h3>
              <p className="text-slate-100 text-sm opacity-60">Excellent repository status</p>
            </div>
            {/* Metric 2 */}
            <div className="glass p-8 rounded-2xl flex flex-col items-center text-center group hover:border-primary/30 transition-all">
              <div className="size-24 mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-primary">groups</span>
              </div>
              <h3 className="text-4xl font-bold text-white mb-1">12</h3>
              <p className="text-slate-400 font-medium">Bus Factor</p>
              <p className="text-slate-100 text-sm opacity-60">Low risk knowledge distribution</p>
            </div>
            {/* Metric 3 */}
            <div className="glass p-8 rounded-2xl flex flex-col items-center text-center group hover:border-primary/30 transition-all">
              <div className="size-24 mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-primary">speed</span>
              </div>
              <h3 className="text-4xl font-bold text-white mb-1">4.2h</h3>
              <p className="text-slate-400 font-medium">Avg PR Merge</p>
              <p className="text-slate-100 text-sm opacity-60">Top 5% of similar projects</p>
            </div>
          </div>
          {/* Social Proof */}
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center -space-x-3">
              <div className="size-12 rounded-full border-4 border-background-dark bg-slate-800 overflow-hidden">
                <img alt="Developer avatar portrait circle" className="size-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAAsR6o-Gj6dEyHy-qibr9mn-bLbTB64Zob5_G16uUMpd0uGnmeM2KMixHucVPQRnXibZD5y-YK_V5XHTs3c_-_DlVYTTsHdDnrJVPX91IPtR7sJe-rdNKCjIdeUdng4maRbGnNkPOw0wuECmoQfNX4e2TpzgFSoVMwGT1oksOrTGpZSKP-59SUHsOQtKAViNqWIBXIIIj5xI_3eoe6WOmUDIbyq3TfYxB8-lgUF-Uv6vNYYiA5QlV3jkYoKAvg6enKfS5H3_-aBiE" />
              </div>
              <div className="size-12 rounded-full border-4 border-background-dark bg-slate-700 overflow-hidden">
                <img alt="Developer avatar portrait circle" className="size-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCtG24ZbIDNGPUoS3tTaTerTnN4hu1sE_BO7i4FPvGTwxFmbBF1K0CeVYcRL386lrCo2FwPXZDVpVSkfolmlkF9HOYwRnGtL91ax24hJcwqSx0mcGa9HVGtcMzl-St3JHLDzurl0l2ooU_BzpRB4scXGi64vzwDOUblZAIzzci26dDjkXg9ypY7r7KCZQiQiKwx1joT0BZPKmOEeg6Ya7Ey6nHI-mSYNoRPntWnuHUpUOPrmHO1WrLv6gwmseJIQQYsiyPOV1AsboE" />
              </div>
              <div className="size-12 rounded-full border-4 border-background-dark bg-slate-600 overflow-hidden">
                <img alt="Developer avatar portrait circle" className="size-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBun_sN0psZgw-rIt2Y8XI3RZJwZCut8dTlRKCC5fNWsEaEV7VxJPdI9jbfgQznSwB1ycc2kwhpQyvs2ZAM-Aq7A3E2DWVTf_LltAgUfmgy3Z94YCN5mvHqyd8uIrR_zTqV3IKCmGjJebrviCOlG7R0s9K44anvQVI3--Jr66xMpTHLIM8gugQZn3gLxyYWXxPQOgyA1y1iIcsTdGi0sgQHA1vsELQZtGI00upJ_k9jHr8RRdQwd_Fki-o71VIW-ZNhITUtY7lbEHw" />
              </div>
              <div className="size-12 rounded-full border-4 border-background-dark bg-slate-500 overflow-hidden">
                <img alt="Developer avatar portrait circle" className="size-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBQdgG5aTuiJ__dHwUbjWAxQcrnkruzhrdhcjHLTzvGJjTEpyU7aulllGVrvSDN9snGGsje5aPvKFV5HsHeo_0qRAJcV_swHBMIBtHbzKcye2UPsQ3XxsMvLJb3OtMrEQQE32UElOqJBoNgsiyUBHf0-9PI4gT-qqXsTxAQ2tm60C3QPojDpG6eV3lsWsIJLIyDvKqRsji82sUGNfK8NqZFp4DgLZR69eA6C_hQUv3CW-e368tDGVAg8OcV5X3SYupvAwKUcUcHAzA" />
              </div>
              <div className="size-12 rounded-full border-4 border-background-dark bg-primary flex items-center justify-center text-background-dark font-bold text-xs">
                +2k
              </div>
            </div>
            <div className="text-slate-400 flex items-center gap-3">
              <span className="text-sm font-medium tracking-wide uppercase">Trusted by 2,000+ developers</span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                <span className="text-slate-100 font-bold">4.8k Stars</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      {/* Footer */}
      <footer className="border-t border-primary/10 bg-background-dark pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-2xl">monitor_heart</span>
              <span className="text-lg font-bold tracking-tight text-slate-100">Git Vital</span>
            </div>
            <div className="flex gap-10">
              <a className="text-sm text-slate-500 hover:text-primary transition-colors" href="#">About</a>
              <a className="text-sm text-slate-500 hover:text-primary transition-colors" href="#">GitHub</a>
              <a className="text-sm text-slate-500 hover:text-primary transition-colors" href="#">Privacy</a>
              <a className="text-sm text-slate-500 hover:text-primary transition-colors" href="#">Terms</a>
            </div>
          </div>
          <div className="text-center md:text-left pt-8 border-t border-slate-800/50">
            <p className="text-xs text-slate-600">
              © 2024 Git Vital AI. All rights reserved. Analyzing the heartbeat of open source.
            </p>
          </div>
        </div>
      </footer>
    </body>
  );
}
