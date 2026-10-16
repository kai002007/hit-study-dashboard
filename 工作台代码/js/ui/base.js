// ==================== js/ui/base.js ====================
// 批次20（ESM-b）自 script.js 整切：基础设施域（Toast/数字动画/hover光晕/撤销/Ctrl+Z/音效/趋势显隐开关/工具函数/安全DOM/时间色温/打卡高光）。函数体逐字节不变。
import { isSoundEnabled, isTrendHidden, saveData, setSoundEnabled, setTrendHidden } from "../storage.js";
import { updateAllCards } from "./today.js";

/**
 * 学习目标管理台 · 仪表盘首页逻辑
 * 终极稳妥方案：HTML 静态写死卡片结构，JS 只负责更新数据和绑定事件
 * 数据来源：阶段表.csv、周配额表.csv、指标表.csv、日卡模板.csv
 * 运行方式：纯前端，localStorage 持久化
 */

// ==================== 0. Toast 通知系统（S3-4） ====================

function showToast(message, type, duration, action) {
  const container = document.getElementById("toast-container");
  if (!container) {
    console.log("[Toast]", message);
    return;
  }

  const icons = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  const t = type || "info";
  const icon = icons[t] || icons.info;
  const ms = typeof duration === "number" ? duration : 2600;

  // 播放音效（S9-1）
  if (t === "success") SoundKit.success();
  else if (t === "warning") SoundKit.warn();
  else if (t === "error") SoundKit.error();
  else SoundKit.tick();

  const el = document.createElement("div");
  el.className = `toast toast-${t}` + (action && action.label ? " toast-with-action" : "");
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-body"></span>`;
  el.querySelector(".toast-body").textContent = message;

  let actionBtn = null;
  if (action && action.label && typeof action.handler === "function") {
    actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "toast-action-btn";
    actionBtn.textContent = action.label;
    actionBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      el.classList.add("toast-out");
      setTimeout(() => el.remove(), 260);
      action.handler();
    });
    el.appendChild(actionBtn);
  }

  container.appendChild(el);

  setTimeout(() => {
    el.classList.add("toast-out");
    setTimeout(() => el.remove(), 260);
  }, ms);
}

// 替换 alert 的统一入口
function notify(message, type) {
  // 自动识别类型的简单策略：包含"失败/错误/不正确/无效/请输入有效"→error
  // 包含"确定/确认/再次"→warning，其他→success/info
  let t = type;
  if (!t) {
    if (/失败|错误|不正确|无效|请输入有效/.test(message)) t = "error";
    else if (/确定|确认|再次确认/.test(message)) t = "warning";
    else t = "success";
  }
  showToast(message, t);
}

// ==================== 0.1 数字滚动动画（S3-2） ====================

function animateNumber(id, to, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  const toNum = Number(to);
  if (isNaN(toNum)) {
    el.textContent = to;
    return;
  }
  const fromNum = Number(el.dataset.animFrom !== undefined ? el.dataset.animFrom : el.textContent) || 0;
  if (fromNum === toNum) {
    el.textContent = String(to);
    el.dataset.animFrom = String(to);
    return;
  }
  const ms = typeof duration === "number" ? duration : 500;
  const start = performance.now();
  const diff = toNum - fromNum;

  cancelAnimationFrame(el._animRaf);
  function step(now) {
    const p = Math.min(1, (now - start) / ms);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - p, 3);
    const val = fromNum + diff * eased;
    el.textContent = Number.isInteger(toNum) ? String(Math.round(val)) : val.toFixed(1);
    if (p < 1) {
      el._animRaf = requestAnimationFrame(step);
    } else {
      el.textContent = String(to);
      el.dataset.animFrom = String(to);
    }
  }
  el._animRaf = requestAnimationFrame(step);
}

// ==================== 0.2 卡片 hover 光晕跟随（S3-3） ====================

function bindGlowFollow() {
  document.querySelectorAll(".metric-card-bar, .metric-card, .dashboard-card").forEach(card => {
    if (card.dataset.glowBound) return;
    card.dataset.glowBound = "1";
    card.addEventListener("mousemove", function(e) {
      const r = this.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      this.style.setProperty("--mx", x + "%");
      this.style.setProperty("--my", y + "%");
    });
  });
}

// ==================== 0.4 撤销系统（S5-1） ====================

const undoStack = [];
const UNDO_LIMIT = 20;          // 栈最多保留 20 条
const UNDO_TOAST_TTL = 5000;    // Toast 上的撤销按钮 5 秒有效
const UNDO_STACK_TTL = 60000;   // Ctrl+Z 撤销窗口 60 秒

function pushUndo(description, beforeSnapshot) {
  const record = {
    description: description,
    before: beforeSnapshot,
    timestamp: Date.now()
  };
  undoStack.push(record);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();

  // 弹出带撤销按钮的 Toast
  showToast(description, "success", UNDO_TOAST_TTL, {
    label: "撤销",
    handler: () => performUndo(record)
  });
}

function performUndo(record) {
  let target = record;

  if (!target) {
    // 从栈顶找未过期的
    while (undoStack.length > 0) {
      const top = undoStack[undoStack.length - 1];
      if (Date.now() - top.timestamp <= UNDO_STACK_TTL) {
        target = undoStack.pop();
        break;
      } else {
        undoStack.pop(); // 过期丢弃
      }
    }
  } else {
    // 从栈中移除指定的一条
    const idx = undoStack.indexOf(target);
    if (idx >= 0) undoStack.splice(idx, 1);
  }

  if (!target) {
    showToast("没有可撤销的操作", "info");
    return;
  }

  if (Date.now() - target.timestamp > UNDO_STACK_TTL) {
    showToast("该操作已超过 60 秒，无法撤销", "warning");
    return;
  }

  // 恢复快照
  for (const key in target.before) {
    const snapshot = target.before[key];
    if (snapshot === null || snapshot === undefined) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    } else {
      saveData(key, snapshot);
    }
  }

  showToast(`已撤销：${target.description}`, "info");
  updateAllCards();
}

// ==================== 0.5 Ctrl+Z 快捷键（S5-1） ====================

function bindUndoShortcut() {
  if (document._undoShortcutBound) return;
  document._undoShortcutBound = true;
  document.addEventListener("keydown", (e) => {
    if (!((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey)) return;
    const tag = (e.target && e.target.tagName ? e.target.tagName : "").toLowerCase();
    if (tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable)) return;
    e.preventDefault();
    performUndo();
  });
}

// ==================== 0.6 UI 音效系统（S9-1） ====================

// 已迁移至 js/storage.js（批次8）
const SOUND_MASTER_VOLUME = 0.11;

let _audioCtx = null;

function getAudioContext() {
  if (_audioCtx) return _audioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
  } catch (e) {
    console.warn("[Sound] AudioContext 创建失败", e);
    return null;
  }
  return _audioCtx;
}

// 已迁移至 js/storage.js（批次8）

// 已迁移至 js/storage.js（批次8）

function playTone(freq, duration, type, startOffset, volumeScale) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  const t0 = ctx.currentTime + (startOffset || 0);
  const vol = SOUND_MASTER_VOLUME * (volumeScale === undefined ? 1 : volumeScale);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  const attack = 0.005;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function playSweep(fromFreq, toFreq, duration, type, volumeScale) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  const t0 = ctx.currentTime;
  const vol = SOUND_MASTER_VOLUME * (volumeScale === undefined ? 1 : volumeScale);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(fromFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(toFreq, t0 + duration);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function playChordSequence(notes, type, volumeScale) {
  notes.forEach(n => {
    playTone(n.freq, n.duration, type, n.offset, volumeScale);
  });
}

const SoundKit = {
  tick() {
    if (!isSoundEnabled()) return;
    playTone(880, 0.04, "sine");
  },
  success() {
    if (!isSoundEnabled()) return;
    playChordSequence([
      { freq: 523.25, duration: 0.08, offset: 0 },
      { freq: 659.25, duration: 0.08, offset: 0.07 },
      { freq: 783.99, duration: 0.14, offset: 0.14 }
    ], "triangle", 0.9);
  },
  warn() {
    if (!isSoundEnabled()) return;
    playTone(660, 0.18, "triangle", 0, 0.9);
  },
  error() {
    if (!isSoundEnabled()) return;
    playChordSequence([
      { freq: 440, duration: 0.1, offset: 0 },
      { freq: 330, duration: 0.15, offset: 0.1 }
    ], "sawtooth", 0.7);
  },
  switch() {
    if (!isSoundEnabled()) return;
    playTone(990, 0.05, "sine", 0, 0.8);
  },
  pop() {
    if (!isSoundEnabled()) return;
    playSweep(660, 880, 0.12, "sine", 0.9);
  }
};

function bindSoundOnButtons() {
  if (document._soundBound) return;
  document._soundBound = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.id === "sound-toggle-btn") return;
    SoundKit.tick();
  }, true);
}

function renderSoundToggle() {
  const btn = document.getElementById("sound-toggle-btn");
  const title = document.getElementById("sound-toggle-title");
  const desc = btn ? btn.querySelector(".settings-action-desc") : null;
  const icon = document.getElementById("sound-toggle-icon");
  if (!btn || !title) return;

  const enabled = isSoundEnabled();
  btn.classList.toggle("muted", !enabled);
  title.textContent = enabled ? "关闭音效" : "开启音效";

  if (desc) desc.textContent = enabled ? "当前：已开启" : "当前：已静音";

  if (icon) {
    icon.innerHTML = enabled
      ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>'
      : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  }
}

function handleSoundToggle() {
  const enabled = isSoundEnabled();
  setSoundEnabled(!enabled);
  renderSoundToggle();
  if (!enabled) {
    // 刚才是关的，现在是开的
    SoundKit.tick();
  }
}

// ==================== 0.7 趋势图显隐开关（S10-5） ====================

// 已迁移至 js/storage.js（批次8）

function applyTrendHiddenState() {
  const hidden = isTrendHidden();
  document.body.classList.toggle("hide-trend-charts", hidden);
  renderTrendToggle();
}

function renderTrendToggle() {
  const btn = document.getElementById("trend-toggle-btn");
  const title = document.getElementById("trend-toggle-title");
  const desc = btn ? btn.querySelector(".settings-action-desc") : null;
  const icon = document.getElementById("trend-toggle-icon");
  if (!btn || !title) return;

  const hidden = isTrendHidden();
  btn.classList.toggle("muted", hidden);
  title.textContent = hidden ? "显示柱状图" : "隐藏柱状图";

  if (desc) desc.textContent = hidden ? "当前：已隐藏" : "当前：显示中";

  if (icon) {
    icon.innerHTML = hidden
      ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
      : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}

function handleTrendToggle() {
  const hidden = isTrendHidden();
  setTrendHidden(!hidden);
  document.body.classList.toggle("hide-trend-charts", !hidden);
  renderTrendToggle();
  if (typeof SoundKit !== "undefined") SoundKit.tick();
}


// ==================== 4. 工具函数 ====================

function parseDate(str) {
  return new Date(str + "T00:00:00");
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateCN(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function formatDate(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function daysBetween(start, end) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((end - start) / msPerDay);
}

function getToday() {
  return formatDateISO(new Date());
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDateISO(d);
}

function parseTime(timeStr) {
  if (!timeStr || !timeStr.includes(":")) return null;
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function parseSleepTime(timeStr) {
  if (!timeStr || !timeStr.includes(":")) return null;
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  // 睡眠场景：小时数 < 12 视为跨过午夜，加 24 小时
  const adjustedH = h < 12 ? h + 24 : h;
  return adjustedH * 60 + m;
}

function isInStage(stage, date) {
  const s = parseDate(stage.start);
  const e = parseDate(stage.end);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return d >= s && d <= e;
}

function normalizeHours(item) {
  if (typeof item.hours === "number") return item.hours;
  if (typeof item.hoursPerDay === "number") return item.hoursPerDay * 7;
  return 0;
}

// ==================== 5. 安全的 DOM 操作工具 ====================

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
  return el;
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
  return el;
}

function setWidth(id, percent) {
  const el = document.getElementById(id);
  if (el) el.style.width = Math.min(100, Math.max(0, percent)) + "%";
  return el;
}

function setClass(id, className) {
  const el = document.getElementById(id);
  if (el) el.className = className;
  return el;
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
  return el;
}

function setDisplay(id, display) {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
  return el;
}

function setRingProgress(key, percent, statusClass) {
  const el = document.getElementById(`${key}-progress`);
  if (el) {
    if (el.classList.contains("metric-bar-fill")) {
      el.style.width = Math.min(100, Math.max(0, percent)) + "%";
      el.className = "metric-bar-fill " + statusClass;
    } else {
      el.setAttribute("stroke-dasharray", `${Math.min(100, Math.max(0, percent))}, 100`);
      el.setAttribute("class", `ring-progress ${statusClass}`);
    }
  }
  const text = document.getElementById(`${key}-percent`);
  if (text) text.textContent = `${Math.round(percent)}%`;
}

function setBarProgress(key, percent, statusClass) {
  const fill = document.getElementById(`${key}-progress`);
  if (fill) {
    fill.style.width = Math.min(100, Math.max(0, percent)) + "%";
    fill.className = "metric-bar-fill " + statusClass;
  }
  const text = document.getElementById(`${key}-percent`);
  if (text) text.textContent = `${Math.round(percent)}%`;
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", handler);
  return el;
}


// ==================== 23. 时间色温（批次 C） ====================

let _timePhaseTimer = null;

function applyTimePhase() {
  const hour = new Date().getHours();
  let phase;
  if (hour >= 6 && hour < 10) phase = "morning";
  else if (hour >= 10 && hour < 18) phase = "day";
  else if (hour >= 18 && hour < 22) phase = "evening";
  else phase = "night";
  document.body.dataset.timePhase = phase;
}

function startTimePhaseTimer() {
  applyTimePhase();
  if (_timePhaseTimer) return;
  // 每 30 分钟检查一次（跨越时段边界时能及时切换）
  _timePhaseTimer = setInterval(applyTimePhase, 30 * 60 * 1000);
}

// ==================== 24. 打卡成功高光时刻（批次 D） ====================

function pulseCardSuccess(metricKey) {
  if (!metricKey) return;
  const card = document.querySelector(`[data-metric="${metricKey}"]`);
  if (!card) return;
  // 若上一轮动画还没结束，先移除再重新加，保证动画可重复触发
  card.classList.remove("card-pulse-success");
  // 强制 reflow，让浏览器重新计算样式（否则同一动画连续触发不会重新播放）
  void card.offsetWidth;
  card.classList.add("card-pulse-success");
  setTimeout(() => card.classList.remove("card-pulse-success"), 750);
}


// ==================== ESM 导出（批次20） ====================
export {
  SoundKit, animateNumber, applyTrendHiddenState, bindClick, bindSoundOnButtons, bindUndoShortcut, daysBetween, formatDate,
    formatDateCN, formatDateISO, getToday, getYesterday, handleSoundToggle, handleTrendToggle, isInStage, normalizeHours,
    notify, parseDate, parseSleepTime, performUndo, pulseCardSuccess, pushUndo, renderSoundToggle, setBarProgress,
    setClass, setHTML, setInputValue, setRingProgress, setText, setWidth, showToast, startTimePhaseTimer
};
