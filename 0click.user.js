// ==UserScript==
// @name         0click
// @namespace    https://github.com/mobility22/0click
// @version      1.9
// @description  Read-only AutoContour Zero-Click Jobs History summary
// @match        http://10.240.61.81:18001/*
// @updateURL    https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js
// @downloadURL  https://raw.githubusercontent.com/mobility22/0click/refs/heads/main/0click.user.js
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_setClipboard
// @inject-into  page
// ==/UserScript==

// 0click 1.9 — AutoContour Zero-Click Jobs History summary (read-only)

(function () {
  'use strict';
  const TAG = '[0click]';
  const SCRIPT_VERSION = '1.9';
  const PANEL_TITLE = '0click 1.9';
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
  function applyTime(d, hour, minute, second) {
    if (!d) return null;
    const out = new Date(d.getTime());
    out.setHours(Number(hour || 0), Number(minute || 0), Number(second || 0), 0);
    return out;
  }
  function parseSubmittedDateTime(text) {
    const t = norm(text);
    if (!t) return null;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
    if (m) return applyTime(localYmd(Number(m[1]), Number(m[2]), Number(m[3])), m[4], m[5], m[6]);
    m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
    if (m) return applyTime(localYmd(Number(m[3]), Number(m[1]), Number(m[2])), m[4], m[5], m[6]);
    return null;
  }
  function formatClock(d) {
    const pad = n => String(n).padStart(2, '0');
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function formatLastSubmitted(text, now) {
    const d = parseSubmittedDateTime(text);
    if (!d) return norm(text);
    const today = startOfLocalDay(now || nowFn());
    const day = startOfLocalDay(d);
    if (day.getTime() === today.getTime()) return formatClock(d);
    const pad = n => String(n).padStart(2, '0');
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + formatClock(d);
  }
  function latestSubmittedText(rows) {
    let best = null, bestText = '';
    for (const r of rows || []) {
      const d = parseSubmittedDateTime(r && r.submitted);
      if (!d) continue;
      if (!best || d.getTime() > best.getTime()) {
        best = d;
        bestText = r.submitted;
      }
    }
    return bestText;
  }
  const SHORT_WORDS = 3;
  const SHORT_MAX = 20;
  function shortSeriesLabel(text) {
    const full = norm(text);
    if (!full) return '';
    const words = full.split(' ');
    let short = words.slice(0, SHORT_WORDS).join(' ');
    if (short.length > SHORT_MAX) {
      let cut = short.slice(0, SHORT_MAX);
      if (cut.lastIndexOf(' ') > 8) cut = cut.slice(0, cut.lastIndexOf(' '));
      short = cut;
    }
    short = short.replace(/[.,;:\s]+$/, '');
    if (short.length < full.length) short += '…';
    return short;
  }
  const PHASE_RE = /^T=(\d+)%/;
  const MAX_CELL_LINES = 3;
  function parsePhasePercent(text) {
    const m = PHASE_RE.exec(norm(text));
    return m ? Number(m[1]) : null;
  }
  function firstSeriesToken(text) {
    const full = norm(text);
    if (!full) return '';
    const m = /^([A-Za-z][A-Za-z0-9_.-]*(?:\([^)]+\))?)/.exec(full);
    if (m) return m[1];
    return full.split(/\s+/)[0] || full;
  }
  function uniqueSortedNums(nums) {
    return [...new Set((nums || []).filter(n => Number.isFinite(n)))].sort((a, b) => a - b);
  }
  function compactPhaseList(percents) {
    const nums = uniqueSortedNums(percents);
    if (!nums.length) return '';
    if (nums.length === 1) return 'T ' + nums[0] + '%';
    if (nums.length <= 5) return 'T ' + nums.join(',') + '%';
    return 'T ' + nums[0] + ',' + nums[1] + ',' + nums[2] + ',\u2026,' + nums[nums.length - 1] + '%';
  }
  function phaseLineLabel(percents, count) {
    const nums = uniqueSortedNums(percents);
    let inner = compactPhaseList(nums);
    if (nums.length >= 5) inner = 'T ' + nums[0] + '\u2013' + nums[nums.length - 1] + '%';
    return '4D phases \u00d7' + count + ' (' + inner + ')';
  }
  function templatePrefix(templates) {
    const uniq = [];
    for (const t of templates || []) {
      const s = norm(t);
      if (s && uniq.indexOf(s) === -1) uniq.push(s);
    }
    return uniq.length ? uniq.join(', ') + ' \u2190 ' : '';
  }
  function packLines(lead, groups, maxLines) {
    const out = [];
    if (lead) out.push(lead);
    const room = Math.max(1, maxLines - out.length);
    if (groups.length <= room) return out.concat(groups);
    const head = groups.slice(0, room - 1);
    const tail = groups.slice(room - 1);
    const packed = {
      label: tail.map(g => g.label).join(', '),
      title: tail.map(g => g.title).filter(Boolean).join('\n')
    };
    return out.concat(head).concat([packed]);
  }
  function consolidateSeriesLines(items, withTemplate) {
    const list = items || [];
    const phases = [];
    const other = [];
    for (const item of list) {
      const full = norm(item && item.series) || '(no series description)';
      if (parsePhasePercent(full) != null) phases.push(item);
      else other.push(item);
    }
    const allTitles = list.map(item => {
      const full = norm(item && item.series) || '(no series description)';
      const tmpl = withTemplate ? norm(item && item.template) : '';
      return tmpl ? (tmpl + ' \u2190 ' + full) : full;
    });
    const fullTitle = allTitles.join('\n');
    let lead = null;
    if (phases.length) {
      const percents = phases.map(item => parsePhasePercent(item && item.series));
      const tmpl = withTemplate ? templatePrefix(phases.map(item => item && item.template)) : '';
      lead = {
        label: tmpl + phaseLineLabel(percents, phases.length),
        title: (compactPhaseList(percents) ? compactPhaseList(percents) + '\n' : '') +
          phases.map(item => {
            const full = norm(item && item.series) || '(no series description)';
            const t = withTemplate ? norm(item && item.template) : '';
            return t ? (t + ' \u2190 ' + full) : full;
          }).join('\n')
      };
    }
    const order = [];
    const map = new Map();
    for (const item of other) {
      const full = norm(item && item.series) || '(no series description)';
      const token = firstSeriesToken(full) || full;
      if (!map.has(token)) {
        map.set(token, { token: token, items: [] });
        order.push(token);
      }
      map.get(token).items.push(item);
    }
    const groups = order.map(token => {
      const recs = map.get(token).items;
      const first = recs[0];
      const short = shortSeriesLabel(first && first.series) || token;
      const tmpl = withTemplate ? templatePrefix(recs.map(r => r && r.template)) : '';
      const label = tmpl + short + (recs.length > 1 ? ' \u00d7' + recs.length : '');
      const title = recs.map(r => {
        const full = norm(r && r.series) || '(no series description)';
        const t = withTemplate ? norm(r && r.template) : '';
        return t ? (t + ' \u2190 ' + full) : full;
      }).join('\n');
      return { label: label, title: title };
    });
    const lines = packLines(lead, groups, MAX_CELL_LINES);
    return lines.map(line => ({ label: line.label, title: line.title || fullTitle }));
  }
  function consolidateUnmatched(items) {
    const ok = (items || []).filter(r => !isProblemStatus(r && r.status));
    return errorSeriesLines(items, false).concat(consolidateSeriesLines(ok, false));
  }
  function formatMatchedItems(items) {
    const ok = (items || []).filter(r => !isProblemStatus(r && r.status));
    return errorSeriesLines(items, true).concat(consolidateSeriesLines(ok, true));
  }
  function dayKind(text, now) {
    const d = parseSubmittedDate(text);
    if (!d) return null;
    const today = startOfLocalDay(now || nowFn());
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const t = startOfLocalDay(d).getTime();
    if (t === today.getTime()) return 'today';
    if (t === yesterday.getTime()) return 'yesterday';
    return null;
  }
  function rowsForDay(rows, which, now) {
    const when = now || nowFn();
    return (rows || []).filter(r => r && dayKind(r.submitted, when) === which);
  }
  function summarizeDay(rows, which, now) {
    const when = now || nowFn();
    const range = lastTwoDayRange(when);
    const dayDate = which === 'today' ? range.end : range.start;
    const summary = groupByPatient(rowsForDay(rows, which, when), when);
    summary.day = which;
    summary.dateLabel = formatLocalDate(dayDate);
    summary.sectionTitle = (which === 'today' ? 'TODAY' : 'YESTERDAY') + ' (' + summary.dateLabel + ')';
    return summary;
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
  function statusLabel(text) {
    return String(text == null ? '' : text).trim();
  }
  // Problem statuses: Error/Failed/Cancelled/Timeout (case-insensitive),
  // or any status containing "error"/"fail". "Completed" and "Transferred" are not errors.
  function isProblemStatus(status) {
    const t = statusLabel(status);
    if (!t) return false;
    const low = t.toLowerCase();
    if (low === 'completed') return false;
    if (low.indexOf('error') !== -1 || low.indexOf('fail') !== -1) return true;
    if (/^(cancelled|canceled|timeout|timed[\s-]*out)$/i.test(t)) return true;
    return false;
  }
  function countErrorSeries(items) {
    let n = 0;
    for (const r of items || []) {
      if (isProblemStatus(r && r.status)) n += 1;
    }
    return n;
  }
  function errorSeriesLines(items, withTemplate) {
    const errors = (items || []).filter(r => isProblemStatus(r && r.status));
    const order = [];
    const map = new Map();
    for (const r of errors) {
      const short = shortSeriesLabel(r && r.series) || '(no series description)';
      const tmpl = withTemplate ? templatePrefix([r && r.template]) : '';
      const st = statusLabel(r && r.status);
      const key = tmpl + '\0' + short + '\0' + st.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { tmpl: tmpl, short: short, st: st, items: [] });
        order.push(key);
      }
      map.get(key).items.push(r);
    }
    return order.map(key => {
      const g = map.get(key);
      const label = g.tmpl + g.short + (g.items.length > 1 ? ' \u00d7' + g.items.length : '');
      const title = g.items.map(r => {
        const full = norm(r && r.series) || '(no series description)';
        const t = withTemplate ? norm(r && r.template) : '';
        const base = t ? (t + ' \u2190 ' + full) : full;
        const st = statusLabel(r && r.status);
        return st ? (base + ' [' + st + ']') : base;
      }).join('\n');
      return { label: label, title: title, error: true, status: g.st, rows: g.items };
    });
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
  let drainTimer = null;
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
    try {
      Object.defineProperty(win, 'fetch', { configurable: true, enumerable: true, writable: true, value: wrapped });
    } catch (e) {
      try { win.fetch = wrapped; } catch (e2) { /* page may lock fetch */ }
    }
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
    try {
      window.addEventListener('zclick-api', drainBuf);
    } catch (e) { /* ignore */ }
    if (!drainTimer) drainTimer = setInterval(drainBuf, 400);
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
  function rowsFromContainer(root, withEl) {
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
      out.push(withEl ? { rec: rec, el: row } : rec);
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
  function collectDomJobRows() {
    const out = [];
    for (const root of findJobContainers()) {
      out.push.apply(out, rowsFromContainer(root, true));
    }
    return out;
  }
  function findDomRowFor(name, wanted) {
    const seriesSet = new Set((wanted || []).map(r => norm(r.series)).filter(Boolean));
    const dateSet = new Set((wanted || []).map(r => norm(r.submitted)).filter(Boolean));
    let fallback = null;
    for (const item of collectDomJobRows()) {
      const rec = item && item.rec, el = item && item.el;
      if (!rec || !el || norm(rec.patient) !== name) continue;
      if (!fallback) fallback = el;
      if ((rec.series && seriesSet.has(norm(rec.series))) || (rec.submitted && dateSet.has(norm(rec.submitted)))) {
        return el;
      }
    }
    return wanted && wanted.length ? null : fallback;
  }
  function findPatientDomRow(group) {
    const name = norm(group && group.patient);
    if (!name) return null;
    const matched = (group && group.matched) || [];
    const unmatched = (group && group.unmatched) || [];
    if (matched.length) {
      const hit = findDomRowFor(name, matched);
      if (hit) return hit;
    }
    return findDomRowFor(name, unmatched.concat(matched)) || findDomRowFor(name, []);
  }
  function sameStatus(a, b) {
    return norm(statusLabel(a)).toLowerCase() === norm(statusLabel(b)).toLowerCase();
  }
  function findErrorDomRow(patient, rows) {
    const name = norm(patient);
    if (!name) return null;
    for (const want of rows || []) {
      for (const item of collectDomJobRows()) {
        const rec = item && item.rec, el = item && item.el;
        if (!rec || !el || norm(rec.patient) !== name) continue;
        if (norm(rec.series) === norm(want && want.series) &&
            norm(rec.submitted) === norm(want && want.submitted) &&
            sameStatus(rec.status, want && want.status)) {
          return el;
        }
      }
    }
    return null;
  }
  function locateErrorSeries(patient, rows) {
    const row = findErrorDomRow(patient, rows);
    if (row) {
      setLocateNote('');
      highlightDomRow(row, 'error');
      debug('locate-error', 'ok');
      return true;
    }
    setLocateNote('not on this page');
    debug('locate-error', 'not-on-page');
    return false;
  }
  const FLASH_MS = 2000;
  let flashTimer = null, flashEl = null, flashPrev = null;
  function clearFlash() {
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    if (flashEl && flashPrev) {
      try {
        flashEl.style.outline = flashPrev.outline;
        flashEl.style.outlineOffset = flashPrev.outlineOffset;
        flashEl.style.backgroundColor = flashPrev.backgroundColor;
        flashEl.style.transition = flashPrev.transition;
        flashEl.style.boxShadow = flashPrev.boxShadow;
      } catch (e) { /* ignore */ }
    }
    flashEl = null;
    flashPrev = null;
  }
  function highlightDomRow(rowEl, tone) {
    if (!rowEl) return false;
    clearFlash();
    flashEl = rowEl;
    flashPrev = {
      outline: rowEl.style.outline,
      outlineOffset: rowEl.style.outlineOffset,
      backgroundColor: rowEl.style.backgroundColor,
      transition: rowEl.style.transition,
      boxShadow: rowEl.style.boxShadow
    };
    const error = tone === 'error';
    rowEl.style.transition = 'background-color 0.2s, box-shadow 0.2s';
    rowEl.style.outline = error ? '3px solid #c62828' : '3px solid #1565c0';
    rowEl.style.outlineOffset = '-2px';
    rowEl.style.backgroundColor = error ? '#ffcdd2' : '#fff59d';
    rowEl.style.boxShadow = error ? '0 0 0 3px rgba(198,40,40,.45)' : '0 0 0 3px rgba(21,101,192,.35)';
    try { rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    catch (e) {
      try { rowEl.scrollIntoView(true); } catch (e2) { /* ignore */ }
    }
    flashTimer = setTimeout(clearFlash, FLASH_MS);
    return true;
  }
  function setLocateNote(text) {
    const root = panelShadow;
    const note = root && root.querySelector('.locate-note');
    if (!note) return;
    const msg = text ? String(text) : '';
    note.textContent = msg;
    note.style.display = msg ? 'block' : 'none';
  }
  // Patient cell form: "LAST, FIRST (ID)". Use the last parentheses only.
  // Allowed ID characters: alphanumerics plus $ - _. Never log or store the ID.
  function extractPatientId(patient) {
    const text = patient == null ? '' : String(patient);
    const open = text.lastIndexOf('(');
    const close = text.lastIndexOf(')');
    if (open < 0 || close <= open) return '';
    const id = text.slice(open + 1, close).trim();
    if (!id || !/^[A-Za-z0-9$_-]+$/.test(id)) return '';
    return id;
  }
  function tryGmSetClipboard(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, 'text');
        return true;
      }
    } catch (e) { /* fall through */ }
    return false;
  }
  function writeClipboard(text) {
    if (tryGmSetClipboard(text)) return Promise.resolve(true);
    try {
      const clip = (typeof navigator !== 'undefined' && navigator.clipboard) ? navigator.clipboard : null;
      if (clip && typeof clip.writeText === 'function') {
        return Promise.resolve(clip.writeText(text)).then(function () { return true; }).catch(function () { return false; });
      }
    } catch (e) { /* ignore */ }
    return Promise.resolve(false);
  }
  function copyPatientId(patient) {
    const id = extractPatientId(patient);
    if (!id) return Promise.resolve('missing');
    return writeClipboard(id).then(function (ok) { return ok ? 'copied' : 'failed'; });
  }
  function locateNotes(copyStatus, found) {
    const parts = [];
    if (copyStatus === 'missing') parts.push('ID not found');
    if (!found) parts.push('not on this page');
    return parts.join('. ');
  }
  function locatePatient(group) {
    const row = findPatientDomRow(group);
    if (row) {
      highlightDomRow(row);
      debug('locate', 'ok');
    } else {
      debug('locate', 'not-on-page');
    }
    const id = extractPatientId(group && group.patient);
    if (!id) {
      setLocateNote(locateNotes('missing', !!row));
      return !!row;
    }
    // Prefer GM_setClipboard so the note can update immediately. The ID is not kept or logged.
    if (tryGmSetClipboard(id)) {
      setLocateNote(locateNotes('copied', !!row));
      return !!row;
    }
    writeClipboard(id).then(function (ok) {
      setLocateNote(locateNotes(ok ? 'copied' : 'failed', !!row));
    });
    return !!row;
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
        unmatchedCount: g.unmatched.length,
        errorCount: countErrorSeries(g.matched.concat(g.unmatched))
      };
    });
    return {
      groups,
      patientCount: groups.length,
      seriesCount: ros.length,
      matchedCount: groups.reduce((n, g) => n + g.matchedCount, 0),
      unmatchedCount: groups.reduce((n, g) => n + g.unmatchedCount, 0),
      errorCount: countErrorSeries(ros),
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
  function addLines(td, items, kind, patient) {
    if (!items.length) {
      td.appendChild(el('span', 'none', '—'));
      return;
    }
    const wrap = el('div', 'cell-lines');
    wrap.title = items.map(item => item.title).filter(Boolean).join('\n') || items.map(item => item.label).join('\n');
    for (const item of items) {
      const cls = 'cell-line ' + kind + (item && item.error ? ' series-error' : '');
      const line = el('div', cls);
      line.appendChild(document.createTextNode(item.label || ''));
      if (item && item.error && item.status) {
        const chip = el('button', 'status-chip', item.status);
        chip.type = 'button';
        const recs = item.rows || [];
        chip.addEventListener('click', ev => {
          ev.preventDefault();
          ev.stopPropagation();
          locateErrorSeries(patient, recs);
        });
        line.appendChild(chip);
      }
      if (item.title) line.title = item.title;
      wrap.appendChild(line);
    }
    td.appendChild(wrap);
  }
  function sourceLabel(info) {
    if (info.state === 'loading' && !apiRows) return 'Source: loading jobs API…';
    if (info.source === 'api') return 'Source: GET ' + (info.path || '/');
    return 'Source: visible table (API not detected; may be limited by page filters or pagination)';
  }
  function appendPatientRows(tbody, daySummary, splitFirst) {
    const day = daySummary.day;
    let first = true;
    for (const g of daySummary.groups) {
      const alert = g.unmatchedCount > 0 && g.matchedCount === 0;
      const tr = el('tr', 'day-' + day + (alert ? ' alert' : '') + (splitFirst && first ? ' day-split' : ''));
      first = false;
      const ptd = el('td', 'patient-cell');
      if (alert) {
        const mark = el('span', 'alert-mark', '!');
        mark.title = 'Unmatched only';
        ptd.appendChild(mark);
        ptd.appendChild(document.createTextNode(' '));
      }
      const btn = el('button', 'patient-link', g.patient);
      btn.type = 'button';
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        locatePatient(g);
      });
      ptd.appendChild(btn);
      tr.appendChild(ptd);
      const utd = el('td', 'unmatched-cell');
      addLines(utd, consolidateUnmatched(g.unmatched), 'unmatched', g.patient);
      tr.appendChild(utd);
      const mtd = el('td', 'matched-cell');
      addLines(mtd, formatMatchedItems(g.matched), 'matched', g.patient);
      tr.appendChild(mtd);
      const all = (g.matched || []).concat(g.unmatched || []);
      const latest = latestSubmittedText(all);
      const ttd = el('td', 'time');
      if (latest) {
        const dt = parseSubmittedDateTime(latest);
        ttd.textContent = dt ? formatClock(dt) : formatLastSubmitted(latest);
        ttd.title = String(latest);
      } else {
        ttd.appendChild(el('span', 'none', '—'));
      }
      tr.appendChild(ttd);
      tbody.appendChild(tr);
    }
  }
  function renderSummaryTable(body, rows, overall) {
    const today = summarizeDay(rows, 'today');
    const yesterday = summarizeDay(rows, 'yesterday');
    const table = el('table', 'grid');
    const thead = el('thead');
    const hr = el('tr');
    hr.appendChild(el('th', '', 'Patient'));
    hr.appendChild(el('th', '', 'Unmatched (' + overall.unmatchedCount + ')'));
    hr.appendChild(el('th', '', 'Matched'));
    hr.appendChild(el('th', '', 'Last submitted'));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el('tbody');
    appendPatientRows(tbody, today);
    appendPatientRows(tbody, yesterday, today.groups.length > 0 && yesterday.groups.length > 0);
    table.appendChild(tbody);
    const tfoot = el('tfoot');
    const fr = el('tr');
    fr.appendChild(el('td', '', overall.patientCount + ' patient' + (overall.patientCount === 1 ? '' : 's')));
    fr.appendChild(el('td', '', overall.unmatchedCount + ' unmatched'));
    fr.appendChild(el('td', '', overall.matchedCount + ' matched'));
    fr.appendChild(el('td', '', ''));
    tfoot.appendChild(fr);
    table.appendChild(tfoot);
    body.appendChild(table);
  }
  function renderBody() {
    const root = panelShadow;
    if (!root) return;
    const body = root.querySelector('.body');
    const totalsEl = root.querySelector('.totals');
    if (!body || !totalsEl) return;
    clearNode(body);
    drainBuf();
    const info = getRowsAndSource();
    const summary = groupByPatient(info.rows);
    clearNode(totalsEl);
    totalsEl.appendChild(document.createTextNode(
      summary.patientCount + ' patient' + (summary.patientCount === 1 ? '' : 's') +
      ' · ' + summary.seriesCount + ' series · ' +
      summary.matchedCount + ' matched · ' +
      summary.unmatchedCount + ' unmatched'
    ));
    if (summary.errorCount > 0) {
      totalsEl.appendChild(document.createTextNode(' · '));
      totalsEl.appendChild(el('span', 'error-count', summary.errorCount + ' error' + (summary.errorCount === 1 ? '' : 's')));
    }
    totalsEl.title = sourceLabel(info);
    if (info.state === 'loading' && info.source !== 'api') {
      body.appendChild(el('div', 'empty', 'Loading the last two days from the jobs API…'));
    } else if (info.source !== 'api' && !summary.tableCount) {
      body.appendChild(el('div', 'empty', 'No jobs table found on this page.'));
    } else if (!summary.seriesCount) {
      body.appendChild(el('div', 'empty', 'No matching workflow jobs in the last two days.'));
    } else {
      renderSummaryTable(body, info.rows, summary);
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
    const host = document.getElementById(PANEL_ID);
    if (host) {
      if (collapsed) {
        if (!host.dataset.openHeight) host.dataset.openHeight = host.style.height || '520px';
        host.style.height = 'auto';
        host.style.resize = 'none';
      } else {
        host.style.height = host.dataset.openHeight || '520px';
        host.style.resize = 'both';
      }
    }
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
    panel.style.cssText = 'position:fixed;bottom:16px;right:16px;top:auto;z-index:99999;width:700px;max-width:calc(100vw - 32px);min-width:520px;min-height:180px;height:520px;max-height:calc(100vh - 32px);resize:both;overflow:hidden;background:transparent;';
    // Closed shadow root so Ctrl+F does not match panel text (including patient names).
    panelShadow = panel.attachShadow({ mode: 'closed' });
    panelShadow.innerHTML =
      '<style>' +
      ':host, .wrap { font: 12px/1.35 sans-serif; color: #111; }' +
      '.wrap { width: 100%; height: 100%; background: #fff; border: 2px solid #1565c0; border-radius: 8px; box-shadow: 0 3px 10px rgba(0,0,0,.35); box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }' +
      '.bar { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: #1565c0; color: #fff; flex: 0 0 auto; }' +
      '.head { flex: 1; min-width: 0; }' +
      '.title { font-weight: bold; font-size: 15px; }' +
      '.bar button { font-size: 12px; padding: 3px 8px; border: 0; border-radius: 4px; background: #fff; color: #1565c0; font-weight: bold; cursor: pointer; }' +
      '.totals { padding: 6px 10px 6px; font-size: 12px; color: #333; flex: 0 0 auto; }' +
      '.body { padding: 0 0 0; overflow: auto; flex: 1 1 auto; min-height: 0; border-top: 1px solid #e0e0e0; }' +
      '.wrap.collapsed .totals, .wrap.collapsed .locate-note, .wrap.collapsed .body { display: none; }' +
      '.wrap.collapsed { height: auto; }' +
      '.empty { color: #555; font-style: italic; margin: 8px 10px; }' +
      'table.grid { width: 100%; border-collapse: collapse; table-layout: auto; }' +
      'table.grid th, table.grid td { border: 1px solid #c5d4e8; padding: 5px 7px; vertical-align: top; text-align: left; }' +
      'table.grid thead th { position: sticky; top: 0; background: #1565c0; color: #fff; z-index: 1; font-weight: 700; box-shadow: 0 1px 0 #0d47a1; }' +
      'table.grid tbody tr.day-today td { background: #e3f2fd; border-left: 4px solid #1976d2; }' +
      'table.grid tbody tr.day-yesterday.day-split td { border-top: 2px solid #90a4ae; }' +
      'table.grid tbody tr.day-yesterday td { background: #eceff1; color: #546e7a; border-left: 4px solid #90a4ae; }' +
      'table.grid tbody tr.day-yesterday .patient-link { color: #37474f; }' +
      'table.grid tbody tr.alert td { background: #ffe0b2; border-left: 5px solid #e65100; color: #4e342e; }' +
      'table.grid tbody tr.day-today.alert td, table.grid tbody tr.day-yesterday.alert td { background: #ffe0b2; border-left: 5px solid #e65100; color: #4e342e; }' +
      'table.grid tbody tr.alert .patient-link, table.grid tbody tr.day-yesterday.alert .patient-link { color: #bf360c; }' +
      '.error-count { color: #c62828; font-weight: 800; }' +
      '.cell-line.series-error { color: #b71c1c; font-weight: 700; }' +
      '.status-chip { display: inline-block; margin-left: 5px; background: #c62828; color: #fff; font-size: 10px; font-weight: 800; line-height: 1.4; padding: 0 5px; border: 0; border-radius: 3px; vertical-align: middle; letter-spacing: .03em; font-family: inherit; cursor: pointer; }' +
      'table.grid tfoot td { position: sticky; bottom: 0; background: #eceff1; font-weight: 700; box-shadow: 0 -1px 0 #cfd8dc; }' +
      'td.patient-cell { font-weight: 600; white-space: nowrap; }' +
      'button.patient-link { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: #0d47a1; text-decoration: underline; cursor: pointer; }' +
      'td.time { white-space: nowrap; color: #333; }' +
      '.alert-mark { display: inline-block; margin-right: 4px; background: #ef6c00; color: #fff; font-weight: 800; font-size: 10px; line-height: 1.4; padding: 0 5px; border-radius: 3px; vertical-align: middle; }' +
      '.locate-note { display: none; padding: 4px 10px; font-size: 11px; color: #b71c1c; flex: 0 0 auto; }' +
      '.cell-lines { display: flex; flex-direction: column; gap: 1px; }' +
      '.cell-line { font-size: 11px; line-height: 1.35; }' +
      '.cell-line.unmatched { }' +
      '.cell-line.matched { }' +
      '.none { color: #888; }' +
      '</style>' +
      '<div class="wrap">' +
      '<div class="bar">' +
      '<div class="head"><div class="title"></div></div>' +
      '<button class="refresh" type="button">Refresh</button>' +
      '<button class="toggle" type="button">Hide</button>' +
      '</div>' +
      '<div class="totals"></div>' +
      '<div class="locate-note"></div>' +
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
      parseSubmittedDate, parseSubmittedDateTime, isWithinLastTwoLocalDays, lastTwoDayRange, setNow, formatLocalDate,
      inferDateFormat, formatDateWith, mapJobObject, rowsFromPayload, pickCollection,
      isAllowedGet, buildExpandedUrls, nextPageUrl, fetchExpanded, considerResponse,
      hookNetwork, getRowsAndSource, resetApiState, sourceLabel, safePath, debugEnabled,
      shortSeriesLabel, consolidateUnmatched, formatMatchedItems, formatLastSubmitted, latestSubmittedText,
      parsePhasePercent, firstSeriesToken, compactPhaseList, phaseLineLabel, consolidateSeriesLines,
      dayKind, summarizeDay, rowsForDay, MAX_CELL_LINES,
      collectDomJobRows, findPatientDomRow, locatePatient, highlightDomRow, setLocateNote, FLASH_MS,
      extractPatientId, copyPatientId, writeClipboard, locateNotes,
      isProblemStatus, countErrorSeries, errorSeriesLines, statusLabel,
      findErrorDomRow, locateErrorSeries, sameStatus,
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
