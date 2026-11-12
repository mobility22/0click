'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '0click.user.js'), 'utf8');

let failed = 0;
function check(name, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + ' got ' + JSON.stringify(got) + ' expected ' + JSON.stringify(expected));
}

check('script @version 1.4', /@version\s+1\.4\b/.test(src), true);
check('script SCRIPT_VERSION', /const SCRIPT_VERSION = '1\.4'/.test(src), true);
check('script header comment 0click 1.4', /\/\/ 0click 1\.4\b/.test(src), true);
check('script PANEL_TITLE', /const PANEL_TITLE = '0click 1\.4'/.test(src), true);
check('script @run-at document-start', /@run-at\s+document-start/.test(src), true);
check('script @inject-into page', /@inject-into\s+page/.test(src), true);
check('script closed shadow', src.includes("attachShadow({ mode: 'closed' })"), true);
check('script @downloadURL raw main', src.includes('https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js'), true);
check('script @match Zero-Click host', src.includes('@match        http://10.240.61.81:18001/*'), true);
check('PHI-free log: no innerText dump in log()', /log\([^)]*innerText/.test(src), false);
check('no GM_setValue', !src.includes('GM_setValue') && !src.includes('GM_getValue'), true);
check('no localStorage of row data', !/localStorage\.(setItem|getItem)/.test(src), true);
check('debug flag off by default', /const DEBUG = false/.test(src), true);
check('GET only: no POST/PUT/DELETE issued', !/method:\s*['"]POST['"]/.test(src) && !/method:\s*['"]PUT['"]/.test(src) && !/method:\s*['"]DELETE['"]/.test(src), true);

const userscriptHeader = src.split('(function ()')[0];
check('userscript header/metadata has no ROS', /ROS/.test(userscriptHeader), false);
check('ROS workflow filter logic kept', /function isRosWorkflow/.test(src) && /\/ROS\/i/.test(src), true);
const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
check('README has no ROS', /ROS/.test(readme), false);


function loadJsdom() {
  const tries = ['jsdom', '/tmp/jsdom-root/node_modules/jsdom', path.join(__dirname, '../node_modules/jsdom')];
  for (const p of tries) {
    try { return require(p); } catch (e) { /* next */ }
  }
  return null;
}

const jsdom = loadJsdom();
if (!jsdom) {
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('SKIP DOM fixture tests (jsdom not installed)');
  console.log('all tests passed');
  process.exit(0);
}

const { JSDOM } = jsdom;

// Placeholder names only — never use real patient data in tests.
const P1 = 'DOE, JANE (000000)';
const P2 = 'SMITH, JOHN (111111)';
const NOW = new Date(2026, 10, 12, 15, 0, 0); // local 2026-11-12

function jobsTableHtml() {
  // Columns deliberately not in the live-page order, to prove header-text mapping.
  // Dates use the documented 2026-11-12 13:51:51 form, plus one older row to exclude.
  return '<table id="jobs">' +
    '<thead>' +
    '<tr>' +
    '<th>Status</th><th>Template</th><th>Patient</th><th>Workflow</th>' +
    '<th>Series Description</th><th>Date Submitted</th><th>Modality</th>' +
    '</tr>' +
    '<tr class="filters">' +
    '<td><input type="text"></td><td><input type="text"></td><td><input type="text"></td>' +
    '<td><input type="text"></td><td><input type="text"></td><td><input type="text"></td>' +
    '<td><input type="text"></td>' +
    '</tr>' +
    '</thead>' +
    '<tbody>' +
    '<tr><td>Transferred</td><td>-</td><td>' + P1 + '</td><td>KP_ROS</td><td>CT HEAD</td><td>2026-11-12 13:51:51</td><td>CT</td></tr>' +
    '<tr><td>Completed</td><td>Head and Neck</td><td>' + P1 + '</td><td>KP_ROS</td><td>CT NECK</td><td>2026-11-12 11:40:00</td><td>CT</td></tr>' +
    '<tr><td>Transferred</td><td></td><td>' + P1 + '</td><td>KP_ROS</td><td>MR BRAIN</td><td>2026-11-11 09:00:00</td><td>MR</td></tr>' +
    '<tr><td>Completed</td><td>Prostate</td><td>' + P2 + '</td><td>kp_ros</td><td>CT PELVIS</td><td>2026-11-12 12:00:00</td><td>CT</td></tr>' +
    '<tr><td>Transferred</td><td>-</td><td>' + P2 + '</td><td>Other_Workflow</td><td>CT CHEST</td><td>2026-11-12 12:01:00</td><td>CT</td></tr>' +
    '<tr><td>Transferred</td><td>-</td><td>' + P2 + '</td><td>KP_ROS</td><td>MR PELVIS</td><td>2026-11-11 08:02:00</td><td>MR</td></tr>' +
    '<tr><td>Transferred</td><td>-</td><td>' + P2 + '</td><td>KP_ROS</td><td>CT OLD</td><td>2026-11-10 08:00:00</td><td>CT</td></tr>' +
    '</tbody>' +
    '</table>';
}

function loadApi(html) {
  const dom = new JSDOM('<!DOCTYPE html><html><body>' + (html || '') + '</body></html>', {
    url: 'http://10.240.61.81:18001/jobs/history?filterSubmittedDate=11-12',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.ZEROCLICK_TEST = true;
      window.__zclickScrolls = [];
      window.__zclickPageClicks = [];
      const proto = window.HTMLElement.prototype;
      proto.scrollIntoView = function (opts) {
        window.__zclickScrolls.push({ id: this.id || '', opts: opts || null });
      };
    }
  });
  const script = dom.window.document.createElement('script');
  script.textContent = src;
  dom.window.document.body.appendChild(script);
  if (!dom.window.ZEROCLICK_API) throw new Error('ZEROCLICK_API not exported');
  const api = dom.window.ZEROCLICK_API;
  api.setNow(NOW);
  api.resetApiState();
  return { api, document: dom.window.document, window: dom.window };
}

{
  const { api, window } = loadApi(jobsTableHtml());
  check('isRosWorkflow KP_ROS', api.isRosWorkflow('KP_ROS'), true);
  check('isRosWorkflow other', api.isRosWorkflow('Other_Workflow'), false);
  check('isMatchedTemplate name', api.isMatchedTemplate('Head and Neck'), true);
  check('isMatchedTemplate dash', api.isMatchedTemplate('-'), false);
  check('isMatchedTemplate empty', api.isMatchedTemplate(''), false);
  check('isMatchedTemplate whitespace', api.isMatchedTemplate('   '), false);
  check('headerKey by text', api.headerKey('Series Description'), 'series');
  check('parse 2026-11-12 13:51:51', api.formatLocalDate(api.parseSubmittedDate('2026-11-12 13:51:51')), '2026-11-12');
  check('today included', api.isWithinLastTwoLocalDays('2026-11-12 13:51:51', NOW), true);
  check('yesterday included', api.isWithinLastTwoLocalDays('2026-11-11 09:00:00', NOW), true);
  check('two days ago excluded', api.isWithinLastTwoLocalDays('2026-11-10 08:00:00', NOW), false);
  check('unparsable date excluded', api.isWithinLastTwoLocalDays('not-a-date', NOW), false);
  check('range label', api.lastTwoDayRange(NOW).label, '2026-11-11 \u2013 2026-11-12');

  const rows = api.extractRows();
  check('extract skips filter row and keeps 7 data rows', rows.length, 7);

  const summary = api.groupByPatient(rows, NOW);
  check('ROS patient count', summary.patientCount, 2);
  check('ROS series count excludes non-ROS and old dates', summary.seriesCount, 5);
  check('overall matched count', summary.matchedCount, 2);
  check('overall unmatched count', summary.unmatchedCount, 3);
  check('skipped old or unparsed ROS', summary.skippedCount, 1);
  check('first patient name', summary.groups[0].patient, P1);
  check('first patient unmatched count', summary.groups[0].unmatchedCount, 2);
  check('first patient matched count', summary.groups[0].matchedCount, 1);
  check('first unmatched series', summary.groups[0].unmatched.map(r => r.series), ['CT HEAD', 'MR BRAIN']);
  check('first matched template', summary.groups[0].matched.map(r => r.template), ['Head and Neck']);
  check('second patient unmatched series', summary.groups[1].unmatched.map(r => r.series), ['MR PELVIS']);
  check('second patient matched series', summary.groups[1].matched.map(r => r.series), ['CT PELVIS']);

  const logs = [];
  const origLog = window.console.log;
  window.console.log = function () {
    logs.push([...arguments].map(String).join(' '));
    return origLog.apply(this, arguments);
  };
  api.addPanel();
  const host = window.document.getElementById(api.PANEL_ID);
  const light = host ? (host.textContent || host.innerHTML || '') : 'MISSING_PANEL';
  check('panel host light DOM has no patient text', light.indexOf(P1) === -1 && light.indexOf(P2) === -1, true);
  const root = api.panelRoot();
  check('panel uses closed shadow root', !!(root && root.mode === 'closed'), true);
  check('panel title is 0click 1.4', !!(root && root.querySelector('.title') && root.querySelector('.title').textContent === '0click 1.4'), true);
  check('panel has refresh button', !!(root && root.querySelector('.refresh')), true);
  check('panel header has no date-range subtitle', !!(root && !root.querySelector('.range')), true);
  check('panel header has no source line', !!(root && !root.querySelector('.source')), true);
  check('panel header has no long note', !!(root && !root.querySelector('.note')), true);
  const totalsText = root && root.querySelector('.totals') ? root.querySelector('.totals').textContent : '';
  check('panel keeps the stats line', /\d+ patients? \u00b7 \d+ series \u00b7 \d+ matched \u00b7 \d+ unmatched/.test(totalsText), true);
  const bodyText = root && root.querySelector('.body') ? root.querySelector('.body').textContent : '';
  check('panel lists first patient in shadow only', bodyText.indexOf(P1) !== -1, true);
  const grid = root && root.querySelector('table.grid');
  check('panel uses a summary table', !!grid, true);
  const heads = grid ? [...grid.querySelectorAll('thead th')].map(th => th.textContent) : [];
  check('table column Patient', heads[0], 'Patient');
  check('table column Unmatched (N)', /^Unmatched \(\d+\)$/.test(heads[1] || ''), true);
  check('table column Matched', heads[2], 'Matched');
  check('table column Last submitted', heads[3], 'Last submitted');
  check('one table row per patient per day', grid ? grid.querySelectorAll('tbody tr.day-today, tbody tr.day-yesterday').length : 0, 4);
  check('panel lists unmatched heading', /Unmatched \(/.test(bodyText), true);
  check('panel lists matched heading', heads[2] === 'Matched', true);
  check('panel does not list excluded non-ROS series', bodyText.indexOf('CT CHEST') === -1, true);
  check('panel does not list old-date series', bodyText.indexOf('CT OLD') === -1, true);
  const logBlob = logs.join('\n');
  check('console logs do not contain patient names', logBlob.indexOf(P1) === -1 && logBlob.indexOf(P2) === -1, true);
  check('debug disabled by default', api.debugEnabled(), false);

  check('short label keeps short text', api.shortSeriesLabel('CT HEAD'), 'CT HEAD');
  check('short label first 3 words or ~20 chars', api.shortSeriesLabel('Ave-IP(10) Axial 2.0 mm FREE BREATHING'), 'Ave-IP(10) Axial 2.0…');
  const longTok = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  check('short label trims a long token', api.shortSeriesLabel(longTok), 'ABCDEFGHIJKLMNOPQRST…');
  check('first token strips trailing words', api.firstSeriesToken('Ave-IP(10) Axial 2.0 mm'), 'Ave-IP(10)');
  check('phase parse T=90%', api.parsePhasePercent('T=90%,PR=86% -> 93%AR(cm)=1.2'), 90);
  check('phase parse T=0%', api.parsePhasePercent('T=0%,PR=97% -> 10%AR(cm)=1.1'), 0);
  const phaseItems = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(n => ({
    series: 'T=' + n + '%,PR=' + (90 - n) + '% -> ' + (n + 3) + '%AR(cm)=1.0'
  }));
  const phaseLines = api.consolidateUnmatched(phaseItems);
  check('4D phases collapse to one line', phaseLines.length, 1);
  check('4D phases label uses count and range', phaseLines[0].label, '4D phases ×10 (T 0–90%)');
  check('4D phases tooltip lists percents and full fake descriptions', phaseLines[0].title.indexOf('T 0,10,20') !== -1 && phaseLines[0].title.indexOf('T=90%,PR=0%') !== -1, true);
  const mixed = api.consolidateUnmatched([
    { series: 'Ave-IP(10) Axial 2.0 mm A' },
    { series: 'Ave-IP(10) Axial 2.0 mm B' },
    { series: 'MIP(10) 2.0 mm' },
    { series: 'CT HEAD' }
  ].concat(phaseItems));
  check('mixed cell stays within about 3 lines', mixed.length <= 3, true);
  check('mixed cell has a 4D phases line first', mixed[0].label, '4D phases ×10 (T 0–90%)');
  const mixedText = mixed.map(l => l.label).join(' | ');
  check('mixed cell groups Ave-IP with count', mixedText.indexOf('Ave-IP(10) Axial 2.0… ×2') !== -1, true);
  check('mixed cell tooltip keeps full fake descriptions', mixed.some(l => l.title && l.title.indexOf('Ave-IP(10) Axial 2.0 mm A') !== -1 && l.title.indexOf('Ave-IP(10) Axial 2.0 mm B') !== -1), true);
  const tokenOnly = api.consolidateUnmatched([
    { series: 'Ave-IP(10) Axial 2.0 mm A' },
    { series: 'Ave-IP(10) Axial 2.0 mm B' },
    { series: 'CT HEAD' }
  ]);
  check('token groups use ×count for repeats', tokenOnly.some(l => l.label.indexOf('Ave-IP(10) Axial 2.0… ×2') !== -1) && tokenOnly.some(l => l.label.indexOf('CT HEAD') !== -1), true);
  const matched = api.formatMatchedItems([{ template: 'Thorax', series: 'Ave-IP(10) Axial 2.0 mm FREE BREATHING' }]);
  check('matched label is template plus short series', matched[0].label, 'Thorax ← Ave-IP(10) Axial 2.0…');
  const matchedMany = api.formatMatchedItems([
    { template: 'Thorax', series: 'Ave-IP(10) Axial 2.0 mm A' },
    { template: 'Thorax', series: 'Ave-IP(10) Axial 2.0 mm B' },
    { template: 'Thorax', series: 'T=0%,PR=97% -> 10%AR(cm)=1.1' },
    { template: 'Thorax', series: 'T=90%,PR=86% -> 93%AR(cm)=1.2' }
  ]);
  check('matched 4D and tokens stay within 3 lines', matchedMany.length <= 3, true);
  check('matched 4D line includes template', /Thorax ← 4D phases ×2 \(T 0[,–]90%\)/.test(matchedMany[0].label) || matchedMany[0].label.indexOf('Thorax ← 4D phases ×2') !== -1, true);

  const todayHead = grid && grid.querySelector('tr.section-today th');
  const yestHead = grid && grid.querySelector('tr.section-yesterday th');
  check('today section header comes first and includes date', !!(todayHead && todayHead.textContent.indexOf('TODAY (2026-11-12)') === 0 && todayHead.textContent.indexOf('patient') !== -1), true);
  check('yesterday section header includes date', !!(yestHead && yestHead.textContent.indexOf('YESTERDAY (2026-11-11)') === 0), true);
  const todayRows = grid ? [...grid.querySelectorAll('tr.day-today')] : [];
  const yestRows = grid ? [...grid.querySelectorAll('tr.day-yesterday')] : [];
  check('today has one row per patient', todayRows.length, 2);
  check('yesterday has one row per patient', yestRows.length, 2);
  check('patient with jobs on both days appears in both sections', todayRows.filter(r => r.textContent.indexOf(P1) !== -1).length === 1 && yestRows.filter(r => r.textContent.indexOf(P1) !== -1).length === 1, true);
  const p1Today = todayRows.find(r => r.textContent.indexOf(P1) !== -1);
  const p2Today = todayRows.find(r => r.textContent.indexOf(P2) !== -1);
  const p1Yest = yestRows.find(r => r.textContent.indexOf(P1) !== -1);
  const uLines = p1Today ? [...p1Today.querySelectorAll('.cell-line.unmatched')].map(c => c.textContent) : [];
  const mLines = p1Today ? [...p1Today.querySelectorAll('.cell-line.matched')].map(c => c.textContent) : [];
  check('P1 today unmatched is that day only', uLines.join(' | ').indexOf('CT HEAD') !== -1 && uLines.join(' | ').indexOf('MR BRAIN') === -1, true);
  check('P1 yesterday unmatched is that day only', !!(p1Yest && p1Yest.textContent.indexOf('MR BRAIN') !== -1 && p1Yest.textContent.indexOf('CT HEAD') === -1), true);
  check('P1 today matched uses template arrow short series', mLines, ['Head and Neck ← CT NECK']);
  const todayTime = p1Today ? p1Today.querySelector('td.time').textContent.replace(/\s+/g, ' ').trim() : '';
  check('P1 last submitted has Today badge and time', todayTime.indexOf('Today') !== -1 && todayTime.indexOf('13:51:51') !== -1, true);
  check('today rows are not unmatched-only', !!(p1Today && p2Today && !p1Today.classList.contains('alert') && !p2Today.classList.contains('alert')), true);
  check('yesterday unmatched-only rows use alert marker', !!(p1Yest && p1Yest.classList.contains('alert') && p1Yest.querySelector('.alert-mark')), true);
  check('today row uses day-today class', !!(p1Today && p1Today.classList.contains('day-today')), true);
  check('yesterday row uses day-yesterday class', !!(p1Yest && p1Yest.classList.contains('day-yesterday')), true);
  const foot = grid ? [...grid.querySelectorAll('tfoot td')].map(td => td.textContent) : [];
  check('totals row has patient and unmatched counts', foot[0].indexOf('2 patient') !== -1 && foot[1].indexOf('unmatched') !== -1, true);
  check('panel is anchored bottom-right', host && host.style.bottom === '16px' && host.style.right === '16px' && (!host.style.top || host.style.top === 'auto'), true);

  // Clickable name: first/topmost page row for P1 is CT HEAD
  const pageDoc = window.document;
  pageDoc.querySelectorAll('#jobs tbody tr').forEach((row, i) => {
    row.id = 'job-row-' + i;
    row.addEventListener('click', () => { window.__zclickPageClicks.push(row.id); });
  });
  const firstJob = pageDoc.querySelector('#jobs tbody tr');
  const matchedJob = pageDoc.querySelector('#job-row-1');
  const links = [...root.querySelectorAll('button.patient-link')];
  check('each patient name is a button', links.length, 4);
  links[0].click();
  check('locate prefers the first matched series row', window.__zclickScrolls[0] && window.__zclickScrolls[0].id, matchedJob && matchedJob.id);
  check('locate does not use the unmatched row first', window.__zclickScrolls[0] && window.__zclickScrolls[0].id !== (firstJob && firstJob.id), true);
  check('locate scroll uses block center', !!(window.__zclickScrolls[0] && window.__zclickScrolls[0].opts && window.__zclickScrolls[0].opts.block === 'center'), true);
  const outline = matchedJob ? String(matchedJob.style.outline || '') : '';
  const bg = matchedJob ? String(matchedJob.style.backgroundColor || '') : '';
  check('located row is highlighted', /3px/.test(outline) && (outline.indexOf('1565c0') !== -1 || /rgb\( *21, *101, *192 *\)/.test(outline) || /rgb\( *255, *245, *157 *\)/.test(bg) || bg.indexOf('fff59d') !== -1 || bg.length > 0), true);
  check('locate does not click the page row', window.__zclickPageClicks.length, 0);
  check('locate note hidden when row is found', (root.querySelector('.locate-note') || {}).textContent || '', '');

  const yesterdayP1 = { patient: P1, matched: [], unmatched: [{ series: 'MR BRAIN', submitted: '2026-11-11 09:00:00' }] };
  window.__zclickScrolls = [];
  const yestOk = api.locatePatient(yesterdayP1);
  const yestRow = pageDoc.querySelector('#job-row-2');
  check('unmatched-only locate uses the first series row', !!(yestOk && window.__zclickScrolls[0] && window.__zclickScrolls[0].id === (yestRow && yestRow.id)), true);

  const missingGroup = { patient: 'BROWN, PAT (222222)', matched: [], unmatched: [{ series: 'CT OTHER', submitted: '2026-11-12 10:00:00' }] };
  const missingOk = api.locatePatient(missingGroup);
  check('missing page row returns false', missingOk, false);
  check('missing page row shows not-on-page note', (root.querySelector('.locate-note') || {}).textContent, 'not on this page');
  check('missing locate does not log the name', logs.join('\n').indexOf('BROWN, PAT') === -1, true);

  window.console.log = origLog;
}

{
  const html = '<table id="only">' +
    '<thead><tr><th>Patient</th><th>Workflow</th><th>Template</th><th>Series Description</th><th>Date Submitted</th></tr></thead>' +
    '<tbody><tr><td>' + P1 + '</td><td>KP_ROS</td><td>-</td><td>CT HEAD</td><td>2026-11-12 13:51:51</td></tr></tbody></table>';
  const { api } = loadApi(html);
  const summary = api.groupByPatient(api.extractRows(), NOW);
  check('unmatched-only patient count', summary.groups[0] && summary.groups[0].matchedCount, 0);
  api.addPanel();
  const root = api.panelRoot();
  const row = root && root.querySelector('table.grid tbody tr.alert');
  check('unmatched-only row is highlighted', !!(row && row.classList.contains('alert') && row.querySelector('.alert-mark')), true);
  check('unmatched-only table still one row per patient', root ? root.querySelectorAll('table.grid tr.day-today, table.grid tr.day-yesterday').length : 0, 1);
}

{
  const grid = '<div role="grid" id="grid">' +
    '<div role="row">' +
    '<div role="columnheader">Patient</div>' +
    '<div role="columnheader">Series Description</div>' +
    '<div role="columnheader">Workflow</div>' +
    '<div role="columnheader">Template</div>' +
    '<div role="columnheader">Status</div>' +
    '<div role="columnheader">Date Submitted</div>' +
    '</div>' +
    '<div role="row">' +
    '<div role="gridcell"><input type="text"></div>' +
    '<div role="gridcell"><input type="text"></div>' +
    '<div role="gridcell"><input type="text"></div>' +
    '<div role="gridcell"><input type="text"></div>' +
    '<div role="gridcell"><input type="text"></div>' +
    '<div role="gridcell"><input type="text"></div>' +
    '</div>' +
    '<div role="row">' +
    '<div role="gridcell">' + P1 + '</div>' +
    '<div role="gridcell">CT HEAD</div>' +
    '<div role="gridcell">KP_ROS</div>' +
    '<div role="gridcell">-</div>' +
    '<div role="gridcell">Transferred</div>' +
    '<div role="gridcell">2026-11-12 13:51:51</div>' +
    '</div>' +
    '</div>';
  const { api } = loadApi(grid);
  const rows = api.extractRows();
  check('role=grid extracts one data row', rows.length, 1);
  const summary = api.groupByPatient(rows, NOW);
  check('role=grid unmatched ROS series', summary.unmatchedCount, 1);
  check('role=grid matched ROS series', summary.matchedCount, 0);
}

{
  const { api } = loadApi('');
  const payload = {
    totalElements: 2,
    data: {
      content: [
        {
          Patient: P1,
          Workflow: 'KP_ROS',
          Template: '-',
          'Series Description': 'CT HEAD',
          Status: 'Transferred',
          'Date Submitted': '2026-11-12 13:51:51'
        },
        {
          patientName: P2,
          workflowName: 'KP_ROS',
          templateName: 'Prostate',
          seriesDescription: 'CT PELVIS',
          status: 'Completed',
          dateSubmitted: '2026-11-10 08:00:00'
        }
      ]
    }
  };
  const mapped = api.rowsFromPayload(payload);
  check('JSON nested content mapped row count', mapped.length, 2);
  check('JSON maps Patient / Date Submitted', mapped[0].patient === P1 && mapped[0].submitted === '2026-11-12 13:51:51' && mapped[0].template === '-', true);
  check('JSON maps camelCase fields', mapped[1].patient === P2 && mapped[1].template === 'Prostate' && mapped[1].series === 'CT PELVIS', true);
  const summary = api.groupByPatient(mapped, NOW);
  check('JSON date window drops old ROS row', summary.seriesCount, 1);
  check('JSON date window keeps today unmatched', summary.unmatchedCount, 1);
}

{
  const { api } = loadApi('');
  check('allow same-origin GET', api.isAllowedGet('http://10.240.61.81:18001/api/jobs?page=1', 'GET'), true);
  check('reject POST even if same origin', api.isAllowedGet('http://10.240.61.81:18001/api/jobs', 'POST'), false);
  check('reject PUT', api.isAllowedGet('http://10.240.61.81:18001/api/jobs', 'PUT'), false);
  check('reject DELETE', api.isAllowedGet('http://10.240.61.81:18001/api/jobs', 'DELETE'), false);
  check('reject other origin GET', api.isAllowedGet('http://example.com/api/jobs', 'GET'), false);

  const single = api.buildExpandedUrls('http://10.240.61.81:18001/api/jobs?filterSubmittedDate=11-12&page=1&pageSize=20', NOW);
  check('single date param expands to two URLs', single.length, 2);
  check('expanded page size is large', single.every(u => u.indexOf('pageSize=500') !== -1), true);
  check('expanded pages start at 1', single.every(u => /[?&]page=1(?:&|$)/.test(u)), true);
  check('today requested as MM-DD', single.some(u => u.indexOf('filterSubmittedDate=11-12') !== -1), true);
  check('yesterday requested as MM-DD', single.some(u => u.indexOf('filterSubmittedDate=11-11') !== -1), true);
  check('expanded URL path only jobs api', single.every(u => api.safePath(u) === '/api/jobs'), true);

  const ranged = api.buildExpandedUrls('http://10.240.61.81:18001/api/jobs?from=2026-01-01&to=2026-01-02&limit=25', NOW);
  check('from/to expands to one URL', ranged.length, 1);
  check('from/to uses last two local days', ranged[0].indexOf('from=2026-11-11') !== -1 && ranged[0].indexOf('to=2026-11-12') !== -1, true);

  const bare = api.buildExpandedUrls('http://10.240.61.81:18001/api/jobs', NOW);
  check('no date param still same-origin GET with large page size', bare.length === 1 && bare[0].indexOf('pageSize=500') !== -1, true);
}

{
  const { api, window } = loadApi('<table><thead><tr><th>Patient</th><th>Workflow</th><th>Template</th><th>Series Description</th><th>Date Submitted</th></tr></thead><tbody><tr><td>' + P1 + '</td><td>KP_ROS</td><td>-</td><td>VISIBLE ONLY</td><td>2026-11-12 13:51:51</td></tr></tbody></table>');
  const page1 = {
    total: 2,
    items: [{
      patient: P1,
      workflow: 'KP_ROS',
      template: '-',
      seriesDescription: 'CT HEAD',
      status: 'Transferred',
      dateSubmitted: '2026-11-12 13:51:51'
    }]
  };
  const page2 = {
    total: 2,
    items: [{
      patient: P2,
      workflow: 'KP_ROS',
      template: 'Prostate',
      seriesDescription: 'MR PELVIS',
      status: 'Transferred',
      dateSubmitted: '2026-11-11 08:02:00'
    }]
  };
  const calls = [];
  const getJson = href => {
    calls.push({ method: 'GET', href: String(href) });
    const u = new URL(href, 'http://10.240.61.81:18001/');
    if (u.searchParams.get('page') === '2') return Promise.resolve(page2);
    return Promise.resolve(page1);
  };
  Promise.resolve(api.fetchExpanded('http://10.240.61.81:18001/api/jobs?page=1&pageSize=20', NOW, getJson)).then(rows => {
    check('expanded fetch used only GET', calls.every(c => c.method === 'GET') && calls.length >= 2, true);
    check('expanded fetch stays same origin', calls.every(c => c.href.indexOf('http://10.240.61.81:18001/') === 0), true);
    check('expanded fetch paginated row count', rows.length, 2);
    api.setApiRowsForTest(rows, '/api/jobs');
    const info = api.getRowsAndSource();
    check('prefers API rows over visible table', info.source === 'api' && info.rows.length === 2, true);
    check('API source ignores visible-only DOM series', info.rows.every(r => r.series !== 'VISIBLE ONLY'), true);
    const summary = api.groupByPatient(info.rows, NOW);
    check('API summary includes both days', summary.seriesCount, 2);
    api.addPanel();
    const root = api.panelRoot();
    const totalsEl = root && root.querySelector('.totals');
    const srcTip = totalsEl ? String(totalsEl.title || '') : '';
    check('panel source tooltip shows GET path', srcTip.indexOf('GET /api/jobs') !== -1, true);
    check('API panel has no source line in the header', !!(root && !root.querySelector('.source')), true);
    const bodyText = root && root.querySelector('.body') ? root.querySelector('.body').textContent : '';
    check('API panel lists both placeholder patients', bodyText.indexOf(P1) !== -1 && bodyText.indexOf(P2) !== -1, true);
    check('API panel does not use visible-only DOM series', bodyText.indexOf('VISIBLE ONLY') === -1, true);

    const logs = [];
    const origLog = window.console.log;
    window.ZEROCLICK_DEBUG = true;
    window.console.log = function () {
      logs.push([...arguments].map(String).join(' '));
      return origLog.apply(this, arguments);
    };
    api.considerResponse('http://10.240.61.81:18001/api/jobs?page=1', page1, false);
    window.console.log = origLog;
    window.ZEROCLICK_DEBUG = false;
    const blob = logs.join('\n');
    check('debug log includes endpoint path and counts', /\/api\/jobs/.test(blob) && /rows=/.test(blob), true);
    check('debug log has no patient names', blob.indexOf(P1) === -1 && blob.indexOf(P2) === -1, true);
    finish();
  }).catch(err => {
    check('expanded fetch threw', String(err && err.message || err), 'no throw');
    finish();
  });
}

function finish() {
  if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log('all tests passed');
}
