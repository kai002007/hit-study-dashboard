// ==================== js/ui/today.js ====================
// 批次20（ESM-b）自 script.js 整切：今日作战域（时间坐标三件套/Top3/全部卡片更新编排）。函数体逐字节不变。
import { METRIC_CONFIGS, MILESTONES } from "../config.js";
import { getCheckinValue, getProgressIncrement, getTotalCompleted, loadCustomGoals } from "../storage.js";
import { bindClick, daysBetween, formatDateCN, getToday, parseDate } from "./base.js";
import { isReduceWeek, isSundayAfternoon, renderDailyCard } from "./daily-card.js";
import { getCurrentStage } from "./stage.js";
import { fillTodayCheckin, isYesterdayMissed, openAdjustPlan, updateHabitCard, updateProgressCard, updateVocabularyCard, updateWeeklyCapacityCard, updateWeeklyCheckCard } from "./checkin.js";
import { renderAllTrendCharts } from "./charts.js";
import { renderWeeklyReview } from "./weekly.js";
import { refreshMakeupDateOptions, renderAllCustomGoals, updateCustomGoalCard } from "./goals.js";
import { renderProgressDashboard } from "./dashboard.js";

// ==================== 11.8 今日作战 Top 3（S6-1） ====================

const TOP_TASK_PRIORITY = {
  "cmc": 10,
  "mock-exams": 9,
  "vocabulary": 8,
  "listening": 8,
  "sleep": 7,
  "advanced-math": 7,
  "final-courses": 6
};

function getTodayTop3Tasks() {
  const todayStr = getToday();
  const candidates = [];

  for (const key in METRIC_CONFIGS) {
    const cfg = METRIC_CONFIGS[key];
    if (cfg.type === "summary" || cfg.type === "auto-check") continue;

    let weight = TOP_TASK_PRIORITY[key] || 5;
    let reason = "";
    let action = "去打卡";
    let hasTodo = false;

    if (cfg.type === "time-habit") {
      const v = getCheckinValue(key, todayStr);
      if (!v) {
        hasTodo = true;
        reason = "今日未记录";
        action = "记录";
      }
    } else if (cfg.type === "habit" || cfg.type === "hybrid") {
      const v = Number(getCheckinValue(key, todayStr)) || 0;
      const target = cfg.dailyTarget || 0;
      if (v < target) {
        hasTodo = true;
        const gap = target - v;
        reason = `还差 ${gap} ${cfg.unit}`;
        action = "一键打卡";
        weight += 2;
      }
    } else if (cfg.type === "progress") {
      const todayDone = getProgressIncrement(key, todayStr);
      if (todayDone <= 0) {
        hasTodo = true;
        const total = cfg.totalGoal;
        const done = getTotalCompleted(key);
        const remaining = Math.max(0, total - done);
        if (remaining <= 0) continue;
        const daysLeft = Math.max(1, daysBetween(new Date(), parseDate(cfg.deadline)));
        const perDay = Math.max(1, Math.ceil(remaining / daysLeft));
        reason = `今日需推进 ${perDay} ${cfg.unit}`;
        action = "一键推进";
        const remainRatio = remaining / total;
        weight += Math.min(5, Math.round(remainRatio * 5));
      }
    }

    if (hasTodo) {
      candidates.push({ key, name: cfg.name, reason, action, weight });
    }
  }

  const goals = loadCustomGoals();
  goals.forEach(g => {
    const todayDone = getProgressIncrement(g.id, todayStr);
    if (todayDone > 0) return;
    const done = getTotalCompleted(g.id);
    const remaining = Math.max(0, g.total - done);
    if (remaining <= 0) return;
    candidates.push({
      key: g.id,
      name: g.name,
      reason: "今日未推进",
      action: "去推进",
      weight: 4
    });
  });

  candidates.sort((a, b) => b.weight - a.weight);
  return candidates.slice(0, 3);
}

function renderTop3Tasks() {
  const listEl = document.getElementById("top-tasks-list");
  const subEl = document.getElementById("top-tasks-subtitle");
  if (!listEl) return;

  const tasks = getTodayTop3Tasks();

  if (subEl) {
    subEl.textContent = tasks.length === 0 ? "全部完成 🎉" : `共 ${tasks.length} 项待办`;
  }

  if (tasks.length === 0) {
    listEl.innerHTML = `<div class="top-tasks-empty">今日无待办 · 享受成果</div>`;
    return;
  }

  listEl.innerHTML = tasks.map((t, i) => `
    <div class="top-task-item">
      <span class="top-task-rank">${i + 1}</span>
      <div class="top-task-body">
        <span class="top-task-name">${t.name}</span>
        <span class="top-task-reason">${t.reason}</span>
      </div>
      <button type="button" class="top-task-btn" data-task-key="${t.key}">${t.action}</button>
    </div>
  `).join("");

  listEl.querySelectorAll(".top-task-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.taskKey;
      const card = document.querySelector(`[data-metric="${key}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("card-highlight");
        setTimeout(() => card.classList.remove("card-highlight"), 1400);
      }
    });
  });
}


// ==================== 11.7 今日时间坐标三件套（S2） ====================

function renderTodayLine() {
  const el = document.getElementById("today-line");
  if (!el) return;

  const now = new Date();
  const todayStr = getToday();
  const weekNames = ["日", "一", "二", "三", "四", "五", "六"];
  const weekDay = weekNames[now.getDay()];
  const dayInWeek = ((now.getDay() + 6) % 7) + 1;

  const stageInfo = getCurrentStage(now);
  const isSunday = now.getDay() === 0;

  const mainEl = el.querySelector(".today-line-main");
  if (mainEl) {
    mainEl.innerHTML = `
      <span class="today-line-date">${formatDateCN(todayStr)}</span>
      <span class="today-line-weekday">周${weekDay}</span>
      ${isSunday ? '<span class="today-line-sunday-tag">周报日</span>' : ''}
    `;
  }

  const subEl = el.querySelector(".today-line-sub");
  if (subEl) {
    const parts = [];
    parts.push(`本周第 <strong>${dayInWeek}/7</strong> 天`);
    if (stageInfo.main) {
      const dayInStage = daysBetween(parseDate(stageInfo.main.start), now) + 1;
      parts.push(`阶段第 <strong>${dayInStage}</strong> 天`);
      parts.push(`剩余 <strong>${stageInfo.daysLeftMain}</strong> 天`);
    }
    if (isReduceWeek()) {
      parts.push(`<strong style="color:#fbbf24;">减量周</strong>`);
    }
    if (isSundayAfternoon()) {
      parts.push(`<strong style="color:#c084fc;">下午半天休</strong>`);
    }
    subEl.innerHTML = parts.map(p => `<span>${p}</span>`).join('<span class="sub-sep">·</span>');
  }
}

function renderNextMilestone() {
  const el = document.getElementById("next-milestone");
  if (!el) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = MILESTONES
    .map(m => ({ ...m, d: parseDate(m.date) }))
    .filter(m => m.d >= today)
    .sort((a, b) => a.d - b.d);

  if (upcoming.length === 0) {
    el.className = "next-milestone milestone-normal";
    el.innerHTML = `<span class="milestone-icon">🎯</span><span>已无后续节点</span>`;
    return;
  }

  const next = upcoming[0];
  const days = daysBetween(today, next.d);

  let urgency = "milestone-normal";
  if (days <= 3) urgency = "milestone-danger";
  else if (days <= 7) urgency = "milestone-warning";

  el.className = `next-milestone ${urgency}`;
  el.innerHTML = `
    <span class="milestone-icon">🎯</span>
    <span>距「<strong>${next.label}</strong>」还有 <strong>${days}</strong> 天</span>
    <span class="milestone-date">${formatDateCN(next.date)}</span>
  `;
}

function renderWeeklyDayHint() {
  const el = document.getElementById("weekly-check-day-hint");
  if (!el) return;
  const now = new Date();
  const dayInWeek = ((now.getDay() + 6) % 7) + 1;
  el.textContent = `（本周已过 ${dayInWeek}/7 天）`;
}

function updateAllCards() {
  updateVocabularyCard();
  updateHabitCard("listening");
  updateHabitCard("sleep");
  updateProgressCard("cmc");
  updateProgressCard("mock-exams");
  updateProgressCard("advanced-math");
  updateProgressCard("final-courses");
  updateWeeklyCapacityCard();
  updateWeeklyCheckCard();
  renderAllTrendCharts();
  updateMissedBanner();

  // 自定义目标：存在的更新数据，缺失的重建（例如撤销删除后）
  const customGoals = loadCustomGoals();
  const needsRebuild = customGoals.some(
    goal => !document.querySelector(`[data-metric="${goal.id}"]`)
  );
  if (needsRebuild) {
    renderAllCustomGoals();
  } else {
    customGoals.forEach(goal => updateCustomGoalCard(goal));
  }

  renderProgressDashboard();
  refreshMakeupDateOptions();
  renderWeeklyReview();
  renderTodayLine();
  renderNextMilestone();
  renderWeeklyDayHint();
  renderDailyCard();
  renderTop3Tasks();
}

function getMissedMetrics() {
  const missed = [];
  for (const key in METRIC_CONFIGS) {
    const config = METRIC_CONFIGS[key];
    if (config.type === "summary" || config.type === "auto-check" || config.type === "progress") continue;
    if (isYesterdayMissed(key)) missed.push(config);
  }
  return missed;
}

function updateMissedBanner() {
  const wrapper = document.getElementById("missed-banner-wrapper");
  if (!wrapper) return;

  const missed = getMissedMetrics();
  if (missed.length === 0) {
    wrapper.innerHTML = "";
    return;
  }

  const names = missed.map(c => `「${c.name}」`).join("、");
  const firstKey = missed[0].key;

  wrapper.innerHTML = `
    <div class="missed-banner" id="missed-banner">
      <div class="missed-banner-content">
        <div class="missed-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        </div>
        <div class="missed-text">
          <strong>昨日 ${names} 漏打卡</strong>
          <span>已逾期 1 天 · 点击立即打卡补回，不影响连续天数</span>
        </div>
      </div>
      <div class="missed-actions">
        <button class="missed-btn missed-btn-primary" id="missed-btn-checkin">立即打卡</button>
        <button class="missed-btn" id="missed-btn-adjust">调整计划</button>
      </div>
    </div>
  `;

  bindClick("missed-btn-checkin", () => fillTodayCheckin(firstKey));
  bindClick("missed-btn-adjust", () => openAdjustPlan(firstKey));
}

function getLightningIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
}


// ==================== ESM 导出（批次20） ====================
export {
  getLightningIcon, updateAllCards
};
