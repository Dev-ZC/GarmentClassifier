# GarmentClassifier

A local desktop app for collecting and organizing images on an infinite
canvas board, with search over garment-specific visual attributes: color,
fabric, seams, fit/shape, hardware, and free-text/semantic similarity.
Images are ingested via drag-and-drop or a file picker, stored locally,
and rendered as freely draggable cards on a pan/zoom canvas. A search bar
docked at the top moves to the center of the screen when focused.

Everything - color analysis, attribute tagging, and semantic embeddings -
runs locally. No image or query ever leaves the machine, and no API key
is required.

## Stack

- **Backend**: FastAPI + SQLAlchemy (SQLite) + Pillow, serving a REST API
  and the stored image files.
- **Frontend**: React + TypeScript + Vite, wrapped in Electron for the
  desktop shell. Infinite pan/zoom canvas via `react-zoom-pan-pinch`.
- **Local tagging pipeline** (runs on upload, see "Search & tagging"
  below): Pillow for color extraction, a local CLIP model (via
  `transformers`/`torch`) for semantic embeddings, and a local
  vision-language model served by [Ollama](https://ollama.com) for
  structured garment attributes.

## Project layout

```
backend/
  app/
    main.py         FastAPI app, static file mount, router registration
    models.py        SQLAlchemy Image model (incl. tagging/attribute columns)
    color.py          Dominant color extraction + LAB Delta-E proximity
    embeddings.py      Local CLIP image/text embeddings for semantic search
    vlm.py             Ollama call for structured garment attributes (JSON)
    tagging.py         Background pipeline that runs the three steps above
    routers/images.py  Upload/list/move/tag/retag/delete endpoints
    routers/search.py  Hybrid search endpoint (filters + color + semantic)
    storage.py       Saves uploaded files under backend/data/images
  data/              SQLite DB + ingested images (gitignored, created at runtime)
  run.py             Dev entrypoint (uvicorn with reload)
  dev.sh             Creates a venv, installs deps, and runs the API

frontend/
  electron/          Electron main + preload process
  src/
    api/client.ts     Fetch wrapper for the backend REST API
    components/       SearchBar (text + color), Canvas/Board, Canvas/ImageCard
    hooks/useImages.ts Loads/mutates images, polls while tagging is in progress
```

## Running it

From `frontend/`:

```
npm install
npm run dev
```

This starts the FastAPI backend (via `backend/dev.sh`, auto-creating a
venv on first run), the Vite dev server, and an Electron window, all
together.

To run pieces individually: `npm run dev:backend`, `npm run dev:vite`,
`npm run dev:electron` (the last one needs the Vite server already
running on port 5173).

To build a distributable desktop app: `npm run dist` (runs `electron-builder`
after a production build).

## macOS Gatekeeper note

npm's `electron` package downloads an unsigned `Electron.app` binary for
local development. Some macOS versions' XProtect heuristics flag unsigned
Electron shells as malware and quarantine them — this is a known false
positive (the binary's checksum matches Electron's official release
exactly). `npm install` runs `scripts/sign-electron.cjs` automatically,
which ad-hoc signs the binary and clears the quarantine flag to avoid
this. If you ever see a "malware blocked" dialog for `Electron.app`, rerun
`npm install` (or `node scripts/sign-electron.cjs` directly) and try again.

## Search & tagging

Every uploaded image goes through a local background pipeline
(`backend/app/tagging.py`), tracked per-image via `tagging_status`
(`pending` → `processing` → `done`/`failed`, shown as a badge on each
card):

1. **Color** (`app/color.py`) — dominant colors are extracted directly
   from pixels (Pillow palette quantization) and converted to LAB. Color
   search computes CIE76 Delta-E distance, so "close to this color" is
   exact math, not a model's guess.
2. **Structured attributes** (`app/vlm.py`) — a local vision-language
   model via Ollama returns strict JSON: `garment_type`, `fabric`,
   `pattern`, `fit_shape`, `seam_type`, `hardware` (type + color), free-form
   `style_tags`, and a one-sentence `description`.
3. **Semantic embedding** (`app/embeddings.py`) — a local CLIP model
   embeds the image; free-text queries are embedded the same way so
   "similar vibe" search works even for things with no fixed taxonomy
   (patterns, inspiration photos, etc).

`POST /api/search` combines all three: hard filters on structured fields,
Delta-E color proximity, and CLIP cosine similarity (with a keyword-match
bonus), ranked into one result list.

### One-time local model setup

```
brew install ollama
brew services start ollama
ollama pull qwen2.5vl:3b
```

The CLIP model (`openai/clip-vit-base-patch32`, ~600MB) downloads
automatically the first time an image is tagged. Both models are
configurable via env vars (`OLLAMA_VISION_MODEL`, `OLLAMA_HOST`,
`CLIP_MODEL_NAME` in `backend/app/config.py`) if you want a smaller/larger
model. The default VLM is `qwen2.5vl:3b` (~2.5GB resident) - the 7b
variant (~6GB) is noticeably better but only worth it on machines with
headroom; `OLLAMA_HOST` can also point at an Ollama server on another
machine. Tagging also works on downscaled copies
(`TAGGING_IMAGE_MAX_PX`, default 1024) and runs one image at a time to
keep peak memory bounded. If Ollama isn't running, color + semantic
search still work; only the structured-attribute step fails (retry it
per-image from the card's "Tagging failed - retry" badge, or
`POST /api/images/{id}/retag`).

Everything runs locally after that first CLIP download — the app sets
`HF_HUB_OFFLINE=1` so it never calls the Hugging Face Hub again (no
"unauthenticated requests" warning, no rate limits, no dependency on
internet access). If you ever need to re-download or switch
`CLIP_MODEL_NAME`, run once with `HF_HUB_OFFLINE=0` and network access.

## Backend API

- `GET /api/images` — list all images
- `POST /api/images` — upload an image (multipart form: `file`, `x`, `y`); kicks off tagging
- `PATCH /api/images/{id}/position` — update board position
- `PATCH /api/images/{id}/tags` — update manual tags
- `POST /api/images/{id}/retag` — re-run the local tagging pipeline
- `DELETE /api/images/{id}` — remove an image
- `GET /api/swatches` — list the fabric swatch bank
- `POST /api/swatches` — upload a fabric swatch (multipart form: `file`); kicks off tagging
- `POST /api/swatches/search` — hybrid search scoped to swatches only
- `GET /api/swatches/facets` — filter pills for the swatch bank
- `POST /api/search` — hybrid search (`query`, `color_hex`, `color_tolerance`, `attribute_tags`); swatches are excluded
- Static files served under `/media/<stored_filename>`
