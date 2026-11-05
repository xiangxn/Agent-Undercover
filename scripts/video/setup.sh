#!/usr/bin/env bash
# One-time setup for the local demo-video pipeline. Everything lands in
# .video-tools/, which is gitignored.
set -euo pipefail

cd "$(dirname "$0")/../.."

python3 -m venv .video-tools
.video-tools/bin/pip install -U pip edge-tts pillow

cat > .video-tools/package.json <<'JSON'
{
  "name": "agent-undercover-video-tools",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "@ffmpeg-installer/ffmpeg": "^1.1.0",
    "@ffprobe-installer/ffprobe": "^2.1.2"
  }
}
JSON

(cd .video-tools && npm install --omit=dev --no-audit --no-fund)

echo
echo "==> Ready"
.video-tools/bin/edge-tts --list-voices >/dev/null && echo "edge-tts ok"
.video-tools/bin/python -c "import PIL; print('Pillow', PIL.__version__)"
FFMPEG_BIN=$(node -e 'const { createRequire } = require("node:module"); const r = createRequire(process.cwd() + "/.video-tools/package.json"); const m = r("@ffmpeg-installer/ffmpeg"); process.stdout.write(typeof m === "string" ? m : m.path);')
"$FFMPEG_BIN" -version | head -1
