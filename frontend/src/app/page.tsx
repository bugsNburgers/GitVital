"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// -----------------------------------------------------------------------------
// INLINED STATS GRID COMPONENT
// -----------------------------------------------------------------------------
interface StatItem {
  label: string;
  targetValue: string;
}

const TOTAL_BOXES = 32;
const TOP_GRID_ROWS = 1;
const BOTTOM_GRID_ROWS = 1;

function StatsGrid() {
  const stats: StatItem[] = [
    { label: "PROFILES", targetValue: "2,568,376" },
    { label: "REPOSITORIES", targetValue: "8,046,382" },
    { label: "ANALYSES", targetValue: "44,682,649" },
    { label: "ACTIVE USERS", targetValue: "116,802,629,281" },
    { label: "LOG EVENTS", targetValue: "464,421,007,363" },
  ];

  const [displayValues, setDisplayValues] = useState<string[]>(
    stats.map(() => "0")
  );
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const GRID_ROWS = TOP_GRID_ROWS + stats.length + BOTTOM_GRID_ROWS;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.3 }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const duration = 2000;
    const steps = 60;
    const stepDuration = duration / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;

      setDisplayValues(
        stats.map((stat) => {
          const targetNum = parseInt(stat.targetValue.replace(/,/g, ""));
          const currentNum = Math.floor(targetNum * progress);
          return currentNum.toLocaleString();
        })
      );

      if (currentStep >= steps) {
        clearInterval(interval);
        setDisplayValues(stats.map((stat) => stat.targetValue));
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [isVisible]);

  const renderRow = (label: string, value: string, index: number) => {
    const boxes = [];
    const labelChars = label.split("");
    const valueChars = value.split("");

    const labelStart = 2;
    const labelEnd = labelStart + labelChars.length;
    const valueEnd = TOTAL_BOXES - 2;
    const valueStart = valueEnd - valueChars.length;

    for (let i = 0; i < TOTAL_BOXES; i++) {
      let char = "";
      let isLabel = false;
      let isValue = false;

      if (i >= labelStart && i < labelEnd) {
        char = labelChars[i - labelStart];
        isLabel = true;
      } else if (i >= valueStart && i < valueEnd) {
        char = valueChars[i - valueStart];
        isValue = true;
      }

      boxes.push(
        <div
          key={i}
          className={`
            h-12 sm:h-16 min-w-0
            flex items-center justify-center
            transition-all duration-500
            ${isVisible ? "bg-white/5 border border-white/10" : "bg-transparent border border-transparent"}
            rounded-sm font-mono
            ${isValue ? "text-white text-base sm:text-xl font-semibold" : isLabel ? "text-slate-400 text-sm sm:text-base" : ""}
            ${!char ? "opacity-20" : ""}
          `}
          style={{ transitionDelay: isVisible ? `${index * 50 + i * 10}ms` : "0ms" }}
        >
          {char}
        </div>
      );
    }
    return boxes;
  };

  const renderEmptyRow = (rowKey: string) => {
    return (
      <div
        key={rowKey}
        className="relative z-10 grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${TOTAL_BOXES}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: TOTAL_BOXES }).map((_, i) => (
          <div
            key={`${rowKey}-${i}`}
            className={`
              h-12 sm:h-16 min-w-0 flex items-center justify-center transition-all duration-500
              ${isVisible ? "bg-white/5 border border-white/10" : "bg-transparent border border-transparent"}
              rounded-sm opacity-20
            `}
          ></div>
        ))}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full min-h-[400px] sm:min-h-[560px] bg-transparent overflow-hidden flex items-center py-14"
    >
      <div className="relative z-10 space-y-0.5 flex w-full flex-col">
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="h-full w-full grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${TOTAL_BOXES}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: TOTAL_BOXES * GRID_ROWS }).map((_, idx) => (
              <span key={`guide-${idx}`} className="rounded-sm border border-white/5 bg-transparent"></span>
            ))}
          </div>
        </div>
        {Array.from({ length: TOP_GRID_ROWS }).map((_, idx) => renderEmptyRow(`top-row-${idx}`))}
        {stats.map((stat, index) => (
          <div key={index} className="relative z-10 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${TOTAL_BOXES}, minmax(0, 1fr))` }}>
            {renderRow(stat.label, displayValues[index], index)}
          </div>
        ))}
        {Array.from({ length: BOTTOM_GRID_ROWS }).map((_, idx) => renderEmptyRow(`bottom-row-${idx}`))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// HELPER COMPONENTS
// -----------------------------------------------------------------------------
function FadeIn({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-[800ms] ease-out w-full ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

const GreenCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
);

// -----------------------------------------------------------------------------
// MAIN PAGE COMPONENT
// -----------------------------------------------------------------------------
export default function GitVitalLanding() {
  const router = useRouter();
  const [repoQuery, setRepoQuery] = useState("");
  const [activeTab, setActiveTab] = useState("Analyze");

  const handleAnalyze = () => {
    if (!repoQuery) return;
    const raw = repoQuery.trim().replace(/^https?:\/\/(www\.)?github\.com\//, "");
    router.push(`/analyze?repo=${encodeURIComponent(raw)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAnalyze();
  };

  const featureTabs = [
    {
      id: "Analyze",
      title: "Instant Repository Analysis",
      desc: "GitVital scans deep commit history to measure bus factor, PR turnaround, commit velocity, and issue backlog.",
      bullets: ["Bus factor detection", "PR turnaround times", "Activity trends"],
      mockup: (
        <div className="font-mono text-xs w-full">
          <div className="text-zinc-500 mb-2">$ gitvital analyze facebook/react</div>
          <div className="text-green-500 mb-1 flex gap-2"><GreenCheck /> Bus factor: 12 (Healthy)</div>
          <div className="text-green-500 mb-1 flex gap-2"><GreenCheck /> PR Turnaround: 1.2d avg</div>
          <div className="text-yellow-500 mb-1 flex gap-2"><span>⚠️</span> Issue Backlog: 642 open</div>
          <div className="text-green-500 mb-1 flex gap-2"><GreenCheck /> Commit Velocity: +5%</div>
          <div className="mt-4 text-violet-400">Analysis complete in 420ms</div>
        </div>
      )
    },
    {
      id: "Score",
      title: "Single Unified Score",
      desc: "Get a single metric that represents the overall health and maintainability of your repository. Stop guessing from stars.",
      bullets: ["0-100 objective score", "Benchmarked against top 1%", "Historical context"],
      mockup: (
        <div className="flex items-center justify-center w-full h-full pb-4">
          <div className="relative flex items-center justify-center w-36 h-36 rounded-full border border-white/[0.06] shadow-[0_0_30px_rgba(34,197,94,0.1)]">
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
              <circle cx="72" cy="72" r="66" stroke="rgba(34,197,94,0.15)" strokeWidth="6" fill="transparent" />
              <circle cx="72" cy="72" r="66" stroke="#22C55E" strokeWidth="6" fill="transparent" strokeDasharray="414" strokeDashoffset="49" className="transition-all duration-1000 ease-out" />
            </svg>
            <span className="text-5xl font-mono font-bold text-green-500">88</span>
          </div>
        </div>
      )
    },
    {
      id: "Compare",
      title: "Side-by-Side Comparison",
      desc: "Weighing framework options? Instantly compare two repos based on pure maintenance health.",
      bullets: ["Cross-repo ranking", "Component-level breakdown", "Winner identification"],
      mockup: (
        <div className="w-full text-xs sm:text-sm font-mono space-y-3">
          <div className="flex justify-between border-b border-white/[0.06] pb-2 text-zinc-500 font-sans tracking-widest uppercase">
            <span>Metric</span><span>React</span><span>Vue</span>
          </div>
          <div className="flex justify-between py-1 border-b border-white/[0.03]">
             <span className="text-zinc-400">Health</span><span className="text-green-400">88</span><span className="text-green-400">85</span>
          </div>
          <div className="flex justify-between py-1 border-b border-white/[0.03]">
             <span className="text-zinc-400">PR Speed</span><span className="text-green-400">1.2d</span><span className="text-yellow-400">3.4d</span>
          </div>
          <div className="flex justify-between py-1">
             <span className="text-zinc-400">Bus Factor</span><span className="text-green-400">12</span><span className="text-red-400">2</span>
          </div>
        </div>
      )
    },
    {
      id: "Timeline",
      title: "Health Over Time",
      desc: "Track how repo maintenance has evolved over the last year. Spot dying projects before you adopt them.",
      bullets: ["Quarterly trends", "Velocity drops", "Contributor churn"],
      mockup: (
        <div className="w-full h-full flex flex-col justify-end pt-8">
          <div className="flex items-end justify-between h-32 gap-3 px-2 border-b border-white/[0.06] pb-2 relative">
            <div className="absolute top-10 left-0 w-full border-t border-white/[0.06] border-dashed"></div>
            <div className="w-1/4 bg-violet-600/30 rounded-t h-[60%] hover:brightness-125 transition-all"></div>
            <div className="w-1/4 bg-violet-600/50 rounded-t h-[75%] hover:brightness-125 transition-all"></div>
            <div className="w-1/4 bg-violet-600/70 rounded-t h-[85%] hover:brightness-125 transition-all"></div>
            <div className="w-1/4 bg-violet-600 rounded-t h-[95%] shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:brightness-125 transition-all"></div>
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500 px-2 mt-2 tracking-widest uppercase">
            <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
          </div>
        </div>
      )
    },
    {
      id: "Advise",
      title: "AI-Powered Action Items",
      desc: "Don't just stare at numbers. Get actionable AI advice on how to improve your repo's specific weaknesses.",
      bullets: ["Context-aware tips", "Maintainer onboarding check", "Burnout risk alerts"],
      mockup: (
        <div className="w-full border border-violet-500/30 bg-violet-500/5 p-5 rounded-xl shadow-[0_0_30px_rgba(124,58,237,0.1)]">
          <div className="flex items-center gap-2 text-violet-400 mb-3">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"/></svg>
             <span className="text-xs font-semibold uppercase tracking-widest">AI Advice</span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed italic">"Consider recruiting dedicated code-reviewers. PR velocity has dropped 24% despite a steady commit rate over the past two months."</p>
          <button className="mt-4 text-xs font-medium bg-violet-600/20 text-violet-300 px-3 py-1 rounded-full border border-violet-500/30 hover:bg-violet-600/30 transition-colors">Apply Fixes →</button>
        </div>
      )
    },
  ];

  const activeFeature = featureTabs.find(t => t.id === activeTab) || featureTabs[0];

  return (
    <div className="min-h-screen bg-[#0B0D0E] text-white selection:bg-violet-500/30 selection:text-white font-sans">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 35s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}} />

      {/* 1. NAVBAR */}
      <nav className="fixed top-0 z-50 w-full h-[60px] backdrop-blur-md bg-[#0B0D0E]/80 border-b border-white/[0.05] transition-all">
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-green-500">
              <path d="M22 12H18L15 21L9 3L6 12H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-bold text-base tracking-tight text-white">GitVital</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-zinc-400 hover:text-white transition-colors duration-200">Features</a>
            <a href="#compare" className="text-sm text-zinc-400 hover:text-white transition-colors duration-200">Compare</a>
            <a href="#leaderboard" className="text-sm text-zinc-400 hover:text-white transition-colors duration-200">Leaderboard</a>
            <a href="#docs" className="text-sm text-zinc-400 hover:text-white transition-colors duration-200">Docs</a>
          </div>
          <div className="flex items-center gap-3">
            <button className="hidden sm:block border border-white/10 rounded-full px-4 py-1.5 text-sm text-white hover:border-white/30 transition-colors duration-200">Login with GitHub</button>
            <button className="bg-gradient-to-b from-violet-500 to-violet-600 hover:brightness-110 shadow-[0_0_20px_rgba(124,58,237,0.2)] rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 text-white">Try Free →</button>
          </div>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section className="relative min-h-screen flex flex-col justify-center pt-24 pb-16 overflow-hidden">
        {/* Subtle Radial Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] opacity-60 pointer-events-none" style={{ backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,58,237,0.15), transparent)" }} />
        
        <FadeIn className="max-w-6xl mx-auto px-6 w-full text-center relative z-10 flex flex-col items-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 mb-6">
            <span className="text-xs font-medium text-violet-400 tracking-wide">✦ Now with AI-Powered Advice</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            <span className="block text-white">Is your GitHub repo</span>
            <span className="block">healthy or slowly <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">dying?</span></span>
          </h1>
          
          <p className="text-zinc-400 text-base md:text-lg max-w-xl mx-auto mb-10 leading-relaxed font-normal">
            GitVital scores any public GitHub repository across 6 health metrics — bus factor, PR speed, issue backlog, activity trend, contributor spread, and code churn — in under 60 seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 w-full">
            <button onClick={handleAnalyze} className="w-full sm:w-auto bg-gradient-to-b from-violet-500 to-violet-600 text-white rounded-lg px-6 py-3 font-medium shadow-[0_0_40px_rgba(124,58,237,0.3)] hover:brightness-110 transition-all duration-150">
              Analyze a Repo →
            </button>
            <button className="w-full sm:w-auto border border-white/10 rounded-lg px-6 py-3 text-zinc-300 hover:bg-white/[0.03] transition-colors duration-200">
              See Live Demo
            </button>
          </div>

          <div className="w-full max-w-xl mx-auto relative group">
            <input 
              type="text" 
              placeholder="github.com/facebook/react" 
              className="w-full bg-[#111315] border border-white/10 rounded-lg px-4 py-4 pr-32 text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 transition-all"
              value={repoQuery}
              onChange={(e) => setRepoQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button 
              onClick={handleAnalyze}
              className="absolute right-2 top-2 bottom-2 bg-white/10 hover:bg-white/20 text-white rounded-md px-4 text-sm font-medium transition-colors"
            >
              Analyze →
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-3 font-mono">Analyzes last 1,000 commits · 500 PRs · 500 Issues · Public repos only</p>

          {/* Hero mockup */}
          <div className="mt-16 w-full max-w-2xl mx-auto bg-[#111315] border border-white/[0.06] rounded-xl p-4 sm:p-6 shadow-2xl relative">
            {/* Mockup header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-white/5 border border-white/10 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.477 2 2 6.477 2 12C2 16.42 4.87 20.17 8.84 21.5C9.34 21.58 9.5 21.27 9.5 21C9.5 20.77 9.5 20.14 9.5 19.31C6.73 19.91 6.14 17.97 6.14 17.97C5.68 16.81 5.03 16.5 5.03 16.5C4.12 15.88 5.1 15.9 5.1 15.9C6.1 15.97 6.63 16.93 6.63 16.93C7.5 18.45 8.97 18.02 9.54 17.76C9.63 17.11 9.89 16.67 10.17 16.42C7.95 16.17 5.62 15.31 5.62 11.5C5.62 10.39 6.01 9.5 6.65 8.79C6.55 8.54 6.2 7.5 6.75 6.15C6.75 6.15 7.59 5.88 9.5 7.17C10.29 6.95 11.15 6.84 12 6.84C12.85 6.84 13.71 6.95 14.5 7.17C16.4 5.88 17.25 6.15 17.25 6.15C17.8 7.5 17.45 8.54 17.35 8.79C17.99 9.5 18.38 10.39 18.38 11.5C18.38 15.32 16.04 16.16 13.81 16.41C14.17 16.72 14.5 17.33 14.5 18.26C14.5 19.6 14.5 20.68 14.5 21C14.5 21.28 14.66 21.59 15.17 21.5C19.14 20.16 22 16.42 22 12C22 6.477 17.52 2 12 2Z"/></svg>
                </div>
                <span className="font-mono text-sm sm:text-base font-medium">facebook/react</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-xs sm:text-sm">Health Score</span>
                <span className="text-green-500 font-mono text-xl sm:text-2xl font-bold">88<span className="text-sm text-green-500/50">/100</span></span>
              </div>
            </div>
            {/* Metric Pills */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
              <div className="bg-[#0B0D0E] border border-white/[0.04] rounded-lg p-3">
                 <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Bus Factor</div>
                 <div className="text-sm font-mono text-white flex items-center justify-between">12 <span className="text-green-500">✅</span></div>
              </div>
              <div className="bg-[#0B0D0E] border border-white/[0.04] rounded-lg p-3">
                 <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">PR Speed</div>
                 <div className="text-sm font-mono text-white flex items-center justify-between">1.2d <span className="text-green-500">✅</span></div>
              </div>
              <div className="bg-[#0B0D0E] border border-white/[0.04] rounded-lg p-3">
                 <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Activity</div>
                 <div className="text-sm font-mono text-white flex items-center justify-between">+5% <span className="text-green-500">✅</span></div>
              </div>
              <div className="bg-[#0B0D0E] border border-white/[0.04] rounded-lg p-3">
                 <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Issues</div>
                 <div className="text-sm font-mono text-white flex items-center justify-between">642 <span className="text-yellow-500">⚠️</span></div>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* 3. SOCIAL PROOF LOGOS MARQUEE */}
      <section className="py-12 relative border-y border-white/[0.02] bg-[#0B0D0E]/50">
        <div className="max-w-6xl mx-auto px-6 mb-6">
          <h3 className="text-xs text-zinc-600 uppercase tracking-widest text-center">Trusted by developers at</h3>
        </div>
        
        <div className="w-full overflow-hidden flex" style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}>
          <div className="flex animate-scroll whitespace-nowrap items-center w-max">
            {/* Logo Group */}
            {['Google', 'Meta', 'Stripe', 'Vercel', 'Shopify', 'Linear', 'Notion', 'Figma', 'Supabase', 'PlanetScale'].map((logo, i) => (
              <div key={`l1-${i}`} className="mx-8 text-zinc-500 font-medium text-lg tracking-tight select-none">{logo}</div>
            ))}
            {/* Duplicated for seamless loop */}
            {['Google', 'Meta', 'Stripe', 'Vercel', 'Shopify', 'Linear', 'Notion', 'Figma', 'Supabase', 'PlanetScale'].map((logo, i) => (
              <div key={`l2-${i}`} className="mx-8 text-zinc-500 font-medium text-lg tracking-tight select-none">{logo}</div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. FEATURES SECTION */}
      <section id="features" className="py-24 md:py-32">
        <FadeIn className="max-w-6xl mx-auto px-6 flex flex-col items-center">
          <div className="rounded-full border border-white/10 text-zinc-500 text-xs px-3 py-1 mb-8 uppercase tracking-widest font-medium">
            WHAT GITVITAL MEASURES
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center max-w-2xl mb-12 text-white">
            Every signal that tells you if a repo is worth your time
          </h2>

          {/* Tab Switcher */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-full p-1 inline-flex gap-1 mb-10 overflow-x-auto max-w-full no-scrollbar">
            {featureTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id ? "bg-[#27272A] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tab.id}
              </button>
            ))}
          </div>

          {/* Tab Content Panel */}
          <div className="w-full rounded-2xl border border-white/[0.06] bg-[#111315] p-6 md:p-10 flex flex-col md:flex-row gap-10 md:items-center min-h-[400px]">
            <div key={activeFeature.id} className="w-full md:w-3/5 animate-[fadeIn_0.3s_ease-out]">
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">{activeFeature.title}</h3>
              <p className="text-zinc-400 text-base leading-relaxed mb-8">{activeFeature.desc}</p>
              
              <ul className="space-y-4 mb-8">
                {activeFeature.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-zinc-300">
                    <GreenCheck />
                    {bullet}
                  </li>
                ))}
              </ul>
              <button className="text-violet-400 text-sm font-medium hover:text-violet-300 transition-colors flex items-center gap-1 group">
                Learn more 
                <span className="transform group-hover:translate-x-1 transition-transform">→</span>
              </button>
            </div>
            
            <div key={activeFeature.id + "-mockup"} className="w-full md:w-2/5 h-64 md:h-80 bg-[#0B0D0E] rounded-xl border border-white/[0.06] p-6 flex flex-col relative overflow-hidden animate-[fadeIn_0.3s_ease-out] shadow-inner">
              {activeFeature.mockup}
            </div>
          </div>

          {/* "Better than reading:" Strip */}
          <div className="mt-12 w-full flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
            <span className="text-xs text-zinc-500 uppercase tracking-widest mr-2">Better than reading:</span>
            <div className="flex flex-wrap justify-center gap-4">
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 bg-white/5 px-2 py-1 rounded">⭐ Stars Count</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 bg-white/5 px-2 py-1 rounded">📅 Last Commit</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 bg-white/5 px-2 py-1 rounded">👁️ Manual Scanning</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 bg-white/5 px-2 py-1 rounded">🤞 Hoping for defaults</span>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* 5. BENTO GRID SECTION */}
      <section className="py-24 md:py-32 border-t border-white/[0.02]">
        <FadeIn className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">Everything you need to evaluate a repo</h2>
            <p className="text-zinc-400 text-base">Integrated into your workflow. Instantly accessible.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[250px]">
            {/* Card 1: Embeddable Badge (span 2) */}
            <div className="bg-[#111315] border border-white/[0.06] rounded-xl p-6 md:p-8 flex flex-col justify-between md:col-span-2 group hover:border-white/[0.12] transition-colors duration-300">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2 tracking-tight">Embeddable Badges</h3>
                <p className="text-sm text-zinc-400 max-w-sm">Show off your repo's health directly in your README. Auto-updates.</p>
              </div>
              <div className="bg-[#0B0D0E] border border-white/[0.06] rounded-lg p-4 font-mono text-xs flex items-center justify-between">
                <span className="text-zinc-500 select-all">![GitVital](https://gitvital.com/badge/facebook/react)</span>
                {/* Visual badge mockup */}
                <div className="hidden sm:flex rounded overflow-hidden border border-[#52525B]">
                  <div className="bg-[#52525B] px-2 py-1 text-white font-sans font-medium text-[10px]">GitVital</div>
                  <div className="bg-green-600 px-2 py-1 text-white font-sans font-medium text-[10px]">Health: 88 ✅</div>
                </div>
              </div>
            </div>

            {/* Card 2: Risk Flags (span 1) */}
            <div className="bg-[#111315] border border-white/[0.06] rounded-xl p-6 md:p-8 flex flex-col overflow-hidden group hover:border-white/[0.12] transition-colors duration-300">
              <h3 className="text-lg font-semibold text-white mb-2 tracking-tight">Risk Flags</h3>
              <p className="text-sm text-zinc-400 mb-6">Spot single points of failure instantly.</p>
              <div className="space-y-2 mt-auto">
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-2 w-max">
                  <span className="text-red-500">⚠️</span> Contributor Concentration
                </div>
                <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-2 w-max translate-x-4">
                  <span className="text-green-500">✅</span> Fast PR Reviews
                </div>
              </div>
            </div>

            {/* Card 3: Leaderboard (span 1) */}
            <div className="bg-[#111315] border border-white/[0.06] rounded-xl p-6 md:p-8 flex flex-col group hover:border-white/[0.12] transition-colors duration-300">
              <h3 className="text-lg font-semibold text-white mb-2 tracking-tight">Global Leaderboard</h3>
              <p className="text-sm text-zinc-400">See where you stand.</p>
              <div className="mt-auto bg-[#0B0D0E] border border-white/[0.06] rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-500 to-amber-200 flex items-center justify-center shadow-[0_0_15px_rgba(234,179,8,0.3)]">
                  <span className="text-black font-bold text-sm">#142</span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Global Rank</div>
                  <div className="text-[10px] text-zinc-500">Top 7% of repos</div>
                </div>
              </div>
            </div>

            {/* Card 5: Dev Health Score (span 2) */}
            <div className="bg-[#111315] border border-white/[0.06] rounded-xl p-6 md:p-8 flex flex-col md:col-span-2 relative overflow-hidden group hover:border-white/[0.12] transition-colors duration-300">
              <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 blur-[60px] pointer-events-none rounded-full" />
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2 tracking-tight">Developer Health Score</h3>
                  <p className="text-sm text-zinc-400 max-w-sm">Login with GitHub to analyze your own repos and track your personal maintainer score across all projects.</p>
                </div>
                <div className="flex gap-4 mt-6">
                  <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs flex items-center gap-2">
                    <span>🏃</span> <span className="font-medium">The Speedster</span>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs flex items-center gap-2 z-10">
                    <span>🔒</span> <span className="font-medium">The Closer</span>
                  </div>
                  <div className="hidden sm:flex bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs items-center gap-2">
                    <span className="text-amber-400">⭐</span> <span className="font-medium">OSS Hero</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Card 6: API Limits (span 1 - implicitly placed, but let's make it explicitly span 1 full width or just a card) */}
            <div className="bg-[#111315] border border-white/[0.06] rounded-xl p-6 md:p-8 flex flex-col group hover:border-white/[0.12] transition-colors duration-300 md:col-span-3">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                 <div>
                   <h3 className="text-lg font-semibold text-white mb-2 tracking-tight">Transparent Limits</h3>
                   <p className="text-sm text-zinc-400">We analyze what matters, with deep context.</p>
                 </div>
                 <div className="bg-[#0B0D0E] border border-white/[0.06] rounded-lg p-4 font-mono text-[11px] sm:text-xs text-zinc-500 w-full md:w-auto text-center md:text-left">
                   1,000 commits · 500 PRs · 500 issues per analysis
                 </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* 6. TESTIMONIALS */}
      <section className="py-24 md:py-32">
        <FadeIn className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center text-white mb-16">Loved by developers who care about code</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-[#111315] border border-white/[0.06] rounded-xl p-6 hover:border-white/[0.12] transition-colors duration-200">
               <p className="text-sm text-zinc-300 mb-6 leading-relaxed">"Pasted facebook/react URL and instantly knew it was safe to use as a dependency. Bus factor of 12, PRs merging in 1 day. Sold."</p>
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-xs font-bold text-white shadow-inner">DK</div>
                  <div>
                    <div className="text-xs font-medium text-white">Devansh K.</div>
                    <div className="text-[10px] text-zinc-500">@devanshk</div>
                  </div>
               </div>
            </div>
            
            <div className="bg-[#111315] border border-white/[0.06] rounded-xl p-6 hover:border-white/[0.12] transition-colors duration-200">
               <p className="text-sm text-zinc-300 mb-6 leading-relaxed">"The repo comparison feature is insane. Compared next.js vs nuxt in 10 seconds before starting a new project. Saved me hours."</p>
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-xs font-bold text-white shadow-inner">PT</div>
                  <div>
                    <div className="text-xs font-medium text-white">Priya Tiwari</div>
                    <div className="text-[10px] text-zinc-500">@priyatiwari</div>
                  </div>
               </div>
            </div>
            
            <div className="bg-[#111315] border border-white/[0.06] rounded-xl p-6 hover:border-white/[0.12] transition-colors duration-200">
               <p className="text-sm text-zinc-300 mb-6 leading-relaxed">"GitVital showed my side project had a bus factor of 1 (just me 😂). Good reality check before I tried to open source it officially."</p>
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-xs font-bold text-white shadow-inner">RB</div>
                  <div>
                    <div className="text-xs font-medium text-white">Rohit Builds</div>
                    <div className="text-[10px] text-zinc-500">@roh_builds</div>
                  </div>
               </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* 7. LIVE STATS COUNTER */}
      <section className="relative border-y border-white/[0.02] bg-[#0B0D0E]">
        <StatsGrid />
      </section>

      {/* 8. FINAL CTA */}
      <section className="relative py-32 overflow-hidden flex flex-col items-center justify-center text-center">
        <div className="absolute inset-0 top-1/2 -translate-y-1/2 w-full h-[600px] opacity-40 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle 600px at center, rgba(124,58,237,0.3), transparent)" }} />
        
        <FadeIn className="max-w-3xl mx-auto px-6 relative z-10 flex flex-col items-center">
          <div className="rounded-full border border-white/10 text-white text-[10px] sm:text-xs px-4 py-1.5 mb-8 uppercase tracking-widest font-medium bg-white/5 backdrop-blur-sm">
            GET STARTED FREE
          </div>
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-white mb-6">Stop guessing. Start knowing.</h2>
          <p className="text-zinc-400 text-lg md:text-xl mb-10 max-w-2xl">
            Paste any GitHub URL. Get a full health report in under 60 seconds. Free forever for public repos.
          </p>
          
          <div className="w-full max-w-xl mx-auto relative mb-4">
            <input 
              type="text" 
              placeholder="github.com/facebook/react" 
              className="w-full bg-[#111315]/80 backdrop-blur-md border border-white/20 rounded-lg px-5 py-5 pr-36 text-white text-lg placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all shadow-2xl"
              value={repoQuery}
              onChange={(e) => setRepoQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button 
              onClick={handleAnalyze}
              className="absolute right-2 top-2 bottom-2 bg-gradient-to-b from-violet-500 to-violet-600 hover:brightness-110 text-white rounded-md px-6 font-medium transition-all shadow-[0_0_20px_rgba(124,58,237,0.4)]"
            >
              Analyze Now →
            </button>
          </div>
          <p className="text-xs text-zinc-600 font-mono tracking-wide">No signup required for public repos</p>
        </FadeIn>
      </section>

      {/* 9. FOOTER */}
      <footer className="border-t border-white/[0.06] pt-16 pb-8 bg-[#0B0D0E]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-16">
            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold text-white mb-2">Product</h4>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Features</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Health Score</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Repo Compare</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Timeline</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">AI Advice</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Badges</a>
            </div>
            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold text-white mb-2">Developers</h4>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Docs</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">API</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">GitHub</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Changelog</a>
            </div>
            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold text-white mb-2">Compare</h4>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">vs. deps.dev</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">vs. Snyk</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">vs. manual review</a>
            </div>
            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold text-white mb-2">Community</h4>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Discord</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Twitter/X</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">GitHub Discussions</a>
            </div>
            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold text-white mb-2">Legal</h4>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Privacy</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Terms</a>
              <a href="#" className="text-sm text-zinc-500 hover:text-white transition-colors">Fair Use</a>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-between pt-8 border-t border-white/[0.06] text-xs text-zinc-600">
            <p>© 2025 GitVital. All rights reserved.</p>
            <div className="flex items-center gap-2 mt-4 sm:mt-0 pt-2 sm:pt-0">
               <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
               <span>All systems operational ↗</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
