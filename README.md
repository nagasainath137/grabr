GRABR — Social Media Downloader
A web app to download videos, audio, and images from social media platforms like YouTube, Instagram, TikTok, Twitter/X, Facebook, and more.

Paste any public social media URL and download the video, audio, or thumbnail
Supports multiple quality options (up to 1080p/4K where available)
Can extract audio as MP3 from any video
Shows a thumbnail preview before downloading
Works on mobile too

Tech Stack

Frontend — React + Vite
Backend — Express (Node.js)
Download Engine — yt-dlp (Python)
Video/Audio Merging — ffmpeg

API Endpoints
MethodEndpointDescriptionGET/api/healthCheck server statusPOST/api/infoGet video metadata and available formatsGET/api/downloadDownload and stream the media file
Deployment
Vercel — works for basic use but has a 10 second timeout on the free tier, so large downloads may fail.
Railway — recommended for downloads since it supports long-running requests and file streaming.
Docker
bashdocker build -t grabr .
docker run -p 3001:3001 grabr
Notes

Only works with public content — private or login-required videos are not supported
Built for personal use only — respect each platform's terms of service
Run pip install --upgrade yt-dlp regularly to keep the download engine updated
