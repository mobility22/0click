# 0click

Tampermonkey userscript **0click** v1.0 for the AutoContour Zero-Click Jobs History page.

The script runs on `http://10.240.61.81:18001/*` (for example `/jobs/history`). It is read-only: it never clicks anything on the page and never changes the page's filters. It re-reads the table after SPA navigation and after table updates (debounced MutationObserver). A Refresh button is also on the panel.

## Install

https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js

In Tampermonkey, choose Install from URL and paste that link, or open it after Tampermonkey is installed. Auto-update uses the same raw URL on `main`.

## What it does

A floating **0click 1.0** panel summarizes the jobs currently shown in the table.

- Only rows whose Workflow contains `ROS` (for example `KP_ROS`) are included.
- Rows are grouped by the Patient cell text.
- For each patient, series are listed in two groups:
  - **Transferred, no matching template**: Template is `-` or empty. Each item shows Series Description, Status, and Date Submitted.
  - **Matched**: Template is not `-` or empty. Each item also shows the template name.
- Counts are shown per patient and as overall totals.

Columns are found by header text, not by fixed index, so a different column order still works. A filter-input row under the headers is ignored. If the table is paginated or virtualized, only the rows currently in the DOM are counted; scroll or change filters yourself if you need a wider view.

The panel lives in a closed shadow root so a Ctrl+F search does not hit the summary (including patient names). It can be collapsed or refreshed from the title bar.

## Safety

- Read-only. It never clicks page controls and never changes Jobs History filters.
- Patient names appear only in the live panel in the browser. The script does not `console.log`, store (`GM_setValue` / `localStorage`), or send row data. Do not put patient names, IDs, or real series examples in issues, commits, or this README. Tests use placeholders such as `DOE, JANE (000000)`.

## Tests

`node --check 0click.user.js`, and `node test/0click.test.js` for ROS filtering, grouping, the matched / no-template split, header-text column mapping, and the panel being hidden from find-in-page (uses `jsdom` when installed).
