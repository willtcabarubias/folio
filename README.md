# Folio

Turn a prompt — or your PDF, Word, PowerPoint and text files — into polished **PPTX, DOCX and PDF** documents. Powered by NVIDIA Nemotron 3 Ultra through the NVIDIA NIM API.

## Run locally

```bash
npm install
cp .env.example .env.local      # then paste your key into .env.local
npm run dev                     # http://localhost:3000
```

`.env.local` must contain:

```
NVIDIA_API_KEY=nvapi-...
NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

Environment files are read once at startup — **restart `npm run dev` after editing them**. No database is required; projects are stored in the browser.

If the app shows "Add your NVIDIA API key", the server process did not see `NVIDIA_API_KEY`. Check that `.env.local` is in the same folder as `package.json`, that the line has no leading spaces or `export`, and restart the server.

## Environment variables

| Variable | Required | Default |
| --- | --- | --- |
| `NVIDIA_API_KEY` | yes | — |
| `NVIDIA_MODEL` | no | `nvidia/nemotron-3-ultra-550b-a55b` |
| `NVIDIA_BASE_URL` | no | `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_THINKING` | no | `off` |
| `DATABASE_URL` | no | only used by `/api/health` |

## How it works

1. **Plan** — `/api/agent` reads the request and attachments, asks only the clarifying questions that change the result (max two rounds), then returns a structured outline. Length follows real-world conventions (resume = 1 page, pitch deck = 10–12 slides, report = 3–6 pages…) unless the user states a number.
2. **Edit** — the outline (sections, layouts, points) and settings (format, length, page size, audience, tone) are editable; follow-up messages revise the plan.
3. **Generate** — `/api/expand` writes the content against per-section word budgets, then a page-fit pass measures the real layout and tightens density or trims detail until the document lands on its page target.
4. **Preview & export** — `/api/render` produces the PPTX/DOCX/PDF with a monochrome design system (`pptxgenjs`, `docx`, `pdfkit`). Slides are built from a shared scene graph, so the on-screen preview (a PDF twin rendered with pdf.js) matches the PowerPoint file. Export as PPTX, DOCX, PDF, PNG images or Markdown.

## Scripts

- `npm run dev` — development server
- `npm run build` / `npm start` — production
- `npm run typecheck` — TypeScript
