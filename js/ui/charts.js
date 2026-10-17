// ==================== js/ui/charts.js ====================
// 批次20（ESM-b）自 script.js 整切：图表域（14天趋势/周学时趋势/月测分双曲线/全年热力图）。函数体逐字节不变。
import { METRIC_CONFIGS, MONTHLY_SUBJECTS } from "../config.js";
import { STORAGE_KEYS, addMonthlyScore, getCheckinValue, getMonthlyScores, getProgressIncrement, loadCustomGoals, removeLastMonthlyScore } from "../storage.js";
import { fmtHours, getDailyHours } from "../aggregation.js";
import { SoundKit, formatDateISO, getToday, notify, parseSleepTime, pushUndo } from "./base.js";
import { getSuggestedToday } from "./checkin.js";

// 热力图默认近 13 周；展开后全年 53 周（运行时切换）
let heatmapFullView = false;

// ==================== 11.4 关键节点表（S2-2） ====================

// 配置常量已迁移至 js/config.js（批次7）

// ==================== 11.5 趋势图：14 天迷你柱状图（S1-2） ====================

const TREND_DAYS = 14;

function getTrendData(metricKey, cfgOverride) {
  const config = cfgOverride || METRIC_CONFIGS[metricKey];
  const data = [];
  const today = new Date();

  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatDateISO(d);
    const isRestDay = d.getDay() === 1 && metricKey !== "vocabulary"; // 周一自动休息日；单词7/7例外

    let value = 0;
    let target = 1;
    let hasData = false;

    if (config.type === "progress") {
      value = getProgressIncrement(metricKey, dateStr);
      target = cfgOverride ? (config.dailyTarget || 1) : getSuggestedToday(metricKey);
      hasData = value > 0;
    } else if (config.type === "time-habit") {
      const timeStr = getCheckinValue(metricKey, dateStr);
      const targetMinutes = parseSleepTime(config.dailyTarget);
      const currentMinutes = parseSleepTime(timeStr);
      hasData = !!timeStr;
      if (hasData && currentMinutes && targetMinutes) {
        value = Math.min(1, Math.max(0, targetMinutes / currentMinutes));
      }
      target = 1;
    } else {
      value = Number(getCheckinValue(metricKey, dateStr)) || 0;
      target = config.dailyTarget || 1;
      hasData = value > 0;
    }

    data.push({ date: d, dateStr, value, target, hasData, isRestDay });
  }

  return data;
}

function renderTrendChart(metricKey, cfgOverride) {
  const el = document.getElementById(`${metricKey}-trend`);
  const config = cfgOverride || METRIC_CONFIGS[metricKey];
  if (!el || !config) return;

  const data = getTrendData(metricKey, cfgOverride);
  const W = 140;
  const H = 48;
  const barW = 7;
  const gap = 3;
  const offsetX = (W - (TREND_DAYS * barW + (TREND_DAYS - 1) * gap)) / 2;
  const todayStr = getToday();
  const weekNames = ["日", "一", "二", "三", "四", "五", "六"];

  let rects = "";
  data.forEach((item, i) => {
    const x = Math.round((offsetX + i * (barW + gap)) * 10) / 10;
    const ratio = item.target > 0 ? item.value / item.target : 0;
    const capped = Math.min(1, Math.max(0, ratio));

    let cls;
    let h;
    if (item.isRestDay && !item.hasData) {
      cls = "trend-bar-rest";
      h = 4;
    } else if (!item.hasData) {
      cls = "trend-bar-empty";
      h = 2;
    } else {
      cls = capped >= 1 ? "trend-bar-normal" : "trend-bar-warning";
      h = Math.max(4, Math.round(capped * H));
    }
    const y = H - h;
    if (item.dateStr === todayStr) cls += " trend-bar-today";

    const dateLabel = `${item.date.getMonth() + 1}.${item.date.getDate()} 周${weekNames[item.date.getDay()]}`;
    let valueLabel;
    if (item.isRestDay && !item.hasData) {
      valueLabel = "休息日";
    } else if (!item.hasData) {
      valueLabel = "未打卡";
    } else if (config.type === "time-habit") {
      valueLabel = `入睡 ${getCheckinValue(metricKey, item.dateStr)} / 目标 ${config.dailyTarget}`;
    } else if (config.type === "progress") {
      valueLabel = `+${item.value} ${config.unit} / 建议 ${item.target}`;
    } else {
      valueLabel = `${item.value}/${item.target} ${config.unit}`;
    }

    rects += `<rect class="${cls}" x="${x}" y="${y}" width="${barW}" height="${h}" rx="1.5"><title>${dateLabel} · ${valueLabel}</title></rect>`;
  });

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
}

function renderAllTrendCharts() {
  const keys = ["vocabulary", "listening", "sleep", "cmc", "mock-exams", "advanced-math", "final-courses"];
  keys.forEach(renderTrendChart);
  loadCustomGoals().forEach(renderCustomGoalTrend);
}

// 自定义目标趋势图（批次16 R-2b）：以 goal.daily 为日目标合成 progress 配置，复用 renderTrendChart
function renderCustomGoalTrend(goal) {
  renderTrendChart(goal.id, { type: "progress", unit: goal.unit, dailyTarget: goal.daily });
}

// ==================== 11.6 周学时趋势汇总（S1-3） ====================

const WEEK_TREND_COUNT = 8;

function getWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffToMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function getWeeklyHoursTrendData() {
  const weeks = [];
  const today = new Date();
  const currentMonday = getWeekMonday(today);

  for (let i = 0; i < WEEK_TREND_COUNT; i++) {
    const monday = new Date(currentMonday);
    monday.setDate(currentMonday.getDate() - (WEEK_TREND_COUNT - 1 - i) * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    let hours = 0;
    for (let j = 0; j < 7; j++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + j);
      hours += getDailyHours(formatDateISO(d)).hours;
    }
    hours = Math.round(hours * 10) / 10;

    weeks.push({ monday, sunday, hours, isCurrent: i === WEEK_TREND_COUNT - 1, isFuture: monday > today });
  }

  return weeks;
}

function renderWeeklyHoursTrend() {
  const el = document.getElementById("weekly-hours-trend");
  if (!el) return;

  const weeks = getWeeklyHoursTrendData();
  const capacityConfig = METRIC_CONFIGS["weekly-capacity"] || {};
  const target = capacityConfig.target || 30;
  const bottom = capacityConfig.bottom || 21;

  const W = 560;
  const H = 158;
  const padL = 8;
  const padR = 8;
  const padT = 24;
  const padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxHours = weeks.reduce((m, w) => Math.max(m, w.hours), 0);
  const yMax = Math.max(target, maxHours) * 1.08;

  const slotW = chartW / WEEK_TREND_COUNT;
  const barW = Math.min(40, slotW * 0.5);

  function yOf(hours) {
    return padT + chartH - (hours / yMax) * chartH;
  }

  let shapes = "";
  weeks.forEach((week, i) => {
    const cx = Math.round((padL + slotW * i + slotW / 2) * 10) / 10;
    const x = Math.round((cx - barW / 2) * 10) / 10;

    let cls;
    let h;
    if (week.hours <= 0) {
      cls = "week-bar-empty";
      h = 3;
    } else if (week.hours >= target) {
      cls = "week-bar-normal";
      h = (week.hours / yMax) * chartH;
    } else if (week.hours >= bottom) {
      cls = "week-bar-warning";
      h = (week.hours / yMax) * chartH;
    } else {
      cls = "week-bar-danger";
      h = Math.max(4, (week.hours / yMax) * chartH);
    }
    h = Math.round(h * 10) / 10;
    const y = Math.round((padT + chartH - h) * 10) / 10;
    if (week.isCurrent) cls += " week-bar-current";

    const rangeLabel = `${week.monday.getMonth() + 1}.${week.monday.getDate()}–${week.sunday.getMonth() + 1}.${week.sunday.getDate()}`;
    const statusLabel = week.isFuture ? "未开始" : (week.hours >= target ? "达标" : (week.hours >= bottom ? "过底线" : "低于底线"));
    const currentLabel = week.isCurrent ? " · 本周进行中" : "";

    shapes += `<rect class="${cls}" x="${x}" y="${y}" width="${barW}" height="${h}" rx="3"><title>${rangeLabel}${currentLabel} · ${fmtHours(week.hours)}h · ${statusLabel}（底线 ${bottom}h / 目标 ${target}h）</title></rect>`;

    const labelY = Math.round((y - 5) * 10) / 10;
    shapes += `<text class="week-bar-label" x="${cx}" y="${labelY}">${fmtHours(week.hours)}</text>`;

    const axisCls = week.isCurrent ? "week-axis-label week-axis-current" : "week-axis-label";
    const axisText = week.isCurrent ? "本周" : `${week.monday.getMonth() + 1}.${week.monday.getDate()}`;
    shapes += `<text class="${axisCls}" x="${cx}" y="${H - 10}">${axisText}</text>`;
  });

  const yTarget = Math.round(yOf(target) * 10) / 10;
  const yBottom = Math.round(yOf(bottom) * 10) / 10;
  shapes += `<line class="week-ref-line week-ref-target" x1="${padL}" y1="${yTarget}" x2="${W - padR}" y2="${yTarget}" />`;
  shapes += `<line class="week-ref-line week-ref-bottom" x1="${padL}" y1="${yBottom}" x2="${W - padR}" y2="${yBottom}" />`;

  // 计算 HTML 覆盖层标签的垂直位置（百分比，相对 SVG 总高度）
  const yTargetPercent = ((yTarget / H) * 100).toFixed(2);
  const yBottomPercent = ((yBottom / H) * 100).toFixed(2);

  el.innerHTML = `<div class="weekly-hours-trend-header">`
    + `<h3 class="weekly-hours-trend-title">周学时趋势汇总</h3>`
    + `<span class="weekly-hours-trend-subtitle">近 ${WEEK_TREND_COUNT} 周 · 口径同「周有效产能」</span>`
    + `</div>`
    + `<div class="weekly-hours-chart-wrap">`
    +   `<div class="weekly-hours-chart-yaxis" aria-hidden="true">`
    +     `<span class="weekly-hours-chart-label weekly-hours-chart-label-target" style="top: ${yTargetPercent}%;">目标 ${target}h</span>`
    +     `<span class="weekly-hours-chart-label weekly-hours-chart-label-bottom" style="top: ${yBottomPercent}%;">底线 ${bottom}h</span>`
    +   `</div>`
    +   `<div class="weekly-hours-chart"><svg viewBox="0 0 ${W} ${H}">${shapes}</svg></div>`
    + `</div>`
    + `<div class="weekly-hours-legend">`
    + `<span><span class="legend-dot" style="background: var(--status-normal);"></span>≥${target}h 达标</span>`
    + `<span><span class="legend-dot" style="background: var(--status-warning);"></span>≥${bottom}h 过底线</span>`
    + `<span><span class="legend-dot" style="background: var(--status-danger);"></span>&lt;${bottom}h 低于底线</span>`
    + `<span><span class="legend-dot" style="background: var(--purple-100);"></span>无记录</span>`
    + `</div>`;

  // 默认滚动到最右侧，让用户第一眼看到本周
  const chartEl = el.querySelector(".weekly-hours-chart");
  if (chartEl && chartEl.scrollWidth > chartEl.clientWidth) {
    requestAnimationFrame(() => {
      chartEl.scrollLeft = chartEl.scrollWidth;
    });
  }
}

function scrollDashboardChartsToRight() {
  // 周学时趋势：滚到最右（本周）
  const trendEl = document.querySelector(".weekly-hours-chart");
  if (trendEl && trendEl.scrollWidth > trendEl.clientWidth) {
    requestAnimationFrame(() => {
      trendEl.scrollLeft = trendEl.scrollWidth;
    });
  }

  // 热力图：仅当处于全年视图时滚到最右
  if (typeof heatmapFullView !== "undefined" && heatmapFullView) {
    const heatmapEl = document.querySelector(".year-heatmap-chart");
    if (heatmapEl && heatmapEl.scrollWidth > heatmapEl.clientWidth) {
      requestAnimationFrame(() => {
        heatmapEl.scrollLeft = heatmapEl.scrollWidth;
      });
    }
  }
}

// ==================== 11.85 月测分双曲线（S7-2） ====================

// 配置常量已迁移至 js/config.js（批次7）

// 已迁移至 js/storage.js（批次8）

function renderMonthlyTrack(subjectKey) {
  const cfg = MONTHLY_SUBJECTS[subjectKey];
  const scores = getMonthlyScores()[subjectKey] || [];

  const headerHTML = `
    <div class="monthly-track-header">
      <span class="monthly-track-name">${cfg.name}</span>
      <span class="monthly-track-latest">${scores.length ? scores[scores.length - 1].score : "--"}</span>
    </div>
  `;

  if (scores.length === 0) {
    return `
      <div class="monthly-track monthly-track-${subjectKey}">
        ${headerHTML}
        <div class="monthly-track-empty">暂无成绩记录</div>
      </div>
    `;
  }

  const W = 280;
  const H = 110;
  const padL = 22;
  const padR = 10;
  const padT = 14;
  const padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const yMax = cfg.max;
  const yMin = 0;

  function xOf(i, total) {
    if (total <= 1) return padL + chartW / 2;
    return padL + (i / (total - 1)) * chartW;
  }
  function yOf(score) {
    const ratio = (score - yMin) / (yMax - yMin);
    return padT + chartH - ratio * chartH;
  }

  let points = "";
  let dots = "";
  scores.forEach((s, i) => {
    const x = Math.round(xOf(i, scores.length) * 10) / 10;
    const y = Math.round(yOf(s.score) * 10) / 10;
    points += (i === 0 ? "M" : "L") + x + " " + y + " ";
    dots += `<circle class="dot-${subjectKey}" cx="${x}" cy="${y}" r="3"><title>${s.date} · ${s.score}分${s.note ? " · " + s.note : ""}</title></circle>`;
  });

  const yTarget = Math.round(yOf(cfg.target) * 10) / 10;
  const yFallback = Math.round(yOf(cfg.fallback) * 10) / 10;

  const refLines = `
    <line class="ref-line ref-line-target" x1="${padL}" y1="${yTarget}" x2="${W - padR}" y2="${yTarget}" />
    <text class="ref-label ref-label-target" x="${W - padR}" y="${yTarget - 3}" text-anchor="end">目标 ${cfg.target}</text>
    <line class="ref-line ref-line-fallback" x1="${padL}" y1="${yFallback}" x2="${W - padR}" y2="${yFallback}" />
    <text class="ref-label ref-label-fallback" x="${padL}" y="${yFallback - 3}" text-anchor="start">底线 ${cfg.fallback}</text>
  `;

  const firstLabel = scores[0].date.slice(5).replace("-", ".");
  const lastLabel = scores[scores.length - 1].date.slice(5).replace("-", ".");
  const axisLabels = `
    <text class="axis-label" x="${padL}" y="${H - 6}">${firstLabel}</text>
    <text class="axis-label" x="${W - padR}" y="${H - 6}">${lastLabel}</text>
  `;

  return `
    <div class="monthly-track monthly-track-${subjectKey}">
      ${headerHTML}
      <div class="monthly-track-chart">
        <svg viewBox="0 0 ${W} ${H}">
          ${refLines}
          <path class="line-${subjectKey}" d="${points.trim()}" />
          ${dots}
          ${axisLabels}
        </svg>
      </div>
    </div>
  `;
}

function renderMonthlyScores() {
  const el = document.getElementById("monthly-scores");
  if (!el) return;

  el.innerHTML = `
    <div class="monthly-scores-header">
      <h3 class="monthly-scores-title">月测分曲线</h3>
      <span class="monthly-scores-subtitle">分列两条曲线 · 不混画（总纲第十章口径）</span>
    </div>
    <div class="monthly-scores-grid">
      ${renderMonthlyTrack("math")}
      ${renderMonthlyTrack("english")}
    </div>
    <div class="monthly-scores-footer">
      <div class="monthly-score-actions">
        <button type="button" class="monthly-add-btn" id="monthly-add-btn">+ 录入成绩</button>
        <button type="button" class="monthly-undo-btn" id="monthly-undo-btn" aria-expanded="false">↩ 撤回最近一次</button>
        <div class="monthly-undo-menu" id="monthly-undo-menu" hidden>
          <span class="monthly-undo-menu-tip">撤回哪一题？</span>
          <button type="button" class="monthly-undo-subject" data-subject="math">数学一</button>
          <button type="button" class="monthly-undo-subject" data-subject="english">英语一</button>
        </div>
      </div>
      <form class="monthly-add-form" id="monthly-add-form">
        <select id="monthly-subject">
          <option value="math">数学一</option>
          <option value="english">英语一</option>
        </select>
        <input type="date" id="monthly-date">
        <input type="number" id="monthly-score" placeholder="分数" min="0" max="150">
        <input type="text" id="monthly-note" placeholder="备注（如：国庆基线 / 第一次全真模考）">
        <button type="button" class="btn-confirm" id="monthly-confirm-btn">保存</button>
        <button type="button" class="btn-cancel" id="monthly-cancel-btn">取消</button>
      </form>
    </div>
  `;

  bindMonthlyScoreEvents();
}

function bindMonthlyScoreEvents() {
  const addBtn = document.getElementById("monthly-add-btn");
  const form = document.getElementById("monthly-add-form");
  const cancelBtn = document.getElementById("monthly-cancel-btn");
  const confirmBtn = document.getElementById("monthly-confirm-btn");
  const dateInput = document.getElementById("monthly-date");

  if (addBtn && form) {
    addBtn.addEventListener("click", () => {
      form.classList.toggle("open");
      if (form.classList.contains("open") && dateInput && !dateInput.value) {
        dateInput.value = getToday();
      }
    });
  }

  if (cancelBtn && form) {
    cancelBtn.addEventListener("click", () => {
      form.classList.remove("open");
      form.reset();
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      const subject = document.getElementById("monthly-subject").value;
      const dateStr = document.getElementById("monthly-date").value;
      const scoreVal = parseFloat(document.getElementById("monthly-score").value);
      const note = document.getElementById("monthly-note").value.trim();

      if (!dateStr) {
        notify("请选择日期");
        return;
      }
      if (isNaN(scoreVal) || scoreVal < 0) {
        notify("请输入有效分数");
        return;
      }

      const before = getMonthlyScores();
      addMonthlyScore(subject, dateStr, scoreVal, note);
      pushUndo("录入月测分", { [STORAGE_KEYS.monthlyScores]: before });

      renderMonthlyScores();
    });
  }

  // 批次24 补正7（第八轮④）：撤回最近一次录入 —— 先选科目，再撤该曲线最新点
  const undoBtn = document.getElementById("monthly-undo-btn");
  const undoMenu = document.getElementById("monthly-undo-menu");
  if (undoBtn && undoMenu) {
    undoBtn.addEventListener("click", () => {
      const willOpen = undoMenu.hidden;
      undoMenu.hidden = !willOpen;
      undoBtn.setAttribute("aria-expanded", String(willOpen));
      undoBtn.classList.toggle("is-open", willOpen);
      SoundKit.tick();
    });
    undoMenu.querySelectorAll(".monthly-undo-subject").forEach(btn => {
      btn.addEventListener("click", () => {
        const subject = btn.dataset.subject;
        const removed = removeLastMonthlyScore(subject);
        if (!removed) {
          notify("该科目暂无成绩可撤回", "warning");
          return;
        }
        const subjName = (MONTHLY_SUBJECTS[subject] || {}).name || subject;
        notify(`已撤回 ${subjName} ${removed.date} · ${removed.score} 分`, "success");
        renderMonthlyScores();
      });
    });
  }
}


// ==================== 11.9 全年打卡热力图（S6-2） ====================

function getYearHeatmapData() {
  const weeks = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalWeeks = heatmapFullView ? 53 : 13;
  const todayDow = (today.getDay() + 6) % 7; // 周一=0，周日=6
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - todayDow);

  const firstMonday = new Date(currentMonday);
  firstMonday.setDate(currentMonday.getDate() - (totalWeeks - 1) * 7);

  for (let w = 0; w < totalWeeks; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(firstMonday);
      day.setDate(firstMonday.getDate() + w * 7 + d);
      const dateStr = formatDateISO(day);
      const isFuture = day > today;
      const hours = isFuture ? null : getDailyHours(dateStr).hours;
      week.push({ date: day, dateStr, hours, isFuture });
    }
    weeks.push(week);
  }
  return weeks;
}

function renderYearHeatmap() {
  const el = document.getElementById("year-heatmap");
  if (!el) return;

  const weeks = getYearHeatmapData();
  const totalWeeks = weeks.length;
  // 13 周视图用较大格子（避免小图显得空旷），53 周视图保持 12px
  const cellSize = heatmapFullView ? 12 : 14;
  const gap = 3;
  const leftPad = 26;
  const rightPad = 24;    // 给最后一个月的文字标签留空间，避免被裁
  const topPad = 34;      // 原 22 → 34，多 12px 给年份标识留空间
  const W = leftPad + totalWeeks * (cellSize + gap) - gap + rightPad;
  const H = topPad + 7 * (cellSize + gap) - gap;

  let cells = "";
  weeks.forEach((week, wi) => {
    week.forEach((day, di) => {
      const x = leftPad + wi * (cellSize + gap);
      const y = topPad + di * (cellSize + gap);
      let cls = "heatmap-cell";
      if (day.isFuture) {
        cls += " heatmap-future";
      } else {
        const h = day.hours || 0;
        if (h <= 0) cls += " heatmap-empty";
        else if (h < 1) cls += " heatmap-l1";
        else if (h < 2) cls += " heatmap-l2";
        else if (h < 3) cls += " heatmap-l3";
        else cls += " heatmap-l4";
      }
      const tooltip = day.isFuture
        ? `${day.dateStr} · 未来`
        : `${day.dateStr} · ${fmtHours(day.hours || 0)}h`;
      const dataHours = day.isFuture ? "" : String(fmtHours(day.hours || 0));
      cells += `<rect class="${cls}" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" data-date="${day.dateStr}" data-hours="${dataHours}" data-future="${day.isFuture ? "1" : "0"}"><title>${tooltip}</title></rect>`;
    });
  });

  const dayLabels = ["一", "二", "三", "四", "五", "六", "日"];
  let labels = "";
  [0, 2, 4, 6].forEach(di => {
    const y = topPad + di * (cellSize + gap) + cellSize * 0.72;
    labels += `<text class="heatmap-day-label" x="${leftPad - 6}" y="${y}" text-anchor="end">${dayLabels[di]}</text>`;
  });

  let monthLabels = "";
  let yearLabels = "";
  const seenMonths = new Set();
  weeks.forEach((week, wi) => {
    const firstDay = week[0].date;
    const m = firstDay.getMonth();
    const y = firstDay.getFullYear();
    const key = y + "-" + m;
    if (!seenMonths.has(key) && firstDay.getDate() <= 7) {
      seenMonths.add(key);
      const x = leftPad + wi * (cellSize + gap);
      const isLastCol = (wi === weeks.length - 1);
      if (isLastCol) {
        monthLabels += `<text class="heatmap-month-label" x="${x + cellSize}" y="${topPad - 8}" text-anchor="end">${m + 1}月</text>`;
      } else {
        monthLabels += `<text class="heatmap-month-label" x="${x}" y="${topPad - 8}">${m + 1}月</text>`;
      }
      if (m === 0) {
        yearLabels += `<text class="heatmap-year-label" x="${x}" y="${topPad - 20}">${y}</text>`;
      }
    }
  });

  const firstDate = weeks[0][0].date;
  const lastDate = weeks[totalWeeks - 1][6].date;
  const rangeText = `${firstDate.getFullYear()}.${firstDate.getMonth() + 1}.${firstDate.getDate()} 至 ${lastDate.getFullYear()}.${lastDate.getMonth() + 1}.${lastDate.getDate()}`;

  el.innerHTML = `
    <div class="year-heatmap-header">
      <h3 class="year-heatmap-title">${heatmapFullView ? "全年打卡热力图" : "近 13 周打卡热力图"}</h3>
      <div class="year-heatmap-header-right">
        <span class="year-heatmap-subtitle">${rangeText} · 颜色越深当日学时越长</span>
        <button type="button" class="heatmap-toggle-btn" id="heatmap-toggle-btn">
          ${heatmapFullView ? "收起" : "展开全年"}
        </button>
      </div>
    </div>
    <div class="year-heatmap-chart">
      <svg viewBox="0 0 ${W} ${H}" data-heatmap-mode="${heatmapFullView ? "full" : "short"}" preserveAspectRatio="xMidYMid meet">${yearLabels}${monthLabels}${labels}${cells}</svg>
    </div>
    <div class="year-heatmap-legend">
      <span>少</span>
      <span class="heatmap-empty"></span>
      <span class="heatmap-l1"></span>
      <span class="heatmap-l2"></span>
      <span class="heatmap-l3"></span>
      <span class="heatmap-l4"></span>
      <span>多</span>
    </div>
  `;

  const toggleBtn = document.getElementById("heatmap-toggle-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      heatmapFullView = !heatmapFullView;
      renderYearHeatmap();
      if (typeof SoundKit !== "undefined") SoundKit.tick();
    });
  }

  // 展开全年时，自动滚动到最右侧，让用户第一眼看到最近一天
  const chartEl = el.querySelector(".year-heatmap-chart");
  if (chartEl && heatmapFullView && chartEl.scrollWidth > chartEl.clientWidth) {
    requestAnimationFrame(() => {
      chartEl.scrollLeft = chartEl.scrollWidth;
    });
  }
}


// ==================== ESM 导出（批次20） ====================
export {
  renderAllTrendCharts, renderCustomGoalTrend, renderMonthlyScores, renderWeeklyHoursTrend, renderYearHeatmap, scrollDashboardChartsToRight
};
