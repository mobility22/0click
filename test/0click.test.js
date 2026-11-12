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

check('script @version 1.0', /@version\s+1\.0\b/.test(src), true);
check('script SCRIPT_VERSION', /const SCRIPT_VERSION = '1\.0'/.test(src), true);
check('script header comment 0click 1.0', /\/\/ 0click 1\.0\b/.test(src), true);
check('script PANEL_TITLE', /const PANEL_TITLE = '0click 1\.0'/.test(src), true);
check('script closed shadow', src.includes("attachShadow({ mode: 'closed' })"), true);
check('script @downloadURL raw main', src.includes('https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js'), true);
check('script @match Zero-Click host', src.includes('@match        http://10.240.61.81:18001/*'), true);
check('PHI-free log: no innerText dump in log()', /log\([^)]*innerText/.test(src), false);
check('no GM_setValue', !src.includes('GM_setValue') && !src.includes('GM_getValue'), true);
check('no localStorage of row data', !/localStorage\.(setItem|getItem)/.test(src), true);

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

function jobsTableHtml() {
  // Columns deliberately not in the live-page order, to prove header-text mapping.
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
    '<tr><td>Transferred</td><td>-</td><td>' + P1 + '</td><td>KP_ROS</td><td>CT HEAD</td><td>11-12-2026 11:38</td><td>CT</td></tr>' +
    '<tr><td>Completed</td><td>Head and Neck</td><td>' + P1 + '</td><td>KP_ROS</td><td>CT NECK</td><td>11-12-2026 11:40</td><td>CT</td></tr>' +
    '<tr><td>Transferred</td><td></td><td>' + P1 + '</td><td>KP_ROS</td><td>MR BRAIN</td><td>11-12-2026 11:41</td><td>MR</td></tr>' +
    '<tr><td>Completed</td><td>Prostate</td><td>' + P2 + '</td><td>kp_ros</td><td>CT PELVIS</td><td>11-12-2026 12:00</td><td>CT</td></tr>' +
    '<tr><td>Transferred</td><td>-</td><td>' + P2 + '</td><td>Other_Workflow</td><td>CT CHEST</td><td>11-12-2026 12:01</td><td>CT</td></tr>' +
    '<tr><td>Transferred</td><td>-</td><td>' + P2 + '</td><td>KP_ROS</td><td>MR PELVIS</td><td>11-12-2026 12:02</td><td>MR</td></tr>' +
    '</tbody>' +
    '</table>';
}

function loadApi(html) {
  const dom = new JSDOM('<!DOCTYPE html><html><body>' + html + '</body></html>', {
    url: 'http://10.240.61.81:18001/jobs/history?filterSubmittedDate=11-12',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.ZEROCLICK_TEST = true;
    }
  });
  const script = dom.window.document.createElement('script');
  script.textContent = src;
  dom.window.document.body.appendChild(script);
  if (!dom.window.ZEROCLICK_API) throw new Error('ZEROCLICK_API not exported');
  return { api: dom.window.ZEROCLICK_API, document: dom.window.document, window: dom.window, logs: [] };
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

  const rows = api.extractRows();
  check('extract skips filter row and keeps 6 data rows', rows.length, 6);

  const summary = api.groupByPatient(rows);
  check('ROS patient count', summary.patientCount, 2);
  check('ROS series count excludes non-ROS', summary.seriesCount, 5);
  check('overall matched count', summary.matchedCount, 2);
  check('overall unmatched count', summary.unmatchedCount, 3);
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
  check('panel title is 0click 1.0', !!(root && root.querySelector('.title') && root.querySelector('.title').textContent === '0click 1.0'), true);
  check('panel has refresh button', !!(root && root.querySelector('.refresh')), true);
  const bodyText = root && root.querySelector('.body') ? root.querySelector('.body').textContent : '';
  check('panel lists first patient in shadow only', bodyText.indexOf(P1) !== -1, true);
  check('panel lists unmatched heading', bodyText.indexOf('Transferred, no matching template') !== -1, true);
  check('panel lists matched heading', /Matched \(/.test(bodyText), true);
  check('panel does not list excluded non-ROS series', bodyText.indexOf('CT CHEST') === -1, true);
  const logBlob = logs.join('\n');
  check('console logs do not contain patient names', logBlob.indexOf(P1) === -1 && logBlob.indexOf(P2) === -1, true);
  window.console.log = origLog;
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
    '<div role="gridcell">11-12-2026 11:38</div>' +
    '</div>' +
    '</div>';
  const { api } = loadApi(grid);
  const rows = api.extractRows();
  check('role=grid extracts one data row', rows.length, 1);
  const summary = api.groupByPatient(rows);
  check('role=grid unmatched ROS series', summary.unmatchedCount, 1);
  check('role=grid matched ROS series', summary.matchedCount, 0);
}

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all tests passed');
