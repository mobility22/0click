// ==UserScript==
// @name         0click
// @namespace    https://github.com/mobility22/0click
// @version      1.0
// @description  Read-only ROS Jobs History summary for AutoContour Zero-Click
// @match        http://10.240.61.81:18001/*
// @updateURL    https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js
// @downloadURL  https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js
// @run-at       document-idle
// ==/UserScript==

// 0click 1.0 — AutoContour Zero-Click Jobs History ROS summary (read-only)

(function () {
  'use strict';
  const TAG = '[0click]';
  const SCRIPT_VERSION = '1.0';
  const PANEL_TITLE = '0click 1.0';
  const PANEL_ID = 'zclick-panel';
  const DEBOUNCE_MS = 250;
  const log = (...a) => console.log(TAG, ...a);
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

  function isRosWorkflow(text) {
    return /ROS/i.test(norm(text));
  }
  function isMatchedTemplate(text) {
    const t = norm(text);
    return t !== '' && t !== '-';
  }
  function headerKey(text) {
    const t = norm(text);
    if (/^patient$/i.test(t)) return 'patient';
    if (/^series\s*description$/i.test(t)) return 'series';
    if (/^image\s*creation$/i.test(t)) return 'imageCreation';
    if (/^modality$/i.test(t)) return 'modality';
    if (/^workflow$/i.test(t)) return 'workflow';
    if (/^template$/i.test(t)) return 'template';
    if (/^status$/i.test(t)) return 'status';
    if (/^date\s*submitted$/i.test(t)) return 'submitted';
    if (/^runtime$/i.test(t)) return 'runtime';
    return null;
  }
  function cellText(el) {
    if (!el) return '';
    return norm(el.innerText || el.textContent || '');
  }
  function ourUi(el) {
    if (!el) return false;
    if (el.closest && el.closest('#' + PANEL_ID)) return true;
    if (panelShadow && (el === panelShadow.host || panelShadow.contains(el))) return true;
    return false;
  }

  function rowCells(row) {
    if (!row) return [];
    if (row.cells && row.cells.length) return [...row.cells];
    const sel = 'th,td,[role="columnheader"],[role="cell"],[role="gridcell"]';
    const direct = [...row.children].filter(el => {
      const tag = (el.tagName || '').toLowerCase();
      const role = (el.getAttribute && el.getAttribute('role')) || '';
      return tag === 'th' || tag === 'td' || role === 'columnheader' || role === 'cell' || role === 'gridcell';
    });
    if (direct.length) return direct;
    return [...row.querySelectorAll(sel)].filter(el => el.parentElement === row || !el.parentElement.closest(sel));
  }
  function isFilterRow(row) {
    if (!row || typeof row.querySelector !== 'function') return false;
    return !!row.querySelector('input,select,textarea');
  }
  function mapHeaders(cells) {
    const map = {};
    cells.forEach((el, i) => {
      const k = headerKey(cellText(el));
      if (k && map[k] == null) map[k] = i;
    });
    if (map.patient == null || map.workflow == null || map.template == null) return null;
    return map;
  }
  function rowFromCells(cells, map) {
    const get = key => (map[key] == null ? '' : cellText(cells[map[key]]));
    return {
      patient: get('patient'),
      series: get('series'),
      workflow: get('workflow'),
      template: get('template'),
      status: get('status'),
      submitted: get('submitted')
    };
  }
  function rowsFromContainer(root) {
    if (!root || ourUi(root)) return [];
    let rowEls = [];
    if (root.rows && root.rows.length) rowEls = [...root.rows];
    else rowEls = [...root.querySelectorAll('tr,[role="row"]')];
    if (!rowEls.length && root.children && root.children.length) {
      rowEls = [...root.children];
    }
    let map = null;
    const out = [];
    for (const row of rowEls) {
      if (ourUi(row)) continue;
      const cells = rowCells(row);
      if (!cells.length) continue;
      if (!map) {
        const maybe = mapHeaders(cells);
        if (maybe) {
          map = maybe;
          continue;
        }
        continue;
      }
      if (isFilterRow(row)) continue;
      const rec = rowFromCells(cells, map);
      if (!rec.patient && !rec.workflow && !rec.series) continue;
      out.push(rec);
    }
    return out;
  }
  function findJobContainers() {
    const seen = [];
    const add = el => {
      if (!el || ourUi(el) || seen.includes(el)) return;
      seen.push(el);
    };
    document.querySelectorAll('table,[role="table"],[role="grid"]').forEach(add);
    return seen;
  }
  function extractRows() {
    const rows = [];
    for (const root of findJobContainers()) {
      rows.push.apply(rows, rowsFromContainer(root));
    }
    return rows;
  }

  function groupByPatient(rows) {
    const ros = (rows || []).filter(r => r && r.patient && isRosWorkflow(r.workflow));
    const order = [];
    const map = new Map();
    for (const r of ros) {
      if (!map.has(r.patient)) {
        map.set(r.patient, { patient: r.patient, matched: [], unmatched: [] });
        order.push(r.patient);
      }
      const g = map.get(r.patient);
      if (isMatchedTemplate(r.template)) g.matched.push(r);
      else g.unmatched.push(r);
    }
    const groups = order.map(name => {
      const g = map.get(name);
      return {
        patient: g.patient,
        matched: g.matched,
        unmatched: g.unmatched,
        total: g.matched.length + g.unmatched.length,
        matchedCount: g.matched.length,
        unmatchedCount: g.unmatched.length
      };
    });
    return {
      groups,
      patientCount: groups.length,
      seriesCount: ros.length,
      matchedCount: groups.reduce((n, g) => n + g.matchedCount, 0),
      unmatchedCount: groups.reduce((n, g) => n + g.unmatchedCount, 0),
      tableCount: findJobContainers().length
    };
  }

  let panelShadow = null;
  let collapsed = false;
  let debounceTimer = null;
  let historyHooked = false;

  function setHostHidden(hidden) {
    const host = document.getElementById(PANEL_ID);
    if (!host) return;
    host.setAttribute('data-collapsed', hidden ? '1' : '0');
  }
  function clearNode(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== '') node.textContent = text;
    return node;
  }
  function addSeriesList(parent, title, items, showTemplate) {
    const wrap = el('div', 'group');
    wrap.appendChild(el('div', 'group-title', title + ' (' + items.length + ')'));
    if (!items.length) {
      wrap.appendChild(el('div', 'empty', 'None'));
      parent.appendChild(wrap);
      return;
    }
    const ul = el('ul', 'series');
    for (const item of items) {
      const li = el('li');
      const line = el('div', 'series-name', item.series || '(no series description)');
      li.appendChild(line);
      const meta = el('div', 'series-meta');
      const bits = [];
      if (item.status) bits.push(item.status);
      if (item.submitted) bits.push(item.submitted);
      if (showTemplate && item.template) bits.push(item.template);
      meta.textContent = bits.join(' · ');
      li.appendChild(meta);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    parent.appendChild(wrap);
  }
  function renderBody() {
    const root = panelShadow;
    if (!root) return;
    const body = root.querySelector('.body');
    const totalsEl = root.querySelector('.totals');
    if (!body || !totalsEl) return;
    clearNode(body);
    const summary = groupByPatient(extractRows());
    totalsEl.textContent =
      summary.patientCount + ' ROS patient' + (summary.patientCount === 1 ? '' : 's') +
      ' · ' + summary.seriesCount + ' series · ' +
      summary.matchedCount + ' matched · ' +
      summary.unmatchedCount + ' no matching template';
    if (!summary.tableCount) {
      body.appendChild(el('div', 'empty', 'No jobs table found on this page.'));
    } else if (!summary.seriesCount) {
      body.appendChild(el('div', 'empty', 'No ROS workflow rows in the current table.'));
    }
    for (const g of summary.groups) {
      const card = el('section', 'patient');
      card.appendChild(el('h2', 'patient-name', g.patient));
      card.appendChild(el(
        'div',
        'patient-counts',
        g.total + ' series · ' + g.matchedCount + ' matched · ' + g.unmatchedCount + ' no matching template'
      ));
      addSeriesList(card, 'Transferred, no matching template', g.unmatched, false);
      addSeriesList(card, 'Matched', g.matched, true);
      body.appendChild(card);
    }
    log(
      'summary',
      'patients=' + summary.patientCount,
      'series=' + summary.seriesCount,
      'matched=' + summary.matchedCount,
      'unmatched=' + summary.unmatchedCount,
      'tables=' + summary.tableCount
    );
    return summary;
  }
  function applyCollapsed() {
    const root = panelShadow;
    if (!root) return;
    const wrap = root.querySelector('.wrap');
    const toggle = root.querySelector('.toggle');
    if (wrap) wrap.classList.toggle('collapsed', collapsed);
    if (toggle) toggle.textContent = collapsed ? 'Show' : 'Hide';
    setHostHidden(collapsed);
  }
  function addPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;width:360px;background:transparent;';
    // Closed shadow root so Ctrl+F does not match panel text (including patient names).
    panelShadow = panel.attachShadow({ mode: 'closed' });
    panelShadow.innerHTML =
      '<style>' +
      ':host, .wrap { font: 13px/1.4 sans-serif; color: #111; }' +
      '.wrap { width: 360px; max-height: calc(100vh - 24px); background: #fff; border: 2px solid #1565c0; border-radius: 8px; box-shadow: 0 3px 10px rgba(0,0,0,.35); box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }' +
      '.bar { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: #1565c0; color: #fff; }' +
      '.title { font-weight: bold; font-size: 15px; flex: 1; }' +
      '.bar button { font-size: 12px; padding: 3px 8px; border: 0; border-radius: 4px; background: #fff; color: #1565c0; font-weight: bold; cursor: pointer; }' +
      '.totals { padding: 8px 10px 4px; font-size: 12px; color: #333; border-bottom: 1px solid #e0e0e0; }' +
      '.note { padding: 4px 10px 8px; font-size: 11px; color: #555; }' +
      '.body { padding: 8px 10px 12px; overflow: auto; }' +
      '.wrap.collapsed .totals, .wrap.collapsed .note, .wrap.collapsed .body { display: none; }' +
      '.wrap.collapsed { width: auto; }' +
      '.empty { color: #555; font-style: italic; margin: 6px 0; }' +
      '.patient { margin: 0 0 12px; padding: 0 0 10px; border-bottom: 1px solid #eee; }' +
      '.patient:last-child { border-bottom: 0; margin-bottom: 0; }' +
      'h2.patient-name { margin: 0 0 2px; font-size: 14px; }' +
      '.patient-counts { font-size: 11px; color: #444; margin-bottom: 6px; }' +
      '.group { margin: 6px 0 0; }' +
      '.group-title { font-weight: bold; font-size: 12px; color: #1565c0; }' +
      'ul.series { margin: 4px 0 0; padding: 0 0 0 16px; }' +
      'ul.series li { margin: 0 0 6px; }' +
      '.series-name { font-weight: 600; }' +
      '.series-meta { font-size: 11px; color: #444; }' +
      '</style>' +
      '<div class="wrap">' +
      '<div class="bar">' +
      '<div class="title"></div>' +
      '<button class="refresh" type="button">Refresh</button>' +
      '<button class="toggle" type="button">Hide</button>' +
      '</div>' +
      '<div class="totals"></div>' +
      '<div class="note">Read-only. Only rows currently in the table are counted. Page filters are not changed.</div>' +
      '<div class="body"></div>' +
      '</div>';
    panelShadow.querySelector('.title').textContent = PANEL_TITLE;
    panelShadow.querySelector('.refresh').addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      renderBody();
    });
    panelShadow.querySelector('.toggle').addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      collapsed = !collapsed;
      applyCollapsed();
    });
    const parent = document.body || document.documentElement;
    parent.appendChild(panel);
    applyCollapsed();
    renderBody();
  }

  function scheduleRefresh() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (!document.getElementById(PANEL_ID)) addPanel();
      else renderBody();
    }, DEBOUNCE_MS);
  }
  function hookHistory() {
    if (historyHooked) return;
    historyHooked = true;
    const wrap = name => {
      const orig = history[name];
      if (typeof orig !== 'function') return;
      history[name] = function () {
        const ret = orig.apply(this, arguments);
        scheduleRefresh();
        return ret;
      };
    };
    try {
      wrap('pushState');
      wrap('replaceState');
    } catch (e) { /* ignore */ }
    window.addEventListener('popstate', scheduleRefresh);
    window.addEventListener('hashchange', scheduleRefresh);
  }

  if (typeof globalThis !== 'undefined' && globalThis.ZEROCLICK_TEST) {
    globalThis.ZEROCLICK_API = {
      SCRIPT_VERSION, PANEL_TITLE, PANEL_ID,
      isRosWorkflow, isMatchedTemplate, headerKey, extractRows, rowsFromContainer,
      groupByPatient, addPanel, renderBody, panelRoot: () => panelShadow,
      norm
    };
    return;
  }

  function start() {
    addPanel();
    hookHistory();
    const root = document.documentElement || document.body;
    if (root && typeof MutationObserver === 'function') {
      const observer = new MutationObserver(records => {
        for (const rec of records) {
          if (ourUi(rec.target)) continue;
          scheduleRefresh();
          return;
        }
      });
      observer.observe(root, { childList: true, subtree: true, characterData: true });
    }
    log('ready', 'v' + SCRIPT_VERSION);
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
