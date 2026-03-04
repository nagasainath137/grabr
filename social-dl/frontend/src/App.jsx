import { useState, useRef, useCallback } from "react";

// ─── Platform Config ──────────────────────────────────────────────────────
const PLATFORMS = {
  youtube:     { name: "YouTube",     color: "#FF0000", icon: "▶" },
  instagram:   { name: "Instagram",   color: "#E1306C", icon: "◈" },
  tiktok:      { name: "TikTok",      color: "#69C9D0", icon: "♪" },
  twitter:     { name: "X / Twitter", color: "#1DA1F2", icon: "✕" },
  facebook:    { name: "Facebook",    color: "#1877F2", icon: "ƒ" },
  snapchat:    { name: "Snapchat",    color: "#FFFC00", icon: "👻" },
  threads:     { name: "Threads",     color: "#101010", icon: "⊕" },
  linkedin:    { name: "LinkedIn",    color: "#0A66C2", icon: "in" },
  pinterest:   { name: "Pinterest",   color: "#E60023", icon: "P" },
  reddit:      { name: "Reddit",      color: "#FF4500", icon: "◉" },
  vimeo:       { name: "Vimeo",       color: "#1AB7EA", icon: "V" },
  twitch:      { name: "Twitch",      color: "#9146FF", icon: "⬡" },
  dailymotion: { name: "Dailymotion", color: "#0066DC", icon: "D" },
  bereal:      { name: "BeReal",      color: "#000000", icon: "B" },
  unknown:     { name: "Auto-detect", color: "#888888", icon: "?" },
};

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

function formatDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatFileSize(bytes) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatViews(n) {
  if (!n) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B views`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M views`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K views`;
  return `${n} views`;
}

// ─── Detect platform client-side for instant badge ────────────────────────
function detectPlatformLocally(url) {
  const patterns = Object.entries({
    youtube:     /(?:youtube\.com\/(?:watch|shorts|reel|embed)|youtu\.be\/)/i,
    instagram:   /instagram\.com\/(p|reel|tv|stories)\//i,
    tiktok:      /tiktok\.com\/@?.+\/video\//i,
    twitter:     /(?:twitter\.com|x\.com)\/\w+\/status\//i,
    facebook:    /facebook\.com\/(?:watch|reel|video|share)/i,
    snapchat:    /snapchat\.com\/spotlight\//i,
    threads:     /threads\.net\/@?.+\/post\//i,
    linkedin:    /linkedin\.com\/(posts|feed\/update)\//i,
    pinterest:   /pinterest\.(?:com|co\.uk)\/pin\//i,
    reddit:      /reddit\.com\/r\/.+\/comments\//i,
    vimeo:       /vimeo\.com\/\d+/i,
    twitch:      /twitch\.tv\/videos\//i,
    dailymotion: /dailymotion\.com\/video\//i,
    bereal:      /bereal\.com\//i,
  });
  for (const [key, re] of patterns) {
    if (re.test(url)) return key;
  }
  return url.includes("http") ? "unknown" : null;
}

// ─── Main App ─────────────────────────────────────────────────────────────
export default function App() {
  const [url, setUrl] = useState("");
  const [detectedPlatform, setDetectedPlatform] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | fetching | ready | downloading | done | error
  const [mediaInfo, setMediaInfo] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState(null);
  const [error, setError] = useState("");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const abortRef = useRef(null);

  // Live platform detection as user types
  const handleUrlChange = useCallback((e) => {
    const val = e.target.value;
    setUrl(val);
    const p = detectPlatformLocally(val);
    setDetectedPlatform(p);
    if (phase !== "idle") {
      setPhase("idle");
      setMediaInfo(null);
      setError("");
    }
  }, [phase]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setDetectedPlatform(detectPlatformLocally(text));
    } catch {
      // clipboard access denied — user must paste manually
    }
  }, []);

  // Fetch media info from backend
  const handleFetch = useCallback(async (e) => {
    e?.preventDefault();
    if (!url.trim()) return;

    setPhase("fetching");
    setError("");
    setMediaInfo(null);
    setSelectedFormat(null);

    // Fake progress animation during fetch
    let prog = 0;
    const tick = setInterval(() => {
      prog = Math.min(prog + Math.random() * 12, 85);
      setDownloadProgress(prog);
      setProgressLabel("Fetching media info…");
    }, 200);

    try {
      const res = await fetch(`${API_BASE}/api/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: AbortSignal.timeout(50000),
      });

      const data = await res.json();
      clearInterval(tick);

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch media info.");
      }

      setDownloadProgress(100);
      setTimeout(() => {
        setMediaInfo(data);
        setSelectedFormat(data.formats?.[0] || null);
        setPhase("ready");
        setDownloadProgress(0);
      }, 400);
    } catch (err) {
      clearInterval(tick);
      setDownloadProgress(0);
      setPhase("error");
      setError(err.name === "TimeoutError"
        ? "Request timed out. Please try again."
        : err.message || "Something went wrong.");
    }
  }, [url]);

  // Trigger download
  const handleDownload = useCallback(async () => {
    if (!selectedFormat || !mediaInfo) return;

    setPhase("downloading");
    setDownloadProgress(0);
    setProgressLabel("Preparing download…");

    // Simulate progress while waiting for file
    let prog = 0;
    const tick = setInterval(() => {
      prog = Math.min(prog + Math.random() * 8, 92);
      setDownloadProgress(prog);
      setProgressLabel(
        prog < 30 ? "Connecting to source…"
        : prog < 60 ? "Processing media…"
        : prog < 85 ? "Encoding file…"
        : "Almost done…"
      );
    }, 300);

    try {
      const params = new URLSearchParams({
        url: mediaInfo.originalUrl,
        formatId: selectedFormat.id,
        ext: selectedFormat.ext,
        title: mediaInfo.title,
      });

      const response = await fetch(`${API_BASE}/api/download?${params}`);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Download failed.");
      }

      // Stream blob to client
      const blob = await response.blob();
      clearInterval(tick);
      setDownloadProgress(100);
      setProgressLabel("Complete!");

      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `${mediaInfo.title?.slice(0, 60) || "download"}.${selectedFormat.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);

      setTimeout(() => {
        setPhase("done");
        setDownloadProgress(0);
      }, 1000);
    } catch (err) {
      clearInterval(tick);
      setDownloadProgress(0);
      setPhase("error");
      setError(err.message || "Download failed.");
    }
  }, [selectedFormat, mediaInfo]);

  const reset = useCallback(() => {
    setUrl("");
    setDetectedPlatform(null);
    setPhase("idle");
    setMediaInfo(null);
    setSelectedFormat(null);
    setError("");
    setDownloadProgress(0);
  }, []);

  const platform = mediaInfo?.platform || detectedPlatform;
  const platformInfo = PLATFORMS[platform] || PLATFORMS.unknown;
  const isBusy = phase === "fetching" || phase === "downloading";

  return (
    <div className="app-shell">
      {/* Background grid */}
      <div className="bg-grid" aria-hidden />
      <div className="bg-glow" aria-hidden />

      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">⬇</span>
            <span className="logo-text">GRABR</span>
            <span className="logo-sub">Universal Downloader</span>
          </div>
          <div className="supported-badge">
            {Object.entries(PLATFORMS).filter(([k]) => k !== "unknown").map(([key, p]) => (
              <span
                key={key}
                className="platform-dot"
                title={p.name}
                style={{ background: p.color + "33", color: p.color, border: `1px solid ${p.color}44` }}
              >
                {p.icon}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="main">
        <div className="hero">
          <h1 className="hero-title">
            Download Any<br />
            <span className="hero-accent">Social Media</span> Video
          </h1>
          <p className="hero-sub">
            YouTube · Instagram · TikTok · Twitter/X · Facebook · Snapchat · Threads · LinkedIn · Pinterest · Reddit · and 1,000+ more
          </p>
        </div>

        {/* URL Input Card */}
        <div className="card input-card">
          <form onSubmit={handleFetch} className="url-form">
            <div className="input-wrap">
              {/* Platform badge */}
              {platform && (
                <span
                  className="platform-badge"
                  style={{ background: platformInfo.color + "22", color: platformInfo.color }}
                >
                  {platformInfo.icon} {platformInfo.name}
                </span>
              )}

              <input
                className={`url-input ${platform ? "has-badge" : ""}`}
                type="url"
                placeholder="Paste any social media URL here…"
                value={url}
                onChange={handleUrlChange}
                disabled={isBusy}
                autoComplete="off"
                spellCheck={false}
              />

              <div className="input-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handlePaste}
                  title="Paste from clipboard"
                  disabled={isBusy}
                >
                  ⎘ Paste
                </button>
                {url && (
                  <button
                    type="button"
                    className="btn-ghost btn-clear"
                    onClick={reset}
                    title="Clear"
                    disabled={isBusy}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              className={`btn-primary ${isBusy ? "loading" : ""}`}
              disabled={!url.trim() || isBusy}
            >
              {phase === "fetching" ? (
                <><span className="spinner" /> Fetching…</>
              ) : (
                <><span className="btn-icon">⬇</span> Fetch Media</>
              )}
            </button>
          </form>

          {/* Progress bar */}
          {isBusy && (
            <div className="progress-section">
              <div className="progress-bar-wrap">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <span className="progress-label">{progressLabel}</span>
            </div>
          )}

          {/* Error state */}
          {phase === "error" && (
            <div className="error-box">
              <span className="error-icon">⚠</span>
              <div>
                <strong>Error</strong>
                <p>{error}</p>
              </div>
              <button className="btn-ghost" onClick={reset}>Try Again</button>
            </div>
          )}
        </div>

        {/* Media Info Card */}
        {phase === "ready" || phase === "done" || phase === "downloading" ? (
          <div className="card media-card" style={{ "--accent": platformInfo.color }}>
            {/* Thumbnail */}
            {mediaInfo?.thumbnail && (
              <div className="thumb-wrap">
                <img
                  src={mediaInfo.thumbnail}
                  alt="Preview thumbnail"
                  className="thumbnail"
                  loading="lazy"
                />
                {mediaInfo.duration && (
                  <span className="duration-badge">{formatDuration(mediaInfo.duration)}</span>
                )}
                <div
                  className="platform-overlay"
                  style={{ background: `linear-gradient(135deg, ${platformInfo.color}33, transparent)` }}
                >
                  <span className="platform-big-icon" style={{ color: platformInfo.color }}>
                    {platformInfo.icon}
                  </span>
                  <span style={{ color: platformInfo.color, fontWeight: 700, fontSize: "0.7rem" }}>
                    {platformInfo.name}
                  </span>
                </div>
              </div>
            )}

            {/* Media metadata */}
            <div className="media-meta">
              <h2 className="media-title" title={mediaInfo?.title}>
                {mediaInfo?.title || "Untitled"}
              </h2>

              <div className="meta-row">
                {mediaInfo?.uploader && (
                  <span className="meta-chip">
                    <span className="meta-chip-icon">@</span> {mediaInfo.uploader}
                  </span>
                )}
                {mediaInfo?.viewCount && (
                  <span className="meta-chip">
                    <span className="meta-chip-icon">▶</span> {formatViews(mediaInfo.viewCount)}
                  </span>
                )}
                {mediaInfo?.duration && (
                  <span className="meta-chip">
                    <span className="meta-chip-icon">⏱</span> {formatDuration(mediaInfo.duration)}
                  </span>
                )}
              </div>

              {/* Format selector */}
              <div className="format-section">
                <p className="format-label">Select Quality</p>
                <div className="format-grid">
                  {mediaInfo?.formats?.map((fmt) => (
                    <button
                      key={fmt.id}
                      className={`format-btn ${selectedFormat?.id === fmt.id ? "active" : ""} fmt-${fmt.type}`}
                      onClick={() => setSelectedFormat(fmt)}
                      disabled={phase === "downloading"}
                    >
                      <span className="fmt-icon">
                        {fmt.type === "video" ? "🎬" : fmt.type === "audio" ? "🎵" : "🖼"}
                      </span>
                      <span className="fmt-label">{fmt.label}</span>
                      {fmt.filesize && (
                        <span className="fmt-size">{formatFileSize(fmt.filesize)}</span>
                      )}
                      <span className="fmt-ext">.{fmt.ext}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Download progress */}
              {phase === "downloading" && (
                <div className="progress-section">
                  <div className="progress-bar-wrap">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <span className="progress-label">{progressLabel}</span>
                </div>
              )}

              {/* Download button */}
              <div className="action-row">
                {phase === "done" ? (
                  <div className="success-box">
                    <span>✓</span> Download complete!
                    <button className="btn-ghost" onClick={reset} style={{ marginLeft: "auto" }}>
                      Download Another
                    </button>
                  </div>
                ) : (
                  <button
                    className={`btn-download ${phase === "downloading" ? "loading" : ""}`}
                    onClick={handleDownload}
                    disabled={!selectedFormat || phase === "downloading"}
                    style={{ "--dl-color": platformInfo.color }}
                  >
                    {phase === "downloading" ? (
                      <><span className="spinner" /> Downloading…</>
                    ) : (
                      <>
                        <span>⬇</span>
                        Download {selectedFormat?.type === "audio" ? "MP3" : selectedFormat?.type === "image" ? "Image" : "Video"}
                        {selectedFormat && ` · ${selectedFormat.label}`}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Features grid */}
        {phase === "idle" && (
          <div className="features-grid">
            {[
              { icon: "🔗", title: "Paste & Go", desc: "Paste any URL, we detect the platform instantly" },
              { icon: "🎬", title: "Up to 4K", desc: "Download in the highest quality available" },
              { icon: "🎵", title: "Audio Extract", desc: "Extract MP3 audio from any video" },
              { icon: "⚡", title: "Fast Fetch", desc: "Direct links with no redirects or waiting" },
              { icon: "🔒", title: "Public Only", desc: "Works with public posts — no login needed" },
              { icon: "📱", title: "All Platforms", desc: "YouTube, TikTok, Instagram, X, and 1000+ more" },
            ].map((f) => (
              <div key={f.title} className="feature-card">
                <span className="feature-icon">{f.icon}</span>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>GRABR · For personal use only · Public content only · No login required</p>
        <p className="footer-disclaimer">
          Respect content creators and platform terms of service. Only download content you have rights to.
        </p>
      </footer>
    </div>
  );
}
