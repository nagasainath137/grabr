/**
 * Universal Social Media Downloader — Backend Server
 * Uses yt-dlp (Python) as the core extraction engine via child_process.
 * Supports: YouTube, Instagram, TikTok, Twitter/X, Facebook, Snapchat,
 *           Threads, BeReal, LinkedIn, Pinterest, Reddit, Vimeo, and 1000+ more.
 *
 * Setup: npm install && pip install yt-dlp
 * Run:   node server.js  (or: nodemon server.js)
 */

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
  })
);

// Rate limiting — prevents abuse and reduces ban risk
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Too many requests. Please wait 15 minutes before trying again.",
    retryAfter: 15,
  },
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 downloads per minute per IP
  message: {
    error: "Download limit reached. Please wait a minute.",
    retryAfter: 1,
  },
});

app.use("/api/", limiter);

// ─── Platform Detection ────────────────────────────────────────────────────
const PLATFORM_PATTERNS = {
  youtube: /(?:youtube\.com\/(?:watch|shorts|reel|embed)|youtu\.be\/)/i,
  instagram: /instagram\.com\/(p|reel|tv|stories)\//i,
  tiktok: /tiktok\.com\/@?.+\/video\//i,
  twitter: /(?:twitter\.com|x\.com)\/\w+\/status\//i,
  facebook: /facebook\.com\/(?:watch|reel|video|share)/i,
  snapchat: /snapchat\.com\/spotlight\//i,
  threads: /threads\.net\/@?.+\/post\//i,
  linkedin: /linkedin\.com\/(posts|feed\/update)\//i,
  pinterest: /pinterest\.(?:com|co\.uk)\/pin\//i,
  reddit: /reddit\.com\/r\/.+\/comments\//i,
  vimeo: /vimeo\.com\/\d+/i,
  twitch: /twitch\.tv\/videos\//i,
  dailymotion: /dailymotion\.com\/video\//i,
  bereal: /bereal\.com\//i,
};

function detectPlatform(url) {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) return platform;
  }
  return "unknown";
}

function validateUrl(url) {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    // Block localhost / private IPs (SSRF protection)
    const hostname = u.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname === "0.0.0.0"
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

// ─── yt-dlp Helpers ────────────────────────────────────────────────────────
const { execSync, execFile } = require("child_process");

let YT_DLP = process.env.YT_DLP_PATH || "/app/yt-dlp";

// Download yt-dlp binary in background after server starts
function ensureYtDlp() {
  try {
    execSync(`${YT_DLP} --version`, { stdio: "ignore" });
    console.log("yt-dlp found!");
  } catch {
    console.log("Downloading yt-dlp binary...");
    try {
      execSync(
        `curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /app/yt-dlp && chmod +x /app/yt-dlp`,
        { stdio: "inherit", timeout: 60000 }
      );
      YT_DLP = "/app/yt-dlp";
      console.log("yt-dlp ready!");
    } catch(e) {
      console.error("Failed to download yt-dlp:", e.message);
    }
  }
}


/**
 * Fetch video/audio metadata without downloading.
 * Returns structured info: title, thumbnail, formats, duration, uploader, etc.
 */
async function fetchInfo(url) {
  const args = [
    "--dump-json",
    "--no-playlist",
    "--no-warnings",
    "--extractor-retries",
    "3",
    "--socket-timeout",
    "30",
    // Rotate user agents to reduce bans
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    url,
  ];

  const { stdout } = await execFileAsync(YT_DLP, args, {
    timeout: 45000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return JSON.parse(stdout);
}

/**
 * Parse yt-dlp format list into clean quality options.
 */
function parseFormats(info) {
  const formats = [];
  const seen = new Set();

  if (!info.formats) {
    // Single format available
    return [
      {
        id: "best",
        label: "Best Quality",
        ext: info.ext || "mp4",
        type: "video",
        resolution: info.width ? `${info.width}x${info.height}` : "Unknown",
        filesize: info.filesize || null,
      },
    ];
  }

  // Video formats (with audio merged)
  const videoFormats = info.formats
    .filter(
      (f) =>
        f.vcodec !== "none" &&
        f.acodec !== "none" &&
        f.ext !== "mhtml" &&
        f.url
    )
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  // Add video+audio merged formats
  const videoQualities = [2160, 1440, 1080, 720, 480, 360, 240, 144];
  for (const q of videoQualities) {
    const fmt = videoFormats.find((f) => f.height === q);
    if (fmt && !seen.has(q)) {
      seen.add(q);
      formats.push({
        id: fmt.format_id,
        label: `${q}p ${q >= 1080 ? "Full HD" : q >= 720 ? "HD" : "SD"}`,
        ext: "mp4",
        type: "video",
        resolution: `${fmt.width || "?"}x${fmt.height}`,
        filesize: fmt.filesize || fmt.filesize_approx || null,
        fps: fmt.fps || null,
      });
    }
  }

  // Fallback: best available video
  if (formats.filter((f) => f.type === "video").length === 0) {
    formats.push({
      id: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      label: "Best Video (MP4)",
      ext: "mp4",
      type: "video",
      resolution: info.resolution || "Best available",
      filesize: null,
    });
  }

  // Audio-only formats
  const audioFormats = info.formats
    .filter((f) => f.vcodec === "none" && f.acodec !== "none")
    .sort((a, b) => (b.abr || 0) - (a.abr || 0));

  if (audioFormats.length > 0) {
    const best = audioFormats[0];
    formats.push({
      id: "bestaudio/best",
      label: `Audio Only (MP3)`,
      ext: "mp3",
      type: "audio",
      resolution: `${best.abr || "?"}kbps`,
      filesize: best.filesize || null,
    });
  }

  // Image/thumbnail formats (for Instagram images, etc.)
  if (info.thumbnail || info.thumbnails) {
    formats.push({
      id: "thumbnail",
      label: "Thumbnail / Cover Image",
      ext: "jpg",
      type: "image",
      resolution: "Original",
      filesize: null,
    });
  }

  return formats.length > 0
    ? formats
    : [
        {
          id: "best",
          label: "Best Quality",
          ext: "mp4",
          type: "video",
          resolution: "Best available",
          filesize: null,
        },
      ];
}

// ─── API Routes ────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * Health check + yt-dlp version
 */
app.get("/api/health", async (req, res) => {
  try {
    const { stdout } = await execFileAsync(YT_DLP, ["--version"], {
      timeout: 5000,
    });
    res.json({
      status: "ok",
      ytdlp: stdout.trim(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "error",
      message: "yt-dlp not found. Run: pip install yt-dlp",
    });
  }
});

/**
 * POST /api/info
 * Body: { url: string }
 * Returns: platform, title, thumbnail, duration, formats[]
 */
app.post("/api/info", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL is required." });
  }

  if (!validateUrl(url)) {
    return res
      .status(400)
      .json({ error: "Invalid or unsupported URL format." });
  }

  const platform = detectPlatform(url);

  try {
    const info = await fetchInfo(url);

    const formats = parseFormats(info);

    // Normalize thumbnail: prefer highest-res thumbnail
    let thumbnail = info.thumbnail;
    if (info.thumbnails && info.thumbnails.length > 0) {
      const sorted = [...info.thumbnails]
        .filter((t) => t.url)
        .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
      if (sorted[0]) thumbnail = sorted[0].url;
    }

    res.json({
      platform,
      title: info.title || "Untitled",
      thumbnail: thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || info.channel || info.creator || null,
      uploadDate: info.upload_date || null,
      viewCount: info.view_count || null,
      description: info.description
        ? info.description.slice(0, 200)
        : null,
      formats,
      originalUrl: url,
    });
  } catch (err) {
    console.error("[info] Error:", err.message);

    // Parse common yt-dlp errors into user-friendly messages
    const msg = err.message || "";
    if (msg.includes("Private video") || msg.includes("private"))
      return res
        .status(403)
        .json({ error: "This content is private or unavailable." });
    if (msg.includes("not available") || msg.includes("removed"))
      return res
        .status(404)
        .json({ error: "Content not found or has been removed." });
    if (msg.includes("login") || msg.includes("sign in"))
      return res
        .status(403)
        .json({ error: "This content requires login. Only public posts are supported." });
    if (msg.includes("age") || msg.includes("18+"))
      return res
        .status(403)
        .json({ error: "Age-restricted content is not supported." });
    if (msg.includes("geo") || msg.includes("region"))
      return res
        .status(403)
        .json({ error: "This content is geo-restricted in your region." });

    res
      .status(500)
      .json({ error: "Failed to fetch media info. The URL may be invalid or unsupported." });
  }
});

/**
 * GET /api/download
 * Query: url, formatId, ext, title
 * Streams the file directly to the client.
 */
app.get("/api/download", downloadLimiter, async (req, res) => {
  const { url, formatId = "best", ext = "mp4", title = "download" } = req.query;

  if (!url || !validateUrl(url)) {
    return res.status(400).json({ error: "Invalid URL." });
  }

  // Generate a safe filename
  const safeTitle = title
    .replace(/[^a-zA-Z0-9\s\-_]/g, "")
    .trim()
    .slice(0, 80) || "download";
  const filename = `${safeTitle}.${ext}`;

  // Build yt-dlp format selector
  let formatSelector;
  if (formatId === "thumbnail") {
    // Special case: download thumbnail as image
    return downloadThumbnail(url, res, filename);
  } else if (ext === "mp3" || formatId.includes("bestaudio")) {
    formatSelector = "bestaudio/best";
  } else if (formatId === "best") {
    formatSelector = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
  } else {
    // Specific format ID with audio merge
    formatSelector = `${formatId}+bestaudio/best`;
  }

  // Create a temp directory for output
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdl-"));
  const outputTemplate = path.join(tmpDir, "%(title)s.%(ext)s");

  const args = [
    "-f",
    formatSelector,
    "--no-playlist",
    "--no-warnings",
    "-o",
    outputTemplate,
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "--socket-timeout",
    "60",
  ];

  // Add post-processing for MP3
  if (ext === "mp3") {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    // Merge into MP4 if possible
    args.push("--merge-output-format", "mp4");
  }

  args.push(url);

  console.log(`[download] Starting: ${url} | format: ${formatSelector}`);

  const ytdlp = spawn(YT_DLP, args, { cwd: tmpDir });

  let stderr = "";
  ytdlp.stderr.on("data", (d) => {
    stderr += d.toString();
  });

  ytdlp.on("close", (code) => {
    if (code !== 0) {
      console.error("[download] yt-dlp error:", stderr);
      cleanup(tmpDir);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Download failed. The content may be unavailable." });
      }
      return;
    }

    // Find the output file
    let files;
    try {
      files = fs.readdirSync(tmpDir);
    } catch {
      return res.status(500).json({ error: "Failed to read output directory." });
    }

    const outputFile = files.find((f) =>
      [".mp4", ".mp3", ".webm", ".mkv", ".jpg", ".png"].some((e) =>
        f.endsWith(e)
      )
    );

    if (!outputFile) {
      cleanup(tmpDir);
      return res.status(500).json({ error: "No output file found after download." });
    }

    const filePath = path.join(tmpDir, outputFile);
    const stat = fs.statSync(filePath);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(filename)}"`
    );
    res.setHeader(
      "Content-Type",
      ext === "mp3" ? "audio/mpeg" : ext === "mp4" ? "video/mp4" : "application/octet-stream"
    );
    res.setHeader("Content-Length", stat.size);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    stream.on("end", () => {
      cleanup(tmpDir);
    });

    stream.on("error", () => {
      cleanup(tmpDir);
      if (!res.headersSent) {
        res.status(500).json({ error: "Stream error during download." });
      }
    });
  });

  ytdlp.on("error", (err) => {
    cleanup(tmpDir);
    console.error("[download] spawn error:", err.message);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "yt-dlp not found. Ensure it is installed: pip install yt-dlp" });
    }
  });

  // Handle client disconnect
  req.on("close", () => {
    if (!res.writableEnded) {
      ytdlp.kill("SIGTERM");
      cleanup(tmpDir);
    }
  });
});

// ─── Thumbnail Download Helper ─────────────────────────────────────────────
async function downloadThumbnail(url, res, filename) {
  try {
    const info = await fetchInfo(url);
    const thumbUrl = info.thumbnail;
    if (!thumbUrl) {
      return res.status(404).json({ error: "No thumbnail found." });
    }

    const https = require("https");
    const http = require("http");
    const protocol = thumbUrl.startsWith("https") ? https : http;

    protocol.get(thumbUrl, (thumbRes) => {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", thumbRes.headers["content-type"] || "image/jpeg");
      thumbRes.pipe(res);
    });
  } catch {
    res.status(500).json({ error: "Failed to download thumbnail." });
  }
}

// ─── Cleanup Helper ────────────────────────────────────────────────────────
function cleanup(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach((f) => fs.unlinkSync(path.join(dir, f)));
      fs.rmdirSync(dir);
    }
  } catch (e) {
    console.warn("[cleanup] Warning:", e.message);
  }
}

// ─── Serve Frontend in Production ─────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const buildPath = path.join(__dirname, "../frontend/dist");
  if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(buildPath, "index.html"));
    });
  }
}

// ─── 404 & Error Handlers ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

app.use((err, req, res, next) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Social Media Downloader API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  ensureYtDlp(); // Download yt-dlp after server starts
});
