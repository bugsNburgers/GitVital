'use client';

import { useState } from 'react';
import { METRIC_INFO } from './metricDefinitions';

interface InfoTooltipProps {
  metricKey: string;
}

/**
 * InfoTooltip — renders an ℹ icon next to a metric label.
 * On hover, shows a glassmorphism tooltip card with the metric's
 * name, description, and calculation formula.
 *
 * The parent element does NOT need `position: relative` —
 * the wrapper <span> itself is positioned relatively.
 */
export default function InfoTooltip({ metricKey }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);

  const info = METRIC_INFO[metricKey];
  if (!info) return null;

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        marginLeft: '5px',
        verticalAlign: 'middle',
      }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {/* ℹ icon */}
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

      {/* Tooltip card */}
      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            pointerEvents: 'none',
            width: '280px',
            background: 'rgba(17, 19, 20, 0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Metric name */}
          <span
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text, #ffffff)',
              marginBottom: '4px',
              lineHeight: 1.4,
            }}
          >
            {info.name}
          </span>

          {/* Description */}
          <span
            style={{
              display: 'block',
              fontSize: '11px',
              color: 'var(--text-secondary, rgba(255,255,255,0.6))',
              lineHeight: 1.5,
              marginBottom: '6px',
            }}
          >
            {info.description}
          </span>

          {/* Calculation formula */}
          <span
            style={{
              display: 'block',
              fontSize: '10px',
              fontFamily: 'var(--mono, "JetBrains Mono", monospace)',
              color: 'var(--text-muted, rgba(255,255,255,0.35))',
              lineHeight: 1.5,
              paddingTop: '6px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            {info.calculation}
          </span>
        </span>
      )}
    </span>
  );
}
