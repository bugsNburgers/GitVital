"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

// ── Shared nav skeleton bar ──────────────────────────────────────────────────
function SkeletonNav() {
  return (
    <div style={{
      height: 58,
      borderBottom: "1px solid rgba(255,255,255,0.055)",
      background: "rgba(8,9,9,0.95)",
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      gap: 16,
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div className="skeleton skeleton-block" style={{ width: 120, height: 28 }} />
      {/* Middle spacer */}
      <div style={{ flex: 1 }} />
      {/* Nav links */}
      {[72, 90, 64, 80].map((w, i) => (
        <div key={i} className="skeleton skeleton-text" style={{ width: w }} />
      ))}
    </div>
  );
}

// ── Generic "dashboard" skeleton body used as fallback ──────────────────────
function SkeletonDashboard() {
  return (
    <div style={{ padding: "40px 24px", maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hero card */}
      <div className="skeleton skeleton-block" style={{ height: 160, width: "100%" }} />
      {/* 4-col metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {[1,2,3,4].map(i => (
          <div key={i} className="skeleton skeleton-block" style={{ height: 120 }} />
        ))}
      </div>
      {/* Wide chart */}
      <div className="skeleton skeleton-block" style={{ height: 220 }} />
      {/* 4-col flags */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {[1,2,3,4].map(i => (
          <div key={i} className="skeleton skeleton-block" style={{ height: 80 }} />
        ))}
      </div>
      {/* AI panel */}
      <div className="skeleton skeleton-block" style={{ height: 140 }} />
      {/* Badges */}
      <div className="skeleton skeleton-block" style={{ height: 100 }} />
    </div>
  );
}

// ── Home/landing skeleton ────────────────────────────────────────────────────
function SkeletonLanding() {
  return (
    <div style={{ padding: "120px 24px 60px", maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      {/* Pill badge */}
      <div className="skeleton" style={{ width: 200, height: 26, borderRadius: 20 }} />
      {/* Headline */}
      <div className="skeleton skeleton-block" style={{ width: "75%", height: 64 }} />
      <div className="skeleton skeleton-block" style={{ width: "55%", height: 64 }} />
      {/* Subtext */}
      <div className="skeleton skeleton-text" style={{ width: "60%", marginTop: 8 }} />
      <div className="skeleton skeleton-text" style={{ width: "50%" }} />
      {/* Search bar */}
      <div className="skeleton skeleton-block" style={{ width: "100%", maxWidth: 540, height: 50, marginTop: 8 }} />
      {/* Mockup card */}
      <div className="skeleton skeleton-block" style={{ width: "100%", maxWidth: 560, height: 240, marginTop: 20 }} />
    </div>
  );
}

// ── Profile skeleton ─────────────────────────────────────────────────────────
function SkeletonProfile() {
  return (
    <div style={{ padding: "90px 24px 60px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Profile header */}
      <div className="skeleton skeleton-block" style={{ height: 200 }} />
      {/* Achievements */}
      <div>
        <div className="skeleton skeleton-text" style={{ width: 200, marginBottom: 16 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton skeleton-block" style={{ height: 160 }} />
          ))}
        </div>
      </div>
      {/* Repos */}
      <div>
        <div className="skeleton skeleton-text" style={{ width: 200, marginBottom: 16 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {[1,2,3].map(i => (
            <div key={i} className="skeleton skeleton-block" style={{ height: 180 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Leaderboard skeleton ─────────────────────────────────────────────────────
function SkeletonLeaderboard() {
  return (
    <div style={{ padding: "84px 24px 60px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Hero */}
      <div className="skeleton skeleton-block" style={{ height: 80 }} />
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {[1,2,3].map(i => (
          <div key={i} className="skeleton skeleton-block" style={{ height: 80 }} />
        ))}
      </div>
      {/* Table */}
      <div className="skeleton skeleton-block" style={{ height: 360 }} />
    </div>
  );
}

// ── Compare skeleton ─────────────────────────────────────────────────────────
function SkeletonCompare() {
  return (
    <div style={{ padding: "40px 24px 120px", maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Heading */}
      <div className="skeleton skeleton-block" style={{ height: 60 }} />
      {/* Input row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        {[1,2,3,4].map(i => (
          <div key={i} className="skeleton skeleton-block" style={{ height: 44 }} />
        ))}
      </div>
      {/* Sparklines */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {[1,2,3].map(i => (
          <div key={i} className="skeleton skeleton-block" style={{ height: 100 }} />
        ))}
      </div>
      {/* Radar */}
      <div className="skeleton skeleton-block" style={{ height: 440 }} />
      {/* Table */}
      <div className="skeleton skeleton-block" style={{ height: 320 }} />
    </div>
  );
}

// ── Route → skeleton mapping ─────────────────────────────────────────────────
function SkeletonBody({ to }: { to: string }) {
  if (to === "/" || to === "") return <SkeletonLanding />;
  if (to.startsWith("/leaderboard")) return <SkeletonLeaderboard />;
  if (to.startsWith("/compare")) return <SkeletonCompare />;
  // If the path has exactly 1 segment → profile page
  const segments = to.replace(/^\//, "").split("/").filter(Boolean);
  if (segments.length === 1) return <SkeletonProfile />;
  // 2+ segments → repo dashboard (or similar)
  return <SkeletonDashboard />;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function PageTransition() {
  const pathname = usePathname();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const targetPathRef = useRef<string>("/");
  const showingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSkeleton = useCallback((targetPath: string) => {
    if (showingRef.current) return;
    showingRef.current = true;
    targetPathRef.current = targetPath;

    // Remove any existing overlay first
    if (overlayRef.current) {
      overlayRef.current.remove();
      overlayRef.current = null;
    }

    const overlay = document.createElement("div");
    overlay.className = "page-skeleton-overlay";
    overlay.innerHTML = ""; // will be filled via React portal–like approach

    // We cannot render React components into a raw DOM div easily, so we
    // build the skeleton with innerHTML + the CSS classes already in globals.css
    overlay.style.cssText = `
      position: fixed; inset: 0; background: #080909;
      z-index: 9998; display: flex; flex-direction: column; overflow: hidden;
    `;

    // Nav bar
    const nav = document.createElement("div");
    nav.style.cssText = `
      height: 58px; border-bottom: 1px solid rgba(255,255,255,0.055);
      background: rgba(8,9,9,0.95); display: flex; align-items: center;
      padding: 0 24px; gap: 16px; flex-shrink: 0;
    `;
    nav.innerHTML = `
      <div class="skeleton skeleton-block" style="width:120px;height:28px;"></div>
      <div style="flex:1;"></div>
      <div class="skeleton skeleton-text" style="width:72px;"></div>
      <div class="skeleton skeleton-text" style="width:90px;"></div>
      <div class="skeleton skeleton-text" style="width:64px;"></div>
      <div class="skeleton skeleton-text" style="width:80px;"></div>
    `;
    overlay.appendChild(nav);

    // Body content based on destination
    const body = document.createElement("div");
    body.style.cssText = "flex:1; overflow:hidden;";
    body.innerHTML = buildSkeletonHTML(targetPath);
    overlay.appendChild(body);

    document.body.appendChild(overlay);
    overlayRef.current = overlay;

    // Safety: auto-remove after 8s in case navigation failed
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => hideSkeleton(), 8000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hideSkeleton = useCallback(() => {
    showingRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.style.transition = "opacity 0.25s ease";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    setTimeout(() => {
      overlay.remove();
      if (overlayRef.current === overlay) overlayRef.current = null;
    }, 260);
  }, []);

  // Hide skeleton whenever the actual route has settled (pathname changed)
  useEffect(() => {
    if (showingRef.current) {
      hideSkeleton();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Intercept ALL link clicks and programmatic router.push calls
  useEffect(() => {
    // ── Intercept <a> tag clicks ──────────────────────────────────────────
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      // Only intercept same-origin internal links
      if (href.startsWith("http") || href.startsWith("//") || href.startsWith("mailto") || href.startsWith("#")) return;
      showSkeleton(href);
    };

    // ── Intercept Next.js router navigation ──────────────────────────────
    // Next.js 13+ App Router uses history.pushState / replaceState under the hood.
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);

    history.pushState = function(state, title, url) {
      if (url && typeof url === "string") {
        const path = url.startsWith("http") ? new URL(url).pathname : url;
        showSkeleton(path);
      }
      return origPush(state, title, url);
    };

    history.replaceState = function(state, title, url) {
      if (url && typeof url === "string") {
        const path = url.startsWith("http") ? new URL(url).pathname : url;
        // replaceState on hash changes / minor updates — only show if meaningful change
        if (path !== pathname) showSkeleton(path);
      }
      return origReplace(state, title, url);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, showSkeleton]);

  return null; // Renders nothing — skeleton is managed via raw DOM for cross-page guarantee
}

// ── HTML skeleton builders ───────────────────────────────────────────────────
function sk(w: string | number, h: number, extra = "") {
  return `<div class="skeleton skeleton-block" style="width:${typeof w === "number" ? w + "px" : w};height:${h}px;${extra}"></div>`;
}
function skText(w: string | number, extra = "") {
  return `<div class="skeleton skeleton-text" style="width:${typeof w === "number" ? w + "px" : w};${extra}"></div>`;
}
function grid(cols: number, items: string[], gap = 10) {
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${gap}px;">${items.join("")}</div>`;
}

function buildSkeletonHTML(to: string): string {
  const segments = to.replace(/^\//, "").split("/").filter(Boolean);
  const base = segments[0] ?? "";

  if (to === "/" || to === "") {
    // Landing
    return `<div style="padding:120px 24px 60px;max-width:780px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:20px;">
      <div class="skeleton" style="width:200px;height:26px;border-radius:20px;"></div>
      ${sk("75%", 64)}
      ${sk("55%", 64)}
      ${skText("60%", "margin-top:8px;")}
      ${skText("50%")}
      ${sk("100%", 50, "max-width:540px;margin-top:8px;")}
      ${sk("100%", 240, "max-width:560px;margin-top:20px;")}
    </div>`;
  }

  if (base === "leaderboard") {
    return `<div style="padding:84px 24px 60px;max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:24px;">
      ${sk("100%", 80)}
      ${grid(3, [sk("100%", 80), sk("100%", 80), sk("100%", 80)], 16)}
      ${sk("100%", 360)}
    </div>`;
  }

  if (base === "compare") {
    return `<div style="padding:40px 24px 120px;max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">
      ${sk("100%", 60)}
      ${grid(4, [sk("100%",44),sk("100%",44),sk("100%",44),sk("100%",44)], 8)}
      ${grid(3, [sk("100%",100),sk("100%",100),sk("100%",100)])}
      ${sk("100%", 440)}
      ${sk("100%", 320)}
    </div>`;
  }

  if (segments.length === 1) {
    // Profile page (/owner)
    return `<div style="padding:90px 24px 60px;max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:28px;">
      ${sk("100%", 200)}
      <div>
        ${skText("200px", "margin-bottom:16px;")}
        ${grid(4, [sk("100%",160),sk("100%",160),sk("100%",160),sk("100%",160)], 16)}
      </div>
      <div>
        ${skText("200px", "margin-bottom:16px;")}
        ${grid(3, [sk("100%",180),sk("100%",180),sk("100%",180)], 16)}
      </div>
    </div>`;
  }

  // Repo dashboard (default)
  return `<div style="padding:40px 24px 80px;max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">
    ${sk("100%", 160)}
    ${grid(4, [sk("100%",120),sk("100%",120),sk("100%",120),sk("100%",120)])}
    ${sk("100%", 220)}
    ${grid(4, [sk("100%",80),sk("100%",80),sk("100%",80),sk("100%",80)])}
    ${sk("100%", 140)}
    ${sk("100%", 100)}
  </div>`;
}
