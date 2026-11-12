// ==UserScript==
// @name         0click
// @namespace    https://github.com/mobility22/0click
// @version      1.1
// @description  Read-only ROS Jobs History summary for AutoContour Zero-Click
// @match        http://10.240.61.81:18001/*
// @updateURL    https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js
// @downloadURL  https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

// 0click 1.1 — AutoContour Zero-Click Jobs History ROS summary (read-only)

(function () {
  'use strict';
  const TAG = '[0click]';
  const SCRIPT_VERSION = '1.1';
  const PANEL_TITLE = '0click 1.1';
  const PANEL_ID = 'zclick-panel';
  const DEBOUNCE_MS = 250;
  const PAGE_SIZE = 500;
  const MAX_PAGES = 20;
  // Off by default. Set globalThis.ZEROCLICK_DEBUG = true for path/count logs only (no row data).
  const DEBUG = false;
  const log = (...a) => console.log(TAG, ...a);
  const debugEnabled = () => {
    try { return !!(DEBUG || (typeof globalThis !== 'undefined' && globalThis.ZEROCLICK_DEBUG)); }
    catch (e) { return !!DEBUG; }
  };
  const debug = (...a) => { if (debugEnabled()) log(...a); };
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const normKey = k => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  let nowFn = () => new Date();
  function setNow(d) { nowFn = d ? () => new Date(d) : () => new Date(); }
  function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function formatLocalDate(d) {
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function localYmd(y, m, day) {
    if (m < 1 || m > 12 || day < 1 || day > 31) return null;
    const d = new Date(y, m - 1, day);
    if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return null;
    return d;
  }
  function parseSubmittedDate(text) {
    const t = norm(text);
    if (!t) return null;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
    if (m) return localYmd(Number(m[1]), Number(m[2]), Number(m[3]));
    m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
    if (m) return localYmd(Number(m[3]), Number(m[1]), Number(m[2]));
    return null;
  }
  function lastTwoDayRange(now) {
    const today = startOfLocalDay(now || nowFn());
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    return {
      start: yesterday,
      end: today,
      label: formatLocalDate(yesterday) + ' \u2013 ' + formatLocalDate(today)
    };
  }
  function isWithinLastTwoLocalDays(text, now) {
    const d = parseSubmittedDate(text);
    if (!d) return false;
    const today = startOfLocalDay(now || nowFn());
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const t = startOfLocalDay(d).getTime();
    return t === today.getTime() || t === yesterday.getTime();
  }
  function inferDateFormat(value) {
    const t = norm(value || '');
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(t)) return 'YMD';
    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/.test(t)) return 'MDY';
    if (/^\d{1,2}-\d{1,2}$/.test(t)) return 'MD';
    return 'YMD';
  }
  function formatDateWith(fmt, d) {
    const pad = n => String(n).padStart(2, '0');
    const y = d.getFullYear(), m = pad(d.getMonth() + 1), day = pad(d.getDate());
    if (fmt === 'MD') return m + '-' + day;
    if (fmt === 'MDY') return m + '-' + day + '-' + y;
    return y + '-' + m + '-' + day;
  }

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

  // --- JSON field mapping (unknown API shape) ---
  const KEYS = {
    patient: ['patient', 'patientname', 'patientfullname', 'patientdisplayname', 'patientlabel', 'subjectname', 'subject'],
    series: ['seriesdescription', 'seriesdesc', 'series', 'seriesname', 'description'],
    workflow: ['workflow', 'workflowname', 'workflowchart', 'workflowlabel'],
    template: ['template', 'templatename', 'matchingtemplate', 'matchedtemplate', 'templatelabel'],
    status: ['status', 'jobstatus', 'state', 'jobstate', 'statusname'],
    submitted: ['datesubmitted', 'submitteddate', 'submittedat', 'submittedon', 'submitted', 'datecreated', 'createdat', 'createdon', 'jobdate', 'submissiondate', 'submissiontime']
  };
  function scalarText(v) {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return norm(v);
    if (typeof v === 'object') {
      if (v.name != null) return norm(v.name);
      if (v.value != null) return norm(v.value);
      if (v.label != null) return norm(v.label);
      if (v.text != null) return norm(v.text);
    }
    return '';
  }
  function pickField(obj, names) {
    if (!obj || typeof obj !== 'object') return '';
    const want = new Set(names);
    for (const k of Object.keys(obj)) {
      if (want.has(normKey(k))) return scalarText(obj[k]);
    }
    return '';
  }
  function mapJobObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { patient: '', series: '', workflow: '', template: '', status: '', submitted: '' };
    }
    return {
      patient: pickField(obj, KEYS.patient),
      series: pickField(obj, KEYS.series),
      workflow: pickField(obj, KEYS.workflow),
      template: pickField(obj, KEYS.template),
      status: pickField(obj, KEYS.status),
      submitted: pickField(obj, KEYS.submitted)
    };
  }
  function scoreJobObject(obj) {
    const r = mapJobObject(obj);
    let n = 0;
    if (r.patient) n += 3;
    if (r.workflow) n += 3;
    if (r.template !== '') n += 2;
    if (r.series) n += 2;
    if (r.submitted) n += 2;
    if (r.status) n += 1;
    return n;
  }
  function readTotalHint(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const names = ['total', 'totalcount', 'totalelements', 'totalrecords', 'totalitems', 'recordcount', 'rowcount', 'filteredcount', 'count', 'totalhits'];
    for (const k of Object.keys(obj)) {
      if (!names.includes(normKey(k))) continue;
      const v = obj[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
    }
    return null;
  }
  function findJobCollections(data, depth, path, out) {
    if (data == null || depth > 6) return;
    if (Array.isArray(data)) {
      const sample = data.find(x => x && typeof x === 'object' && !Array.isArray(x));
      if (sample) {
        const score = scoreJobObject(sample);
        if (score >= 5) {
          out.push({
            rows: data,
            score: score,
            path: path.join('.') || '(root)',
            total: data.length
          });
        }
      }
      return;
    }
    if (typeof data !== 'object') return;
    const total = readTotalHint(data);
    for (const k of Object.keys(data)) {
      const before = out.length;
      findJobCollections(data[k], depth + 1, path.concat(k), out);
      if (total != null && out.length > before) {
        const last = out[out.length - 1];
        last.total = Math.max(last.total || 0, total);
      }
    }
  }
  function pickCollection(data) {
    const found = [];
    findJobCollections(data, 0, [], found);
    if (!found.length) return null;
    found.sort((a, b) => (b.score - a.score) || (b.rows.length - a.rows.length));
    const best = found[0];
    return {
      rows: best.rows,
      mapped: best.rows.map(mapJobObject),
      score: best.score,
      path: best.path,
      total: best.total
    };
  }
  function rowsFromPayload(data) {
    const col = pickCollection(data);
    return col ? col.mapped : [];
  }

  // --- Same-origin GET only ---
  const SIZE_KEYS = ['pagesize', 'pagesizelimit', 'limit', 'size', 'take', 'perpage', 'per_page', 'max', 'maxresults', 'top', 'pagesize'];
  const PAGE_KEYS = ['page', 'pageno', 'pagenumber', 'pageindex', 'pagenum', 'offset', 'skip'];
  const SINGLE_DATE_KEYS = ['filtersubmitteddate', 'submitteddate', 'datesubmitted', 'date', 'ondate', 'day', 'filterdate'];
  const FROM_KEYS = ['from', 'fromdate', 'datefrom', 'startdate', 'start', 'submittedfrom', 'startdatetime', 'begin', 'begindate', 'fromtime'];
  const TO_KEYS = ['to', 'todate', 'dateto', 'enddate', 'end', 'submittedto', 'enddatetime', 'totime'];

  function pageWin() {
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
    } catch (e) { /* isolated */ }
    return window;
  }
  function safePath(href) {
    try {
      const u = new URL(href, (pageWin().location && pageWin().location.href) || location.href);
      return u.pathname || '/';
    } catch (e) { return '(url)'; }
  }
  function isAllowedGet(href, method) {
    const m = String(method == null ? 'GET' : method).toUpperCase();
    if (m !== 'GET') return false;
    if (href == null || href === '') return false;
    try {
      const base = (pageWin().location && pageWin().location.href) || location.href;
      const u = new URL(String(href), base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      const origin = (pageWin().location && pageWin().location.origin) || location.origin;
      return u.origin === origin;
    } catch (e) { return false; }
  }
  function findParamName(params, names) {
    for (const key of params.keys()) {
      if (names.includes(normKey(key))) return key;
    }
    return null;
  }
  function buildExpandedUrls(href, now) {
    if (!isAllowedGet(href, 'GET')) return [];
    const base = (pageWin().location && pageWin().location.href) || location.href;
    const u = new URL(href, base);
    const params = u.searchParams;
    const sizeKey = findParamName(params, SIZE_KEYS);
    if (sizeKey) params.set(sizeKey, String(PAGE_SIZE));
    else params.set('pageSize', String(PAGE_SIZE));
    const pageKey = findParamName(params, PAGE_KEYS);
    if (pageKey) {
      const nk = normKey(pageKey);
      params.set(pageKey, (nk === 'offset' || nk === 'skip') ? '0' : '1');
    }
    const range = lastTwoDayRange(now || nowFn());
    const fromKey = findParamName(params, FROM_KEYS);
    const toKey = findParamName(params, TO_KEYS);
    const singleKey = findParamName(params, SINGLE_DATE_KEYS);
    const urls = [];
    if (fromKey || toKey) {
      if (fromKey) params.set(fromKey, formatLocalDate(range.start));
      else params.set('from', formatLocalDate(range.start));
      if (toKey) params.set(toKey, formatLocalDate(range.end));
      else params.set('to', formatLocalDate(range.end));
      urls.push(u.href);
    } else if (singleKey) {
      const fmt = inferDateFormat(params.get(singleKey));
      const today = new URL(u.href);
      today.searchParams.set(singleKey, formatDateWith(fmt, range.end));
      const yest = new URL(u.href);
      yest.searchParams.set(singleKey, formatDateWith(fmt, range.start));
      urls.push(today.href, yest.href);
    } else {
      urls.push(u.href);
    }
    return urls;
  }
  function nextPageUrl(href, pageIndex) {
    if (!isAllowedGet(href, 'GET')) return null;
    const base = (pageWin().location && pageWin().location.href) || location.href;
    const u = new URL(href, base);
    const pageKey = findParamName(u.searchParams, PAGE_KEYS);
    if (!pageKey) return null;
    const nk = normKey(pageKey);
    if (nk === 'offset' || nk === 'skip') u.searchParams.set(pageKey, String(pageIndex * PAGE_SIZE));
    else u.searchParams.set(pageKey, String(pageIndex + 1));
    return u.href;
  }
  function rowKey(r) {
    return [r.patient, r.series, r.workflow, r.template, r.status, r.submitted].join('\0');
  }
  function mergeRows(into, extra) {
    const seen = new Set(into.map(rowKey));
    for (const r of extra) {
      const k = rowKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      into.push(r);
    }
    return into;
  }

  let selfFetches = new Set();
  let lastJobsUrl = '';
  let apiRows = null;
  let apiPath = '';
  let apiState = 'idle';
  let expanding = false;
  let expandTimer = null;
  let customGetJson = null;

  function isSelfUrl(href) {
    try {
      const base = (pageWin().location && pageWin().location.href) || location.href;
      return selfFetches.has(new URL(String(href), base).href);
    } catch (e) { return false; }
  }
  async function getJson(href) {
    if (customGetJson) return customGetJson(href);
    if (!isAllowedGet(href, 'GET')) {
      debug('blocked request', safePath(href));
      return null;
    }
    const base = (pageWin().location && pageWin().location.href) || location.href;
    const u = new URL(href, base);
    selfFetches.add(u.href);
    try {
      const w = pageWin();
      const fetcher = (w && w.fetch) || fetch;
      const res = await fetcher.call(w || window, u.href, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!res || !res.ok) {
        debug('GET failed', safePath(u.href), 'status=' + (res && res.status));
        return null;
      }
      return await res.json();
    } catch (e) {
      debug('GET error', safePath(href));
      return null;
    } finally {
      selfFetches.delete(u.href);
    }
  }
  async function fetchAllPages(href) {
    const all = [];
    let url = href;
    for (let i = 0; i < MAX_PAGES; i++) {
      const data = await getJson(url);
      if (!data) break;
      const col = pickCollection(data);
      if (!col || !col.mapped.length) break;
      mergeRows(all, col.mapped);
      debug('page', safePath(url), 'rows=' + col.mapped.length, 'totalHint=' + (col.total == null ? 'n' : col.total));
      if (col.total != null && all.length >= col.total) break;
      // A short page ends the loop only when the payload did not advertise more rows.
      if (col.rows.length < PAGE_SIZE && (col.total == null || all.length >= col.total)) break;
      const next = nextPageUrl(href, i + 1);
      if (!next || next === url) break;
      url = next;
    }
    return all;
  }
  async function fetchExpanded(href, now, getJsonFn) {
    if (getJsonFn) customGetJson = getJsonFn;
    try {
      if (!isAllowedGet(href, 'GET')) return [];
      const urls = buildExpandedUrls(href, now || nowFn());
      const all = [];
      for (const url of urls) {
        mergeRows(all, await fetchAllPages(url));
      }
      return all;
    } finally {
      if (getJsonFn) customGetJson = null;
    }
  }
  function scheduleExpand(href) {
    if (href) lastJobsUrl = href;
    if (!lastJobsUrl) return;
    if (expandTimer) clearTimeout(expandTimer);
    expandTimer = setTimeout(() => {
      expandTimer = null;
      runExpand();
    }, 150);
  }
  async function runExpand() {
    if (expanding || !lastJobsUrl) return;
    expanding = true;
    apiState = 'loading';
    scheduleRefresh();
    try {
      const rows = await fetchExpanded(lastJobsUrl, nowFn());
      apiRows = rows;
      apiPath = safePath(lastJobsUrl);
      apiState = 'api';
      debug('expanded', apiPath, 'rows=' + rows.length);
    } catch (e) {
      if (!apiRows) apiState = 'dom';
      debug('expand failed', safePath(lastJobsUrl));
    } finally {
      expanding = false;
      scheduleRefresh();
    }
  }
  function considerResponse(href, data, fromSelf) {
    if (!isAllowedGet(href, 'GET')) return false;
    const col = pickCollection(data);
    if (!col) return false;
    debug('jobs payload', safePath(href), 'rows=' + col.mapped.length, 'score=' + col.score, fromSelf ? 'self' : 'page');
    if (!fromSelf && !isSelfUrl(href)) scheduleExpand(href);
    return true;
  }

  function hookFetch(win) {
    if (!win || typeof win.fetch !== 'function' || win.fetch.__zclick) return;
    const orig = win.fetch;
    const wrapped = function (input, init) {
      const method = (init && init.method) || (input && input.method) || 'GET';
      const url = typeof input === 'string' ? input : (input && input.url);
      const p = orig.apply(this === win ? win : this, arguments);
      if (isAllowedGet(url, method)) {
        Promise.resolve(p).then(res => {
          if (!res || typeof res.clone !== 'function') return;
          return res.clone().json().then(data => {
            considerResponse(url, data, isSelfUrl(url));
          }).catch(() => {});
        }).catch(() => {});
      }
      return p;
    };
    wrapped.__zclick = true;
    try { Object.defineProperty(wrapped, 'name', { value: 'fetch' }); } catch (e) { /* ignore */ }
    win.fetch = wrapped;
  }
  function hookXhr(win) {
    if (!win || !win.XMLHttpRequest || !win.XMLHttpRequest.prototype) return;
    const proto = win.XMLHttpRequest.prototype;
    if (proto.__zclickOpen) return;
    const open = proto.open;
    const send = proto.send;
    proto.__zclickOpen = true;
    proto.open = function (method, url) {
      this.__zclickMethod = method;
      this.__zclickUrl = url;
      return open.apply(this, arguments);
    };
    proto.send = function () {
      this.addEventListener('load', function () {
        try {
          if (!isAllowedGet(this.__zclickUrl, this.__zclickMethod)) return;
          const text = this.responseText;
          if (!text) return;
          const first = text.trim()[0];
          if (first !== '{' && first !== '[') return;
          considerResponse(this.__zclickUrl, JSON.parse(text), isSelfUrl(this.__zclickUrl));
        } catch (e) { /* not json */ }
      });
      return send.apply(this, arguments);
    };
  }
  function hookNetwork(win) {
    hookFetch(win);
    hookXhr(win);
  }
  function drainBuf() {
    const w = pageWin();
    const buf = w && w.__zclickBuf;
    if (!buf || !buf.length) return;
    const items = buf.splice(0, buf.length);
    for (const it of items) {
      if (it && it.href) considerResponse(it.href, it.data, isSelfUrl(it.href));
    }
  }
  function injectPageHook() {
    const src = '(' + function () {
      if (window.__zclickHooked) return;
      window.__zclickHooked = true;
      if (!window.__zclickBuf) window.__zclickBuf = [];
      const notify = function (href, data) {
        try {
          window.__zclickBuf.push({ href: String(href || ''), data: data });
          window.dispatchEvent(new CustomEvent('zclick-api', { detail: { href: String(href || '') } }));
        } catch (e) { /* ignore */ }
      };
      const sameOriginGet = function (href, method) {
        const m = String(method == null ? 'GET' : method).toUpperCase();
        if (m !== 'GET' || !href) return false;
        try {
          const u = new URL(String(href), location.href);
          return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === location.origin;
        } catch (e) { return false; }
      };
      if (typeof window.fetch === 'function' && !window.fetch.__zclickPage) {
        const orig = window.fetch;
        const wrapped = function (input, init) {
          const method = (init && init.method) || (input && input.method) || 'GET';
          const url = typeof input === 'string' ? input : (input && input.url);
          const p = orig.apply(this, arguments);
          if (sameOriginGet(url, method)) {
            Promise.resolve(p).then(function (res) {
              if (!res || typeof res.clone !== 'function') return;
              return res.clone().json().then(function (data) { notify(url, data); }).catch(function () {});
            }).catch(function () {});
          }
          return p;
        };
        wrapped.__zclickPage = true;
        window.fetch = wrapped;
      }
      const XHR = window.XMLHttpRequest;
      if (XHR && XHR.prototype && !XHR.prototype.__zclickPageOpen) {
        const open = XHR.prototype.open;
        const send = XHR.prototype.send;
        XHR.prototype.__zclickPageOpen = true;
        XHR.prototype.open = function (method, url) {
          this.__zclickMethod = method;
          this.__zclickUrl = url;
          return open.apply(this, arguments);
        };
        XHR.prototype.send = function () {
          this.addEventListener('load', function () {
            try {
              if (!sameOriginGet(this.__zclickUrl, this.__zclickMethod)) return;
              const text = this.responseText;
              if (!text) return;
              const first = text.trim()[0];
              if (first !== '{' && first !== '[') return;
              notify(this.__zclickUrl, JSON.parse(text));
            } catch (e) { /* ignore */ }
          });
          return send.apply(this, arguments);
        };
      }
    } + ')();';
    const inject = () => {
      const parent = document.documentElement || document.head;
      if (!parent) return false;
      const s = document.createElement('script');
      s.textContent = src;
      parent.appendChild(s);
      s.remove();
      return true;
    };
    try { if (!inject()) document.addEventListener('DOMContentLoaded', inject, { once: true }); }
    catch (e) { debug('page hook inject skipped'); }
    try {
      const w = pageWin();
      w.addEventListener('zclick-api', drainBuf);
    } catch (e) { /* ignore */ }
  }
  function installHooks() {
    hookNetwork(window);
    try { hookNetwork(pageWin()); } catch (e) { /* ignore */ }
    injectPageHook();
  }
  function resetApiState() {
    selfFetches = new Set();
    lastJobsUrl = '';
    apiRows = null;
    apiPath = '';
    apiState = 'idle';
    expanding = false;
    customGetJson = null;
    if (expandTimer) { clearTimeout(expandTimer); expandTimer = null; }
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
  function getRowsAndSource() {
    if (apiRows) return { rows: apiRows, source: 'api', path: apiPath, state: apiState };
    return { rows: extractRows(), source: 'dom', path: '', state: apiState };
  }

  function groupByPatient(rows, now) {
    const when = now || nowFn();
    const range = lastTwoDayRange(when);
    const rosAll = (rows || []).filter(r => r && r.patient && isRosWorkflow(r.workflow));
    const ros = rosAll.filter(r => isWithinLastTwoLocalDays(r.submitted, when));
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
      tableCount: findJobContainers().length,
      rangeLabel: range.label,
      skippedCount: rosAll.length - ros.length
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
      meta.textContent = bits.join(' \u00b7 ');
      li.appendChild(meta);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    parent.appendChild(wrap);
  }
  function sourceLabel(info) {
    if (info.state === 'loading' && !apiRows) return 'Source: loading jobs API\u2026';
    if (info.source === 'api') return 'Source: GET ' + (info.path || '/');
    return 'Source: visible table (API not detected; may be limited by page filters or pagination)';
  }
  function renderBody() {
    const root = panelShadow;
    if (!root) return;
    const body = root.querySelector('.body');
    const totalsEl = root.querySelector('.totals');
    const rangeEl = root.querySelector('.range');
    const sourceEl = root.querySelector('.source');
    if (!body || !totalsEl) return;
    clearNode(body);
    drainBuf();
    const info = getRowsAndSource();
    const summary = groupByPatient(info.rows);
    if (rangeEl) rangeEl.textContent = summary.rangeLabel;
    if (sourceEl) sourceEl.textContent = sourceLabel(info);
    totalsEl.textContent =
      summary.patientCount + ' ROS patient' + (summary.patientCount === 1 ? '' : 's') +
      ' \u00b7 ' + summary.seriesCount + ' series \u00b7 ' +
      summary.matchedCount + ' matched \u00b7 ' +
      summary.unmatchedCount + ' no matching template';
    if (info.state === 'loading' && info.source !== 'api') {
      body.appendChild(el('div', 'empty', 'Loading the last two days from the jobs API\u2026'));
    } else if (info.source !== 'api' && !summary.tableCount) {
      body.appendChild(el('div', 'empty', 'No jobs table found on this page.'));
    } else if (!summary.seriesCount) {
      body.appendChild(el('div', 'empty', 'No ROS workflow jobs in the last two days.'));
    }
    for (const g of summary.groups) {
      const card = el('section', 'patient');
      card.appendChild(el('h2', 'patient-name', g.patient));
      card.appendChild(el(
        'div',
        'patient-counts',
        g.total + ' series \u00b7 ' + g.matchedCount + ' matched \u00b7 ' + g.unmatchedCount + ' no matching template'
      ));
      addSeriesList(card, 'Transferred, no matching template', g.unmatched, false);
      addSeriesList(card, 'Matched', g.matched, true);
      body.appendChild(card);
    }
    log(
      'summary',
      'source=' + info.source,
      'patients=' + summary.patientCount,
      'series=' + summary.seriesCount,
      'matched=' + summary.matchedCount,
      'unmatched=' + summary.unmatchedCount,
      'skipped=' + summary.skippedCount
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
  function onRefresh(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (lastJobsUrl) scheduleExpand(lastJobsUrl);
    else renderBody();
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
      '.head { flex: 1; min-width: 0; }' +
      '.title { font-weight: bold; font-size: 15px; }' +
      '.range { font-size: 11px; opacity: .95; margin-top: 1px; }' +
      '.bar button { font-size: 12px; padding: 3px 8px; border: 0; border-radius: 4px; background: #fff; color: #1565c0; font-weight: bold; cursor: pointer; }' +
      '.totals { padding: 8px 10px 2px; font-size: 12px; color: #333; }' +
      '.source { padding: 0 10px 4px; font-size: 11px; color: #444; border-bottom: 1px solid #e0e0e0; }' +
      '.note { padding: 4px 10px 8px; font-size: 11px; color: #555; }' +
      '.body { padding: 8px 10px 12px; overflow: auto; }' +
      '.wrap.collapsed .totals, .wrap.collapsed .source, .wrap.collapsed .note, .wrap.collapsed .body { display: none; }' +
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
      '<div class="head"><div class="title"></div><div class="range"></div></div>' +
      '<button class="refresh" type="button">Refresh</button>' +
      '<button class="toggle" type="button">Hide</button>' +
      '</div>' +
      '<div class="totals"></div>' +
      '<div class="source"></div>' +
      '<div class="note">Read-only. Prefers the same-origin jobs API (GET only) so the summary is not limited by the page column filters. Falls back to the visible table if the API is not detected. Includes today and yesterday (local date). Never changes page filters or clicks pagination.</div>' +
      '<div class="body"></div>' +
      '</div>';
    panelShadow.querySelector('.title').textContent = PANEL_TITLE;
    panelShadow.querySelector('.refresh').addEventListener('click', onRefresh);
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
      if (!document.getElementById(PANEL_ID)) {
        if (document.body) addPanel();
      } else renderBody();
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
      SCRIPT_VERSION, PANEL_TITLE, PANEL_ID, PAGE_SIZE, DEBUG,
      isRosWorkflow, isMatchedTemplate, headerKey, extractRows, rowsFromContainer,
      groupByPatient, addPanel, renderBody, panelRoot: () => panelShadow,
      parseSubmittedDate, isWithinLastTwoLocalDays, lastTwoDayRange, setNow, formatLocalDate,
      inferDateFormat, formatDateWith, mapJobObject, rowsFromPayload, pickCollection,
      isAllowedGet, buildExpandedUrls, nextPageUrl, fetchExpanded, considerResponse,
      hookNetwork, getRowsAndSource, resetApiState, sourceLabel, safePath, debugEnabled,
      setApiRowsForTest: (rows, path) => { apiRows = rows; apiPath = path || '/api/jobs'; apiState = rows ? 'api' : 'idle'; lastJobsUrl = path || lastJobsUrl; },
      norm
    };
    return;
  }

  installHooks();
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
