'use strict';

const OFFSET_MINUTES = 330;
const STORAGE_KEY = 'convertToIst';
const DEBOUNCE_MS = 100;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MONTH_RE = MONTHS.join('|');
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);

const RE_WITH_YEAR = new RegExp(
  `\\b(${MONTH_RE})\\s+(\\d{1,2}),\\s+(\\d{4}),\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)(?:\\s*UTC)?\\b`,
  'gi'
);
const RE_NO_YEAR = new RegExp(
  `\\b(${MONTH_RE})\\s+(\\d{1,2}),\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)(?:\\s*UTC)?\\b`,
  'gi'
);
const RE_ISO_T = /\b(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]00:00)\b/g;
const RE_ISO_SPACE = /\b(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*UTC\b/g;
const RE_BARE_TIME = /\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi;
const RE_MONTH_DAY_YEAR = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2}),\\s+(\\d{4})\\b`, 'i');
const RE_MONTH_DAY = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:,\\b)?`, 'i');
const RE_ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

let enabled = true;
let isWriting = false;
let debounceTimer = null;
let observer = null;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function monthIndex(name) {
  const i = MONTHS.findIndex((m) => m.toLowerCase() === name.toLowerCase());
  return i;
}

function to12Hour(hours24) {
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  let hour = hours24 % 12;
  if (hour === 0) hour = 12;
  return { hour, ampm };
}

function addIstOffset(date) {
  return new Date(date.getTime() + OFFSET_MINUTES * 60 * 1000);
}

function istParts(utcDate) {
  const ist = addIstOffset(utcDate);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth(),
    day: ist.getUTCDate(),
    hours: ist.getUTCHours(),
    minutes: ist.getUTCMinutes(),
    seconds: ist.getUTCSeconds(),
  };
}

function resolveYear(month, day) {
  const now = new Date();
  let year = now.getFullYear();
  const assumedUtc = Date.UTC(year, month, day);
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  if (assumedUtc - now.getTime() > twoDaysMs) {
    year -= 1;
  }
  return year;
}

function formatMonthDayTime(parts, year, includeYear) {
  const { hour, ampm } = to12Hour(parts.hours);
  const month = MONTHS[parts.month];
  const time = `${pad2(hour)}:${pad2(parts.minutes)} ${ampm}`;
  if (includeYear) {
    return `${month} ${parts.day}, ${year}, ${time} IST`;
  }
  return `${month} ${parts.day}, ${time} IST`;
}

function parse12HourToUtc(year, month, day, hour12, minute, ampm) {
  let hour = Number(hour12) % 12;
  if (String(ampm).toUpperCase() === 'PM') hour += 12;
  return new Date(Date.UTC(year, month, day, hour, Number(minute), 0));
}

function convertNoYear(monthName, day, hour, minute, ampm) {
  const month = monthIndex(monthName);
  if (month < 0) return null;
  const d = Number(day);
  const year = resolveYear(month, d);
  const utc = parse12HourToUtc(year, month, d, hour, minute, ampm);
  const parts = istParts(utc);
  return formatMonthDayTime(parts, parts.year, false);
}

function convertWithYear(monthName, day, year, hour, minute, ampm) {
  const month = monthIndex(monthName);
  if (month < 0) return null;
  const utc = parse12HourToUtc(Number(year), month, Number(day), hour, minute, ampm);
  const parts = istParts(utc);
  return formatMonthDayTime(parts, parts.year, true);
}

function convertIsoT(dateStr, hour, minute, second) {
  const sec = second == null || second === '' ? 0 : Number(second);
  const utc = new Date(`${dateStr}T${hour}:${minute}:${pad2(sec)}.000Z`);
  if (Number.isNaN(utc.getTime())) return null;
  const p = istParts(utc);
  const keepSeconds = second != null && second !== '';
  const time = keepSeconds
    ? `${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}`
    : `${pad2(p.hours)}:${pad2(p.minutes)}`;
  return `${p.year}-${pad2(p.month + 1)}-${pad2(p.day)}T${time} IST`;
}

function convertIsoSpace(dateStr, hour, minute, second) {
  const sec = second == null || second === '' ? 0 : Number(second);
  const utc = new Date(`${dateStr}T${hour}:${minute}:${pad2(sec)}.000Z`);
  if (Number.isNaN(utc.getTime())) return null;
  const p = istParts(utc);
  const keepSeconds = second != null && second !== '';
  const time = keepSeconds
    ? `${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}`
    : `${pad2(p.hours)}:${pad2(p.minutes)}`;
  return `${p.year}-${pad2(p.month + 1)}-${pad2(p.day)} ${time} IST`;
}

function convertBareTime(hour, minute, ampm, contextDate) {
  const year = contextDate.year;
  const month = contextDate.month;
  const day = contextDate.day;
  const utc = parse12HourToUtc(year, month, day, hour, minute, ampm);
  const p = istParts(utc);
  const { hour: h, ampm: ap } = to12Hour(p.hours);
  return `${pad2(h)}:${pad2(p.minutes)} ${ap} IST`;
}

function findDateContext(node) {
  let el = node.parentElement;
  for (let i = 0; i < 8 && el; i += 1) {
    const text = el.textContent || '';
    const withYear = text.match(RE_MONTH_DAY_YEAR);
    if (withYear) {
      const month = monthIndex(withYear[1]);
      if (month >= 0) {
        return { year: Number(withYear[3]), month, day: Number(withYear[2]) };
      }
    }
    const iso = text.match(RE_ISO_DATE);
    if (iso) {
      const [y, m, d] = iso[1].split('-').map(Number);
      return { year: y, month: m - 1, day: d };
    }
    const noYear = text.match(RE_MONTH_DAY);
    if (noYear) {
      const month = monthIndex(noYear[1]);
      if (month >= 0) {
        const day = Number(noYear[2]);
        return { year: resolveYear(month, day), month, day };
      }
    }
    el = el.parentElement;
  }
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth(),
    day: now.getUTCDate(),
  };
}

function isChartTooltip(el) {
  if (!el) return false;
  if (el.closest('[role="tooltip"]')) return true;
  if (el.closest('[data-radix-tooltip-content]')) return true;
  if (el.closest('[data-state="delayed-open"], [data-state="instant-open"]')) return true;
  const hit = el.closest('[class], [id]');
  if (!hit) return false;
  const label = `${hit.className || ''} ${hit.id || ''}`;
  return /tooltip/i.test(label);
}

function ancestorHasDate(node) {
  let el = node.parentElement;
  for (let i = 0; i < 8 && el; i += 1) {
    const text = el.textContent || '';
    if (RE_MONTH_DAY_YEAR.test(text) || RE_ISO_DATE.test(text) || RE_MONTH_DAY.test(text)) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

function canConvertBareTime(node) {
  const el = node.parentElement;
  if (!el) return false;
  if (isChartTooltip(el)) return true;
  return ancestorHasDate(node);
}

function transformText(text, node) {
  if (!text || !text.trim()) return text;

  let next = text;
  let replacedAbsolute = false;

  next = next.replace(RE_WITH_YEAR, (match, month, day, year, hour, minute, ampm) => {
    const converted = convertWithYear(month, day, year, hour, minute, ampm);
    if (!converted) return match;
    replacedAbsolute = true;
    return converted;
  });

  next = next.replace(RE_NO_YEAR, (match, month, day, hour, minute, ampm) => {
    const converted = convertNoYear(month, day, hour, minute, ampm);
    if (!converted) return match;
    replacedAbsolute = true;
    return converted;
  });

  next = next.replace(RE_ISO_T, (match, dateStr, hour, minute, second) => {
    const converted = convertIsoT(dateStr, hour, minute, second);
    if (!converted) return match;
    replacedAbsolute = true;
    return converted;
  });

  next = next.replace(RE_ISO_SPACE, (match, dateStr, hour, minute, second) => {
    const converted = convertIsoSpace(dateStr, hour, minute, second);
    if (!converted) return match;
    replacedAbsolute = true;
    return converted;
  });

  if (!replacedAbsolute && canConvertBareTime(node)) {
    const ctx = findDateContext(node);
    next = next.replace(RE_BARE_TIME, (match, hour, minute, ampm, offset, full) => {
      const after = full.slice(offset + match.length);
      if (/^\s*IST\b/.test(after)) return match;
      const converted = convertBareTime(hour, minute, ampm, ctx);
      return converted || match;
    });
  }

  next = next.replace(/\(UTC\)/g, '(IST)');
  return next;
}

function shouldSkip(node) {
  const parent = node.parentElement;
  if (!parent) return true;
  if (parent.closest('[data-ist-converted="1"]')) return true;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.isContentEditable) return true;
  if (parent.closest('[contenteditable="true"], [contenteditable=""]')) return true;
  return false;
}

function collectTextNodes(root) {
  if (!root) return [];
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let current = walker.nextNode();
  while (current) {
    nodes.push(current);
    current = walker.nextNode();
  }
  return nodes;
}

function convertNode(node) {
  const parent = node.parentElement;
  if (!parent || parent.getAttribute('data-ist-converted') === '1') return;

  const original = node.nodeValue;
  const next = transformText(original, node);
  if (next === original) return;

  parent.setAttribute('data-ist-original', original);
  parent.setAttribute('data-ist-converted', '1');
  node.nodeValue = next;
}

function convertPage(root) {
  if (!enabled || !document.body) return;
  isWriting = true;
  try {
    const nodes = collectTextNodes(root || document.body);
    for (let i = 0; i < nodes.length; i += 1) {
      convertNode(nodes[i]);
    }
  } finally {
    setTimeout(() => {
      isWriting = false;
    }, 0);
  }
}

function restoreAll() {
  isWriting = true;
  try {
    const marked = document.querySelectorAll('[data-ist-converted="1"]');
    marked.forEach((el) => {
      const original = el.getAttribute('data-ist-original');
      if (original !== null) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          if (textNode.nodeValue && textNode.nodeValue.trim()) {
            textNode.nodeValue = original;
            break;
          }
          textNode = walker.nextNode();
        }
      }
      el.removeAttribute('data-ist-original');
      el.removeAttribute('data-ist-converted');
    });
  } finally {
    setTimeout(() => {
      isWriting = false;
    }, 0);
  }
}

function scheduleConvert() {
  if (!enabled || isWriting) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (!enabled || isWriting) return;
    convertPage(document.body);
  }, DEBOUNCE_MS);
}

function startObserver() {
  if (observer || !document.body) return;
  observer = new MutationObserver(() => {
    if (isWriting || !enabled) return;
    scheduleConvert();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  clearTimeout(debounceTimer);
  debounceTimer = null;
}

function setEnabled(next) {
  enabled = next !== false;
  if (enabled) {
    convertPage(document.body);
    startObserver();
  } else {
    stopObserver();
    restoreAll();
  }
}

function patchHistory() {
  const wrap = (method) => {
    const original = history[method];
    history[method] = function patchedHistory() {
      const result = original.apply(this, arguments);
      scheduleConvert();
      return result;
    };
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', scheduleConvert);
}

function readEnabled(callback) {
  try {
    chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
      callback(result[STORAGE_KEY] !== false);
    });
  } catch (err) {
    callback(true);
  }
}

function init() {
  patchHistory();
  readEnabled((value) => {
    setEnabled(value);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes[STORAGE_KEY]) return;
    setEnabled(changes[STORAGE_KEY].newValue !== false);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
