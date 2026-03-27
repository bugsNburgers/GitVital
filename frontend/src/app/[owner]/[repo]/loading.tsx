// /[owner]/[repo] repo dashboard loading skeleton
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
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="skeleton skeleton-text" style={{ width: 8 }} />
          <div className="skeleton skeleton-text" style={{ width: 80 }} />
          <div className="skeleton skeleton-text" style={{ width: 8 }} />
          <div className="skeleton skeleton-text" style={{ width: 100 }} />
        </div>
        <div style={{ flex: 1 }} />
        {[80, 80].map((w, i) => (
          <div key={i} className="skeleton skeleton-text" style={{ width: w }} />
        ))}
        <div className="skeleton skeleton-text" style={{ width: 60 }} />
        <div className="skeleton skeleton-block" style={{ width: 90, height: 30, borderRadius: 20 }} />
        <div className="skeleton skeleton-block" style={{ width: 110, height: 30, borderRadius: 20 }} />
        <div className="skeleton skeleton-block" style={{ width: 32, height: 30, borderRadius: 8 }} />
      </div>

      <div style={{ padding: "40px 24px 80px", maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Health score card */}
        <div style={{ background: "#111314", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 14, padding: 28, display: "flex", alignItems: "center", gap: 48, flexWrap: "wrap" }}>
          <div className="skeleton skeleton-circle" style={{ width: 160, height: 160, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="skeleton skeleton-block" style={{ height: 28, width: "45%" }} />
            <div className="skeleton skeleton-text" style={{ width: "70%" }} />
            <div className="skeleton skeleton-text" style={{ width: "60%" }} />
            <div style={{ display: "flex", gap: 32, marginTop: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="skeleton skeleton-text" style={{ width: 60 }} />
                  <div className="skeleton skeleton-block" style={{ width: 70, height: 28 }} />
                  <div className="skeleton skeleton-text" style={{ width: 50 }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 4-col metric cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton skeleton-block" style={{ height: 130 }} />
          ))}
        </div>

        {/* Commits timeline */}
        <div className="skeleton skeleton-block" style={{ height: 240 }} />

        {/* Risk flags */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton skeleton-block" style={{ height: 80 }} />
          ))}
        </div>

        {/* AI panel */}
        <div className="skeleton skeleton-block" style={{ height: 160 }} />

        {/* Badge section */}
        <div className="skeleton skeleton-block" style={{ height: 110 }} />
      </div>
    </div>
  );
}
