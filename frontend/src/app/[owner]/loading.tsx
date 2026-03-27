// /[owner] profile loading skeleton
export default function Loading() {
  return (
    <div style={{ background: "#080909", minHeight: "100vh", overflow: "hidden" }}>
      {/* Nav */}
      <div style={{
        height: 58,
        borderBottom: "1px solid rgba(255,255,255,0.055)",
        background: "rgba(8,9,9,0.95)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 16,
      }}>
        <div className="skeleton skeleton-block" style={{ width: 120, height: 28 }} />
        <div style={{ flex: 1 }} />
        <div className="skeleton skeleton-block" style={{ width: 240, height: 30, borderRadius: 8 }} />
        {[72, 100, 80].map((w, i) => (
          <div key={i} className="skeleton skeleton-text" style={{ width: w }} />
        ))}
        <div className="skeleton skeleton-block" style={{ height: 32, width: 100, borderRadius: 20 }} />
      </div>

      <div style={{ padding: "90px 24px 60px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
        {/* Profile header card */}
        <div style={{ background: "#111314", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 24, padding: 40, display: "flex", gap: 40, alignItems: "center", overflow: "hidden", position: "relative" }}>
          {/* Avatar */}
          <div className="skeleton skeleton-circle" style={{ width: 140, height: 140, flexShrink: 0 }} />
          {/* Info */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="skeleton skeleton-block" style={{ height: 36, width: "40%" }} />
            <div className="skeleton skeleton-text" style={{ width: "55%" }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              {[120, 140, 110].map((w, i) => (
                <div key={i} className="skeleton skeleton-block" style={{ width: w, height: 34 }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <div className="skeleton skeleton-block" style={{ width: 120, height: 36 }} />
              <div className="skeleton skeleton-block" style={{ width: 110, height: 36 }} />
            </div>
          </div>
          {/* Score summary */}
          <div className="skeleton skeleton-block" style={{ width: 160, height: 140, flexShrink: 0 }} />
        </div>

        {/* Achievements */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div className="skeleton skeleton-text" style={{ width: 200 }} />
            <div className="skeleton skeleton-text" style={{ width: 80 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton skeleton-block" style={{ height: 160 }} />
            ))}
          </div>
        </div>

        {/* Repositories */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div className="skeleton skeleton-text" style={{ width: 220 }} />
            <div className="skeleton skeleton-block" style={{ width: 180, height: 30 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="skeleton skeleton-block" style={{ height: 180 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
