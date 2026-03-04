# ⬇ GRABR — Universal Social Media Downloader

A full-stack web app to download videos, audio, and images from 1,000+ social media platforms including **YouTube, Instagram, TikTok, Twitter/X, Facebook, Snapchat, Threads, LinkedIn, Pinterest, Reddit, Vimeo, Twitch**, and many more.

```
┌──────────────────────────────────────────────────┐
│  GRABR — Universal Social Media Downloader       │
│  Stack: React + Vite (frontend) · Express (API)  │
│  Engine: yt-dlp (Python) — supports 1000+ sites  │
└──────────────────────────────────────────────────┘
```

---

## ✨ Features

- **Paste & Go** — paste any URL, platform is detected instantly
- **1,000+ platforms** via yt-dlp — YouTube, Instagram, TikTok, X, FB, and more
- **Multiple quality options** — up to 4K/1080p where available
- **Audio extraction** — download MP3 from any video
- **Thumbnail preview** — see the video before downloading
- **Progress bars** — animated fetch and download feedback
- **Error handling** — clear messages for private/removed/geo-blocked content
- **Rate limiting** — 30 info requests / 5 downloads per minute per IP
- **Mobile responsive** — works on all screen sizes
- **No login required** — public posts only

---

## 📁 Project Structure

```
grabr/
├── backend/
│   ├── server.js          # Express API server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # React UI component
│   │   ├── index.css      # Styles
│   │   └── main.jsx       # Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── package.json           # Root — runs both together
├── vercel.json            # Vercel deployment config
└── .env.example           # Environment variable template
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+ → https://nodejs.org
- **Python 3.8+** → https://python.org
- **yt-dlp** (the download engine)
- **ffmpeg** (required for video/audio merging)

### 1. Install yt-dlp and ffmpeg

```bash
# yt-dlp (required)
pip install yt-dlp

# Verify installation
yt-dlp --version

# ffmpeg (required for merging video+audio streams)
# macOS:
brew install ffmpeg

# Ubuntu/Debian:
sudo apt install ffmpeg

# Windows:
# Download from https://ffmpeg.org/download.html
# Add to PATH
```

### 2. Clone and Install Dependencies

```bash
git clone https://github.com/yourname/grabr.git
cd grabr

# Install all Node.js dependencies (frontend + backend)
npm run install:all

# Or manually:
cd backend && npm install
cd ../frontend && npm install
```

### 3. Configure Environment Variables

```bash
# Copy example env file
cp .env.example backend/.env
cp .env.example frontend/.env

# Edit backend/.env:
PORT=3001
YT_DLP_PATH=yt-dlp          # or full path on Windows
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Edit frontend/.env:
VITE_API_URL=http://localhost:3001
```

### 4. Run in Development

```bash
# From root — starts both backend (3001) and frontend (5173) together
npm run dev

# Or separately:
npm run dev:backend    # Express API on :3001
npm run dev:frontend   # Vite React on :5173
```

Open **http://localhost:5173** in your browser.

---

## 🌐 API Reference

### `GET /api/health`
Returns server status and yt-dlp version.

```json
{
  "status": "ok",
  "ytdlp": "2024.01.19",
  "timestamp": "2024-01-19T12:00:00.000Z"
}
```

### `POST /api/info`
Fetches metadata for a social media URL without downloading.

**Request body:**
```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

**Response:**
```json
{
  "platform": "youtube",
  "title": "Rick Astley - Never Gonna Give You Up",
  "thumbnail": "https://...",
  "duration": 213,
  "uploader": "Rick Astley",
  "viewCount": 1500000000,
  "formats": [
    { "id": "137", "label": "1080p Full HD", "ext": "mp4", "type": "video", "resolution": "1920x1080" },
    { "id": "136", "label": "720p HD",       "ext": "mp4", "type": "video", "resolution": "1280x720" },
    { "id": "bestaudio/best", "label": "Audio Only (MP3)", "ext": "mp3", "type": "audio" }
  ]
}
```

### `GET /api/download?url=...&formatId=...&ext=...&title=...`
Downloads and streams the media file to the client.

**Query params:**
| Param | Required | Description |
|-------|----------|-------------|
| `url` | ✅ | The original social media URL |
| `formatId` | ✅ | Format ID from `/api/info` response |
| `ext` | ✅ | File extension: `mp4`, `mp3`, `jpg` |
| `title` | optional | Used as the download filename |

---

## 🚢 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# YT_DLP_PATH, FRONTEND_URL, NODE_ENV=production
```

> ⚠️ **Important:** Vercel Serverless Functions have a 10s timeout on the free tier.
> For downloads of large files, use a VPS (Railway, Render, Fly.io) instead.

### Railway (Best for Downloads)

```bash
# railway.app supports long-running processes and file streaming
# 1. Connect your GitHub repo
# 2. Add environment variables
# 3. It auto-detects Node.js and runs npm start
```

### Docker

```dockerfile
FROM node:20-slim

# Install Python + yt-dlp + ffmpeg
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg \
  && pip3 install yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm run install:all && npm run build

EXPOSE 3001
CMD ["npm", "start"]
```

```bash
docker build -t grabr .
docker run -p 3001:3001 grabr
```

---

## 🔧 Configuration & Tuning

### Update yt-dlp (do this regularly for fresh cookie support)
```bash
pip install --upgrade yt-dlp
# or via yt-dlp itself:
yt-dlp -U
```

### Cookies for Age-Restricted Content
```bash
# Export cookies from your browser (requires yt-dlp cookie support)
# In server.js, add to yt-dlp args:
"--cookies", "/path/to/cookies.txt"
```

### Proxy Support (avoid IP bans)
```bash
# In server.js, add to yt-dlp args:
"--proxy", "socks5://127.0.0.1:9050"
```

### Rate Limit Tuning
Edit `server.js`:
```js
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // change window
  max: 30,                     // change max requests
});
```

---

## ⚠️ Legal & Ethics

- This tool is for **personal use only**
- Only works with **public** content
- Respect the **terms of service** of each platform
- Respect copyright — only download content you have rights to
- Do **not** use for commercial redistribution

---

## 🐛 Troubleshooting

| Error | Solution |
|-------|----------|
| `yt-dlp not found` | Run `pip install yt-dlp` and ensure it's in PATH |
| `ffmpeg not found` | Install ffmpeg: `brew install ffmpeg` / `apt install ffmpeg` |
| `Private video` | Only public content is supported |
| `Login required` | Platform requires authentication — not supported |
| `Timeout` | Try again; or the content may be geo-blocked |
| Download is audio only | ffmpeg is not installed — needed for video+audio merge |
| CORS errors | Set `FRONTEND_URL` env var to your frontend origin |

---

## 📦 Dependencies

### Backend
| Package | Purpose |
|---------|---------|
| `express` | HTTP server |
| `cors` | Cross-origin headers |
| `express-rate-limit` | Request throttling |
| `yt-dlp` (Python) | Media extraction engine |
| `ffmpeg` | Video/audio merging |

### Frontend
| Package | Purpose |
|---------|---------|
| `react` | UI framework |
| `vite` | Build tool |
| Google Fonts | Space Mono + DM Sans |

---

## 📄 License

MIT — free for personal use. See LICENSE.
