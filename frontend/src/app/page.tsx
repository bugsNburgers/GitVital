"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ScrollPulse from '@/components/ScrollPulse';
import { API_BASE, AUTH_URL } from '@/config';

export default function GitvitalLanding() {
  const router = useRouter();
  const [isHealthy, setIsHealthy] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [user, setUser] = useState<{ loggedIn: boolean; githubUsername?: string } | null>(null);
  const [showIpNotice, setShowIpNotice] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Check if the user has already acknowledged the IP notice
    if (typeof window !== 'undefined' && !localStorage.getItem('gitvital_ip_notice_ack')) {
      setShowIpNotice(true);
      // Disable scrolling when modal is open
      document.body.style.overflow = 'hidden';
    }
  }, []);

  const handleAckIpNotice = () => {
    localStorage.setItem('gitvital_ip_notice_ack', 'true');
    setShowIpNotice(false);
    // Re-enable scrolling
    document.body.style.overflow = 'auto';
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/me`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setUser(data))
      .catch(err => {
        console.warn('Failed to fetch user session:', err);
        setUser({ loggedIn: false });
      });
  }, []);

  useEffect(() => {
    // IntersectionObservers equivalent
    const fadeEls = document.querySelectorAll('.fade-in');
    const fadeObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); } });
    }, { threshold: 0.12 });
    fadeEls.forEach(el => fadeObserver.observe(el));

    // Hero trigger
    setTimeout(() => {
      const el = document.getElementById('heroCard');
      if (el) el.classList.add('visible');
    }, 300);

    // Counter animations
    const counterEls = document.querySelectorAll('.stat-num[data-target]');
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const target = parseInt(el.dataset.target || '0');
        const suffix = el.dataset.suffix || '';
        const prefix = el.dataset.prefix || '';
        const divisor = parseFloat(el.dataset.divisor || '1');
        const duration = 1800;
        const steps = 60;
        const stepTime = duration / steps;
        let current = 0;
        const increment = target / steps;
        const timer = setInterval(() => {
          current += increment;
          if (current >= target) {
            current = target;
            clearInterval(timer);
          }
          const display = divisor > 1 ? Math.floor(current / divisor) : Math.floor(current);
          el.textContent = prefix + display + suffix;
        }, stepTime);
        counterObserver.unobserve(el);
      });
    }, { threshold: 0.5 });
    counterEls.forEach(el => counterObserver.observe(el));

    // Marquee duplications
    // Removed innerHTML duplication to avoid React 'removeChild' errors!
    // The items are already duplicated directly in the JSX below.

    let healthTimer: ReturnType<typeof setInterval>;

    const initialTimeout = setTimeout(() => {
      setIsHealthy(prev => !prev);
      setAnimKey(prev => prev + 1);

      healthTimer = setInterval(() => {
        setIsHealthy(prev => !prev);
        setAnimKey(prev => prev + 1);
      }, 3000);
    }, 1000);

    return () => {
      fadeObserver.disconnect();
      counterObserver.disconnect();
      clearTimeout(initialTimeout);
      if (healthTimer) clearInterval(healthTimer);
    };
  }, []);

  useEffect(() => {
    const tabsNav = document.querySelector('.tabs-nav') as HTMLElement | null;
    if (!tabsNav) return;
    const tabPanels = Array.from(document.querySelectorAll('.tab-panel')) as HTMLElement[];

    let lastSwitchAt = 0;
    let accumulatedDeltaX = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const switchByDelta = (delta: number) => {
      const buttons = Array.from(tabsNav.querySelectorAll('.tab-btn')) as HTMLElement[];
      if (buttons.length === 0) return false;

      const activeIndex = Math.max(0, buttons.findIndex((b) => b.classList.contains('active')));
      const direction = delta > 0 ? 1 : -1;
      const nextIndex = Math.min(buttons.length - 1, Math.max(0, activeIndex + direction));
      if (nextIndex === activeIndex) return false;

      const tabId = buttons[nextIndex].dataset.tab;
      if (!tabId) return false;

      switchTab(tabId, buttons[nextIndex]);
      return true;
    };

    const onWheel = (e: WheelEvent) => {
      // Some devices emit horizontal as deltaX, others as Shift+deltaY.
      const horizontalDelta = e.deltaX !== 0 ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
      const absX = Math.abs(horizontalDelta);
      const absY = Math.abs(e.deltaY);
      const isHorizontalIntent = absX > 0 && (absX >= absY * 0.6 || e.shiftKey);
      if (!isHorizontalIntent) return;

      e.preventDefault();

      accumulatedDeltaX += horizontalDelta;
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { accumulatedDeltaX = 0; }, 140);

      if (Math.abs(accumulatedDeltaX) < 38) return;

      const now = Date.now();
      if (now - lastSwitchAt < 180) return;

      const switched = switchByDelta(accumulatedDeltaX);
      if (!switched) return;

      e.preventDefault();
      lastSwitchAt = now;
      accumulatedDeltaX = 0;
    };

    tabsNav.addEventListener('wheel', onWheel, { passive: false });
    tabPanels.forEach((panel) => panel.addEventListener('wheel', onWheel, { passive: false }));
    return () => {
      tabsNav.removeEventListener('wheel', onWheel);
      tabPanels.forEach((panel) => panel.removeEventListener('wheel', onWheel));
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, []);

  useEffect(() => {
    const tabsNav = document.querySelector('.tabs-nav') as HTMLElement | null;
    if (!tabsNav) return;

    const autoAdvance = () => {
      const buttons = Array.from(tabsNav.querySelectorAll('.tab-btn')) as HTMLElement[];
      if (buttons.length < 2) return;

      const activeIndex = Math.max(0, buttons.findIndex((b) => b.classList.contains('active')));
      const nextIndex = (activeIndex + 1) % buttons.length;
      const tabId = buttons[nextIndex].dataset.tab;
      if (!tabId) return;

      switchTab(tabId, buttons[nextIndex]);
    };

    const timer = setInterval(autoAdvance, 3000);
    return () => clearInterval(timer);
  }, []);

  const switchTab = (id: string, btn: HTMLElement) => {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + id)?.classList.add('active');
    btn.classList.add('active');
  };

  const parseRepoInput = (raw: string) => {
    const val = raw.trim().replace(/^https?:\/\//i, '').replace(/^github\.com\//i, '').replace(/^www\.github\.com\//i, '');
    const parts = val.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const owner = parts[0].trim();
      const repoRaw = parts[1].trim();
      const repo = repoRaw.toLowerCase().endsWith('.git') ? repoRaw.slice(0, -4) : repoRaw;
      if (owner && repo) {
        return { owner, repo };
      }
    }
    return null;
  };

  const analyzeRepo = (inputId: string = 'heroInput') => {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    const val = el ? el.value.trim() : "";
    if (val) {
      const parsed = parseRepoInput(val);
      if (parsed) {
        router.push(`/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`);
      }
    }
  };

  const handleKeydown = (e: React.KeyboardEvent<HTMLInputElement>, inputId: string) => {
    if (e.key === 'Enter') analyzeRepo(inputId);
  };

  return (
    <>
      <ScrollPulse />

      {showIpNotice && (
        <div className="ip-modal-overlay">
          <div className="ip-modal">
            <div className="ip-modal-header">
              <div className="ip-modal-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></svg>
              </div>
              <h2 className="ip-modal-title">API Rate Limiting Warning</h2>
            </div>
            <div className="ip-modal-body">
              <p>
                To provide you with lightning-fast analysis and protect our AI systems from abuse, GitVital temporarily collects your <strong>IP address</strong> for <strong>rate-limiting purposes</strong> Hence please approve the pop-up permission <strong>"Access other apps and services on this device"</strong> shown on your browser.
              </p>
              <p>
                <strong>Why is this safe?</strong> We process your IP strictly for request counting. It is completely anonymous—we do not store, track, or share your IP with any third parties.
              </p>
            </div>
            <div className="ip-modal-actions">
              <button className="ip-modal-btn" onClick={handleAckIpNotice}>I understand, let's go!</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
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
    --violet: #FF5E00;
    --orange-light: #FFA066;
    --orange-dim: rgba(255,94,0,0.15);
    --font: 'Geist', system-ui, sans-serif;
    --mono: 'Geist Mono', monospace;
  }

  html { scroll-behavior: smooth; }

  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ─── IP NOTICE MODAL ─── */
  .ip-modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(8, 9, 9, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    animation: fadeInModal 0.3s ease;
  }
  @keyframes fadeInModal { from { opacity: 0; backdrop-filter: blur(0px); } to { opacity: 1; backdrop-filter: blur(8px); } }
  
  .ip-modal {
    background: var(--bg-card);
    border: 1px solid rgba(255,94,0,0.25);
    border-radius: 16px;
    padding: 32px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px var(--border), 0 0 40px rgba(255,94,0,0.1);
    position: relative;
    overflow: hidden;
    transform: translateY(0);
    animation: slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes slideUpModal { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .ip-modal::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,94,0,0.5), transparent);
  }
  
  .ip-modal-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .ip-modal-icon {
    width: 40px; height: 40px;
    background: linear-gradient(135deg, rgba(255,94,0,0.15), rgba(76,202,240,0.05));
    border: 1px solid rgba(255,94,0,0.2);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: var(--orange-light);
    flex-shrink: 0;
  }
  .ip-modal-title { font-size: 20px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
  .ip-modal-body { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 28px; }
  .ip-modal-body p { margin-bottom: 12px; }
  .ip-modal-body p:last-child { margin-bottom: 0; }
  .ip-modal-body strong { color: var(--text); font-weight: 600; }
  .ip-modal-btn {
    font-family: var(--font);
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    background: var(--violet);
    border: 1px solid rgba(255,94,0,0.5);
    border-radius: 8px;
    padding: 10px 24px;
    cursor: pointer;
    transition: background 0.15s, box-shadow 0.15s;
    width: 100%;
    text-align: center;
  }
  .ip-modal-btn:hover { background: #D94E00; box-shadow: 0 0 20px rgba(255,94,0,0.35); }

  /* ─── NOISE TEXTURE OVERLAY ─── */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 999;
    opacity: 0.35;
  }

  /* ─── NAVBAR ─── */
  nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 100;
    height: 58px;
    display: flex;
    align-items: center;
    padding: 0 24px;
    background: rgba(8,9,9,0.75);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .nav-inner {
    width: 100%;
    max-width: 1120px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-self: start;
    text-decoration: none;
    color: var(--text);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .logo-mark {
    height: 46px;
    width: auto;
    display: block;
  }
  .logo-icon {
    width: 26px;
    height: 26px;
    background: linear-gradient(135deg, var(--violet), var(--orange-light));
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .nav-links {
    display: flex;
    align-items: center;
    gap: 2px;
    list-style: none;
    justify-self: center;
  }
  .nav-links a {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 13.5px;
    font-weight: 450;
    padding: 5px 11px;
    border-radius: 6px;
    transition: color 0.15s, background 0.15s;
  }
  .nav-links a:hover { color: var(--text); background: rgba(255,255,255,0.04); }
  .nav-right { display: flex; align-items: center; gap: 8px; justify-self: end; }
  .btn-ghost {
    font-family: var(--font);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    background: none;
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 5px 14px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn-ghost:hover { color: var(--text); border-color: var(--border-hover); }
  .btn-primary {
    font-family: var(--font);
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: var(--violet);
    border: 1px solid rgba(255,94,0,0.5);
    border-radius: 20px;
    padding: 5px 16px;
    cursor: pointer;
    transition: background 0.15s, box-shadow 0.15s;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn-primary:hover { background: #D94E00; box-shadow: 0 0 20px rgba(255,94,0,0.35); }

  /* ─── HERO ─── */
  .hero {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 100px 24px 60px;
    position: relative;
    overflow: hidden;
  }
  .hero-glow {
    position: absolute;
    top: -20%;
    left: 50%;
    transform: translateX(-50%);
    width: 900px;
    height: 600px;
    background: radial-gradient(ellipse at center, rgba(251,54,64,0.15) 0%, transparent 70%);
    pointer-events: none;
    transition: background 0.8s ease;
  }
  .hero.healthy .hero-glow {
    background: radial-gradient(ellipse at center, rgba(34,197,94,0.15) 0%, transparent 70%);
  }
  .hero-glow-2 {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 700px;
    height: 300px;
    background: radial-gradient(ellipse at center, rgba(251,54,64,0.06) 0%, transparent 70%);
    pointer-events: none;
    transition: background 0.8s ease;
  }
  .hero.healthy .hero-glow-2 {
    background: radial-gradient(ellipse at center, rgba(34,197,94,0.06) 0%, transparent 70%);
  }
  .hero-inner {
    position: relative;
    z-index: 1;
    text-align: center;
    max-width: 780px;
    width: 100%;
  }
  .pill-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 500;
    color: #FFB380;
    background: rgba(255,94,0,0.1);
    border: 1px solid rgba(255,94,0,0.25);
    border-radius: 20px;
    padding: 4px 12px;
    margin-bottom: 28px;
    letter-spacing: 0.01em;
  }
  .pill-badge span { width:5px; height:5px; border-radius:50%; background: var(--orange-light); display:inline-block; }
  .hero h1 {
    font-size: clamp(40px, 6.5vw, 76px);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.0;
    color: var(--text);
    margin-bottom: 22px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.12em;
  }
  .hero-title-line {
    display: block;
  }
  .hero-title-status {
    width: 100%;
    display: flex;
    justify-content: center;
    line-height: 1;
  }
  .hero h1 .accent {
    background: linear-gradient(135deg, #FFB380 0%, #FFC7A6 50%, #FFDACC 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .status-scroller {
    display: grid;
    height: 1.15em;
    min-width: 8ch;
    overflow: hidden;
    text-align: center;
  }
  .status-scroller-inner {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    transform: translateY(0);
  }
  .status-scroller-inner.animating {
    animation: scrollDownAnim 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  }
  @keyframes scrollDownAnim {
    0% { transform: translateY(calc(-1.15em - 0.25em)); }
    100% { transform: translateY(0); }
  }
  .word {
    height: 1.15em;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    line-height: 1;
    padding-bottom: 0.1em;
  }
  .word.dying {
    color: #fb3640;
  }
  .word.healthy {
    color: var(--green);
  }
  .hero-sub {
    font-size: clamp(14px, 1.3vw, 17px);
    line-height: 1.65;
    color: var(--text-secondary);
    max-width: 520px;
    margin: 0 auto 36px;
    font-weight: 400;
  }
  .hero-input-wrap {
    display: flex;
    align-items: center;
    max-width: 540px;
    margin: 0 auto 12px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .hero-input-wrap:focus-within {
    border-color: rgba(255,94,0,0.5);
    box-shadow: 0 0 0 3px rgba(255,94,0,0.1);
  }
  .hero-input-wrap input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    padding: 13px 16px;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
    min-width: 0;
  }
  .hero-input-wrap input::placeholder { color: var(--text-muted); }
  .hero-input-wrap button {
    font-family: var(--font);
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: var(--violet);
    border: none;
    padding: 10px 18px;
    margin: 4px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .hero-input-wrap button:hover { background: #D94E00; }
  .hero-limit-note {
    font-size: 11.5px;
    color: var(--text-muted);
    font-family: var(--mono);
    margin-bottom: 52px;
  }

  /* ─── HERO MOCKUP CARD ─── */
  .hero-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 0;
    max-width: 560px;
    margin: 0 auto;
    overflow: hidden;
    box-shadow: 0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px var(--border);
    position: relative;
  }
  .hero-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,94,0,0.4), transparent);
  }
  .card-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
  }
  .card-dots { display:flex; gap:6px; }
  .card-dots span { width:10px; height:10px; border-radius:50%; }
  .dot-r { background: #ff5f57; }
  .dot-y { background: #febc2e; }
  .dot-g { background: #28c840; }
  .card-title { font-family: var(--mono); font-size: 12px; color: var(--text-muted); }
  .card-body { padding: 20px 20px 8px; }
  .repo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .repo-name { font-family: var(--mono); font-size: 13px; color: var(--text); font-weight: 500; }
  .score-badge {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: var(--green);
    line-height: 1;
  }
  .score-label { font-size: 11px; color: var(--text-muted); font-weight: 500; text-align: right; margin-top: 2px; }
  .score-bar-wrap { margin-bottom: 18px; }
  .score-bar-track { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
  .score-bar-fill {
    height: 100%;
    width: 88%;
    background: linear-gradient(90deg, #22c55e, #86efac);
    border-radius: 2px;
    animation: barGrow 1.2s ease-out 0.5s both;
  }
  @keyframes barGrow { from { width: 0 } to { width: 88% } }
  .metrics-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 14px;
  }
  .metric-pill {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    text-align: center;
  }
  .metric-pill .mp-val { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--text); }
  .metric-pill .mp-label { font-size: 9.5px; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
  .metric-pill.green { border-color: rgba(34,197,94,0.2); }
  .metric-pill.green .mp-val { color: var(--green); }
  .metric-pill.yellow { border-color: rgba(234,179,8,0.2); }
  .metric-pill.yellow .mp-val { color: var(--yellow); }
  .flags-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; padding: 12px 20px 18px; border-top: 1px solid var(--border); }
  .flag {
    font-size: 11px;
    font-weight: 500;
    padding: 3px 10px;
    border-radius: 20px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .flag.success { background: var(--green-dim); color: var(--green); }
  .flag.warn { background: var(--yellow-dim); color: var(--yellow); }
  .flag.danger { background: var(--red-dim); color: var(--red); }

  /* ─── SECTION SHARED ─── */
  section { padding: 96px 24px; }
  .section-inner { max-width: 1120px; margin: 0 auto; }
  .section-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 4px 12px;
    margin-bottom: 20px;
  }
  .section-h2 {
    font-size: clamp(28px, 3.5vw, 42px);
    font-weight: 800;
    letter-spacing: -0.035em;
    line-height: 1.1;
    color: var(--text);
    margin-bottom: 14px;
  }
  .section-sub {
    font-size: 15px;
    color: var(--text-secondary);
    line-height: 1.65;
    max-width: 480px;
  }

  /* ─── MARQUEE LOGOS ─── */
  .logos-section {
    padding: 48px 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    overflow: hidden;
  }
  .logos-label {
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 28px;
  }
  .marquee-track {
    display: flex;
    gap: 0;
    width: max-content;
    animation: marquee 28s linear infinite;
  }
  .marquee-wrap {
    overflow: hidden;
    -webkit-mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
    mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
  }
  @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
  .logo-item {
    padding: 0 32px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: -0.01em;
    white-space: nowrap;
    transition: color 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .logo-item:hover { color: var(--text-secondary); }

  /* ─── FEATURES TABS ─── */
  .features-section {}
  .tabs-header {
    display: block;
    margin-bottom: 40px;
  }
  .tabs-nav {
    display: flex;
    gap: 2px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 3px;
    flex-wrap: nowrap;
    width: max-content;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    margin: 36px auto 0;
  }
  .tab-btn {
    font-family: var(--font);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    background: none;
    border: none;
    padding: 7px 16px;
    border-radius: 7px;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    white-space: nowrap;
    flex: 0 0 auto;
    position: relative;
    overflow: hidden;
  }
  .tab-btn:hover { color: var(--text-secondary); }
  .tab-btn.active { color: var(--text); background: rgba(255,255,255,0.07); }
  .tab-btn.active::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: 100%;
    background: rgba(255,255,255,0.5);
    transform: scaleX(0);
    transform-origin: left;
    animation: tabProgress 3s linear forwards;
  }
  @keyframes tabProgress { to { transform: scaleX(1); } }
  .tab-panel {
    display: none;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    animation: fadeIn 0.25s ease;
  }
  .tab-panel.active { display: grid; grid-template-columns: 1fr 1fr; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
  .tab-content { padding: 36px 36px; }
  .tab-label {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--orange-light);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 10px;
  }
  .tab-content h3 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.25;
    margin-bottom: 12px;
    color: var(--text);
  }
  .tab-content p { font-size: 14px; color: var(--text-secondary); line-height: 1.65; margin-bottom: 20px; }
  .tab-bullets { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; }
  .tab-bullets li {
    font-size: 13.5px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tab-bullets li::before {
    content: '';
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--orange-light);
    flex-shrink: 0;
  }
  .tab-visual {
    border-left: 1px solid var(--border);
    background: var(--bg-surface);
    padding: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Tab visuals */
  .terminal {
    background: #0a0a0b;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    width: 100%;
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.8;
  }
  .t-prompt { color: #3f3f46; }
  .t-cmd { color: #FFDACC; }
  .t-key { color: #FFB380; }
  .t-val { color: #34d399; }
  .t-warn { color: var(--yellow); }
  .t-dim { color: #3f3f46; }

  .score-display {
    text-align: center;
    width: 100%;
  }
  .big-score {
    font-size: 72px;
    font-weight: 900;
    letter-spacing: -0.05em;
    color: var(--green);
    line-height: 1;
    margin-bottom: 4px;
  }
  .big-score-label { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; }
  .score-breakdown { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 220px; margin: 0 auto; }
  .sb-row { display: flex; align-items: center; gap: 8px; }
  .sb-label { font-size: 11px; color: var(--text-muted); width: 80px; text-align: right; flex-shrink: 0; font-family: var(--mono); }
  .sb-track { flex: 1; height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
  .sb-fill { height: 100%; border-radius: 3px; background: var(--green); }

  .compare-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .compare-table th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); padding: 6px 10px; border-bottom: 1px solid var(--border); text-align: left; font-weight: 600; }
  .compare-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); color: var(--text-secondary); font-family: var(--mono); }
  .compare-table tr:last-child td { border-bottom: none; }
  .compare-table .winner { color: var(--green); }
  .compare-table .loser { color: var(--text-muted); }
  .w-badge { font-size: 9px; color: var(--green); background: var(--green-dim); border-radius: 4px; padding: 1px 5px; margin-left: 4px; }

  .timeline-chart { width: 100%; }
  .tl-header { font-size: 11px; color: var(--text-muted); margin-bottom: 12px; text-align: center; font-family: var(--mono); }
  .tl-bars { display: flex; align-items: flex-end; gap: 8px; height: 80px; justify-content: center; }
  .tl-bar-wrap { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .tl-bar {
    width: 28px;
    border-radius: 4px 4px 0 0;
    transition: opacity 0.2s;
    cursor: default;
    position: relative;
  }
  .tl-bar:hover { opacity: 0.8; }
  .tl-qlabel { font-size: 9.5px; color: var(--text-muted); font-family: var(--mono); }
  .tl-score { font-size: 10px; color: var(--text-secondary); font-family: var(--mono); }

  .ai-card {
    background: var(--bg);
    border: 1px solid rgba(255,94,0,0.25);
    border-radius: 12px;
    padding: 18px;
    width: 100%;
    box-shadow: 0 0 30px rgba(255,94,0,0.08);
  }
  .ai-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .ai-icon {
    width: 28px; height: 28px;
    background: linear-gradient(135deg, var(--violet), var(--orange-light));
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .ai-model { font-size: 11px; color: var(--text-muted); }
  .ai-model strong { color: #FFB380; font-weight: 600; }
  .ai-text { font-size: 13px; color: var(--text-secondary); line-height: 1.65; font-style: italic; }
  .ai-text strong { color: var(--text); font-style: normal; }

  /* ─── BENTO GRID ─── */
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: auto auto;
    gap: 14px;
    margin-top: 6px;
  }
  .bento-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 26px;
    transition: border-color 0.22s ease, background 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease;
    position: relative;
    overflow: hidden;
  }
  .bento-card:hover {
    border-color: var(--border-hover);
    background: var(--bg-card-hover);
    transform: translateY(-2px);
    box-shadow: 0 14px 24px rgba(0,0,0,0.2);
  }
  .bento-card.col-2 { grid-column: span 2; }
  .bento-kicker {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 10px;
    font-weight: 600;
  }
  .bento-card .bc-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 10px;
  }
  .bento-card .bc-title {
    font-size: 18px;
    font-weight: 750;
    letter-spacing: -0.02em;
    color: var(--text);
    margin-bottom: 8px;
  }
  .bento-card .bc-desc { font-size: 13px; color: rgba(161,161,170,0.88); line-height: 1.65; }

  .badge-embed {
    display: inline-flex;
    align-items: center;
    background: #18181b;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    font-family: var(--mono);
    font-size: 12px;
    margin-top: 14px;
  }
  .badge-left { background: #27272a; padding: 4px 10px; color: var(--text-muted); }
  .badge-right { padding: 4px 10px; color: var(--green); font-weight: 600; }

  .rank-display {
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .rank-number {
    font-size: 44px;
    font-weight: 900;
    letter-spacing: -0.04em;
    color: var(--text);
    line-height: 1;
  }
  .rank-meta { font-size: 13px; color: var(--text-muted); line-height: 1.4; }
  .rank-meta strong { color: var(--orange-light); font-weight: 600; }

  .dev-profile-card { margin-top: 14px; }
  .dev-score-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .dev-score-big { font-size: 50px; font-weight: 900; letter-spacing: -0.04em; line-height: 1; }
  .dev-identity-name { font-size: 13px; color: var(--text); font-weight: 600; }
  .dev-identity-meta { font-size: 12px; color: rgba(161,161,170,0.84); }
  .dev-score-big.green { color: var(--green); }
  .dev-badges { display: flex; flex-wrap: wrap; gap: 6px; }
  .dev-badge {
    font-size: 11px;
    font-weight: 500;
    padding: 0 10px;
    border-radius: 7px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    line-height: 1;
  }
  .dev-badge.earned { background: rgba(255,94,0,0.1); border-color: rgba(255,94,0,0.25); color: #FFB380; }

  .risk-flags-list {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .risk-flags-list .flag {
    width: fit-content;
    padding: 5px 11px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
  }

  .oauth-cta {
    margin-top: 16px;
    display: inline-flex;
    border-radius: 8px;
  }

  .limits-card { font-family: var(--mono); margin-top: 14px; }
  .limit-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12.5px; }
  .limit-row:last-child { border-bottom: none; }
  .limit-key { color: var(--text-muted); }
  .limit-val { color: var(--text); font-weight: 700; }

  /* ─── TESTIMONIALS ─── */
  .testimonials-section {}
  .testimonials-header { text-align: center; margin-bottom: 48px; }
  .testimonials-header .section-label { margin: 0 auto 20px; }
  .testimonials-header .section-sub { margin: 0 auto; text-align: center; }
  .testimonials-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 10px;
  }
  .testimonial-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 22px;
    transition: border-color 0.2s;
  }
  .testimonial-card:hover { border-color: var(--border-hover); }
  .t-quote { font-size: 13.5px; color: var(--text-secondary); line-height: 1.65; margin-bottom: 16px; }
  .t-author { display: flex; align-items: center; gap: 10px; }
  .t-avatar {
    width: 32px; height: 32px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700;
    flex-shrink: 0;
  }
  .t-name { font-size: 13px; font-weight: 600; color: var(--text); }
  .t-handle { font-size: 11.5px; color: var(--text-muted); font-family: var(--mono); }

  /* scrolling row */
  .testimonials-scroll-row {
    overflow: hidden;
    -webkit-mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
    mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
  }
  .testimonials-scroll-track {
    display: flex;
    gap: 10px;
    width: max-content;
    animation: marquee2 40s linear infinite;
  }
  @keyframes marquee2 { from { transform: translateX(0) } to { transform: translateX(-50%) } }
  .t-mini {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 18px;
    width: 260px;
    flex-shrink: 0;
  }
  .t-mini-quote { font-size: 12.5px; color: var(--text-secondary); line-height: 1.55; margin-bottom: 10px; }
  .t-mini-author { font-size: 11.5px; color: var(--text-muted); font-family: var(--mono); }

  /* ─── STATS ─── */
  .stats-section {
    padding: 80px 24px;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
    max-width: 1120px;
    margin: 0 auto;
  }
  .stat-item {
    text-align: center;
    padding: 0 24px;
    border-right: 1px solid var(--border);
  }
  .stat-item:last-child { border-right: none; }
  .stat-num {
    font-size: 40px;
    font-weight: 900;
    letter-spacing: -0.04em;
    color: var(--text);
    line-height: 1;
    margin-bottom: 6px;
    font-family: var(--mono);
  }
  .stat-label { font-size: 13px; color: var(--text-muted); font-weight: 500; }

  /* ─── FINAL CTA ─── */
  .cta-section {
    padding: 120px 24px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .cta-glow {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 800px;
    height: 400px;
    background: radial-gradient(ellipse at center, rgba(255,94,0,0.18) 0%, transparent 70%);
    pointer-events: none;
  }
  .cta-inner { position: relative; z-index: 1; }
  .cta-inner .section-label { margin: 0 auto 20px; }
  .cta-inner h2 {
    font-size: clamp(36px, 5vw, 60px);
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1.05;
    margin-bottom: 16px;
  }
  .cta-inner p { font-size: 16px; color: var(--text-secondary); max-width: 460px; margin: 0 auto 36px; line-height: 1.65; }
  .cta-note { font-size: 11.5px; color: var(--text-muted); margin-top: 12px; font-family: var(--mono); }

  /* ─── FOOTER ─── */
  footer {
    border-top: 1px solid var(--border);
    padding: 56px 24px 32px;
  }
  .footer-inner { max-width: 1120px; margin: 0 auto; }
  .footer-grid {
    display: grid;
    grid-template-columns: 1.5fr repeat(4, 1fr);
    gap: 32px;
    margin-bottom: 48px;
  }
  .footer-brand .logo { margin-bottom: 10px; }
  .footer-brand p { font-size: 13px; color: var(--text-muted); line-height: 1.55; max-width: 200px; }
  .footer-col h4 { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 14px; letter-spacing: -0.01em; }
  .footer-col ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .footer-col ul li a { font-size: 13px; color: var(--text-muted); text-decoration: none; transition: color 0.15s; }
  .footer-col ul li a:hover { color: var(--text-secondary); }
  .footer-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .status-dot {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--green);
    font-size: 12.5px;
    text-decoration: none;
    transition: opacity 0.15s;
  }
  .status-dot:hover { opacity: 0.75; }
  .status-dot::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--green); display: inline-block; box-shadow: 0 0 6px var(--green); }
  .github-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: 12.5px;
    text-decoration: none;
    transition: color 0.15s;
  }
  .github-link:hover { color: var(--text-secondary); }

  /* ─── SCROLL ANIMATIONS ─── */
  .fade-in {
    opacity: 0;
    transform: translateY(22px);
    transition: opacity 0.65s ease, transform 0.65s ease;
  }
  .fade-in.visible { opacity: 1; transform: translateY(0); }
  .fade-in-delay-1 { transition-delay: 0.1s; }
  .fade-in-delay-2 { transition-delay: 0.2s; }
  .fade-in-delay-3 { transition-delay: 0.3s; }

  /* ─── BETTER THAN STRIP ─── */
  .better-than {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 20px;
  }
  .bt-label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
  .bt-item {
    font-size: 12px;
    color: var(--text-muted);
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 3px 10px;
    font-family: var(--mono);
    line-height: 1.5;
  }

  /* ─── LEARN MORE LINK ─── */
  .learn-more {
    font-size: 13px;
    color: var(--orange-light);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: gap 0.15s;
    font-weight: 500;
  }
  .learn-more:hover { gap: 7px; }

  /* ─── LARGE SCREENS (15"+ / wide monitors) ─── */
  @media (min-width: 1400px) {
    .nav-inner { max-width: 1280px; }
    .section-inner { max-width: 1280px; }
    .stats-grid { max-width: 1280px; }
    .footer-inner { max-width: 1280px; }
  }

  /* ─── MEDIUM (tablets / small laptops ~700-900px) ─── */
  @media (max-width: 900px) {
    .tab-panel.active { grid-template-columns: 1fr; }
    .tab-visual { border-left: none; border-top: 1px solid var(--border); }
    .bento-grid { grid-template-columns: 1fr 1fr; }
    .bento-card.col-2 { grid-column: span 1; }
    .testimonials-grid { grid-template-columns: 1fr; }
    .stats-grid { grid-template-columns: 1fr 1fr; gap: 24px; }
    .stat-item { border-right: none; }
    .footer-grid { grid-template-columns: 1fr 1fr; }
    .metrics-row { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 700px) {
    .hero { padding: 90px 16px 48px; }
    .hero-input-wrap { max-width: 100%; }
    .hero-sub { max-width: 100%; }
    .hero-inner { max-width: 100%; }
    .tabs-header { flex-direction: column; }
    .tab-content { padding: 24px; }
  }

  /* ─── HAMBURGER BUTTON ─── */
  .hamburger {
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 5px;
    width: 36px;
    height: 36px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    padding: 0;
    transition: border-color 0.15s, background 0.15s;
    flex-shrink: 0;
  }
  .hamburger:hover { border-color: var(--border-hover); background: rgba(255,255,255,0.04); }
  .hamburger span {
    display: block;
    width: 16px;
    height: 1.5px;
    background: var(--text-secondary);
    border-radius: 2px;
    transition: transform 0.25s ease, opacity 0.25s ease, width 0.25s ease;
    transform-origin: center;
  }
  .hamburger.open span:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
  .hamburger.open span:nth-child(2) { opacity: 0; width: 0; }
  .hamburger.open span:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }

  /* ─── MOBILE DRAWER ─── */
  .mobile-drawer {
    display: none;
    position: fixed;
    top: 58px;
    left: 0; right: 0;
    background: rgba(10,11,11,0.97);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
    z-index: 99;
    flex-direction: column;
    padding: 12px 16px 16px;
    gap: 4px;
    animation: drawerSlide 0.2s ease;
  }
  @keyframes drawerSlide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
  .mobile-drawer.open { display: flex; }
  .mobile-drawer a {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 15px;
    font-weight: 500;
    padding: 11px 12px;
    border-radius: 8px;
    transition: color 0.15s, background 0.15s;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mobile-drawer a:hover { color: var(--text); background: rgba(255,255,255,0.04); }
  .mobile-drawer .drawer-divider {
    height: 1px;
    background: var(--border);
    margin: 6px 0;
  }
  .mobile-drawer .drawer-login {
    color: var(--text);
    font-weight: 600;
    background: rgba(255,94,0,0.1);
    border: 1px solid rgba(255,94,0,0.25);
    margin-top: 2px;
  }
  .mobile-drawer .drawer-login:hover { background: rgba(255,94,0,0.18); }

  /* ─── MOBILE (≤600px) ─── */
  @media (max-width: 600px) {
    nav { padding: 0 16px; }
    .nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
    }
    .nav-links { display: none; }
    .nav-right { display: flex; }
    .nav-right .btn-ghost { font-size: 12px; padding: 5px 10px; }
    .hamburger { display: flex; order: -1; }
    .logo {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      justify-self: unset;
    }
    .logo-mark { height: 38px; }
    section { padding: 64px 16px; }
    .bento-grid { grid-template-columns: 1fr; }
    .tabs-header { flex-direction: column; }
    .stats-grid { grid-template-columns: 1fr 1fr; }
    .footer-grid { grid-template-columns: 1fr; }
    .hero-card { max-width: 100%; }
    .hero-input-wrap { flex-wrap: wrap; border-radius: 10px; }
    .hero-input-wrap input { width: 100%; padding: 12px 14px; }
    .hero-input-wrap button { width: 100%; margin: 0 4px 4px; border-radius: 7px; text-align: center; justify-content: center; }
    .metrics-row { grid-template-columns: repeat(2, 1fr); }
    .testimonials-grid { grid-template-columns: 1fr; }
    .cta-section { padding: 72px 16px; }
    .stat-num { font-size: 32px; }
  }

  /* ─── VERY SMALL PHONES (≤380px) ─── */
  @media (max-width: 380px) {
    .stats-grid { grid-template-columns: 1fr; }
    .metrics-row { grid-template-columns: 1fr 1fr; }
  }
` }} />



      <nav>
        <div className="nav-inner">
          <a href="/" className="logo" aria-label="GitVital Home">
            <img src="/gitvital_logo_fixed.svg" alt="GitVital" className="logo-mark" />
          </a>
          <ul className="nav-links">
            <li><a href="#features">Features</a></li>
            <li><a href="/compare">Compare</a></li>
            <li><a href="/leaderboard">Leaderboard</a></li>
            <li><a href="https://github.com/bugsNburgers/GitVital#readme" target="_blank" rel="noopener noreferrer">Docs</a></li>
          </ul>
          <div className="nav-right">
            {user?.loggedIn ? (
              <a href={`/${user.githubUsername}`} className="btn-ghost" rel="noopener noreferrer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" /></svg>
                View Profile
              </a>
            ) : (
              <a href={AUTH_URL} className="btn-ghost" rel="noopener noreferrer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" /></svg>
                Login with GitHub
              </a>
            )}
          </div>
          {/* Hamburger – mobile only */}
          <button
            className={`hamburger${menuOpen ? ' open' : ''}`}
            aria-label="Toggle menu"
            onClick={() => setMenuOpen(o => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {/* Mobile drawer - nav links only, no login */}
      <div className={`mobile-drawer${menuOpen ? ' open' : ''}`}>
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="/compare" onClick={() => setMenuOpen(false)}>Compare</a>
        <a href="/leaderboard" onClick={() => setMenuOpen(false)}>Leaderboard</a>
        <a href="https://github.com/bugsNburgers/GitVital#readme" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>Docs</a>
        {user?.loggedIn ? (
          <a href={`/${user.githubUsername}`} onClick={() => setMenuOpen(false)} style={{ color: 'var(--orange)' }}>View Profile</a>
        ) : (
          <a href={AUTH_URL} onClick={() => setMenuOpen(false)}>Login with GitHub</a>
        )}
      </div>


      <section className={`hero ${isHealthy ? 'healthy' : ''}`}>
        <div className="hero-glow"></div>
        <div className="hero-glow-2"></div>
        <div className="hero-inner">
          <h1>
            <span className="hero-title-line">Is your GitHub repo</span>
            <span className="hero-title-status">
              <span className="status-scroller">
                <span className={`status-scroller-inner ${animKey > 0 ? 'animating' : ''}`} key={animKey}>
                  <span className={`word ${isHealthy ? 'healthy' : 'dying'}`}>
                    {isHealthy ? 'Healthy?' : 'Dying?'}
                  </span>
                  <span className={`word ${isHealthy ? 'dying' : 'healthy'}`}>
                    {isHealthy ? 'Dying?' : 'Healthy?'}
                  </span>
                </span>
              </span>
            </span>
          </h1>
          <p className="hero-sub">GitVital scores any public GitHub repository across 6 health metrics Bus factor, PR speed, Issue backlog, Activity trend, Contributor spread & Code churn -- in under 60 seconds.</p>

          <div className="hero-input-wrap">
            <input type="text" placeholder="github.com/facebook/react" id="heroInput" onKeyDown={(e) => handleKeydown(e, 'heroInput')} />
            <button onClick={() => analyzeRepo('heroInput')}>Analyze →</button>
          </div>
          <p className="hero-limit-note">Analyzes last 1,000 commits · 500 PRs · 500 issues · Public repos only</p>


          <div className="hero-card fade-in" id="heroCard">
            <div className="card-topbar">
              <div className="card-dots">
                <span className="dot-r"></span>
                <span className="dot-y"></span>
                <span className="dot-g"></span>
              </div>
              <div className="card-title">gitvital — repo analysis</div>
              <div style={{ width: '52px' }}></div>
            </div>
            <div className="card-body">
              <div className="repo-header">
                <div>
                  <div className="repo-name">facebook/react</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', fontFamily: 'var(--mono)' }}>Analyzed 1,000 commits · last 12 months</div>
                </div>
                <div>
                  <div className="score-badge">88</div>
                  <div className="score-label">/ 100 health</div>
                </div>
              </div>
              <div className="score-bar-wrap">
                <div className="score-bar-track"><div className="score-bar-fill"></div></div>
              </div>
              <div className="metrics-row">
                <div className="metric-pill green">
                  <div className="mp-val">12</div>
                  <div className="mp-label">Bus Factor</div>
                </div>
                <div className="metric-pill green">
                  <div className="mp-val">1.2d</div>
                  <div className="mp-label">PR Speed</div>
                </div>
                <div className="metric-pill green">
                  <div className="mp-val">+5%</div>
                  <div className="mp-label">Velocity</div>
                </div>
                <div className="metric-pill yellow">
                  <div className="mp-val">642</div>
                  <div className="mp-label">Open Issues</div>
                </div>
              </div>
            </div>
            <div className="flags-row">
              <span className="flag success">✅ Healthy Team</span>
              <span className="flag success">⚡ Fast Reviews</span>
              <span className="flag warn">⚠️ Large Backlog</span>
              <span className="flag success">📈 Growing Activity</span>
            </div>
          </div>
        </div>
      </section>


      <div className="logos-section">
        <div className="logos-label">Built with</div>
        <div className="marquee-wrap">
          <div className="marquee-track" id="marqueeTrack">
            <div className="logo-item">⬡ Next.js</div>
            <div className="logo-item">◈ React</div>
            <div className="logo-item">▲ TypeScript</div>
            <div className="logo-item">⊕ Node.js</div>
            <div className="logo-item">◉ Prisma</div>
            <div className="logo-item">◆ PostgreSQL</div>
            <div className="logo-item">● Redis</div>
            <div className="logo-item">○ BullMQ</div>
            <div className="logo-item">◇ GraphQL</div>
            <div className="logo-item">▣ Vercel</div>

            <div className="logo-item">⬡ Next.js</div>
            <div className="logo-item">◈ React</div>
            <div className="logo-item">▲ TypeScript</div>
            <div className="logo-item">⊕ Node.js</div>
            <div className="logo-item">◉ Prisma</div>
            <div className="logo-item">◆ PostgreSQL</div>
            <div className="logo-item">● Redis</div>
            <div className="logo-item">○ BullMQ</div>
            <div className="logo-item">◇ GraphQL</div>
            <div className="logo-item">▣ Vercel</div>
          </div>
        </div>
      </div>


      <section className="features-section" id="features">
        <div className="section-inner">
          <div className="tabs-header fade-in">
            <div>
              <h2 className="section-h2">Every signal that tells you<br />if a repo is worth your time</h2>
              <p className="section-sub">Stop manually checking last commit dates and star counts. GitVital runs a full diagnostic on any public repo.</p>
              <div className="better-than">
                <span className="bt-label">Better than:</span>
                <span className="bt-item">⭐ Star counts</span>
                <span className="bt-item">📅 Last commit date</span>
                <span className="bt-item">👁️ Scanning READMEs</span>
                <span className="bt-item">🤞 Hoping for the best</span>
              </div>
            </div>
            <div className="tabs-nav">
              <button className="tab-btn active" data-tab="analyze" onClick={(e) => switchTab('analyze', e.currentTarget)}>Analyze</button>
              <button className="tab-btn" data-tab="score" onClick={(e) => switchTab('score', e.currentTarget)}>Score</button>
              <button className="tab-btn" data-tab="compare" onClick={(e) => switchTab('compare', e.currentTarget)}>Compare</button>
              <button className="tab-btn" data-tab="timeline" onClick={(e) => switchTab('timeline', e.currentTarget)}>Timeline</button>
              <button className="tab-btn" data-tab="advise" onClick={(e) => switchTab('advise', e.currentTarget)}>Advise</button>
            </div>
          </div>


          <div className="tab-panel active" id="tab-analyze">
            <div className="tab-content">
              <div className="tab-label">Core Metrics</div>
              <h3>Run a full health check on any public repo</h3>
              <p>Paste any GitHub URL. GitVital queues a background analysis job, fetches up to 1,000 commits and 500 PRs via GitHub GraphQL, and computes 6 core metrics in under a minute.</p>
              <ul className="tab-bullets">
                <li>Bus factor — contributor concentration risk</li>
                <li>PR turnaround — median and p90 merge time</li>
                <li>Commit velocity — weekly decay or growth trend</li>
                <li>Issue backlog — age, response rate, open count</li>
              </ul>
              <a href="/facebook/react" className="learn-more">View all metrics →</a>
            </div>
            <div className="tab-visual" style={{ flexDirection: 'column', gap: '12px', padding: '20px', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flexShrink: 0, width: '88px', height: '88px' }}>
                  <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                    <circle cx="44" cy="44" r="36" fill="none" stroke="#FF5E00" strokeWidth="8" strokeDasharray="226.19" strokeDashoffset="27" strokeLinecap="round" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>88</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600 }}>/100</span>
                  </div>
                </div>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,94,0,0.2)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Bus Factor</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--green)' }}>12</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '18px', marginTop: '4px' }}>
                      {[40, 60, 50, 80, 100, 70].map((h, i) => <div key={i} style={{ background: `rgba(255,94,0,${0.2 + i * 0.15})`, flex: 1, height: `${h}%`, borderRadius: '2px 2px 0 0' }}></div>)}
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>PR Velocity</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--green)' }}>+12%</div>
                    <svg style={{ width: '100%', height: '18px', marginTop: '4px' }} viewBox="0 0 60 20" preserveAspectRatio="none"><path d="M0,18 Q8,6 15,12 T30,7 T45,14 T60,3" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Issue Health</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ position: 'relative', width: '28px', height: '28px', flexShrink: 0 }}>
                        <svg width="28" height="28" style={{ transform: 'rotate(-90deg)' }}><circle cx="14" cy="14" r="10" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" /><circle cx="14" cy="14" r="10" fill="none" stroke="#eab308" strokeWidth="4" strokeDasharray="62.83" strokeDashoffset="9" /></svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: 700, color: 'var(--text)' }}>85%</div>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--yellow)' }}>Good</span>
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,94,0,0.2)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Code Churn</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--orange-light)' }}>Low</div>
                    <svg style={{ width: '100%', height: '18px', marginTop: '4px' }} viewBox="0 0 60 20" preserveAspectRatio="none"><path d="M0,20 L0,14 Q16,16 28,11 T52,14 T60,9 L60,20 Z" fill="rgba(255,94,0,0.12)" /><path d="M0,14 Q16,16 28,11 T52,14 T60,9" fill="none" stroke="#FF5E00" strokeWidth="1.5" /></svg>
                  </div>
                </div>
              </div>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Commits per Week · last 12 months</div>
                <svg style={{ width: '100%', height: '52px' }} viewBox="0 0 400 52" preserveAspectRatio="none">
                  <defs><linearGradient id="og" x1="0%" x2="0%" y1="0%" y2="100%"><stop offset="0%" stopColor="#FF5E00" stopOpacity="0.3" /><stop offset="100%" stopColor="#FF5E00" stopOpacity="0" /></linearGradient></defs>
                  <path d="M0,42 Q50,28 100,35 T200,22 T300,32 T380,12 L400,10 L400,52 L0,52 Z" fill="url(#og)" />
                  <path d="M0,42 Q50,28 100,35 T200,22 T300,32 T380,12 L400,10" fill="none" stroke="#FF5E00" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  {['Jan', 'Mar', 'Jun', 'Sep', 'Dec'].map(m => <span key={m} style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{m}</span>)}
                </div>
              </div>
            </div>
          </div>


          <div className="tab-panel" id="tab-score">
            <div className="tab-content">
              <div className="tab-label">Health Score</div>
              <h3>A single number that tells the whole story</h3>
              <p>Five weighted sub-scores combine into one 0–100 health rating. Each weight is documented and reasoned — not arbitrary. Activity is king at 30%, contributor diversity follows at 25%.</p>
              <ul className="tab-bullets">
                <li>Activity (30%) — most reliable signal of a living project</li>
                <li>Contributor diversity (25%) — directly affects sustainability</li>
                <li>PR responsiveness (20%) — shows team engagement</li>
                <li>Issue backlog (15%) + Code churn (10%)</li>
              </ul>
              <a href="/facebook/react" className="learn-more">See the formula →</a>
            </div>
            <div className="tab-visual" style={{ flexDirection: 'column', gap: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ position: 'relative', flexShrink: 0, width: '100px', height: '100px' }}>
                  <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#FF5E00" strokeWidth="10" strokeDasharray="263.89" strokeDashoffset="32" strokeLinecap="round" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '26px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>88</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>/100</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Repository Health</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>facebook/react · Excellent condition</div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div><div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Velocity</div><div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--green)' }}>+23%</div></div>
                    <div><div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bus Factor</div><div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>12</div></div>
                    <div><div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Maintenance</div><div style={{ fontSize: '14px', fontWeight: 700, color: '#FFB380' }}>High</div></div>
                  </div>
                </div>
              </div>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Score Breakdown</div>
                {[{ l: 'Activity 30%', w: '92%', c: 'var(--green)', v: '92' }, { l: 'Contributors 25%', w: '82%', c: '#FFB380', v: '82' }, { l: 'PR Speed 20%', w: '88%', c: 'var(--green)', v: '88' }, { l: 'Issues 15%', w: '60%', c: 'var(--yellow)', v: '60' }, { l: 'Code Churn 10%', w: '78%', c: 'var(--green)', v: '78' }].map(r => (
                  <div key={r.l} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', width: '96px', fontFamily: 'var(--mono)', flexShrink: 0 }}>{r.l}</span>
                    <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}><div style={{ width: r.w, height: '100%', background: r.c, borderRadius: '3px' }}></div></div>
                    <span style={{ fontSize: '10px', color: r.c, fontFamily: 'var(--mono)', width: '24px', textAlign: 'right' }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>


          <div className="tab-panel" id="tab-compare">
            <div className="tab-content">
              <div className="tab-label">Repo Comparison</div>
              <h3>Side-by-side. Pick the healthier dependency</h3>
              <p>Input two repos. GitVital queues both analysis jobs simultaneously and renders a comparison table the moment both complete — winner highlighted per metric.</p>
              <ul className="tab-bullets">
                <li>Evaluate competing libraries before adding a dependency</li>
                <li>Compare your fork vs the upstream repo</li>
                <li>Interview demo: pull up react vs vue live</li>
              </ul>
              <a href="/compare" className="learn-more">Try a comparison →</a>
            </div>
            <div className="tab-visual" style={{ flexDirection: 'column', gap: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { name: 'facebook/react', score: 88, color: 'var(--green)', vel: '+5% vel', velColor: 'var(--green)', path: 'M0,28 Q20,10 35,20 T60,10 T85,18 T100,4', fill: 'rgba(34,197,94,0.12)', stroke: '#22c55e', bus: 'Bus 12', pr: 'PR 1.2d', tagColor: 'var(--green)', tagBg: 'rgba(34,197,94,0.12)' },
                  { name: 'vuejs/vue', score: 81, color: 'var(--yellow)', vel: '\u22128% vel', velColor: 'var(--red)', path: 'M0,8 Q15,12 30,10 T55,18 T80,22 T100,28', fill: 'rgba(234,179,8,0.1)', stroke: '#eab308', bus: 'Bus 7', pr: 'PR 2.4d', tagColor: 'var(--yellow)', tagBg: 'rgba(234,179,8,0.12)' }
                ].map(r => (
                  <div key={r.name} style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{r.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                      <span style={{ fontSize: '20px', fontWeight: 800, color: r.color }}>{r.score}</span>
                      <span style={{ fontSize: '10px', color: r.velColor, fontFamily: 'var(--mono)' }}>{r.vel}</span>
                    </div>
                    <svg style={{ width: '100%', height: '32px' }} viewBox="0 0 100 32" preserveAspectRatio="none">
                      <path d={`${r.path} L100,32 L0,32 Z`} fill={r.fill} />
                      <path d={r.path} fill="none" stroke={r.stroke} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
                      {[r.bus, r.pr].map(t => <span key={t} style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '12px', background: r.tagBg, color: r.tagColor }}>{t}</span>)}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Head-to-head · 4 of 5 metrics</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
                  {[{ m: 'Health', v: '88 ✓', c: 'var(--green)' }, { m: 'Bus Factor', v: '12 ✓', c: 'var(--green)' }, { m: 'PR Speed', v: '1.2d ✓', c: 'var(--green)' }, { m: 'Issues', v: '642 ~', c: 'var(--yellow)' }].map(x => (
                    <div key={x.m} style={{ textAlign: 'center' }}><div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '3px' }}>{x.m}</div><div style={{ fontSize: '13px', fontWeight: 700, color: x.c }}>{x.v}</div></div>
                  ))}
                </div>
              </div>
            </div>
          </div>


          <div className="tab-panel" id="tab-timeline">
            <div className="tab-content">
              <div className="tab-label">Health Timeline</div>
              <h3>Watch a repo's health change over time</h3>
              <p>GitVital splits your already-fetched data into quarterly windows and computes a partial health score per period — showing you if a project is gaining momentum or slowly dying.</p>
              <ul className="tab-bullets">
                <li>4-quarter trend computed from existing fetch data (zero extra API calls)</li>
                <li>Catch declining projects before you depend on them</li>
                <li>Spot the exact quarter a maintainer went quiet</li>
              </ul>
              <a href="/facebook/react" className="learn-more">See timeline →</a>
            </div>
            <div className="tab-visual" style={{ flexDirection: 'column', gap: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>kubernetes/kubernetes</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>Health over time · quarterly windows</div>
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--red)', letterSpacing: '-0.04em' }}>65 <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>/100 ↓</span></div>
              </div>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                <svg style={{ width: '100%', height: '80px' }} viewBox="0 0 400 80" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="declineGrad" x1="0%" x2="0%" y1="0%" y2="100%">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
                    </linearGradient>
                  </defs>
                  <path d="M0,20 Q80,18 130,28 T230,42 T330,56 T400,68 L400,80 L0,80 Z" fill="url(#declineGrad)" />
                  <path d="M0,20 Q80,18 130,28 T230,42 T330,56 T400,68" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 3" />
                  <circle cx="0" cy="20" r="4" fill="#22c55e" />
                  <circle cx="133" cy="30" r="4" fill="#22c55e" />
                  <circle cx="266" cy="48" r="4" fill="#eab308" />
                  <circle cx="400" cy="68" r="4" fill="#ef4444" />
                  <text x="4" y="14" fontSize="9" fill="#22c55e" fontFamily="monospace">84</text>
                  <text x="136" y="24" fontSize="9" fill="#22c55e" fontFamily="monospace">79</text>
                  <text x="269" y="42" fontSize="9" fill="#eab308" fontFamily="monospace">71</text>
                  <text x="380" y="62" fontSize="9" fill="#ef4444" fontFamily="monospace">65</text>
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  {['Q1 2024', 'Q2', 'Q3', 'Q4 ↓'].map((q, i) => <span key={q} style={{ fontSize: '9.5px', color: i === 3 ? 'var(--red)' : 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{q}</span>)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '10px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>⚠️</span>
                  <div><div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--red)' }}>Declining Health</div><div style={{ fontSize: '10px', color: 'rgba(239,68,68,0.7)' }}>19pt drop over 4 quarters</div></div>
                </div>
                <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '8px', padding: '10px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>📉</span>
                  <div><div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--yellow)' }}>Maintainer Quiet</div><div style={{ fontSize: '10px', color: 'rgba(234,179,8,0.7)' }}>Commit velocity falling Q3+</div></div>
                </div>
              </div>
            </div>
          </div>


          <div className="tab-panel" id="tab-advise">
            <div className="tab-content">
              <div className="tab-label">AI-Powered Advice</div>
              <h3>Not just data. A personal coaching session</h3>
              <p>GitVital feeds your computed metrics into Gemini and generates personalized, actionable advice — not generic tips. It reads your actual numbers and tells you exactly what to improve.</p>
              <ul className="tab-bullets">
                <li>Prompt-engineered for developer context, not marketing copy</li>
                <li>Stored alongside metrics — re-reads with every refresh</li>
                <li>Turns a dashboard into a feedback loop</li>
              </ul>
              <a href="/facebook/react" className="learn-more">See AI advice →</a>
            </div>
            <div className="tab-visual" style={{ flexDirection: 'column', gap: '12px', padding: '20px' }}>
              <div style={{ background: 'rgba(255,94,0,0.06)', border: '1px solid rgba(255,94,0,0.25)', borderLeft: '3px solid #FF5E00', borderRadius: '10px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div className="ai-icon" style={{ width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>AI Deep Analysis</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>your-org/your-repo · Powered by Gemini</div>
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: '20px', fontWeight: 800, color: 'var(--yellow)' }}>73<span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>/100</span></div>
                </div>
                <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                  Based on recent commit patterns, <span style={{ color: '#FFB380', fontWeight: 600 }}>your-org/your-repo</span> is struggling with <span style={{ color: 'var(--red)', fontWeight: 600 }}>PR review bottlenecks</span>. We noticed a <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>14-day average merge delay</span> — the single highest drag on your health score.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#FFB380', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Recommendation 1</div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>Set a daily 20-min PR review block. Cut merge time from 14d → 3d and gain <strong style={{ color: 'var(--green)' }}>+12pts</strong>.</p>
                </div>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#FFB380', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Recommendation 2</div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>Invite 2 community maintainers to &apos;docs&apos; tag. Push bus factor above <strong style={{ color: 'var(--green)' }}>5</strong>.</p>
                </div>
              </div>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px' }}>Recent commit activity</div>
                <svg style={{ width: '100%', height: '36px' }} viewBox="0 0 300 36" preserveAspectRatio="none">
                  <path d="M0,28 Q30,10 60,20 T120,14 T180,22 T240,10 T300,18 L300,36 L0,36 Z" fill="rgba(255,94,0,0.1)" />
                  <path d="M0,28 Q30,10 60,20 T120,14 T180,22 T240,10 T300,18" fill="none" stroke="#FF5E00" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>

        </div>
      </section>


      <section style={{ paddingTop: '0' }} id="leaderboard">
        <div className="section-inner">
          <div className="fade-in" style={{ marginBottom: '32px' }}>
            <div className="section-label">Everything in one place</div>
            <h2 className="section-h2">Everything you need to evaluate<br />a repo or a developer</h2>
          </div>
          <div className="bento-kicker">Signals, trust checks, and developer context</div>
          <div className="bento-grid">


            <div className="bento-card col-2">
              <div className="bc-label">Embeddable Badge</div>
              <div className="bc-title">Embed a live health badge in any README</div>
              <div className="bc-desc">A URL that returns an SVG badge — color-coded green, yellow, or red based on current health score. Auto-updates with every analysis.</div>
              <div className="badge-embed">
                <span className="badge-left">GitVital</span>
                <span className="badge-right">Health: 88 ✅</span>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>![GitVital](https://gitvital.com/badge/facebook/react)</div>
            </div>


            <div className="bento-card">
              <div className="bc-label">Risk Flags</div>
              <div className="bc-title">Plain English warnings</div>
              <div className="bc-desc">Pure if/else logic that reads smart.</div>
              <div className="risk-flags-list">
                <span className="flag danger">⚠️ Contributor Concentration Risk</span>
                <span className="flag warn">⚠️ PR Response Slow</span>
                <span className="flag success">✅ Fast PR Reviews</span>
                <span className="flag success">📈 Growing Activity</span>
              </div>
            </div>


            <div className="bento-card">
              <div className="bc-label">Leaderboard</div>
              <div className="bc-title">Your global rank</div>
              <div className="bc-desc">Percentile ranking via PostgreSQL window functions.</div>
              <div className="rank-display">
                <div className="rank-number">#142</div>
                <div className="rank-meta">globally<br /><strong>Top 7%</strong> of all developers</div>
              </div>
            </div>


            <div className="bento-card">
              <div className="bc-label">GitHub OAuth</div>
              <div className="bc-title">{user?.loggedIn ? "Profile Active" : "Login to unlock more"}</div>
              <div className="bc-desc">{user?.loggedIn ? `Logged in as @${user.githubUsername}. You can now view your personalized developer score and repository analysis.` : "Authenticate to analyze your own repos, track your developer score, and get personalized AI advice."}</div>
              {user?.loggedIn ? (
                <a href={`/${user.githubUsername}`} className="btn-ghost oauth-cta">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" /></svg>
                  View Profile
                </a>
              ) : (
                <a href={AUTH_URL} className="btn-ghost oauth-cta">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" /></svg>
                  Login with GitHub
                </a>
              )}
            </div>


            <div className="bento-card col-2">
              <div className="bc-label">Developer Health Score</div>
              <div className="bc-title">Your repos, aggregated into one developer score</div>
              <div className="bc-desc">Aggregate metrics across all your repos. Earn badges. Get ranked globally. Spotify Wrapped, but for your GitHub.</div>
              <div className="dev-profile-card">
                <div className="dev-score-row">
                  <div className="dev-score-big green">74</div>
                  <div>
                    <div className="dev-identity-name">{user?.loggedIn ? `@${user.githubUsername}` : "@yourusername"}</div>
                    <div className="dev-identity-meta">{user?.loggedIn ? "Better than 90% of developers" : "Better than 90% of developers"}</div>
                  </div>
                </div>
                <div className="dev-badges">
                  <span className="dev-badge earned">🏃 The Speedster</span>
                  <span className="dev-badge earned">🔒 The Closer</span>
                  <span className="dev-badge earned">⭐ OSS Contributor</span>
                  <span className="dev-badge">🌱 Consistent Committer</span>
                  <span className="dev-badge">🧹 Issue Resolver</span>
                </div>
              </div>
            </div>


            <div className="bento-card">
              <div className="bc-label">Transparent Limits</div>
              <div className="bc-title">No hidden constraints</div>
              <div className="bc-desc">Always shown. Never hidden.</div>
              <div className="limits-card">
                <div className="limit-row"><span className="limit-key">max commits</span><span className="limit-val">1,000</span></div>
                <div className="limit-row"><span className="limit-key">max pull reqs</span><span className="limit-val">500</span></div>
                <div className="limit-row"><span className="limit-key">max issues</span><span className="limit-val">500</span></div>
                <div className="limit-row"><span className="limit-key">time window</span><span className="limit-val">12 months</span></div>
                <div className="limit-row"><span className="limit-key">visibility</span><span className="limit-val">public only</span></div>
              </div>
            </div>

          </div>
        </div>
      </section>


      <section className="testimonials-section">
        <div className="section-inner">
          <div className="testimonials-header fade-in">
            <div className="section-label">Loved by developers</div>
            <h2 className="section-h2">Developers who care about code quality</h2>
            <p className="section-sub">Join developers who've stopped guessing and started knowing.</p>
          </div>

          <div className="testimonials-grid fade-in fade-in-delay-1">
            <div className="testimonial-card">
              <p className="t-quote">"Pasted facebook/react URL and instantly knew it was safe to use as a dependency. Bus factor of 12, PRs merging in 1 day. Sold in under 60 seconds."</p>
              <div className="t-author">
                <div className="t-avatar" style={{ background: 'linear-gradient(135deg, #FF5E00, #FF5E00)', color: 'white' }}>DK</div>
                <div>
                  <div className="t-name">Devansh Kumar</div>
                  <div className="t-handle">@devanshk_dev</div>
                </div>
              </div>
            </div>
            <div className="testimonial-card">
              <p className="t-quote">"The repo comparison feature is genuinely impressive. Compared next.js vs nuxt in 10 seconds before starting a new project. Should've existed years ago."</p>
              <div className="t-author">
                <div className="t-avatar" style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', color: 'white' }}>PT</div>
                <div>
                  <div className="t-name">Priya Tiwari</div>
                  <div className="t-handle">@priyatiwari_io</div>
                </div>
              </div>
            </div>
            <div className="testimonial-card">
              <p className="t-quote">"GitVital showed my side project had a bus factor of 1 (just me 😂). Great reality check before open sourcing. Fixed it, now at 4. The AI advice was actually spot on."</p>
              <div className="t-author">
                <div className="t-avatar" style={{ background: 'linear-gradient(135deg, #22c55e, #86efac)', color: '#052e16' }}>RB</div>
                <div>
                  <div className="t-name">Rohan Builds</div>
                  <div className="t-handle">@roh_builds</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ height: '16px' }}></div>
          <div className="testimonials-scroll-row">
            <div className="testimonials-scroll-track">

              <div className="t-mini"><p className="t-mini-quote">"Finally stopped manually checking 'last commit date' on every library. GitVital does it properly."</p><div className="t-mini-author">@aditya_raj · Backend Eng at Swiggy</div></div>
              <div className="t-mini"><p className="t-mini-quote">"The PR turnaround metric alone saved me from depending on a dead library. Gold."</p><div className="t-mini-author">@sara_codes · Full Stack Dev</div></div>
              <div className="t-mini"><p className="t-mini-quote">"Used GitVital in my architecture review. My team loved the side-by-side comparison output."</p><div className="t-mini-author">@techleadmike · Staff Eng</div></div>
              <div className="t-mini"><p className="t-mini-quote">"The embeddable badge on my README started getting questions from contributors. Real users from day 1."</p><div className="t-mini-author">@oss_maintainer</div></div>
              <div className="t-mini"><p className="t-mini-quote">"Leaderboard hit different. Motivated me to actually start closing old issues and reviewing PRs faster."</p><div className="t-mini-author">@niteshv · SDE-2 at Flipkart</div></div>
              <div className="t-mini"><p className="t-mini-quote">"Showed this in my campus placement interview. Got asked to walk through the architecture for 20 minutes."</p><div className="t-mini-author">@campus_sde · IIT Bombay</div></div>

              <div className="t-mini"><p className="t-mini-quote">"Finally stopped manually checking 'last commit date' on every library. GitVital does it properly."</p><div className="t-mini-author">@aditya_raj · Backend Eng at Swiggy</div></div>
              <div className="t-mini"><p className="t-mini-quote">"The PR turnaround metric alone saved me from depending on a dead library. Gold."</p><div className="t-mini-author">@sara_codes · Full Stack Dev</div></div>
              <div className="t-mini"><p className="t-mini-quote">"Used GitVital in my architecture review. My team loved the side-by-side comparison output."</p><div className="t-mini-author">@techleadmike · Staff Eng</div></div>
              <div className="t-mini"><p className="t-mini-quote">"The embeddable badge on my README started getting questions from contributors. Real users from day 1."</p><div className="t-mini-author">@oss_maintainer</div></div>
              <div className="t-mini"><p className="t-mini-quote">"Leaderboard hit different. Motivated me to actually start closing old issues and reviewing PRs faster."</p><div className="t-mini-author">@niteshv · SDE-2 at Flipkart</div></div>
              <div className="t-mini"><p className="t-mini-quote">"Showed this in my campus placement interview. Got asked to walk through the architecture for 20 minutes."</p><div className="t-mini-author">@campus_sde · IIT Bombay</div></div>
            </div>
          </div>
        </div>
      </section>


      <div className="stats-section">
        <div className="stats-grid">
          <div className="stat-item fade-in">
            <div className="stat-num" data-target="2000000" data-suffix="M+" data-divisor="1000000">0</div>
            <div className="stat-label">Developers</div>
          </div>
          <div className="stat-item fade-in fade-in-delay-1">
            <div className="stat-num" data-target="50000" data-suffix="K+" data-divisor="1000">0</div>
            <div className="stat-label">Repos Analyzed</div>
          </div>
          <div className="stat-item fade-in fade-in-delay-2">
            <div className="stat-num" data-target="500" data-suffix="ms" data-divisor="1">0</div>
            <div className="stat-label">Avg Analysis Time</div>
          </div>
          <div className="stat-item fade-in fade-in-delay-3">
            <div className="stat-num" data-target="999" data-suffix="%" data-prefix="99.">0</div>
            <div className="stat-label">Uptime</div>
          </div>
        </div>
      </div>


      <section className="cta-section">
        <div className="cta-glow"></div>
        <div className="cta-inner fade-in">
          <div className="section-label">Get started free</div>
          <h2>Stop guessing.<br />Start knowing.</h2>
          <p>Paste any GitHub URL. Get a full health report in under 60 seconds. Free forever for public repos.</p>
          <div className="hero-input-wrap" style={{ maxWidth: '480px', margin: '0 auto 12px' }}>
            <input type="text" placeholder="github.com/your-org/your-repo" id="ctaInput" onKeyDown={(e) => handleKeydown(e, 'ctaInput')} />
            <button onClick={() => analyzeRepo('ctaInput')}>Analyze Now →</button>
          </div>
          <p className="cta-note">No signup required for public repos · Free forever</p>
        </div>
      </section>


      <footer>
        <div className="footer-inner">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="/" className="logo" aria-label="GitVital Home">
                <img src="/gitvital_logo_fixed.svg" alt="GitVital" className="logo-mark" />
              </a>
              <p style={{ marginTop: '10px' }}>GitHub repository health analytics. Know before you depend.</p>
            </div>
            <div className="footer-col">
              <h4>Product</h4>
              <ul>
                <li><a href="/facebook/react">Health Score</a></li>
                <li><a href="/compare">Repo Compare</a></li>
                <li><a href="/facebook/react">Timeline</a></li>
                <li><a href="/facebook/react">AI Advice</a></li>
                <li><a href="/facebook/react">Badges</a></li>
                <li><a href="/leaderboard">Leaderboard</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Developers</h4>
              <ul>
                <li><a href="https://github.com/bugsNburgers/GitVital#readme" target="_blank" rel="noopener noreferrer">Docs</a></li>
                <li><a href="https://github.com/bugsNburgers/GitVital/tree/main/gitvital/backend/src" target="_blank" rel="noopener noreferrer">API Reference</a></li>
                <li><a href="https://github.com/bugsNburgers/GitVital" target="_blank" rel="noopener noreferrer">GitHub</a></li>
                <li><a href="https://github.com/bugsNburgers/GitVital/blob/main/gitvital/CHANGELOG.md" target="_blank" rel="noopener noreferrer">Changelog</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Community</h4>
              <ul>
                <li><a href="https://github.com/bugsNburgers/GitVital/discussions" target="_blank" rel="noopener noreferrer">Discord</a></li>
                <li><a href="https://x.com" target="_blank" rel="noopener noreferrer">Twitter / X</a></li>
                <li><a href="https://github.com/bugsNburgers/GitVital/discussions" target="_blank" rel="noopener noreferrer">GitHub Discussions</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Legal</h4>
              <ul>
                <li><a href="https://github.com/bugsNburgers/GitVital#readme" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
                <li><a href="https://github.com/bugsNburgers/GitVital#readme" target="_blank" rel="noopener noreferrer">Terms of Service</a></li>
                <li><a href="https://github.com/bugsNburgers/GitVital#readme" target="_blank" rel="noopener noreferrer">Fair Use</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2025 GitVital. All rights reserved.</span>
            <a href="https://github.com/bugsNburgers/GitVital" target="_blank" rel="noopener noreferrer" className="github-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" /></svg>
              Source Code
            </a>
          </div>
        </div>
      </footer>



    </>
  );
}
