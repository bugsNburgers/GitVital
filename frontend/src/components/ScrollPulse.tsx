"use client";

import { useEffect, useRef } from "react";

/*
  Vertical ECG scrollbar — reference image rotated 90°
  ─────────────────────────────────────────────────────
  ViewBox: 0 0 60 800   center-line = x 30
  In the reference image:
    time → goes LEFT in image  =  goes DOWN in our SVG (y++)
    amplitude UP in image      =  goes LEFT in our SVG  (x--)
    amplitude DOWN in image    =  goes RIGHT in our SVG (x++)

  Per beat anatomy (3 beats spread across the full height):
    flat baseline  →  P-wave (small leftward bump)
    →  Q (slight right)  →  R (BIG left spike)
    →  S (right overshoot)  →  return  →  T-wave (gentle left hump)
    →  long flat baseline
*/

// Three clean beats: ~y140-240, ~y375-475, ~y610-710
const ECG = [
  "M30,10",
  "L30,140",                                             // flat into beat 1

  // P-wave (small smooth leftward hump)
  "C30,140 20,146 16,153 C20,160 30,164 30,164",

  "L30,172",                                             // iso-electric
  "L37,178",                                            // Q  (right dip)
  "L2,187",                                             // R  (BIG left spike)
  "L56,198",                                            // S  (right overshoot)
  "L30,204",                                            // return to baseline

  // T-wave (broad leftward hump)
  "C30,204 14,212 12,224 C15,236 30,242 30,242",

  "L30,378",                                            // long flat to beat 2

  "C30,378 20,384 16,391 C20,398 30,402 30,402",       // P-wave
  "L30,410",
  "L37,416",
  "L2,425",
  "L56,436",
  "L30,442",
  "C30,442 14,450 12,462 C15,474 30,480 30,480",       // T-wave

  "L30,610",                                            // long flat to beat 3

  "C30,610 20,616 16,623 C20,630 30,634 30,634",       // P-wave
  "L30,642",
  "L37,648",
  "L2,657",
  "L56,668",
  "L30,674",
  "C30,674 14,682 12,694 C15,706 30,712 30,712",       // T-wave

  "L30,790",                                            // trail to bottom
].join(" ");

export default function ScrollPulse() {
  const svgRef  = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    // Hide native scrollbar once
    const ID = "ecg-hide-sb";
    if (!document.getElementById(ID)) {
      const s = document.createElement("style");
      s.id = ID;
      s.textContent = `
        html { overflow-y: scroll; }
        body { scrollbar-width: none; -ms-overflow-style: none; }
        body::-webkit-scrollbar { display: none; }
      `;
      document.head.appendChild(s);
    }

    const path = pathRef.current;
    const svg  = svgRef.current;
    if (!path || !svg) return;

    const len = path.getTotalLength();
    path.style.strokeDasharray  = `${len}`;
    path.style.strokeDashoffset = `${len}`;

    let raf = 0;
    let glowTimer: ReturnType<typeof setTimeout> | null = null;
    let scrolling = false;

    const render = () => {
      raf = 0;
      const totalH = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const max = Math.max(totalH - window.innerHeight, 1);
      const p = Math.min(Math.max(window.scrollY / max, 0), 1);
      path.style.strokeDashoffset = `${len * (1 - p)}`;

      const b = svg.querySelector<SVGFEGaussianBlurElement>("#ecg-b1");
      if (b) b.setAttribute("stdDeviation", scrolling ? "5" : "3");
    };

    const sched = () => { if (raf === 0) raf = requestAnimationFrame(render); };
    const onScroll = () => {
      scrolling = true;
      sched();
      if (glowTimer) clearTimeout(glowTimer);
      glowTimer = setTimeout(() => { scrolling = false; sched(); }, 200);
    };

    render();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", sched,    { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", sched);
      if (raf) cancelAnimationFrame(raf);
      if (glowTimer) clearTimeout(glowTimer);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        right: "6px",
        top: "60px",
        bottom: "12px",
        zIndex: 9000,
        pointerEvents: "none",
        display: "flex",
        alignItems: "stretch",
      }}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 60 800"
        preserveAspectRatio="xMidYMid meet"
        style={{ height: "100%", width: "52px", overflow: "visible" }}
      >
        <defs>
          {/* Orange gradient — matches project --violet / --orange-light */}
          <linearGradient id="ecgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#FFD1B0" />
            <stop offset="35%"  stopColor="#FF5E00" />
            <stop offset="70%"  stopColor="#FF7A2A" />
            <stop offset="100%" stopColor="#FFA066" />
          </linearGradient>

          {/* Orange neon glow — 3 layers */}
          <filter id="ecgGlow" x="-200%" y="-5%" width="500%" height="110%">
            <feGaussianBlur id="ecg-b1" in="SourceGraphic" stdDeviation="3"  result="b1"/>
            <feGaussianBlur              in="SourceGraphic" stdDeviation="8"  result="b2"/>
            <feGaussianBlur              in="SourceGraphic" stdDeviation="18" result="b3"/>
            {/* tight crisp halo */}
            <feColorMatrix in="b1" type="matrix"
              values="1 0 0 0 1  .36 0 0 0 .36  0 0 0 0 0  0 0 0 1.7 0" result="g1"/>
            {/* warm orange mid bloom */}
            <feColorMatrix in="b2" type="matrix"
              values="1 0 0 0 .9  .24 0 0 0 .24  0 0 0 0 0  0 0 0 .9 0" result="g2"/>
            {/* broad ambient */}
            <feColorMatrix in="b3" type="matrix"
              values="1 0 0 0 .7  .12 0 0 0 .12  0 0 0 0 0  0 0 0 .40 0" result="g3"/>
            <feMerge>
              <feMergeNode in="g3"/>
              <feMergeNode in="g2"/>
              <feMergeNode in="g1"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Dim background trace */}
        <path
          d={ECG}
          fill="none"
          stroke="rgba(255,94,0,0.13)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Glowing active progress path */}
        <path
          ref={pathRef}
          d={ECG}
          fill="none"
          stroke="url(#ecgGrad)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#ecgGlow)"
          style={{ transition: "stroke-dashoffset 55ms linear" }}
        />
      </svg>
    </div>
  );
}
