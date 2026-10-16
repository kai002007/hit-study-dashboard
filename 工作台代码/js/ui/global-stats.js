// ==================== js/ui/global-stats.js ====================
// 批次20（ESM-b）自 script.js 整切：全局统计页域（批次5 全页 + R-5a 日历 + R-5b 日记编辑器）。函数体逐字节不变。
import { METRIC_CONFIGS, STAGES } from "../config.js";
import { STORAGE_KEYS, getCheckins, getDayDiaries, getDayDiary, getGlobalHoursGoal, loadData, saveDayDiary, setGlobalHoursGoal } from "../storage.js";
import { fmtHours, getDailyHours, getDayCheckinEntries, getGlobalStats } from "../aggregation.js";
import { SoundKit, bindClick, formatDateCN, formatDateISO, getToday, notify, parseDate, pushUndo } from "./base.js";
import { getStageIdByDate } from "./stage.js";

// ==================== 19. 全局累计统计页（批次 5） ====================

// 已迁移至 js/storage.js（批次8）

// ---------- 目标学时 IO ----------
// 已迁移至 js/storage.js（批次8）

// ---------- 数据聚合 ----------
function getAllDatesWithData() {
  const set = new Set();
  const checkins = getCheckins();
  const capacityKeys = new Set();
  for (const key in METRIC_CONFIGS) {
    const cfg = METRIC_CONFIGS[key];
    if (cfg && cfg.contributesToCapacity) capacityKeys.add(key);
  }
  for (const key in checkins) {
    if (!capacityKeys.has(key)) continue;
    checkins[key].forEach(c => { if (c.date) set.add(c.date); });
  }
  return Array.from(set).sort();
}

function getGlobalTotalHours() {
  return getGlobalStats().totalHours;
}

function getGlobalHoursByStage() {
  const byStage = getGlobalStats().byStage;
  const stages = STAGES.filter(s => !s.parentId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return stages.map(s => {
    const hit = byStage.find(x => x.stageId === s.id);
    const started = parseDate(s.start) <= today;
    return {
      id: s.id,
      start: s.start,
      end: s.end,
      termLabel: s.termLabel || "",
      hours: hit ? hit.hours : 0,
      isStarted: started,
      isFuture: !started
    };
  });
}

// 已迁移至 js/aggregation.js（批次9）

function getGlobalHoursByMonth() {
  return getGlobalStats().byMonth;
}

function getGlobalStatsStats() {
  const gs = getGlobalStats();
  return {
    totalHours: gs.totalHours,
    goalHours: getGlobalHoursGoal(),
    remainingHours: Math.max(0, getGlobalHoursGoal() - gs.totalHours),
    stageList: getGlobalHoursByStage(),
    metricList: gs.byMetric,
    monthlyList: gs.byMonth
  };
}

// ---------- 打开 / 关闭 ----------
function openGlobalStatsPage() {
  const page = document.getElementById("global-stats-page");
  if (!page) return;
  page.style.display = "block";
  renderGlobalStatsPage();
  if (typeof SoundKit !== "undefined" && SoundKit.pop) SoundKit.pop();
}

function closeGlobalStatsPage() {
  const page = document.getElementById("global-stats-page");
  if (!page) return;
  page.style.display = "none";
  if (typeof SoundKit !== "undefined" && SoundKit.tick) SoundKit.tick();
}

// ---------- 日历视图（批次17 R-5a 只读） ----------

let calendarCursor = null; // 当前显示月份的 1 号

function openCalendarPage() {
  const page = document.getElementById("calendar-page");
  if (!page) return;
  page.style.display = "block";
  const now = new Date();
  calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);
  renderCalendarPage();
  if (typeof SoundKit !== "undefined" && SoundKit.pop) SoundKit.pop();
}

function closeCalendarPage() {
  const page = document.getElementById("calendar-page");
  if (!page) return;
  page.style.display = "none";
  if (typeof SoundKit !== "undefined" && SoundKit.tick) SoundKit.tick();
}

function shiftCalendarMonth(delta) {
  if (!calendarCursor) return;
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + delta, 1);
  renderCalendarPage();
}

function renderCalendarPage() {
  const body = document.getElementById("calendar-body");
  if (!body || !calendarCursor) return;
  const y = calendarCursor.getFullYear();
  const m = calendarCursor.getMonth();
  const todayStr = getToday();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const leadBlanks = (new Date(y, m, 1).getDay() + 6) % 7; // 周一为首列
  const headCells = ["一", "二", "三", "四", "五", "六", "日"].map(w => `<div class="cal-head">${w}</div>`).join("");
  let cells = "";
  for (let i = 0; i < leadBlanks; i++) cells += `<div class="cal-cell cal-cell-blank"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = formatDateISO(new Date(y, m, d));
    const hours = getDailyHours(ds).hours;
    const count = getDayCheckinEntries(ds).length;
    const cls = ["cal-cell"];
    if (ds === todayStr) cls.push("cal-cell-today");
    if (ds > todayStr) cls.push("cal-cell-future");
    cells += `<div class="${cls.join(" ")}" data-cal-date="${ds}">` +
      `<div class="cal-date">${d}</div>` +
      (hours > 0 ? `<div class="cal-hours">${fmtHours(hours)}h</div>` : "") +
      (count > 0 ? `<div class="cal-count">${count} 项</div>` : "") +
      `<div class="cal-stage">${getStageIdByDate(ds)}</div></div>`;
  }
  body.innerHTML = `<h3 class="stage-review-section-title">${y} 年 ${m + 1} 月</h3>` +
    `<div class="cal-grid">${headCells}${cells}</div>` +
    `<div id="calendar-day-detail" class="cal-detail"><div class="stage-review-empty">点击某一天查看明细</div></div>`;
  body.querySelectorAll("[data-cal-date]").forEach(cell => {
    cell.addEventListener("click", () => renderCalendarDayDetail(cell.dataset.calDate));
  });
}

function renderCalendarDayDetail(dateStr) {
  const box = document.getElementById("calendar-day-detail");
  if (!box) return;
  const entries = getDayCheckinEntries(dateStr);
  const h = getDailyHours(dateStr);
  const cards = loadData(STORAGE_KEYS.dailyCards, {});
  const card = cards[dateStr];
  const rows = entries.map(e =>
    `<div class="stage-review-card-row"><span class="stage-review-card-name">${e.name}</span>` +
    `<span class="stage-review-card-value">${e.value} ${e.unit}${e.hours > 0 ? ` · ${fmtHours(e.hours)} h` : ""}</span></div>`
  ).join("");
  box.innerHTML = `<h3 class="stage-review-section-title">${formatDateCN(dateStr)} · ${getStageIdByDate(dateStr)}</h3>` +
    `<div class="stage-review-card-row"><span class="stage-review-card-name">当日工时</span>` +
    `<span class="stage-review-card-value">${fmtHours(h.hours)} h（折算 ${fmtHours(h.autoHours)} + 调整 ${h.adjustment}）</span></div>` +
    (rows || `<div class="stage-review-empty">当日无打卡</div>`) +
    (card ? `<div class="stage-review-card-row"><span class="stage-review-card-name">日卡</span>` +
      `<span class="stage-review-card-value">状态分 ${card.statusScore || "—"}${card.blocker ? " · 障碍：" + String(card.blocker).slice(0, 40) : ""}</span></div>` : "") +
    `<div class="cal-diary-block">` +
      `<h4 class="cal-diary-title">📓 当日日记</h4>` +
      `<textarea class="cal-diary-input" id="cal-diary-input" rows="4" placeholder="记录今天的收获、状态、想法……（留空保存 = 清除该日日记）"></textarea>` +
      `<div class="cal-diary-actions">` +
        `<button type="button" class="checkin-btn" id="cal-diary-save-btn">保存日记</button>` +
        `<span class="cal-diary-hint" id="cal-diary-hint"></span>` +
      `</div>` +
    `</div>`;
  const diaryInput = document.getElementById("cal-diary-input");
  if (diaryInput) diaryInput.value = getDayDiary(dateStr);
  bindClick("cal-diary-save-btn", () => handleSaveDayDiary(dateStr));
}

// 批次18（R-5b）：保存某日日记；空内容 = 删除该日键（storage 层语义）
function handleSaveDayDiary(dateStr) {
  const input = document.getElementById("cal-diary-input");
  if (!input) return;
  const before = getDayDiaries();
  saveDayDiary(dateStr, input.value);
  pushUndo("保存日记 " + formatDateCN(dateStr), { [STORAGE_KEYS.dayDiary]: before });
  const hint = document.getElementById("cal-diary-hint");
  if (hint) hint.textContent = input.value.trim() === "" ? "已清除该日日记" : "已保存";
  SoundKit.tick();
}

function bindCalendarEvents() {
  bindClick("calendar-open-btn", openCalendarPage);
  bindClick("calendar-close-btn", closeCalendarPage);
  bindClick("calendar-back-btn", closeCalendarPage);
  bindClick("calendar-prev-btn", () => shiftCalendarMonth(-1));
  bindClick("calendar-today-btn", () => {
    const now = new Date();
    calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);
    renderCalendarPage();
  });
  bindClick("calendar-next-btn", () => shiftCalendarMonth(1));
}

// ---------- 主渲染 ----------
function renderGlobalStatsPage() {
  const page = document.getElementById("global-stats-page");
  if (!page) return;

  const body = document.getElementById("global-stats-body");
  if (!body) return;
  body.innerHTML = "";

  const stats = getGlobalStatsStats();

  // 1) 累计投入进度
  const progressSection = document.createElement("div");
  progressSection.className = "global-stats-section";
  body.appendChild(progressSection);
  renderGlobalStatsProgress(progressSection, stats);

  // 2) 各卡片时长分布
  const metricSection = document.createElement("div");
  metricSection.className = "global-stats-section";
  body.appendChild(metricSection);
  renderGlobalStatsMetricBars(metricSection, stats);

  // 3) 各阶段明细
  const stageSection = document.createElement("div");
  stageSection.className = "global-stats-section";
  body.appendChild(stageSection);
  renderGlobalStatsStageList(stageSection, stats);

  // 4) 月度投入曲线
  const monthlySection = document.createElement("div");
  monthlySection.className = "global-stats-section";
  body.appendChild(monthlySection);
  renderGlobalStatsMonthlyChart(monthlySection, stats);

  // 5) 目标学时配置
  const goalSection = document.createElement("div");
  goalSection.className = "global-stats-section";
  body.appendChild(goalSection);
  renderGlobalStatsGoalConfig(goalSection, stats);
}

// ---------- 累计投入进度 ----------
function renderGlobalStatsProgress(container, stats) {
  const ratio = stats.goalHours > 0
    ? Math.min(100, Math.round((stats.totalHours / stats.goalHours) * 1000) / 10)
    : 0;
  container.innerHTML = `
    <h3 class="global-stats-section-title">🎯 累计投入进度</h3>
    <div class="global-stats-progress">
      <div class="global-stats-progress-value">
        <span class="global-stats-progress-current">${stats.totalHours} h</span>
        <span class="global-stats-progress-target">/ ${stats.goalHours} h</span>
        <span style="font-size:14px;color:var(--text-tertiary);font-weight:600;">（${ratio}%）</span>
      </div>
      <div class="global-stats-progress-track">
        <div class="global-stats-progress-fill" style="width: ${ratio}%;"></div>
      </div>
      <div class="global-stats-progress-label">
        ${stats.remainingHours > 0
          ? `距离目标还差 <strong style="color:var(--purple-600);">${stats.remainingHours} h</strong>`
          : `<strong style="color:#34d399;">🎉 已达成目标！超出 ${(stats.totalHours - stats.goalHours).toFixed(1)} h</strong>`
        }
      </div>
    </div>
  `;
}

// ---------- 各阶段明细 ----------
function renderGlobalStatsStageList(container, stats) {
  container.innerHTML = `
    <h3 class="global-stats-section-title">🗂️ 各阶段明细</h3>
    <div class="global-stats-stage-list">
      ${stats.stageList.map(s => {
        const hoursCls = s.isFuture ? "global-stats-stage-hours is-not-started" : "global-stats-stage-hours";
        const hoursText = s.isFuture ? "未开始" : `${fmtHours(s.hours)} h`;
        return `
          <div class="global-stats-stage-row">
            <span class="global-stats-stage-name">
              ${s.id}${s.termLabel ? `<span class="global-stats-stage-term">${s.termLabel}</span>` : ""}
            </span>
            <span class="global-stats-stage-range">${s.start} → ${s.end}</span>
            <span class="${hoursCls}">${hoursText}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ---------- 各卡片时长分布 ----------
function renderGlobalStatsMetricBars(container, stats) {
  const list = stats.metricList;
  if (list.length === 0) {
    container.innerHTML = `
      <h3 class="global-stats-section-title">🎯 各卡片时长分布</h3>
      <div class="global-stats-monthly-empty">暂无卡片时长数据</div>
    `;
    return;
  }
  const maxHours = Math.max(...list.map(x => x.hours), 1);
  container.innerHTML = `
    <h3 class="global-stats-section-title">🎯 各卡片时长分布</h3>
    <div class="global-stats-note">口径：打卡记录 × 折算系数（rate 快照）；当日调整额不摊入指标，合计可能与总学时不同</div>
    <div class="global-stats-bar-list">
      ${list.map(m => {
        const percent = (m.hours / maxHours) * 100;
        return `
          <div class="global-stats-bar-row">
            <span class="global-stats-bar-name" title="${m.name}">${m.name}</span>
            <div class="global-stats-bar-track">
              <div class="global-stats-bar-fill" style="width: ${percent}%;"></div>
            </div>
            <span class="global-stats-bar-value">${fmtHours(m.hours)} h</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ---------- 月度投入曲线 ----------
function renderGlobalStatsMonthlyChart(container, stats) {
  const list = stats.monthlyList;
  if (list.length === 0) {
    container.innerHTML = `
      <h3 class="global-stats-section-title">📈 月度投入曲线</h3>
      <div class="global-stats-monthly-empty">暂无月度数据</div>
    `;
    return;
  }

  const W = 600;
  const H = 180;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const barW = Math.max(8, Math.floor((chartW / list.length) * 0.7));
  const gap = Math.max(2, Math.floor((chartW / list.length) - barW));
  const totalSlot = barW + gap;

  const maxHours = Math.max(...list.map(x => x.hours), 1);
  const yMax = Math.ceil(maxHours * 1.15);

  let bars = "";
  let xLabels = "";
  let yLabels = "";
  const yOf = (h) => padT + chartH - (h / yMax) * chartH;

  // 3 条横线（0 / yMax/2 / yMax）
  for (let i = 0; i <= 2; i++) {
    const v = (yMax * i) / 2;
    const y = yOf(v);
    yLabels += `<text class="global-stats-monthly-axis-value" x="${padL - 6}" y="${y + 4}" text-anchor="end">${v.toFixed(0)}</text>`;
  }

  list.forEach((m, i) => {
    const x = padL + i * totalSlot;
    const y = yOf(m.hours);
    const h = m.hours > 0 ? (m.hours / yMax) * chartH : 0;
    const isZero = m.hours <= 0;
    bars += `<rect class="global-stats-monthly-bar ${isZero ? "is-zero" : ""}" x="${x}" y="${y}" width="${barW}" height="${h}" rx="3"><title>${m.month} · ${fmtHours(m.hours)}h</title></rect>`;
    // 横轴标月份（每 2 个月标一次避免拥挤）
    if (i % 2 === 0 || i === list.length - 1) {
      xLabels += `<text class="global-stats-monthly-axis-label" x="${x + barW / 2}" y="${H - 10}" text-anchor="middle">${m.month}</text>`;
    }
  });

  container.innerHTML = `
    <h3 class="global-stats-section-title">📈 月度投入曲线</h3>
    <div class="global-stats-monthly-wrap">
      <svg class="global-stats-monthly-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="globalStatsMonthlyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c084fc"/>
            <stop offset="100%" stop-color="#9333ea"/>
          </linearGradient>
        </defs>
        ${yLabels}${bars}${xLabels}
      </svg>
    </div>
  `;
}

// ---------- 目标学时配置 ----------
function renderGlobalStatsGoalConfig(container, stats) {
  container.innerHTML = `
    <h3 class="global-stats-section-title">🎯 目标学时配置</h3>
    <div class="global-stats-goal-form">
      <input type="number" class="global-stats-goal-input" id="global-stats-goal-input" min="100" step="100" value="${stats.goalHours}" placeholder="例如 4000">
      <button type="button" class="global-stats-save-btn" id="global-stats-goal-save-btn">💾 保存目标</button>
    </div>
    <div class="global-stats-progress-label" style="margin-top: 10px;">
      目标用于查漏补缺：阶段回顾页会按当前目标对比各阶段累计投入。
    </div>
  `;

  const saveBtn = document.getElementById("global-stats-goal-save-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const input = document.getElementById("global-stats-goal-input");
      if (!input) return;
      const raw = Number(input.value);
      if (!setGlobalHoursGoal(raw)) {
        notify("目标学时必须 ≥ 100", "warning");
        return;
      }
      notify(`目标学时已更新为 ${raw} h`, "success");
      renderGlobalStatsPage();
    });
  }
}

// ---------- 事件绑定 ----------
function bindGlobalStatsEvents() {
  bindClick("global-stats-open-btn", openGlobalStatsPage);
  bindClick("global-stats-close-btn", closeGlobalStatsPage);
  bindClick("global-stats-back-btn", closeGlobalStatsPage);
}


// ==================== ESM 导出（批次20） ====================
export {
  bindCalendarEvents, bindGlobalStatsEvents, renderGlobalStatsPage
};
