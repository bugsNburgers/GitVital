export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white font-sans px-6">
      {/* Glow effect */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />

      <main className="relative z-10 flex flex-col items-center gap-8 text-center max-w-2xl">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-xl font-bold shadow-lg shadow-emerald-500/20">
            GV
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            Git<span className="text-emerald-400">Vital</span>
          </h1>
        </div>

        {/* Tagline */}
        <p className="text-lg text-zinc-400 leading-relaxed max-w-md">
          Instantly check the vital signs of any GitHub repository.
          <br />
          <span className="text-zinc-500">Health scores, risk flags, and AI-powered insights.</span>
        </p>

        {/* URL swap demo */}
        <div className="mt-4 flex flex-col gap-3 items-center">
          <p className="text-sm text-zinc-500 uppercase tracking-widest font-medium">How it works</p>
          <div className="flex flex-col gap-2 font-mono text-sm">
            <div className="flex items-center gap-3">
              <span className="text-zinc-600 line-through">github.com</span>
              <span className="text-zinc-600">/facebook/react</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-semibold">gitvital.com</span>
              <span className="text-zinc-300">/facebook/react</span>
              <span className="text-emerald-400">→ instant health dashboard</span>
            </div>
          </div>
        </div>

        {/* Coming soon badge */}
        <div className="mt-8 px-5 py-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 text-sm font-medium">
          🚀 Coming Soon — Currently under development
        </div>

        {/* GitHub link */}
        <a
          href="https://github.com/bugsNburgers/Repopulse"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          View on GitHub
        </a>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-6 text-zinc-600 text-xs">
        Built with Next.js, Node.js, PostgreSQL, Redis, BullMQ & GitHub GraphQL API
      </footer>
    </div>
  );
}
