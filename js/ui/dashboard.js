// ==================== js/ui/dashboard.js ====================
// 批次20（ESM-b）自 script.js 整切：进度看板域（Tab2 扇形路径/卡片图标/顺序/双列/看板渲染）。函数体逐字节不变。
import { DAILY_CAP, METRIC_CONFIGS } from "../config.js";
import { getCheckinValue, getTotalCompleted, loadCustomGoals } from "../storage.js";
import { fmtHours, getDailyHours, getWeeklyStats } from "../aggregation.js";
import { daysBetween, formatDateCN, formatDateISO, getToday, parseDate, parseSleepTime, setText } from "./base.js";
import { getEstimatedCompletion, getRecentAverage, getStreak, getWeeklyCheckItems } from "./checkin.js";
import { renderMonthlyScores, renderWeeklyHoursTrend, renderYearHeatmap } from "./charts.js";

// ==================== 15. 进度看板（Tab 2）====================

// ==================== 15.0 扇形进度路径生成（S10-1） ====================

function getPiePath(cx, cy, r, percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  if (p <= 0) return "";
  if (p >= 100) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const angle = -Math.PI / 2 + (p / 100) * 2 * Math.PI;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  const largeArc = p > 50 ? 1 : 0;
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`;
}



// 阶段切换抽屉的只读总开关（批次 2）
// 已迁移至 js/storage.js（批次8）



// ==================== 15.01 dashboard 卡片图标映射（S10-2） ====================

const DASHBOARD_CARD_ICONS = {
  "weekly-capacity": '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  "weekly-check": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  "cmc": '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  "advanced-math": '<path d="M21.3 15.3 8.7 2.7a2.4 2.4 0 0 0-3.4 0l-2.6 2.6a2.4 2.4 0 0 0 0 3.4l12.6 12.6a2.4 2.4 0 0 0 3.4 0l2.6-2.6a2.4 2.4 0 0 0 0-3.4z"/><path d="m14.5 12.5-8 8"/><path d="m2.7 8 5.3-5.3"/>',
  "vocabulary": '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  "listening": '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  "mock-exams": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  "final-courses": '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  "sleep": '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
};

function getDashboardCardIconHTML(key) {
  const path = DASHBOARD_CARD_ICONS[key];
  if (!path) return "";
  return '<span class="metric-icon"><svg class="metric-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg></span>';
}

// ==================== 15.02 dashboard 卡片顺序（S10-2） ====================

// 顺序：对齐今日作战 9 张卡片，唯一不同是 weekly-check 放最后
const DASHBOARD_FIXED_ORDER = [
  "weekly-capacity",
  "cmc",
  "advanced-math",
  "vocabulary",
  "listening",
  "mock-exams",
  "final-courses",
  "sleep",
  "weekly-check"
];

// ==================== 15.03 需要占两列的卡片（S10-2） ====================

const DASHBOARD_WIDE_KEYS = ["weekly-capacity"];

function getDashboardStatus(percent, type) {
  if (type === "habit" || type === "time-habit") {
    if (percent >= 100) return { className: "status-normal", text: "今日已达标" };
    if (percent > 0) return { className: "status-warning", text: "进行中" };
    return { className: "status-danger", text: "未打卡" };
  }
  if (percent >= 100) return { className: "status-normal", text: "已完成" };
  if (percent >= 80) return { className: "status-warning", text: "进行中" };
  return { className: "status-danger", text: "落后" };
}

function buildFixedDashboardItem(key, cfg) {
  const todayStr = getToday();

  if (cfg.type === "progress" || cfg.type === "hybrid") {
    const completed = getTotalCompleted(key);
    const total = cfg.totalGoal;
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    const status = getDashboardStatus(percent, cfg.type);
    const estimated = getEstimatedCompletion(key);
    const estimateText = estimated.dateStr
      ? `预计完成日：${formatDateCN(estimated.dateStr)} · ${estimated.onTrack ? "提前" : "拖后"} ${Math.abs(estimated.diffDays)} 天`
      : "预计完成日：暂无推算";
    return {
      key,
      name: cfg.name,
      current: completed,
      target: total,
      unit: cfg.unit,
      percent,
      statusClass: status.className,
      statusText: status.text,
      estimateText
    };
  }

  if (cfg.type === "habit") {
    const todayValue = Number(getCheckinValue(key, todayStr)) || 0;
    const target = cfg.dailyTarget;
    const percent = target > 0 ? Math.min(100, Math.round((todayValue / target) * 100)) : 0;
    const status = getDashboardStatus(percent, cfg.type);
    const streak = getStreak(key);
    return {
      key,
      name: cfg.name,
      current: todayValue,
      target: target,
      unit: cfg.unit,
      percent,
      statusClass: status.className,
      statusText: status.text,
      estimateText: streak > 0 ? `连续 ${streak} 天` : "暂无连续记录"
    };
  }

  if (cfg.type === "time-habit") {
    const todayValue = getCheckinValue(key, todayStr);
    const targetMinutes = parseSleepTime(cfg.dailyTarget);
    const currentMinutes = parseSleepTime(todayValue);
    const percent = currentMinutes && targetMinutes && currentMinutes > 0
      ? Math.min(100, Math.round((targetMinutes / currentMinutes) * 100))
      : 0;
    const status = getDashboardStatus(percent, cfg.type);
    const streak = getStreak(key);
    return {
      key,
      name: cfg.name,
      current: todayValue || "--:--",
      target: cfg.dailyTarget,
      unit: "",
      percent,
      statusClass: status.className,
      statusText: status.text,
      estimateText: streak > 0 ? `连续 ${streak} 天` : "暂无连续记录"
    };
  }

  if (cfg.type === "summary") {
    const current = getWeeklyStats().totalHours;
    const target = cfg.target;
    const bottom = cfg.bottom;
    const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    let statusClass, statusText;
    if (current >= target) {
      statusClass = "status-normal";
      statusText = "已达标";
    } else if (current >= bottom) {
      statusClass = "status-warning";
      statusText = "底线以上";
    } else {
      statusClass = "status-danger";
      statusText = "低于底线";
    }
    return {
      key,
      name: cfg.name,
      current,
      target,
      unit: cfg.unit,
      percent,
      statusClass,
      statusText,
      estimateText: `今日已积累 ${fmtHours(getDailyHours(todayStr).hours)}h`
    };
  }

  if (cfg.type === "auto-check") {
    const items = getWeeklyCheckItems();
    const okCount = items.filter(i => i.ok).length;
    const percent = Math.min(100, Math.round((okCount / 5) * 100));
    let statusClass, statusText;
    if (okCount === 5) {
      statusClass = "status-normal";
      statusText = "全达标";
    } else if (okCount >= 3) {
      statusClass = "status-warning";
      statusText = `${okCount}/5 达标`;
    } else {
      statusClass = "status-danger";
      statusText = `${okCount}/5 达标`;
    }
    return {
      key,
      name: cfg.name,
      current: okCount,
      target: 5,
      unit: "项",
      percent,
      statusClass,
      statusText,
      estimateText: "周检指标自动汇总"
    };
  }

  return null;
}

function buildCustomDashboardItem(goal) {
  const completed = getTotalCompleted(goal.id);
  const percent = Math.min(100, Math.round((completed / goal.total) * 100));
  const status = getDashboardStatus(percent, "progress");
  const remaining = Math.max(0, goal.total - completed);
  const remainingDays = Math.max(1, daysBetween(new Date(), parseDate(goal.deadline)));

  const recent = getRecentAverage(goal.id, 7);
  let estimateText;
  if (recent.sampleDays >= 3 && recent.average > 0) {
    const daysNeeded = remaining / recent.average;
    const estimated = new Date();
    estimated.setDate(estimated.getDate() + Math.ceil(daysNeeded));
    const estimatedStr = formatDateISO(estimated);
    const diff = daysBetween(estimated, parseDate(goal.deadline));
    const onTrack = diff >= 0;
    estimateText = `预计完成日：${formatDateCN(estimatedStr)} · ${onTrack ? "提前" : "拖后"} ${Math.abs(diff)} 天`;
  } else {
    estimateText = "预计完成日：暂无推算（样本不足3天）";
  }

  return {
    key: goal.id,
    name: goal.name,
    current: completed,
    target: goal.total,
    unit: goal.unit,
    percent,
    statusClass: status.className,
    statusText: status.text,
    estimateText
  };
}

function buildDashboardItems() {
  const items = [];

  // 按显式顺序排，只处理 DASHBOARD_FIXED_ORDER 里列出的 key
  DASHBOARD_FIXED_ORDER.forEach(key => {
    const cfg = METRIC_CONFIGS[key];
    if (!cfg) return;
    const item = buildFixedDashboardItem(key, cfg);
    if (item) items.push(item);
  });

  // 兜底：如果将来 METRIC_CONFIGS 里加了新键但没写进顺序表，也一并追加
  for (const key in METRIC_CONFIGS) {
    if (DASHBOARD_FIXED_ORDER.indexOf(key) !== -1) continue;
    const item = buildFixedDashboardItem(key, METRIC_CONFIGS[key]);
    if (item) items.push(item);
  }

  const customGoals = loadCustomGoals();
  customGoals.forEach(goal => {
    items.push(buildCustomDashboardItem(goal));
  });

  return items;
}

// ==================== 15.09 指挥舱 · 今日有效时长 Hero（批次24 二次补正） ====================
// 仅「指挥舱」形态展示：日卡口径（getDailyHours 有效时长 × DAILY_CAP 当日上限），
// 右侧环=本周达成率（周有效学时 / 周配额）。经典形态容器 display:none，零视觉影响。
function renderDeckTodayHero() {
  const el = document.getElementById("deck-today-hero");
  if (!el) return;

  const todayStr = getToday();
  const todayHours = getDailyHours(todayStr).hours;
  const cap = Number(DAILY_CAP[(new Date().getDay() + 6) % 7]) || 0;
  const dayPercent = cap > 0 ? Math.min(100, Math.round((todayHours / cap) * 100)) : 0;

  const weekly = getWeeklyStats();
  const weeklyCfg = METRIC_CONFIGS["weekly-capacity"] || {};
  const weekTarget = Number(weeklyCfg.target) || 0;
  const weekPercent = weekTarget > 0 ? Math.min(100, Math.round((weekly.totalHours / weekTarget) * 100)) : 0;
  const remain = Math.max(0, cap - todayHours);

  el.innerHTML = `
    <div class="deck-hero-main">
      <span class="deck-hero-label">今日有效时长</span>
      <div class="deck-hero-number"><strong>${fmtHours(todayHours)}</strong><span>/ ${fmtHours(cap)} h 上限</span></div>
      <div class="deck-hero-track"><span style="width: ${dayPercent}%;"></span></div>
      <div class="deck-hero-chips">
        <span>已用 ${dayPercent}%</span>
        <span>剩余 ${fmtHours(remain)}h</span>
        <span>本周已用 ${fmtHours(weekly.totalHours)}h</span>
      </div>
    </div>
    <div class="deck-hero-ring" style="--ring-p: ${weekPercent};" aria-label="本周达成率 ${weekPercent}%">
      <span class="deck-hero-ring-inner"><strong>${weekPercent}%</strong><span>本周达成率</span></span>
    </div>
  `;
}

function renderProgressDashboard() {
  const grid = document.getElementById("progress-dashboard-grid");
  if (!grid) return;

  // 批次24 补正5：Hero 作为九卡网格首行渲染（「核心指标」标签与第一排卡片之间）；
  // 重渲染前先把 Hero 移出网格，避免被下方 innerHTML 清掉。
  const heroEl = document.getElementById("deck-today-hero");
  if (heroEl && heroEl.parentElement === grid) {
    grid.parentElement.insertBefore(heroEl, grid);
  }

  renderDeckTodayHero();
  renderMonthlyScores();
  renderYearHeatmap();
  renderWeeklyHoursTrend();

  const items = buildDashboardItems();
  const totalCount = items.length;
  const completedCount = items.filter(i => i.percent >= 100).length;

  setText("dashboard-total-count", String(totalCount));
  setText("dashboard-completed-count", String(completedCount));

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="placeholder-page">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px;">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        <h2>暂无目标</h2>
        <p>在「今日作战」Tab 中新建目标后，这里会自动汇总</p>
      </div>
    `;
    if (heroEl) grid.insertBefore(heroEl, grid.firstChild);
    return;
  }

  grid.innerHTML = items.map(item => {
    const iconHTML = getDashboardCardIconHTML(item.key);
    const isWide = DASHBOARD_WIDE_KEYS.indexOf(item.key) !== -1;
    const wideClass = isWide ? " dashboard-card-wide" : "";
    const barPct = Math.max(2, Math.min(100, Math.round(item.percent)));
    return `
      <article class="dashboard-card${wideClass}" data-dashboard-key="${item.key}" data-metric="${item.key}">
        <div class="dashboard-card-header">
          <h3 class="dashboard-card-name">${iconHTML}${item.name}</h3>
          <span class="metric-status ${item.statusClass}">${item.statusText}</span>
        </div>

        <!-- 扇形进度（两端统一） -->
        <div class="dashboard-card-pie">
          <svg viewBox="0 0 36 36" class="pie-svg">
            <circle class="pie-bg" cx="18" cy="18" r="15.5"/>
            <path class="pie-fill ${item.statusClass}" d="${getPiePath(18, 18, 15.5, item.percent)}"/>
          </svg>
          <span class="pie-percent">${item.percent}%</span>
        </div>

        <div class="dashboard-card-numbers">
          ${item.current}<span class="metric-separator">/</span><span class="target">${item.target} ${item.unit}</span>
        </div>
        <div class="dashboard-card-bar"><span style="width: ${barPct}%"></span></div>
        <div class="dashboard-card-meta">${item.estimateText}</div>
      </article>
    `;
  }).join("");

  // Hero 插到九卡最前面：紧贴「核心指标」标签之下、第一排卡片之上
  if (heroEl) grid.insertBefore(heroEl, grid.firstChild);
}


// ==================== ESM 导出（批次20） ====================
export {
  DASHBOARD_FIXED_ORDER, renderProgressDashboard
};
