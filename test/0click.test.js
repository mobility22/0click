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

check('script @version 1.16', /@version\s+1\.16\b/.test(src), true);
check('script SCRIPT_VERSION', /const SCRIPT_VERSION = '1\.16'/.test(src), true);
check('script header comment 0click 1.16', /\/\/ 0click 1\.16\b/.test(src), true);
check('script PANEL_TITLE', /const PANEL_TITLE = '0click 1\.16'/.test(src), true);
check('script has no ID copied toast text', src.indexOf('ID copied') === -1, true);
check('script has no whole-row has-error class', src.indexOf('has-error') === -1, true);
check('script @run-at document-start', /@run-at\s+document-start/.test(src), true);
check('script @inject-into page', /@inject-into\s+page/.test(src), true);
check('script @grant GM_setClipboard', /@grant\s+GM_setClipboard/.test(src), true);
check('script keeps @grant unsafeWindow', /@grant\s+unsafeWindow/.test(src), true);
check('script @grant GM_xmlhttpRequest', /@grant\s+GM_xmlhttpRequest/.test(src), true);
check('script @grant GM_registerMenuCommand', /@grant\s+GM_registerMenuCommand/.test(src), true);
check('script @grant GM_setValue', /@grant\s+GM_setValue/.test(src), true);
check('script @grant GM_getValue', /@grant\s+GM_getValue/.test(src), true);
check('script @connect uses bare domains plus * fallback', src.indexOf('@connect      powerplatform.com') !== -1 && src.indexOf('@connect      api.powerplatform.com') !== -1 && src.indexOf('@connect      environment.api.powerplatform.com') !== -1 && src.indexOf('@connect      logic.azure.com') !== -1 && src.indexOf('@connect      webhook.office.com') !== -1 && /@connect\s+\*/.test(src) && src.indexOf('*.logic.azure.com') === -1 && src.indexOf('*.powerplatform.com') === -1 && src.indexOf('*.webhook.office.com') === -1, true);
check('script @connect * is last', src.lastIndexOf('@connect      *') > src.lastIndexOf('@connect      webhook.office.com'), true);
check('script closed shadow', src.includes("attachShadow({ mode: 'closed' })"), true);
check('script @downloadURL raw main', src.includes('https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js'), true);
check('script @match Zero-Click host', src.includes('@match        http://10.240.61.81:18001/*'), true);
check('PHI-free log: no innerText dump in log()', /log\([^)]*innerText/.test(src), false);
check('GM_setValue is only used for teamsWebhook', /GM_setValue\(\s*TEAMS_WEBHOOK_KEY/.test(src) && /GM_getValue\(\s*TEAMS_WEBHOOK_KEY/.test(src) && /const TEAMS_WEBHOOK_KEY = 'teamsWebhook'/.test(src) && !/GM_setValue\(\s*['"](?!teamsWebhook)/.test(src), true);
check('no localStorage of row data', !/localStorage\.(setItem|getItem)/.test(src), true);
check('debug flag off by default', /const DEBUG = false/.test(src), true);
check('jobs/page requests stay GET only', /method:\s*'GET'/.test(src) && !/method:\s*['"]PUT['"]/.test(src) && !/method:\s*['"]DELETE['"]/.test(src), true);
check('POST is only used for the Teams webhook', (src.match(/method:\s*['"]POST['"]/g) || []).length === 1 && /function sendTeams/.test(src), true);
check('no hardcoded Teams webhook URL', !/https:\/\/[^\s'"]*(logic\.azure\.com|webhook\.office\.com|powerplatform\.com)/.test(src), true);
check('Teams test message has no patient data', /const TEAMS_TEST_MESSAGE = '0click test OK'/.test(src), true);
check('no automatic Teams send', (src.match(/sendTeams\(/g) || []).length === 2 && src.indexOf('sendTeams(TEAMS_TEST_MESSAGE)') !== -1 && src.indexOf('sendTeams(text)') !== -1, true);

const userscriptHeader = src.split('(function ()')[0];
check('userscript header/metadata has no ROS', /ROS/.test(userscriptHeader), false);
check('ROS workflow filter logic kept', /function isRosWorkflow/.test(src) && /\/ROS\/i/.test(src), true);
const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
check('README has no ROS', /ROS/.test(readme), false);


function loadJsdom() {
  const tries = ['jsdom', '/tmp/jsdom-root/node_modules/jsdom', '/tmp/0click-test-deps/node_modules/jsdom', path.join(__dirname, '../node_modules/jsdom')];
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
const P1_NAME = 'DOE, JANE';
const P2 = 'SMITH, JOHN (111111)';
const P2_NAME = 'SMITH, JOHN';
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
      window.__zclickClipboard = [];
      window.GM_setClipboard = function (data) {
        window.__zclickClipboard.push({ via: 'gm', data: String(data == null ? '' : data) });
      };
      window.__zclickGmValues = {};
      window.__zclickGmRequests = [];
      window.__zclickMenu = [];
      window.GM_getValue = function (key, def) {
        return Object.prototype.hasOwnProperty.call(window.__zclickGmValues, key)
          ? window.__zclickGmValues[key]
          : def;
      };
      window.GM_setValue = function (key, val) {
        window.__zclickGmValues[key] = val;
      };
      window.GM_xmlhttpRequest = function (opts) {
        window.__zclickGmRequests.push(opts);
        const mode = window.__zclickGmMode || (window.__zclickGmError ? 'error' : 'load');
        if (mode === 'timeout') {
          if (typeof opts.ontimeout === 'function') opts.ontimeout();
          return;
        }
        if (mode === 'error') {
          const err = window.__zclickGmErrorRes || { status: window.__zclickGmStatus != null ? window.__zclickGmStatus : 0 };
          if (typeof opts.onerror === 'function') opts.onerror(err);
          return;
        }
        const status = window.__zclickGmStatus != null ? window.__zclickGmStatus : 202;
        if (typeof opts.onload === 'function') opts.onload({ status: status });
      };
      window.GM_registerMenuCommand = function (title, fn) {
        window.__zclickMenu.push({ title: String(title), fn: fn });
      };
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
  check('extract ID from LAST, FIRST (ID)', api.extractPatientId('DOE, JANE (000000)'), '000000');
  check('extract ID uses last parentheses', api.extractPatientId('DOE (NICK), JANE (AB-12_3$)'), 'AB-12_3$');
  check('extract ID trims inside parens', api.extractPatientId('DOE, JANE (  FAKE-1_2$  )'), 'FAKE-1_2$');
  check('extract ID rejects missing parens', api.extractPatientId('DOE, JANE'), '');
  check('extract ID rejects invalid characters', api.extractPatientId('DOE, JANE (00 00!)'), '');
  check('extract ID rejects empty parens', api.extractPatientId('DOE, JANE (   )'), '');
  check('display name strips trailing ID', api.displayPatientName('DOE, JANE (000000)'), 'DOE, JANE');
  check('display name keeps earlier nickname parens', api.displayPatientName('DOE (NICK), JANE (AB-12_3$)'), 'DOE (NICK), JANE');
  check('display name trims around ID', api.displayPatientName('DOE, JANE (  FAKE-1_2$  )'), 'DOE, JANE');
  check('display name without parens is unchanged', api.displayPatientName('DOE, JANE'), 'DOE, JANE');
  check('display name keeps invalid trailing parens', api.displayPatientName('DOE, JANE (00 00!)'), 'DOE, JANE (00 00!)');
  check('display name keeps empty parens', api.displayPatientName('DOE, JANE (   )'), 'DOE, JANE (   )');

  check('isRosWorkflow other', api.isRosWorkflow('Other_Workflow'), false);
  check('isMatchedTemplate name', api.isMatchedTemplate('Head and Neck'), true);
  check('isMatchedTemplate dash', api.isMatchedTemplate('-'), false);
  check('isMatchedTemplate empty', api.isMatchedTemplate(''), false);
  check('isMatchedTemplate whitespace', api.isMatchedTemplate('   '), false);
  check('Completed is not a problem status', api.isProblemStatus('Completed'), false);
  check('Transferred is not a problem status', api.isProblemStatus('Transferred'), false);
  check('empty status is not a problem', api.isProblemStatus(''), false);
  check('Error is a problem status', api.isProblemStatus('Error'), true);
  check('Failed is a problem status', api.isProblemStatus('failed'), true);
  check('Cancelled is a problem status', api.isProblemStatus('Cancelled'), true);
  check('Timeout is a problem status', api.isProblemStatus('Timeout'), true);
  check('status containing fail is a problem', api.isProblemStatus('Job Failed'), true);
  check('status containing error is a problem', api.isProblemStatus('ERROR: timeout'), true);

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
  const sameName = api.groupByPatient([
    { patient: 'DOE, JANE (000000)', workflow: 'KP_ROS', template: '-', series: 'CT A', submitted: '2026-11-12 10:00:00' },
    { patient: 'DOE, JANE (111111)', workflow: 'KP_ROS', template: '-', series: 'CT B', submitted: '2026-11-12 11:00:00' }
  ], NOW);
  check('same display name different IDs stay two groups', sameName.patientCount, 2);
  check('groups keep the full original patient strings', sameName.groups.map(g => g.patient), ['DOE, JANE (000000)', 'DOE, JANE (111111)']);

  const logs = [];
  const origLog = window.console.log;
  window.console.log = function () {
    logs.push([...arguments].map(String).join(' '));
    return origLog.apply(this, arguments);
  };
  api.addPanel();
  const host = window.document.getElementById(api.PANEL_ID);
  const light = host ? (host.textContent || host.innerHTML || '') : 'MISSING_PANEL';
  check('panel host light DOM has no patient text', light.indexOf(P1_NAME) === -1 && light.indexOf(P2_NAME) === -1 && light.indexOf(P1) === -1 && light.indexOf(P2) === -1, true);
  const root = api.panelRoot();
  check('panel uses closed shadow root', !!(root && root.mode === 'closed'), true);
  check('panel title is 0click 1.16', !!(root && root.querySelector('.title') && root.querySelector('.title').textContent === '0click 1.16'), true);
  check('panel has refresh button', !!(root && root.querySelector('.refresh')), true);
  check('panel header has no date-range subtitle', !!(root && !root.querySelector('.range')), true);
  check('panel header has no source line', !!(root && !root.querySelector('.source')), true);
  check('panel header has no long note', !!(root && !root.querySelector('.note')), true);
  const totalsEls = root ? [...root.querySelectorAll('.totals')] : [];
  const totalsText = totalsEls[0] ? totalsEls[0].textContent : '';
  check('panel has a single top stats line', totalsEls.length, 1);
  check('top stats line is today only', totalsText, '2 patients \u00b7 3 series \u00b7 2 matched \u00b7 1 unmatched');
  check('default stats line has no error count', totalsText.indexOf('error') === -1 && !root.querySelector('.error-count'), true);
  const bodyText = root && root.querySelector('.body') ? root.querySelector('.body').textContent : '';
  check('panel lists first patient name in shadow only', bodyText.indexOf(P1_NAME) !== -1, true);
  check('panel does not show patient IDs', bodyText.indexOf('000000') === -1 && bodyText.indexOf('111111') === -1 && bodyText.indexOf(P1) === -1 && bodyText.indexOf(P2) === -1, true);
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

  const todayHead = grid && grid.querySelector('tr.section-today, tr.section-yesterday, th.section-head');
  check('section header rows are removed', !todayHead, true);
  const tbodyText = grid && grid.querySelector('tbody') ? grid.querySelector('tbody').textContent : '';
  check('table body has no TODAY/YESTERDAY header text', !!(tbodyText && tbodyText.indexOf('TODAY') === -1 && tbodyText.indexOf('YESTERDAY') === -1), true);
  const todayRows = grid ? [...grid.querySelectorAll('tr.day-today')] : [];
  const yestRows = grid ? [...grid.querySelectorAll('tr.day-yesterday')] : [];
  const dayRows = grid ? [...grid.querySelectorAll('tbody tr.day-today, tbody tr.day-yesterday')] : [];
  check('today rows are listed before yesterday rows', !!(dayRows.length === 4 && dayRows[0].classList.contains('day-today') && dayRows[1].classList.contains('day-today') && dayRows[2].classList.contains('day-yesterday') && dayRows[3].classList.contains('day-yesterday')), true);
  check('optional divider is on the first yesterday row only', !!(yestRows[0] && yestRows[0].classList.contains('day-split') && !yestRows[1].classList.contains('day-split') && todayRows.every(r => !r.classList.contains('day-split'))), true);
  check('today has one row per patient', todayRows.length, 2);
  check('yesterday has one row per patient', yestRows.length, 2);
  check('patient with jobs on both days appears in both sections', todayRows.filter(r => r.textContent.indexOf(P1_NAME) !== -1).length === 1 && yestRows.filter(r => r.textContent.indexOf(P1_NAME) !== -1).length === 1, true);
  const p1Today = todayRows.find(r => r.textContent.indexOf(P1_NAME) !== -1);
  const p2Today = todayRows.find(r => r.textContent.indexOf(P2_NAME) !== -1);
  const p1Yest = yestRows.find(r => r.textContent.indexOf(P1_NAME) !== -1);
  const uLines = p1Today ? [...p1Today.querySelectorAll('.cell-line.unmatched')].map(c => c.textContent) : [];
  const mLines = p1Today ? [...p1Today.querySelectorAll('.cell-line.matched')].map(c => c.textContent) : [];
  check('P1 today unmatched is that day only', uLines.join(' | ').indexOf('CT HEAD') !== -1 && uLines.join(' | ').indexOf('MR BRAIN') === -1, true);
  check('P1 yesterday unmatched is that day only', !!(p1Yest && p1Yest.textContent.indexOf('MR BRAIN') !== -1 && p1Yest.textContent.indexOf('CT HEAD') === -1), true);
  check('P1 today matched uses template arrow short series', mLines, ['Head and Neck ← CT NECK']);
  const todayTime = p1Today ? p1Today.querySelector('td.time').textContent.replace(/\s+/g, ' ').trim() : '';
  check('P1 last submitted shows only the time', todayTime, '13:51:51');
  check('last submitted has no day badge', !p1Today.querySelector('.badge') && todayTime.indexOf('Today') === -1 && todayTime.indexOf('Yest.') === -1, true);
  check('today rows are not unmatched-only', !!(p1Today && p2Today && !p1Today.classList.contains('alert') && !p2Today.classList.contains('alert')), true);
  check('yesterday unmatched-only rows use alert marker', !!(p1Yest && p1Yest.classList.contains('alert') && p1Yest.querySelector('.alert-mark')), true);
  const panelCss = (root.querySelector('style') || {}).textContent || '';
  check('alert CSS uses whole-row amber tint and orange border', panelCss.indexOf('#ffe0b2') !== -1 && panelCss.indexOf('#e65100') !== -1 && /tr\.alert td/.test(panelCss), true);
  check('default yesterday unmatched-only is not an error row', !!(p1Yest && !p1Yest.classList.contains('has-error')), true);
  check('today row uses day-today class', !!(p1Today && p1Today.classList.contains('day-today')), true);
  check('yesterday row uses day-yesterday class', !!(p1Yest && p1Yest.classList.contains('day-yesterday')), true);
  const foot = grid ? [...grid.querySelectorAll('tfoot td')].map(td => td.textContent.trim()) : [];
  check('footer shows yesterday patient unmatched and matched counts', foot, ['2 patients', '2 unmatched', '0 matched', '']);
  check('footer has no combined or today tally', foot.join(' ').indexOf('3 series') === -1 && foot.join(' ').indexOf('5 series') === -1 && foot.join(' ').indexOf('3 unmatched') === -1, true);
  check('footer has no yesterday section header', !!(grid && grid.querySelector('tfoot') && grid.querySelector('tfoot').textContent.indexOf('YESTERDAY') === -1 && grid.querySelector('tfoot').textContent.indexOf('TODAY') === -1), true);
  check('panel is anchored bottom-right', host && host.style.bottom === '16px' && host.style.right === '16px' && (!host.style.top || host.style.top === 'auto'), true);
  check('panel width stays 800px at the bottom-right', !!(host && host.style.width === '800px' && host.style.minWidth === '600px'), true);
  check('panel height is auto with no min-height', !!(host && (host.style.height === 'auto' || host.style.height === '') && (!host.style.minHeight || host.style.minHeight === '0px' || host.style.minHeight === 'auto' || host.style.minHeight === '')), true);
  check('panel max-height caps the shrink-wrap', !!(/600px/.test(host.style.maxHeight) && /85vh/.test(host.style.maxHeight)), true);
  check('resize handle does not force height', host && host.style.resize, 'horizontal');
  check('script has no fixed or min panel height', src.indexOf('height:600px') === -1 && src.indexOf('min-height:210px') === -1 && src.indexOf('openHeight') === -1, true);
  check('body flex does not fill leftover space', /\.body \{[^}]*flex: 0 1 auto/.test(panelCss) && !/\.body \{[^}]*flex: 1 1 auto/.test(panelCss), true);
  check('wrap shrink-wraps instead of filling 100% height', /\.wrap \{[^}]*height: auto/.test(panelCss) && !/(?<![-\w])height: 100%/.test(panelCss), true);

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
  check('patient buttons show name only', links.map(b => b.textContent), [P1_NAME, P2_NAME, P1_NAME, P2_NAME]);
  check('patient button titles are the name without IDs', links.map(b => b.title), [P1_NAME, P2_NAME, P1_NAME, P2_NAME]);
  check('patient cells and titles do not include IDs', links.every(b => b.textContent.indexOf('(') === -1 && b.title.indexOf('000000') === -1 && b.title.indexOf('111111') === -1 && b.title.indexOf('(') === -1), true);
  check('patient column CSS is narrow with ellipsis', panelCss.indexOf('th.patient-col') !== -1 && panelCss.indexOf('max-width: 10.5em') !== -1 && panelCss.indexOf('text-overflow: ellipsis') !== -1 && /td\.patient-cell/.test(panelCss), true);
  check('base font is 14px', panelCss.indexOf('font: 14px/1.35 sans-serif') !== -1, true);
  check('title font is 18px', panelCss.indexOf('font-size: 18px') !== -1, true);
  check('stats line font is 14px', /\.totals \{[^}]*font-size: 14px/.test(panelCss), true);
  check('cell lines use 13px', /\.cell-line \{ font-size: 13px/.test(panelCss), true);
  check('status chips use 12px', /\.status-chip \{[^}]*font-size: 12px/.test(panelCss), true);
  check('table body still scrolls inside the panel', /\.body \{[^}]*overflow: auto/.test(panelCss), true);
  links[0].click();
  check('locate prefers the first matched series row', window.__zclickScrolls[0] && window.__zclickScrolls[0].id, matchedJob && matchedJob.id);
  check('locate does not use the unmatched row first', window.__zclickScrolls[0] && window.__zclickScrolls[0].id !== (firstJob && firstJob.id), true);
  check('locate scroll uses block center', !!(window.__zclickScrolls[0] && window.__zclickScrolls[0].opts && window.__zclickScrolls[0].opts.block === 'center'), true);
  const outline = matchedJob ? String(matchedJob.style.outline || '') : '';
  const bg = matchedJob ? String(matchedJob.style.backgroundColor || '') : '';
  check('located row is highlighted', /3px/.test(outline) && (outline.indexOf('1565c0') !== -1 || /rgb\( *21, *101, *192 *\)/.test(outline) || /rgb\( *255, *245, *157 *\)/.test(bg) || bg.indexOf('fff59d') !== -1 || bg.length > 0), true);
  check('locate does not click the page row', window.__zclickPageClicks.length, 0);
  const copiedNote = (root.querySelector('.locate-note') || {}).textContent || '';
  check('click copies ID via GM_setClipboard', window.__zclickClipboard.map(x => x.via + ':' + x.data), ['gm:000000']);
  check('click does not show an ID copied note', copiedNote, '');
  check('click note does not display the ID', copiedNote.indexOf('000000') === -1, true);
  check('click does not log the ID', logs.join('\n').indexOf('000000') === -1, true);

  const yesterdayP1 = { patient: P1, matched: [], unmatched: [{ series: 'MR BRAIN', submitted: '2026-11-11 09:00:00' }] };
  window.__zclickScrolls = [];
  const yestOk = api.locatePatient(yesterdayP1);
  const yestRow = pageDoc.querySelector('#job-row-2');
  check('unmatched-only locate uses the first series row', !!(yestOk && window.__zclickScrolls[0] && window.__zclickScrolls[0].id === (yestRow && yestRow.id)), true);

  const missingGroup = { patient: 'BROWN, PAT (222222)', matched: [], unmatched: [{ series: 'CT OTHER', submitted: '2026-11-12 10:00:00' }] };
  const missingOk = api.locatePatient(missingGroup);
  const missingNote = (root.querySelector('.locate-note') || {}).textContent || '';
  check('missing page row returns false', missingOk, false);
  check('missing page row shows not-on-page note', missingNote, 'not on this page');
  check('missing page row also copies ID', window.__zclickClipboard.map(x => x.via + ':' + x.data).indexOf('gm:222222') !== -1, true);
  check('missing locate note has no ID copied text', missingNote.indexOf('ID copied') === -1, true);
  check('missing locate note does not display the ID', missingNote.indexOf('222222') === -1, true);
  check('missing locate does not log the name', logs.join('\n').indexOf('BROWN, PAT') === -1, true);
  check('missing locate does not log the ID', logs.join('\n').indexOf('222222') === -1, true);

  window.console.log = origLog;
}

{
  // Fake values only: a patient cell with no ID in parentheses.
  const { api, window } = loadApi(
    '<table id="noid">' +
    '<thead><tr><th>Patient</th><th>Workflow</th><th>Template</th><th>Series Description</th><th>Date Submitted</th></tr></thead>' +
    '<tbody><tr id="noid-row"><td>DOE, JANE</td><td>KP_ROS</td><td>-</td><td>CT HEAD</td><td>2026-11-12 13:51:51</td></tr></tbody></table>'
  );
  api.addPanel();
  const root = api.panelRoot();
  window.__zclickClipboard = [];
  const link = root && root.querySelector('button.patient-link');
  if (link) link.click();
  const note = ((root && root.querySelector('.locate-note')) || {}).textContent || '';
  check('missing ID copies nothing', window.__zclickClipboard.length, 0);
  check('missing ID shows ID not found', note, 'ID not found');
  check('missing ID note has no patient text', note.indexOf('DOE') === -1 && note.indexOf('JANE') === -1, true);
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
  check('unmatched-only row is not an error row', !!(row && !row.classList.contains('has-error')), true);
  check('unmatched-only table still one row per patient', root ? root.querySelectorAll('table.grid tr.day-today, table.grid tr.day-yesterday').length : 0, 1);
}

{
  // Fake statuses and placeholder names only.
  const P_ERR = 'ROE, ANN (333333)';
  const P_ERR_NAME = 'ROE, ANN';
  const P_ONLY = 'LEE, FAKE (444444)';
  const P_ONLY_NAME = 'LEE, FAKE';
  const html = '<table id="errs">' +
    '<thead><tr><th>Status</th><th>Template</th><th>Patient</th><th>Workflow</th><th>Series Description</th><th>Date Submitted</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>Error</td><td>-</td><td>' + P_ERR + '</td><td>KP_ROS</td><td>CT HEAD</td><td>2026-11-12 10:00:00</td></tr>' +
    '<tr><td>Completed</td><td>Head and Neck</td><td>' + P_ERR + '</td><td>KP_ROS</td><td>CT NECK</td><td>2026-11-12 10:05:00</td></tr>' +
    '<tr><td>Transferred</td><td>-</td><td>' + P_ERR + '</td><td>KP_ROS</td><td>CT OTHER</td><td>2026-11-12 12:00:00</td></tr>' +
    '<tr><td>Failed</td><td>-</td><td>' + P_ONLY + '</td><td>KP_ROS</td><td>CT FAIL</td><td>2026-11-12 11:00:00</td></tr>' +
    '<tr><td>Cancelled</td><td>Thorax</td><td>' + P_ERR + '</td><td>KP_ROS</td><td>CT ABDOMEN</td><td>2026-11-11 09:00:00</td></tr>' +
    '<tr><td>Timeout</td><td>-</td><td>' + P_ONLY + '</td><td>KP_ROS</td><td>CT TO</td><td>2026-11-11 08:00:00</td></tr>' +
    '</tbody></table>';
  const { api, window } = loadApi(html);
  const summary = api.groupByPatient(api.extractRows(), NOW);
  check('error fixture counts four problem series', summary.errorCount, 4);
  check('Transferred is excluded from the error count', summary.seriesCount, 6);
  api.addPanel();
  const root = api.panelRoot();
  const totals = root && root.querySelector('.totals') ? root.querySelector('.totals').textContent : '';
  const errSpan = root && root.querySelector('.totals .error-count');
  check('top stats line is today only including today errors', totals, '2 patients \u00b7 4 series \u00b7 1 matched \u00b7 3 unmatched \u00b7 2 errors');
  check('stats line appends red error count', !!(errSpan && errSpan.textContent === '2 errors' && /2 errors/.test(totals) && totals.indexOf('4 errors') === -1), true);
  check('error count is in a red error-count span', !!(errSpan && errSpan.classList.contains('error-count')), true);
  const foot = root ? [...root.querySelectorAll('table.grid tfoot td')].map(td => td.textContent.trim()) : [];
  const footErr = root && root.querySelector('table.grid tfoot .error-count');
  check('footer shows yesterday counts and yesterday errors', foot, ['2 patients', '1 unmatched', '1 matched', '2 errors']);
  check('footer yesterday errors are in a red error-count span', !!(footErr && footErr.classList.contains('error-count') && footErr.textContent === '2 errors'), true);
  const css = (root.querySelector('style') || {}).textContent || '';
  check('error CSS keeps red chips and count, not a whole-row tint', css.indexOf('has-error') === -1 && css.indexOf('status-chip') !== -1 && css.indexOf('.error-count') !== -1 && css.indexOf('#c62828') !== -1 && css.indexOf('#ffcdd2') === -1, true);

  const todayRows = [...root.querySelectorAll('tr.day-today')];
  const yestRows = [...root.querySelectorAll('tr.day-yesterday')];
  const errToday = todayRows.find(tr => tr.textContent.indexOf(P_ERR_NAME) !== -1);
  const onlyToday = todayRows.find(tr => tr.textContent.indexOf(P_ONLY_NAME) !== -1);
  const errYest = yestRows.find(tr => tr.textContent.indexOf(P_ERR_NAME) !== -1);
  const onlyYest = yestRows.find(tr => tr.textContent.indexOf(P_ONLY_NAME) !== -1);

  check('error fixture panel shows names without IDs', !!(errToday && onlyToday && errYest && onlyYest) && [errToday, onlyToday, errYest, onlyYest].every(tr => tr.textContent.indexOf('333333') === -1 && tr.textContent.indexOf('444444') === -1), true);
  check('error fixture button titles have no IDs', [errToday, onlyToday, errYest, onlyYest].every(tr => { const b = tr && tr.querySelector('button.patient-link'); return b && b.textContent.indexOf('(') === -1 && b.title.indexOf('(') === -1; }), true);
  check('patient with a matched series and an error is not unmatched-only', !!(errToday && errToday.classList.contains('day-today') && !errToday.classList.contains('alert') && !errToday.classList.contains('has-error')), true);
  check('unmatched-only error row keeps the orange marker, not a red row', !!(onlyToday && onlyToday.classList.contains('alert') && !onlyToday.classList.contains('has-error') && onlyToday.querySelector('.alert-mark')), true);
  check('yesterday cancelled matched series keeps the day tint, not a red row', !!(errYest && errYest.classList.contains('day-yesterday') && !errYest.classList.contains('has-error') && !errYest.classList.contains('alert')), true);
  check('yesterday timeout unmatched-only stays orange, not a red row', !!(onlyYest && onlyYest.classList.contains('alert') && !onlyYest.classList.contains('has-error') && onlyYest.classList.contains('day-yesterday')), true);

  const errChips = errToday ? [...errToday.querySelectorAll('.status-chip')].map(c => c.textContent) : [];
  const onlyChips = onlyToday ? [...onlyToday.querySelectorAll('.status-chip')].map(c => c.textContent) : [];
  const yestChips = errYest ? [...errYest.querySelectorAll('.status-chip')].map(c => c.textContent) : [];
  const yestOnlyChips = onlyYest ? [...onlyYest.querySelectorAll('.status-chip')].map(c => c.textContent) : [];
  check('error series shows a red Error chip', errChips, ['Error']);
  check('failed unmatched series shows a Failed chip', onlyChips, ['Failed']);
  check('cancelled matched series shows a Cancelled chip', yestChips, ['Cancelled']);
  check('timeout series shows a Timeout chip', yestOnlyChips, ['Timeout']);
  const errLine = errToday && errToday.querySelector('.cell-line.series-error');
  check('error line stays red and includes the series label', !!(errLine && errLine.classList.contains('series-error') && /CT HEAD/.test(errLine.textContent) && /Error/.test(errLine.textContent)), true);
  const transferred = errToday ? errToday.textContent : '';
  check('transferred series is listed without an error chip', transferred.indexOf('CT OTHER') !== -1 && ![...errToday.querySelectorAll('.status-chip')].some(c => /Transferred/i.test(c.textContent)), true);

  const pageDoc = window.document;
  pageDoc.querySelectorAll('#errs tbody tr').forEach((row, i) => {
    row.id = 'err-page-' + i;
    row.addEventListener('click', () => { window.__zclickPageClicks.push(row.id); });
  });
  const errorPageRow = pageDoc.querySelector('#err-page-0');
  const cancelledPageRow = pageDoc.querySelector('#err-page-4');
  let panelRowClicks = 0;
  let patientClicks = 0;
  errToday.addEventListener('click', () => { panelRowClicks += 1; });
  const patientBtn = errToday.querySelector('button.patient-link');
  if (patientBtn) patientBtn.addEventListener('click', () => { patientClicks += 1; });
  const errorChip = errToday.querySelector('.status-chip');
  check('error chip is a button', !!(errorChip && errorChip.tagName === 'BUTTON'), true);
  window.__zclickScrolls = [];
  window.__zclickPageClicks = [];
  if (errorChip) errorChip.click();
  check('error chip scrolls to the exact Error series row', window.__zclickScrolls[0] && window.__zclickScrolls[0].id, errorPageRow && errorPageRow.id);
  check('error chip locate uses block center', !!(window.__zclickScrolls[0] && window.__zclickScrolls[0].opts && window.__zclickScrolls[0].opts.block === 'center'), true);
  const errOutline = errorPageRow ? String(errorPageRow.style.outline || '') : '';
  const errBg = errorPageRow ? String(errorPageRow.style.backgroundColor || '') : '';
  check('error chip highlight is red', /3px/.test(errOutline) && (errOutline.indexOf('c62828') !== -1 || /rgb\( *198, *40, *40 *\)/.test(errOutline) || errBg.indexOf('ffcdd2') !== -1 || /rgb\( *255, *205, *210 *\)/.test(errBg)), true);
  check('error chip does not use the patient-locate highlight', errOutline.indexOf('1565c0') === -1 && !/rgb\( *21, *101, *192 *\)/.test(errOutline), true);
  check('error chip does not click the page row', window.__zclickPageClicks.length, 0);
  check('error chip click does not bubble to the patient name', patientClicks, 0);
  check('error chip click is stopped on the chip', panelRowClicks, 0);
  check('error chip locate note is cleared when found', (root.querySelector('.locate-note') || {}).textContent || '', '');

  window.__zclickScrolls = [];
  const cancelledChip = errYest && errYest.querySelector('.status-chip');
  if (cancelledChip) cancelledChip.click();
  check('cancelled chip scrolls to the matched Cancelled series row', window.__zclickScrolls[0] && window.__zclickScrolls[0].id, cancelledPageRow && cancelledPageRow.id);

  const missingOk = api.locateErrorSeries('BROWN, PAT (222222)', [{ series: 'CT OTHER', submitted: '2026-11-12 10:00:00', status: 'Error' }]);
  check('missing error row returns false', missingOk, false);
  check('missing error row shows not-on-page note', (root.querySelector('.locate-note') || {}).textContent, 'not on this page');
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
    check('API panel lists both placeholder patients', bodyText.indexOf(P1_NAME) !== -1 && bodyText.indexOf(P2_NAME) !== -1, true);
  check('API panel does not show patient IDs', bodyText.indexOf('000000') === -1 && bodyText.indexOf('111111') === -1, true);
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

function runClipboardFallback() {
  const { api, window } = loadApi(jobsTableHtml());
  window.__zclickClipboard = [];
  window.GM_setClipboard = undefined;
  window.navigator.clipboard = {
    writeText: function (data) {
      window.__zclickClipboard.push({ via: 'nav', data: String(data == null ? '' : data) });
      return Promise.resolve();
    }
  };
  return api.copyPatientId('SMITH, JOHN (111111)').then(function (status) {
    check('clipboard falls back to navigator.clipboard', status, 'copied');
    check('fallback copies the fake ID only', window.__zclickClipboard, [{ via: 'nav', data: '111111' }]);
    return api.copyPatientId('DOE, JANE');
  }).then(function (status) {
    check('fallback copies nothing without an ID', status, 'missing');
    check('fallback without ID does not write clipboard again', window.__zclickClipboard.length, 1);
  });
}

function runTeamsTests() {
  const FAKE_HOOK = 'https://example.invalid/teams-webhook';
  const { api, window, document } = loadApi(jobsTableHtml());
  const payload = api.teamsPayload('0click test OK');
  check('Teams payload type is message', payload.type, 'message');
  check('Teams payload is an Adaptive Card', !!(payload.attachments && payload.attachments[0] && payload.attachments[0].contentType === 'application/vnd.microsoft.card.adaptive' && payload.attachments[0].content && payload.attachments[0].content.type === 'AdaptiveCard' && payload.attachments[0].content.version === '1.4'), true);
  check('Teams payload wraps the text', !!(payload.attachments[0].content.body && payload.attachments[0].content.body[0] && payload.attachments[0].content.body[0].type === 'TextBlock' && payload.attachments[0].content.body[0].text === '0click test OK' && payload.attachments[0].content.body[0].wrap === true), true);
  check('Teams payload has the Adaptive Card schema', payload.attachments[0].content.$schema, 'http://adaptivecards.io/schemas/adaptive-card.json');
  check('Teams test message has no placeholder names or IDs', payload.attachments[0].content.body[0].text.indexOf('DOE') === -1 && payload.attachments[0].content.body[0].text.indexOf('000000') === -1, true);

  window.__zclickGmRequests = [];
  return api.sendTeams('0click test OK').then(function (result) {
    check('sendTeams with no URL does not request', window.__zclickGmRequests.length, 0);
    check('sendTeams with no URL is not sent', result, { sent: false, reason: 'no-url' });
    check('empty webhook trims to unset', api.getTeamsWebhook(), '');
    check('setTeamsWebhook trims and stores only the webhook key', api.setTeamsWebhook('  ' + FAKE_HOOK + '  '), true);
    check('getTeamsWebhook returns the trimmed URL', api.getTeamsWebhook(), FAKE_HOOK);
    check('webhook storage key is teamsWebhook', Object.keys(window.__zclickGmValues), ['teamsWebhook']);
    window.__zclickGmRequests = [];
    window.__zclickGmStatus = 202;
    window.__zclickGmError = false;
    return api.sendTeams(api.TEAMS_TEST_MESSAGE);
  }).then(function (result) {
    check('sendTeams with a URL posts once', window.__zclickGmRequests.length, 1);
    const req = window.__zclickGmRequests[0] || {};
    check('sendTeams uses POST', req.method, 'POST');
    check('sendTeams posts to the stored webhook only', req.url, FAKE_HOOK);
    check('sendTeams Content-Type is JSON', req.headers && req.headers['Content-Type'], 'application/json');
    const body = JSON.parse(req.data || '{}');
    check('sendTeams body matches the Adaptive Card payload', body, api.teamsPayload('0click test OK'));
    check('sendTeams reports success from HTTP 202', result, { sent: true, status: 202 });
    const req0 = window.__zclickGmRequests[0] || {};
    check('sendTeams sets a 15s timeout', req0.timeout, 15000);
    check('strips :443 from https webhook URLs', api.teamsRequestUrl('https://example.invalid:443/workflows/x'), 'https://example.invalid/workflows/x');
    check('strips trailing :443 with no path', api.teamsRequestUrl('https://example.invalid:443'), 'https://example.invalid');
    check('leaves other ports alone', api.teamsRequestUrl('https://example.invalid:8443/x'), 'https://example.invalid:8443/x');
    check('leaves http :443 alone', api.teamsRequestUrl('http://example.invalid:443/x'), 'http://example.invalid:443/x');
    const PORT_HOOK = 'https://example.invalid:443/teams-webhook';
    check('setTeamsWebhook stores the :443 URL unchanged', api.setTeamsWebhook(PORT_HOOK), true);
    window.__zclickGmRequests = [];
    window.__zclickGmMode = 'load';
    window.__zclickGmStatus = 202;
    return api.sendTeams(api.TEAMS_TEST_MESSAGE);
  }).then(function (result) {
    check('sendTeams request strips :443', (window.__zclickGmRequests[0] || {}).url, 'https://example.invalid/teams-webhook');
    check('stored webhook still has :443', api.getTeamsWebhook(), 'https://example.invalid:443/teams-webhook');
    check('striped :443 request still succeeds', result, { sent: true, status: 202 });
    check('setTeamsWebhook empty still stores an empty value', api.setTeamsWebhook('   '), true);
    check('cleared webhook is empty', api.getTeamsWebhook(), '');
    check('cleared storage is still only teamsWebhook', Object.keys(window.__zclickGmValues), ['teamsWebhook']);
    window.__zclickGmValues.teamsWebhook = FAKE_HOOK;
    api.addPanel();
    window.__zclickPrompts = [];
    window.__zclickPromptReturn = '';
    window.prompt = function (msg, def) {
      window.__zclickPrompts.push({ msg: String(msg == null ? '' : msg), def: def });
      return window.__zclickPromptReturn;
    };
    const last6 = FAKE_HOOK.slice(-6);
    const savedMsg = api.teamsWebhookPromptMessage(FAKE_HOOK);
    check('prompt message shows saved suffix only', savedMsg, 'Teams webhook: saved (\u2026' + last6 + ')\nPaste a new URL, or type CLEAR to remove. Leave empty to keep.');
    check('prompt message has no full URL', savedMsg.indexOf('example.invalid') === -1 && savedMsg.indexOf(FAKE_HOOK) === -1, true);
    check('prompt message when unset', api.teamsWebhookPromptMessage(''), 'Teams webhook: not set\nPaste a new URL, or type CLEAR to remove. Leave empty to keep.');
    window.__zclickPromptReturn = '';
    api.promptSetTeamsWebhook();
    check('empty prompt keeps the saved webhook', api.getTeamsWebhook(), FAKE_HOOK);
    check('prompt default is empty', window.__zclickPrompts[0] && window.__zclickPrompts[0].def, '');
    check('prompt used the saved-status message', window.__zclickPrompts[0] && window.__zclickPrompts[0].msg, savedMsg);
    let note = ((api.panelRoot() && api.panelRoot().querySelector('.locate-note')) || {}).textContent || '';
    check('empty prompt says unchanged', note, 'Teams webhook unchanged');
    window.__zclickPromptReturn = null;
    api.promptSetTeamsWebhook();
    check('cancel keeps the saved webhook', api.getTeamsWebhook(), FAKE_HOOK);
    window.__zclickPromptReturn = 'http://example.invalid/hook';
    api.promptSetTeamsWebhook();
    check('non-https URL is rejected', api.getTeamsWebhook(), FAKE_HOOK);
    note = ((api.panelRoot() && api.panelRoot().querySelector('.locate-note')) || {}).textContent || '';
    check('reject note requires https', note, 'Teams webhook not saved (must start with https://)');
    check('reject note has no URL', note.indexOf('example.invalid') === -1, true);
    window.__zclickPromptReturn = 'ftp://example.invalid/hook';
    api.promptSetTeamsWebhook();
    check('non-https scheme is rejected', api.getTeamsWebhook(), FAKE_HOOK);
    const FAKE_HOOK2 = 'https://example.invalid/teams-webhook-2';
    window.__zclickPromptReturn = '  ' + FAKE_HOOK2 + '  ';
    api.promptSetTeamsWebhook();
    check('a new https URL is saved', api.getTeamsWebhook(), FAKE_HOOK2);
    note = ((api.panelRoot() && api.panelRoot().querySelector('.locate-note')) || {}).textContent || '';
    check('save note shows only the last 6 characters', note, 'Teams webhook saved (\u2026' + FAKE_HOOK2.slice(-6) + ')');
    check('save note has no full URL', note.indexOf('example.invalid') === -1 && note.indexOf(FAKE_HOOK2) === -1, true);
    window.__zclickPromptReturn = 'CLEAR';
    api.promptSetTeamsWebhook();
    check('CLEAR clears the webhook', api.getTeamsWebhook(), '');
    note = ((api.panelRoot() && api.panelRoot().querySelector('.locate-note')) || {}).textContent || '';
    check('CLEAR note says cleared', note, 'Teams webhook cleared');
    check('setTeamsWebhook restores a URL', api.setTeamsWebhook(FAKE_HOOK), true);
    window.__zclickPromptReturn = ' clear ';
    api.promptSetTeamsWebhook();
    check('clear is case-insensitive', api.getTeamsWebhook(), '');
    window.__zclickPromptReturn = 'please clear';
    api.setTeamsWebhook(FAKE_HOOK);
    api.promptSetTeamsWebhook();
    check('only the word clear removes the URL', api.getTeamsWebhook(), FAKE_HOOK);
    window.__zclickGmRequests = [];
    window.__zclickGmStatus = 403;
    window.__zclickGmError = false;
    api.registerTeamsMenu();
    check('Teams menu commands are registered', window.__zclickMenu.map(function (m) { return m.title; }), ['Set Teams webhook URL', 'Send Teams test']);
    return api.sendTeamsTest();
  }).then(function (result) {
    const note = ((api.panelRoot() && api.panelRoot().querySelector('.locate-note')) || {}).textContent || '';
    check('Teams test posts the fixed test message only', window.__zclickGmRequests.length, 1);
    check('Teams test failed note shows the HTTP status only', note, 'Teams test failed (403)');
    check('Teams test note has no webhook URL', note.indexOf('example.invalid') === -1 && note.indexOf(FAKE_HOOK) === -1, true);
    check('Teams test note has no patient data', note.indexOf('DOE') === -1 && note.indexOf('000000') === -1, true);
    check('failed Teams test is not sent', result, { sent: false, status: 403 });
    window.__zclickGmRequests = [];
    window.__zclickGmStatus = 202;
    window.__zclickGmError = false;
    return api.sendTeamsTest();
  }).then(function (result) {
    const note = ((api.panelRoot() && api.panelRoot().querySelector('.locate-note')) || {}).textContent || '';
    check('Teams test OK note', note, 'Teams test OK');
    check('successful Teams test is sent', result, { sent: true, status: 202 });
    const posted = JSON.parse((window.__zclickGmRequests[0] || {}).data || '{}');
    check('Teams test post text is only the canned message', posted.attachments[0].content.body[0].text, '0click test OK');
    window.__zclickGmRequests = [];
    window.__zclickGmMode = 'error';
    window.__zclickGmErrorRes = { status: 0, error: 'Refused to connect to https://example.invalid/teams-webhook because it is not in @connect' };
    return api.sendTeamsTest();
  }).then(function (result) {
    const note = ((api.panelRoot() && api.panelRoot().querySelector('.locate-note')) || {}).textContent || '';
    check('onerror note uses blocked/network reason', note.indexOf('Teams test failed (blocked/network: ') === 0, true);
    check('onerror note has no webhook URL', note.indexOf('https://') === -1 && note.indexOf('example.invalid') === -1 && note.indexOf(FAKE_HOOK) === -1, true);
    check('onerror detail is truncated to 60 characters', note.length <= 'Teams test failed (blocked/network: '.length + 60 + 1, true);
    check('onerror result reason is blocked/network', result.reason, 'blocked/network');
    check('onerror note mentions the short error', /because it is not in @connect/.test(note), true);
    window.__zclickGmRequests = [];
    window.__zclickGmMode = 'timeout';
    return api.sendTeamsTest();
  }).then(function (result) {
    const note = ((api.panelRoot() && api.panelRoot().querySelector('.locate-note')) || {}).textContent || '';
    check('timeout note', note, 'Teams test failed (timeout)');
    check('timeout result', result, { sent: false, status: 0, reason: 'timeout' });
    const savedXhr = window.GM_xmlhttpRequest;
    window.GM_xmlhttpRequest = undefined;
    window.GM = undefined;
    window.__zclickGmRequests = [];
    return api.sendTeamsTest().then(function (res) {
      window.GM_xmlhttpRequest = savedXhr;
      window.__zclickGmMode = 'load';
      const note2 = ((api.panelRoot() && api.panelRoot().querySelector('.locate-note')) || {}).textContent || '';
      check('no-gm does not send a request', window.__zclickGmRequests.length, 0);
      check('no-gm note', note2, 'Teams test failed (no-gm)');
      check('no-gm result', res, { sent: false, reason: 'no-gm' });
    });
  });
}

function finish() {
  Promise.resolve().then(runClipboardFallback).then(runTeamsTests).catch(function (err) {
    failed++;
    console.log('FAIL clipboard or Teams tests threw ' + String(err && err.message || err));
  }).then(function () {
    if (failed) {
      console.error(failed + ' failed');
      process.exit(1);
    }
    console.log('all tests passed');
  });
}
