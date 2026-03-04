FROM node:22-slim

RUN apt-get update && apt-get install -y curl python3 python3-pip ffmpeg && rm -rf /var/lib/apt/lists/*

RUN pip3 install yt-dlp --break-system-packages

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV PORT=8080
ENV YT_DLP_PATH=yt-dlp

EXPOSE 8080

CMD ["node", "server.js"]