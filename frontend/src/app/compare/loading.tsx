// /compare loading skeleton
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
        {[80, 80, 100].map((w, i) => (
          <div key={i} className="skeleton skeleton-text" style={{ width: w }} />
        ))}
        <div className="skeleton skeleton-block" style={{ width: 90, height: 30, borderRadius: 20 }} />
      </div>

      <div style={{ padding: "40px 24px 120px", maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Heading */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="skeleton skeleton-block" style={{ height: 44, width: "45%" }} />
          <div className="skeleton skeleton-text" style={{ width: "55%" }} />
        </div>

        {/* Input cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton skeleton-block" style={{ height: 44 }} />
          ))}
        </div>

        {/* Sparklines */}
        <div>
          <div className="skeleton skeleton-text" style={{ width: 180, marginBottom: 10 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton skeleton-block" style={{ height: 100 }} />
            ))}
          </div>
        </div>

        {/* Radar */}
        <div className="skeleton skeleton-block" style={{ height: 460 }} />

        {/* Table */}
        <div className="skeleton skeleton-block" style={{ height: 340 }} />
      </div>
    </div>
  );
}
