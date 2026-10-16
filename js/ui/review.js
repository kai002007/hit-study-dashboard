// ==================== js/ui/review.js ====================
// 批次20（ESM-b）自 script.js 整切：阶段回顾页域（批次4 全页：阶段列表/统计块/热力图/卡片/时间线/笔记）。函数体逐字节不变。
import { METRIC_CONFIGS, STAGES } from "../config.js";
import { getCheckins, getDailyCard, getDailyCardsByStage, getStageReviewNotes, hasCheckin, saveStageReviewNotes } from "../storage.js";
import { fmtHours, getDailyHours, getStageMetricHours } from "../aggregation.js";
import { SoundKit, bindClick, formatDateISO, getToday, notify, parseDate } from "./base.js";
import { DASHBOARD_FIXED_ORDER } from "./dashboard.js";

// ==================== 18. 阶段回顾页（批次 4） ====================

// 已迁移至 js/storage.js（批次8）

// ---------- 工具：取两日期之间的所有日期 ----------
function iterateStageDates(stage, inclusive) {
  const start = parseDate(stage.start);
  const end = parseDate(stage.end);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const realEnd = inclusive ? end : (end > today ? today : end);
  const result = [];
  const cur = new Date(start);
  while (cur <= realEnd) {
    result.push(formatDateISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// ---------- 工具：最长连击（自然日内任一非 summary/auto-check 指标有打卡） ----------
function computeStageLongestStreak(dates) {
  const checkins = getCheckins();
  const skip = new Set(["weekly-capacity", "weekly-check"]);
  const dateSet = new Set();
  dates.forEach(ds => {
    let has = false;
    for (const key in checkins) {
      if (skip.has(key)) continue;
      const cfg = METRIC_CONFIGS[key];
      if (cfg && (cfg.type === "summary" || cfg.type === "auto-check")) continue;
      if (checkins[key].some(c => c.date === ds)) { has = true; break; }
    }
    if (has) dateSet.add(ds);
  });

  let best = 0, cur = 0;
  dates.forEach(ds => {
    if (dateSet.has(ds)) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  });
  return best;
}

// ---------- 工具：某指标在阶段内增量（progress 类型） ----------
function getStageMetricIncrement(metricKey, dates) {
  const checkins = getCheckins();
  const list = checkins[metricKey] || [];
  let total = 0;
  const dateSet = new Set(dates);
  list.forEach(c => {
    if (dateSet.has(c.date)) total += Number(c.value) || 0;
  });
  return total;
}

// ---------- 工具：某习惯型指标在阶段内的打卡天数 ----------
function getStageHabitDays(metricKey, dates) {
  const checkins = getCheckins();
  const list = checkins[metricKey] || [];
  const daySet = new Set();
  dates.forEach(ds => {
    if (list.some(c => c.date === ds)) daySet.add(ds);
  });
  return { days: daySet.size, total: dates.length };
}

// ---------- 数据笔记 IO ----------
// 已迁移至 js/storage.js（批次8）

// ---------- 阶段列表 ----------
function getStageReviewStageList() {
  return STAGES.filter(s => !s.parentId).map(s => ({
    id: s.id,
    start: s.start,
    end: s.end
  }));
}

// ---------- 默认选中阶段 ----------
function getDefaultStageReviewId() {
  const list = getStageReviewStageList();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const s of list) {
    const st = parseDate(s.start);
    const en = parseDate(s.end);
    if (today >= st && today <= en) return s.id;
  }
  let archived = null;
  for (const s of list) {
    const en = parseDate(s.end);
    if (today > en) {
      if (!archived || en > parseDate(archived.end)) archived = s;
    }
  }
  if (archived) return archived.id;
  return list.length ? list[0].id : null;
}

// ---------- 状态标签 ----------
function getStageStatusTag(stageId) {
  const stage = STAGES.find(s => s.id === stageId);
  if (!stage) return { label: "未知", cls: "is-archived" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const st = parseDate(stage.start);
  const en = parseDate(stage.end);
  if (today > en) return { label: "已归档", cls: "is-archived" };
  if (today < st) return { label: "未启用", cls: "is-future" };
  return { label: "进行中", cls: "is-active" };
}

// ---------- 打开 / 关闭 ----------
function openStageReviewPage(stageId) {
  const page = document.getElementById("stage-review-page");
  if (!page) return;
  const targetId = stageId || getDefaultStageReviewId();
  page.dataset.stageId = targetId || "";
  page.style.display = "block";
  renderStageReviewPage(targetId);
  if (typeof SoundKit !== "undefined" && SoundKit.pop) SoundKit.pop();
}

function closeStageReviewPage() {
  const page = document.getElementById("stage-review-page");
  if (!page) return;
  page.style.display = "none";
  page.dataset.stageId = "";
  if (typeof SoundKit !== "undefined" && SoundKit.tick) SoundKit.tick();
}

// ---------- HTML 转义 ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[c]));
}

// ---------- 主渲染 ----------
function renderStageReviewPage(stageId) {
  const page = document.getElementById("stage-review-page");
  if (!page) return;

  // 页面未打开时也要把下拉选项同步好（确保初次有选项）
  const select = document.getElementById("stage-review-select");
  if (page.style.display === "none") {
    if (select && !select.options.length) {
      populateStageReviewSelect(select, stageId || getDefaultStageReviewId());
    }
    return;
  }

  const targetId = stageId || page.dataset.stageId || getDefaultStageReviewId();
  page.dataset.stageId = targetId;

  if (select) populateStageReviewSelect(select, targetId);

  const titleEl = document.getElementById("stage-review-title");
  const subEl = document.getElementById("stage-review-subtitle");
  const stage = STAGES.find(s => s.id === targetId);
  const tag = getStageStatusTag(targetId);
  if (titleEl) titleEl.textContent = `📜 阶段回顾 · ${targetId}`;
  if (subEl && stage) {
    subEl.innerHTML = `
      <span>${stage.start} → ${stage.end}</span>
      <span class="stage-review-status-tag ${tag.cls}">${tag.label}</span>
    `;
  }

  const body = document.getElementById("stage-review-body");
  if (!body) return;
  body.innerHTML = "";

  body.appendChild(buildStageReviewStatsBlock(targetId));

  const heatmapSection = document.createElement("div");
  heatmapSection.className = "stage-review-heatmap";
  heatmapSection.innerHTML = `<h3 class="stage-review-section-title">📅 阶段内每日打卡</h3><div id="stage-review-heatmap-inner"></div>`;
  body.appendChild(heatmapSection);
  renderStageReviewHeatmap(targetId);

  const cardsSection = document.createElement("div");
  cardsSection.className = "stage-review-cards";
  cardsSection.innerHTML = `<h3 class="stage-review-section-title">🎯 9 张核心指标卡 · 阶段终态</h3><div id="stage-review-cards-inner"></div>`;
  body.appendChild(cardsSection);
  renderStageReviewCards(targetId);

  const timelineSection = document.createElement("div");
  timelineSection.className = "stage-review-timeline";
  timelineSection.innerHTML = `<h3 class="stage-review-section-title">📓 日卡时间轴</h3><div id="stage-review-timeline-inner"></div>`;
  body.appendChild(timelineSection);
  renderStageReviewDailyTimeline(targetId);

  const notesSection = document.createElement("div");
  notesSection.className = "stage-review-notes";
  notesSection.id = "stage-review-notes-section";
  body.appendChild(notesSection);
  renderStageReviewNotes(targetId);
}

// ---------- 阶段下拉填充 ----------
function populateStageReviewSelect(select, currentId) {
  const list = getStageReviewStageList();
  select.innerHTML = list.map(s => {
    const tag = getStageStatusTag(s.id);
    const sel = s.id === currentId ? "selected" : "";
    return `<option value="${s.id}" ${sel}>${s.id}（${tag.label}）</option>`;
  }).join("");
}

// ---------- 统计 5 项 ----------
function buildStageReviewStatsBlock(stageId) {
  const wrap = document.createElement("div");
  wrap.className = "stage-review-stats";

  const stage = STAGES.find(s => s.id === stageId);
  if (!stage) return wrap;
  const dates = iterateStageDates(stage, false);
  const totalDays = dates.length;

  let totalHours = 0;
  let validHours = 0;
  let checkinDays = 0;
  const checkins = getCheckins();
  const skip = new Set(["weekly-capacity", "weekly-check"]);
  const daySet = new Set();
  dates.forEach(ds => {
    const h = getDailyHours(ds).hours;
    totalHours += h;
    const card = getDailyCard(ds);
    if (card && Number(card.statusScore) >= 3) validHours += h;
    let has = false;
    for (const key in checkins) {
      if (skip.has(key)) continue;
      const cfg = METRIC_CONFIGS[key];
      if (cfg && (cfg.type === "summary" || cfg.type === "auto-check")) continue;
      if (checkins[key].some(c => c.date === ds)) { has = true; break; }
    }
    if (has) daySet.add(ds);
  });
  checkinDays = daySet.size;
  const dailyAvg = totalDays > 0 ? fmtHours(totalHours / totalDays) : 0;
  const longestStreak = computeStageLongestStreak(dates);

  const items = [
    { label: "总投入", value: fmtHours(totalHours), unit: "h" },
    { label: "有效投入", value: fmtHours(validHours), unit: "h（状态分≥3）" },
    { label: "打卡天数", value: checkinDays, unit: `/${totalDays} 天` },
    { label: "日均", value: dailyAvg, unit: "h/天" },
    { label: "最长连击", value: longestStreak, unit: "天" }
  ];

  wrap.innerHTML = items.map(it => `
    <div class="stage-review-stat">
      <span class="stage-review-stat-label">${it.label}</span>
      <span class="stage-review-stat-value">${it.value}<span class="stage-review-stat-unit">${it.unit}</span></span>
    </div>
  `).join("");
  return wrap;
}

// ---------- 阶段内热力图 ----------
function renderStageReviewHeatmap(stageId) {
  const inner = document.getElementById("stage-review-heatmap-inner");
  if (!inner) return;
  const stage = STAGES.find(s => s.id === stageId);
  if (!stage) { inner.innerHTML = ""; return; }

  const dates = iterateStageDates(stage, false);
  // 批次11修正令2：未开始阶段日期集为空，空集会算出负 viewBox 高度（0 0 116 -3）
  if (dates.length === 0) {
    inner.innerHTML = '<div class="global-stats-monthly-empty">阶段尚未开始，暂无热力图数据</div>';
    return;
  }
  const cellSize = 14;
  const gap = 3;
  const cols = 7;
  const firstDate = parseDate(dates[0]);
  const firstDow = (firstDate.getDay() + 6) % 7;
  const startBlanks = firstDow;
  const cells = [];
  for (let i = 0; i < startBlanks; i++) cells.push({ blank: true });
  dates.forEach(ds => cells.push({ date: ds, hours: getDailyHours(ds).hours }));

  const rows = Math.ceil(cells.length / cols);
  const W = cols * (cellSize + gap) - gap;
  const H = rows * (cellSize + gap) - gap;
  const maxH = Math.max(...dates.map(d => getDailyHours(d).hours), 1);

  let rects = "";
  cells.forEach((c, idx) => {
    if (c.blank) return;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = col * (cellSize + gap);
    const y = row * (cellSize + gap);
    const h = c.hours;
    let cls = "heatmap-cell";
    if (h <= 0) cls += " heatmap-empty";
    else if (h < maxH * 0.25) cls += " heatmap-l1";
    else if (h < maxH * 0.5) cls += " heatmap-l2";
    else if (h < maxH * 0.75) cls += " heatmap-l3";
    else cls += " heatmap-l4";
    rects += `<rect class="${cls}" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" data-sr-date="${c.date}" data-sr-hours="${fmtHours(h)}" style="cursor:pointer;"><title>${c.date} · ${fmtHours(h)}h</title></rect>`;
  });

  inner.innerHTML = `<svg class="stage-review-heatmap-svg" viewBox="0 0 ${W} ${H}">${rects}</svg><div class="stage-review-heatmap-tip" id="stage-review-heatmap-tip" style="display:none;"></div>`;
  // 批次21 R5②：手机端点击格子显示「日期 · 折算时长」（与桌面 title 同口径）；赋值式绑定随渲染覆盖，幂等不叠加
  inner.onclick = function (e) {
    const tip = document.getElementById("stage-review-heatmap-tip");
    if (!tip) return;
    const rect = e.target && e.target.closest ? e.target.closest("rect.heatmap-cell") : null;
    if (!rect || !rect.getAttribute("data-sr-date")) { tip.style.display = "none"; return; }
    tip.textContent = rect.getAttribute("data-sr-date") + " · " + rect.getAttribute("data-sr-hours") + "h";
    tip.style.display = "block";
  };
}

// ---------- 9 张卡片终态 ----------
function renderStageReviewCards(stageId) {
  const inner = document.getElementById("stage-review-cards-inner");
  if (!inner) return;
  const stage = STAGES.find(s => s.id === stageId);
  if (!stage) { inner.innerHTML = ""; return; }
  const dates = iterateStageDates(stage, false);
  const dateSet = new Set(dates);

  const rows = DASHBOARD_FIXED_ORDER.map(key => {
    const cfg = METRIC_CONFIGS[key];
    if (!cfg) return null;

    let display = "";

    if (cfg.type === "progress" || cfg.type === "hybrid") {
      const inc = getStageMetricIncrement(key, dates);
      const total = cfg.totalGoal || 0;
      const percent = total > 0 ? Math.min(100, Math.round((inc / total) * 100)) : 0;
      const hours = getStageMetricHours(key, dates);
      display = `${inc} / ${total} ${cfg.unit} · ${fmtHours(hours)} h · 完成度 ${percent}%`;
    } else if (cfg.type === "habit") {
      const { days, total } = getStageHabitDays(key, dates);
      const hours = getStageMetricHours(key, dates);
      const pct = total > 0 ? Math.round((days / total) * 100) : 0;
      display = `打卡 ${days} / ${total} 天 · ${fmtHours(hours)} h · 完成度 ${pct}%`;
    } else if (cfg.type === "time-habit") {
      const checkins = getCheckins();
      const list = checkins[key] || [];
      let has = 0;
      list.forEach(c => { if (dateSet.has(c.date)) has++; });
      const todayStr = getToday();
      const elapsed = dates.filter(d => d <= todayStr).length;
      const pct = elapsed > 0 ? Math.round((has / elapsed) * 100) : 0;
      display = `记录 ${has} / ${elapsed} 天 · 完成度 ${pct}%（非产能卡无时长）`;
    } else if (cfg.type === "summary") {
      let total = 0;
      dates.forEach(d => total += getDailyHours(d).hours);
      display = `阶段累计 ${fmtHours(total)} h`;
    } else if (cfg.type === "auto-check") {
      const today = new Date();
      const start = parseDate(stage.start);
      const end = today > parseDate(stage.end) ? parseDate(stage.end) : today;
      const startWeekMon = new Date(start);
      const startDow = (startWeekMon.getDay() + 6) % 7;
      startWeekMon.setDate(startWeekMon.getDate() - startDow);
      let cursor = new Date(startWeekMon);
      let weeksTotal = 0, weeksOk = 0;
      while (cursor <= end) {
        const weekEnd = new Date(cursor);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > end) break;
        let inWeek = true;
        for (let d = new Date(cursor); d <= weekEnd; d.setDate(d.getDate() + 1)) {
          const ds = formatDateISO(d);
          if (!dateSet.has(ds) || new Date(ds) > today) { inWeek = false; break; }
        }
        if (inWeek) {
          weeksTotal++;
          let dailyAchieved = 0;
          for (let d = new Date(cursor); d <= weekEnd; d.setDate(d.getDate() + 1)) {
            const ds = formatDateISO(d);
            if (hasCheckin("vocabulary", ds) || hasCheckin("listening", ds) || hasCheckin("cmc", ds)) {
              dailyAchieved++;
            }
          }
          if (dailyAchieved >= 5) weeksOk++;
        }
        cursor.setDate(cursor.getDate() + 7);
      }
      display = `完整周 ${weeksOk}/${weeksTotal} 周达标`;
    } else {
      display = "—";
    }

    return `
      <div class="stage-review-card-row">
        <span class="stage-review-card-name">${cfg.name}</span>
        <span class="stage-review-card-value">${display}</span>
      </div>
    `;
  }).filter(Boolean).join("");

  inner.innerHTML = rows || `<div class="stage-review-empty">无可展示的卡片</div>`;
}

// ---------- 日卡时间轴 ----------
function renderStageReviewDailyTimeline(stageId) {
  const inner = document.getElementById("stage-review-timeline-inner");
  if (!inner) return;
  const cards = getDailyCardsByStage(stageId);
  const dates = Object.keys(cards).sort();
  if (dates.length === 0) {
    inner.innerHTML = `<div class="stage-review-empty">该阶段内暂无日卡记录</div>`;
    return;
  }
  const items = dates.map(ds => {
    const c = cards[ds];
    // 批次21 R7：卡点空则不输出第二排（下一条自动上移）；非空输出全文不截断
    const blocker = c.blocker && String(c.blocker).trim() ? String(c.blocker) : "";
    return `
      <div class="stage-review-timeline-item">
        <div class="stage-review-timeline-row1">
          <span class="stage-review-timeline-date">${ds}</span>
          <span class="stage-review-timeline-hours">${fmtHours(getDailyHours(ds).hours)}h</span>
          <span class="stage-review-timeline-score">${c.statusScore || "—"}</span>
        </div>
        ${blocker ? `<div class="stage-review-timeline-blocker">${blocker}</div>` : ""}
      </div>
    `;
  }).join("");
  inner.innerHTML = `<div class="stage-review-timeline-list">${items}</div>`;
}

// ---------- 手动填写区 ----------
function renderStageReviewNotes(stageId) {
  const section = document.getElementById("stage-review-notes-section");
  if (!section) return;
  const all = getStageReviewNotes();
  const data = all[stageId] || { baselineScore: "", aiChecklist: "", experience: "" };

  section.innerHTML = `
    <h3 class="stage-review-section-title">✍️ 阶段复盘笔记</h3>
    <div class="stage-review-notes-field">
      <label class="stage-review-notes-label" for="sr-baseline-score">基线分（摸底/初始分）</label>
      <textarea id="sr-baseline-score" placeholder="例如：摸底模考 85 / 100，目标 130">${escapeHtml(data.baselineScore)}</textarea>
    </div>
    <div class="stage-review-notes-field">
      <label class="stage-review-notes-label" for="sr-ai-checklist">AI 使用清单</label>
      <textarea id="sr-ai-checklist" placeholder="例如：哪些真有用 · 哪些是噪音">${escapeHtml(data.aiChecklist)}</textarea>
    </div>
    <div class="stage-review-notes-field">
      <label class="stage-review-notes-label" for="sr-experience">经验沉淀</label>
      <textarea id="sr-experience" placeholder="本阶段最大收获、下阶段注意点">${escapeHtml(data.experience)}</textarea>
    </div>
    <button type="button" class="stage-review-save-btn" id="sr-save-btn">💾 保存笔记</button>
  `;

  const saveBtn = document.getElementById("sr-save-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const payload = {
        baselineScore: document.getElementById("sr-baseline-score").value,
        aiChecklist: document.getElementById("sr-ai-checklist").value,
        experience: document.getElementById("sr-experience").value
      };
      saveStageReviewNotes(stageId, payload);
      notify(`「${stageId}」笔记已保存`, "success");
    });
  }
}

// ---------- 事件绑定 ----------
function bindStageReviewEvents() {
  bindClick("stage-review-open-btn", () => openStageReviewPage());
  bindClick("stage-review-close-btn", closeStageReviewPage);
  bindClick("stage-review-back-btn", closeStageReviewPage);

  const select = document.getElementById("stage-review-select");
  if (select) {
    select.addEventListener("change", (e) => {
      const page = document.getElementById("stage-review-page");
      if (!page) return;
      page.dataset.stageId = e.target.value;
      renderStageReviewPage(e.target.value);
    });
  }
}


// ==================== ESM 导出（批次20） ====================
export {
  bindStageReviewEvents, renderStageReviewPage
};
