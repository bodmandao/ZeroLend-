export default function AdminPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div
        className="text-center max-w-xl rounded-2xl p-10"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid #1a2540",
        }}
      >
        <h1
          className="text-3xl font-bold text-zero-text mb-3"
          style={{ fontFamily: "'Syne', sans-serif" }}
        >
          Admin Panel
        </h1>

        <p className="text-zero-text-dim mb-6">
          This section is currently under construction.  
          Administrative controls and oracle management will be available soon.
        </p>

        <div className="flex justify-center">
          <div className="zk-loader" style={{ width: 28, height: 28 }} />
        </div>

        <p className="text-xs text-zero-muted mt-6">
          ZeroLend protocol tools are being prepared.
        </p>
      </div>
    </div>
  );
}
