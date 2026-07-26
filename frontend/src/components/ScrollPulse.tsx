"use client";

import { useEffect, useRef } from "react";

/*
  Vertical ECG scrollbar - GPU-accelerated & butter smooth
  ─────────────────────────────────────────────────────
  ViewBox: 0 0 60 800   center-line = x 30
*/

const ECG = [
  "M30,10",
  "L30,140",

  "C30,140 20,146 16,153 C20,160 30,164 30,164",

  "L30,172",
  "L37,178",
  "L2,187",
  "L56,198",
  "L30,204",

  "C30,204 14,212 12,224 C15,236 30,242 30,242",

  "L30,378",

  "C30,378 20,384 16,391 C20,398 30,402 30,402",
  "L30,410",
  "L37,416",
  "L2,425",
  "L56,436",
  "L30,442",
  "C30,442 14,450 12,462 C15,474 30,480 30,480",

  "L30,610",

  "C30,610 20,616 16,623 C20,630 30,634 30,634",
  "L30,642",
  "L37,648",
  "L2,657",
  "L56,668",
  "L30,674",
  "C30,674 14,682 12,694 C15,706 30,712 30,712",

  "L30,790",
].join(" ");

export default function ScrollPulse() {
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
        @media (max-width: 768px) {
          #ecg-scrollbar { display: none !important; }
        }
      `;
      document.head.appendChild(s);
    }

    const path = pathRef.current;
    if (!path) return;

    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;

    let raf = 0;

    const updateScroll = () => {
      raf = 0;
      const docEl = document.documentElement;
      const totalH = docEl.scrollHeight;
      const max = Math.max(totalH - window.innerHeight, 1);
      const p = Math.min(Math.max(window.scrollY / max, 0), 1);
      path.style.strokeDashoffset = `${len * (1 - p)}`;
    };

    const onScroll = () => {
      if (raf === 0) {
        raf = requestAnimationFrame(updateScroll);
      }
    };

    updateScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      id="ecg-scrollbar"
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
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      <svg
        viewBox="0 0 60 800"
        preserveAspectRatio="xMidYMid meet"
        style={{ height: "100%", width: "52px", overflow: "visible" }}
      >
        <defs>
          <linearGradient id="ecgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD1B0" />
            <stop offset="35%" stopColor="#FF5E00" />
            <stop offset="70%" stopColor="#FF7A2A" />
            <stop offset="100%" stopColor="#FFA066" />
          </linearGradient>
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

        {/* Glowing active progress path - Hardware GPU accelerated */}
        <path
          ref={pathRef}
          d={ECG}
          fill="none"
          stroke="url(#ecgGrad)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: "drop-shadow(0 0 3px rgba(255,94,0,0.9)) drop-shadow(0 0 8px rgba(255,94,0,0.5))",
            willChange: "stroke-dashoffset",
          }}
        />
      </svg>
    </div>
  );
}
