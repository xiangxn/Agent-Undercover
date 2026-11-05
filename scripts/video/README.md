# Demo video pipeline

One raw screen recording in, one finished 60–90s demo out: cuts, speed-ups,
subtitles, AI English voiceover, and end card.

## One-time setup

```bash
bash scripts/video/setup.sh
```

The script creates a local Python venv (edge-tts + Pillow) and downloads a
static ffmpeg/ffprobe into `.video-tools/` from npm. Subtitles are rendered as
PNGs with Pillow, so ffmpeg does not need libass/freetype.

If the static ffmpeg does not run on your machine, install ffmpeg and set
`FFMPEG_PATH` / `FFPROBE_PATH`. The default fonts are macOS Arial; elsewhere,
point `FONT_REGULAR` and `FONT_BOLD` at installed TTF files.

Everything is local-only; `.video-tools/` and `recordings/` are gitignored.

## 1. Record one take

Use QuickTime **File → New Screen Recording**, record the browser window (not
the whole desktop), and save it as `recordings/take-01.mov`. Record the whole
game from before clicking Play until the result page. Do not edit while
recording — pauses and dead time are removed later.

## 2. Find the cut points

Sample one frame every two seconds as a contact sheet:

```bash
ffmpeg -i recordings/take-01.mov \
  -vf "fps=1/2,scale=480:-1,tile=5x4" -frames:v 12 \
  recordings/contact-%02d.jpg
```

Open the images and note the source timestamps of each phase (title, word card,
first description, vote reveal, verdict, result, reasoning replay, payout).
For a transition that is hard to pin down, extract frames around it:

```bash
ffmpeg -ss 42 -i recordings/take-01.mov -t 6 -vf fps=2 recordings/frames-%03d.jpg
```

## 3. Write the edit decision list

Copy `scripts/video/edit.example.json` to `recordings/edit.json` and fill it in.
Times are in **source seconds**; the script computes the final timeline.

- `start` / `end` — trim bounds in the source video.
- `speed` — `1.5` speeds a wait up 1.5×; `1` keeps real time.
- `zoom` — `1.08` is a subtle punch-in; omit for no zoom. With `focus`
  (`{ "x": 0.6, "y": 0.25 }`, normalized 0–1 in the output frame), the
  punch-in centers on that point instead of the frame center.
- `subtitle` — burned-in English line, shown for the whole segment.
- `narration` — English voiceover line. `narrationDelay` (default `0.25`)
  is the gap after the segment starts; `narrationAt` overrides it with an
  absolute final-video time.
- `sourceCrop` — optional `{ x, y, width, height }` applied to every segment
  before scaling. Useful for removing browser chrome from a screen recording.
- `endCard` — title, subtitle, and lines shown on the final seconds
  (`duration` defaults to 4). It can also carry `narration` / `narrationAt`
  for an outro voiceover.

## 4. Build

```bash
# generate the voiceover and print each line's actual duration, no encode
node scripts/video/build-demo-video.mjs recordings/edit.json --tts-only

# validate the timeline without encoding
node scripts/video/build-demo-video.mjs recordings/edit.json --dry-run

# encode
node scripts/video/build-demo-video.mjs recordings/edit.json
```

Output defaults to `recordings/agent-undercover-demo.mp4`
(1920×1080, 30 fps, H.264, AAC). Watch it muted once and with sound once.

## Notes

- Voiceover text is sent to Microsoft's Edge TTS endpoint. It is public
  marketing copy, not secrets.
- Subtitles and the end card are Pillow-rendered PNGs overlaid by ffmpeg.
  Re-run the script after editing `edit.json`; only changed TTS clips are
  regenerated (cached under `recordings/voice/` by text hash).
- If the recording contains a `(scripted)` fallback or secrets, fix the take —
  the pipeline does not hide that.
