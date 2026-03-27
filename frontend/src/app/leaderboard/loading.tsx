// /leaderboard loading skeleton
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
        {[72, 100, 80, 64].map((w, i) => (
          <div key={i} className="skeleton skeleton-text" style={{ width: w }} />
        ))}
      </div>

      <div style={{ padding: "84px 24px 60px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Hero */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
            <div className="skeleton skeleton-block" style={{ height: 52, width: "60%" }} />
            <div className="skeleton skeleton-text" style={{ width: "80%" }} />
            <div className="skeleton skeleton-text" style={{ width: "65%" }} />
          </div>
          <div className="skeleton skeleton-block" style={{ width: 220, height: 70 }} />
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton skeleton-block" style={{ height: 80 }} />
          ))}
        </div>

        {/* Table */}
        <div className="skeleton skeleton-block" style={{ height: 400 }} />

        {/* Pagination */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="skeleton skeleton-text" style={{ width: 300 }} />
          <div style={{ display: "flex", gap: 8 }}>
            {[80, 36, 36, 36, 80].map((w, i) => (
              <div key={i} className="skeleton skeleton-block" style={{ width: w, height: 34 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
