# 0click

Tampermonkey userscript **0click** v1.3 for the AutoContour Zero-Click Jobs History page.

The script runs on `http://10.240.61.81:18001/*` (for example `/jobs/history`). It is read-only: it never clicks anything on the page, never changes the page's filters, and never sends POST, PUT, or DELETE requests.

## Install

https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js

In Tampermonkey, choose Install from URL and paste that link, or open it after Tampermonkey is installed. Auto-update uses the same raw URL on `main`. After a first install, use Tampermonkey's Check for updates (or reinstall from that URL) to get v1.3.

## What it does

A floating **0click 1.3** panel summarizes jobs from **today and yesterday** (the browser's local date). The date range is shown in the panel header. The panel sits in the **bottom-right** corner (about 16px in), starts about 700px wide, and can be resized and collapsed. Because it is anchored at the bottom, growing the height expands the panel upward.

The script includes only the target workflow rows it is written for, and only rows whose Date Submitted falls on today or yesterday. Date Submitted is parsed as `YYYY-MM-DD HH:MM:SS` (other similar date forms are also accepted).

The panel is a compact table with **one row per patient per day** and these columns:

- **Patient**
- **Unmatched (N)**: every no-template series for that patient on that day, consolidated into a few lines (about three at most). 4D phase series (`T=90%…`, `T=0%…`, and so on) are grouped as one line such as `4D phases ×10 (T 0–90%)`, with the phase list available in the tooltip. Other series are grouped by their first token (for example `MIP`, `Ave-IP`, `Resp`, `tMaxIP`) as compact lines like `MIP(10)…, Ave-IP(10)…`, with a ×count when a token repeats. The full list is on a tooltip.
- **Matched**: the same consolidation, with the template name in front of the short series label, for example `Thorax ← Ave-IP(10)…`.
- **Last submitted**: a small **Today** or **Yest.** badge plus the time.

The table is split into two bold section headers, today first: `TODAY (date)` and `YESTERDAY (date)`, each with per-section counts. If a patient has jobs on both days, they appear in each section with that day's series only. Today rows have a light blue background and a strong blue left border; yesterday rows have a light gray background, muted text, and a gray left border. Rows that have unmatched series and no matched series keep an unmatched-only marker (orange accent and a `!` icon) without replacing the day background. A totals row sits at the bottom of the table.

Click a patient name to scroll the page's Jobs History table to that patient's first matching row and briefly highlight it. The script only scrolls and highlights; it never clicks page controls or changes filters. If that row is not in the current page (for example the data came from the API but the row is not rendered), the panel shows a small "not on this page" note.

The table has a sticky header, a compact 12px font, cell borders, and a scroll area.

## How it gets data

The page's own column filters are not used as the data source, because they can be unreliable.

1. **Preferred — same-origin jobs API.** The script starts at `document-start` and watches `fetch` / `XMLHttpRequest` (page context, read-only) to detect the JSON endpoint the Jobs History page already calls. When that endpoint is found, the script issues its own **GET** requests to the same origin, asking for a last-two-days date range and a large page size, and follows further pages by GET if the response looks paginated. The summary is computed from that full result, then filtered again in the script to today and yesterday. It never calls a different origin and never uses POST, PUT, or DELETE.
2. **Fallback — visible table.** If no jobs API is detected, the script reads the table (or grid) already on the page. Columns are found by header text, not by fixed index. A filter-input row is ignored. This fallback can only see rows currently in the DOM, so a narrow page Date Submitted filter or pagination can hide jobs; the script will not click filters or page controls. If you are on the fallback, clear or widen the page Date Submitted filter yourself so both days are included.

The panel's source line says whether the summary came from `GET /path` or from the visible table.

The panel lives in a closed shadow root so a Ctrl+F search does not hit the summary (including patient names). It can be collapsed or refreshed from the title bar. Refresh re-runs the API GET when an endpoint was detected.

## Safety

- Read-only. It never clicks page controls, never changes Jobs History filters, and only sends same-origin GET requests.
- Patient names appear only in the live panel in the browser. The script does not `console.log`, store (`GM_setValue` / `localStorage`), or send row data off-origin. Do not put patient names, IDs, or real series examples in issues, commits, or this README. Tests use placeholders such as `DOE, JANE (000000)`.
- Optional debug logging is **off** by default. In the page console you can set `ZEROCLICK_DEBUG = true` to log endpoint paths and numeric counts only, never row contents.

## Tests

`node --check 0click.user.js`, and `node test/0click.test.js` for workflow filtering, the last-two-days window, grouping, the matched / no-template split, 4D-phase and first-token consolidation, JSON payload mapping, same-origin GET expansion and pagination, the DOM fallback, the today/yesterday table sections, click-to-locate without page clicks, and the panel being hidden from find-in-page (uses `jsdom` when installed).
