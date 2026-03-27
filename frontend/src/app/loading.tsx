// Root loading — shown while the home page (app/page.tsx) is loading server-side
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
        {[72, 90, 64, 80].map((w, i) => (
          <div key={i} className="skeleton skeleton-text" style={{ width: w }} />
        ))}
      </div>

      {/* Hero section */}
      <div style={{ padding: "120px 24px 60px", maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div className="skeleton" style={{ width: 200, height: 26, borderRadius: 20 }} />
        <div className="skeleton skeleton-block" style={{ width: "75%", height: 64 }} />
        <div className="skeleton skeleton-block" style={{ width: "55%", height: 64 }} />
        <div className="skeleton skeleton-text" style={{ width: "60%", marginTop: 8 }} />
        <div className="skeleton skeleton-text" style={{ width: "50%" }} />
        <div className="skeleton skeleton-block" style={{ width: "100%", maxWidth: 540, height: 50, marginTop: 8 }} />
        <div className="skeleton skeleton-block" style={{ width: "100%", maxWidth: 560, height: 240, marginTop: 20 }} />
      </div>
    </div>
  );
}
