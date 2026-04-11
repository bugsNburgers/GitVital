'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { METRIC_INFO } from './metricDefinitions';

interface InfoTooltipProps {
  metricKey: string;
}

/**
 * InfoTooltip — renders an ℹ icon next to a metric label.
 * Uses a React Portal to render the tooltip on document.body so it
 * always appears above the navbar and escapes card overflow/stacking contexts.
 */
export default function InfoTooltip({ metricKey }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);

  // Only enable portal after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  const info = METRIC_INFO[metricKey];
  if (!info) return null;

  const TOOLTIP_WIDTH = 280;
  const TOOLTIP_OFFSET = 10; // gap between icon and tooltip

  function handleMouseEnter() {
    if (!iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();

    // Position above the icon by default
    let top = rect.top + window.scrollY - TOOLTIP_OFFSET;
    let left = rect.left + window.scrollX + rect.width / 2 - TOOLTIP_WIDTH / 2;

    // Clamp horizontally so it doesn't go off screen
    left = Math.max(8, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - 8));

    setPos({ top, left });
    setVisible(true);
  }

  function handleMouseLeave() {
    setVisible(false);
  }

  const tooltip =
    mounted && visible
      ? createPortal(
          <span
            role="tooltip"
            style={{
              position: 'absolute',
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              transform: 'translateY(-100%)',
              zIndex: 99999,
              pointerEvents: 'none',
              width: `${TOOLTIP_WIDTH}px`,
              background: 'rgba(17, 19, 20, 0.97)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
              borderRadius: '10px',
              padding: '12px 16px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: '#ffffff',
                marginBottom: '4px',
                lineHeight: 1.4,
              }}
            >
              {info.name}
            </span>
            <span
              style={{
                display: 'block',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.65)',
                lineHeight: 1.5,
                marginBottom: '6px',
              }}
            >
              {info.description}
            </span>
            <span
              style={{
                display: 'block',
                fontSize: '10px',
                fontFamily: '"JetBrains Mono", "Geist Mono", monospace',
                color: 'rgba(255,255,255,0.35)',
                lineHeight: 1.5,
                paddingTop: '6px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {info.calculation}
            </span>
          </span>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={iconRef}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          marginLeft: '5px',
          verticalAlign: 'middle',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span
          aria-label={`Info about ${info.name}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            border: '1px solid currentColor',
            fontSize: '9px',
            fontWeight: 700,
            fontStyle: 'italic',
            color: 'var(--text-muted, rgba(255,255,255,0.35))',
            cursor: 'default',
            lineHeight: 1,
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          i
        </span>
      </span>
      {tooltip}
    </>
  );
}
