// ==================== js/ui/checkin.js ====================
// 批次20（ESM-b）自 script.js 整切：打卡主交互域（打卡推算/周检五数字/配额区/九卡更新/交互事件/系数设置）。函数体逐字节不变。
import { METRIC_CONFIGS, QUOTAS } from "../config.js";
import { STORAGE_KEYS, addCheckin, getCheckinValue, getCheckins, getProgressIncrement, getTotalCompleted, hasCheckin, isProgressType, loadData, saveSettings } from "../storage.js";
import { fmtHours, getCoeffEditableMetricKeys, getDailyHours, getWeeklyStats } from "../aggregation.js";
import { animateNumber, daysBetween, formatDate, formatDateCN, formatDateISO, getToday, getYesterday, normalizeHours, notify, parseDate, parseSleepTime, pulseCardSuccess, pushUndo, setBarProgress, setClass, setHTML, setRingProgress, setText, setWidth } from "./base.js";
import { getStageIdByDate } from "./stage.js";
import { getLightningIcon, updateAllCards } from "./today.js";

// ==================== 7. 核心逻辑：打卡与推算 ====================

function getSuggestedToday(metricKey) {
  const config = METRIC_CONFIGS[metricKey];
  if (!config) return 0;

  if (config.type === "habit" || config.type === "hybrid" || config.type === "time-habit") {
    return config.dailyTarget;
  }

  if (config.type === "progress") {
    const completed = getTotalCompleted(metricKey);
    const remaining = Math.max(0, config.totalGoal - completed);
    const today = new Date();
    const deadline = parseDate(config.deadline);
    const remainingDays = Math.max(1, daysBetween(today, deadline));
    // 建议量最少 1，避免小总量指标（如模考 3 次/41 天）算出 0
    return Math.max(1, Math.round(remaining / remainingDays));
  }

  return 0;
}

function getRecentAverage(metricKey, days) {
  if (isProgressType(metricKey)) {
    return getProgressRecentAverage(metricKey, days);
  }

  const today = new Date();
  let total = 0;
  let sampleDays = 0;

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = formatDateISO(d);
    const value = getCheckinValue(metricKey, dateStr);
    const num = Number(value) || 0;
    if (num > 0) {
      total += num;
      sampleDays++;
    }
  }

  return { average: sampleDays > 0 ? total / sampleDays : 0, sampleDays };
}

function getProgressRecentAverage(metricKey, days) {
  const today = new Date();
  let totalIncrement = 0;
  let sampleDays = 0;

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = formatDateISO(d);
    const increment = getProgressIncrement(metricKey, dateStr);
    if (increment > 0) {
      totalIncrement += increment;
      sampleDays++;
    }
  }

  return { average: sampleDays > 0 ? totalIncrement / sampleDays : 0, sampleDays };
}

function getEstimatedCompletion(metricKey) {
  const config = METRIC_CONFIGS[metricKey];
  if (!config || !config.totalGoal || !config.deadline) {
    return { dateStr: null, diffDays: null, onTrack: null };
  }

  const { average, sampleDays } = getRecentAverage(metricKey, 7);
  if (sampleDays < 3) {
    return { dateStr: null, diffDays: null, onTrack: null };
  }

  const completed = getTotalCompleted(metricKey);
  const remaining = Math.max(0, config.totalGoal - completed);
  const daysNeeded = remaining / average;

  const today = new Date();
  const estimated = new Date(today);
  estimated.setDate(today.getDate() + Math.ceil(daysNeeded));
  const estimatedStr = formatDateISO(estimated);

  const deadline = parseDate(config.deadline);
  const diffDays = daysBetween(estimated, deadline);

  return { dateStr: estimatedStr, diffDays, onTrack: diffDays >= 0 };
}

function getStreak(metricKey) {
  let streak = 0;
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 1 && metricKey !== "vocabulary") continue; // 周一休息日；单词7/7例外
    const dateStr = formatDateISO(d);
    if (hasCheckin(metricKey, dateStr)) {
      streak++;
    } else {
      const isInCurrentWeek = d >= monday && d < nextMonday;
      if (isInCurrentWeek) continue; // 本周内漏打不断链
      break;
    }
  }
  return streak;
}

function getWeeklyAchievement(metricKey) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  let achieved = 0;
  let total = 0;
  for (let i = 0; i <= diffToMonday; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - diffToMonday + i);
    if (d.getDay() === 1 && metricKey !== "vocabulary") continue; // 周一休息不计；单词7/7例外
    total++;
    if (hasCheckin(metricKey, formatDateISO(d))) achieved++;
  }
  return { achieved, total };
}

function isYesterdayMissed(metricKey) {
  const yesterday = getYesterday();
  const d = parseDate(yesterday);
  if (d.getDay() === 1 && metricKey !== "vocabulary") return false; // 单词7/7例外
  return !hasCheckin(metricKey, yesterday);
}

// ==================== 8. 学时汇总：周有效产能 ====================

// 已迁移至 js/aggregation.js（批次9）

// ==================== 9. 周检5数字自动判断 ====================

function getWeeklyCheckItems() {
  const ws = getWeeklyStats();
  const lastWeek = getLastWeekCheckItems();
  const byId = {};
  ws.checkItems.forEach(ci => { byId[ci.id] = ci; });
  const th = id => (byId[id] ? byId[id].threshold : 0);
  const item = (id, label, thisWeek, lastWeekVal, unit) => ({
    label: label,
    ok: byId[id] ? byId[id].pass : false,
    thisWeek: thisWeek,
    target: th(id),
    lastWeek: lastWeekVal,
    unit: unit
  });

  if (getStageIdByDate(getToday()) === "阶段1") {
    return [
      item("total-hours", "总小时≥21", ws.totalHours, lastWeek.totalHours, "h"),
      item("achieve-days", "达标天≥5/7", ws.achieveDays, lastWeek.achieveDays, "天"),
      item("final-review", "期末复习≥10h", ws.finalReviewHours, lastWeek.finalReviewHours, "h"),
      item("cet6", "六级专项≥3h", ws.cet6Hours, lastWeek.cet6Hours, "h"),
      item("vocab", "单词复习7/7", ws.vocabDays, lastWeek.vocabDays, "天")
    ];
  }

  return [
    item("total-hours", "总小时≥21", ws.totalHours, lastWeek.totalHours, "h"),
    item("achieve-days", "达标天≥5/7", ws.achieveDays, lastWeek.achieveDays, "天"),
    item("competition", "竞赛≥10.5h", ws.competitionHours, lastWeek.competitionHours, "h"),
    item("weekly-invest", "周总投入≥28h", ws.totalHours, lastWeek.totalHours, "h"),
    item("vocab", "单词复习7/7", ws.vocabDays, lastWeek.vocabDays, "天")
  ];
}

function getLastWeekCheckItems() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
  const ws = getWeeklyStats(formatDateISO(d));
  return {
    totalHours: ws.totalHours,
    achieveDays: ws.achieveDays,
    competitionHours: ws.competitionHours,
    vocabDays: ws.vocabDays,
    cet6Hours: ws.cet6Hours,
    finalReviewHours: ws.finalReviewHours
  };
}

// ==================== 10. 渲染：周配额区 ====================

function renderQuotas(stageInfo) {
  const { main, sub } = stageInfo;
  if (!main) return;

  const mainQuotas = QUOTAS.filter(q => q.stage === main.id);
  const mainTotal = mainQuotas.reduce((sum, q) => sum + normalizeHours(q), 0);

  const stageMain = document.getElementById("stage-main");
  if (stageMain) stageMain.textContent = main.id;

  const stageTitle = document.getElementById("stage-title");
  if (stageTitle) stageTitle.textContent = main.goal;

  const stageMeta = document.getElementById("stage-meta");
  if (stageMeta) {
    stageMeta.innerHTML = `${formatDate(main.start)} – ${formatDate(main.end)} · 剩余 <strong>${stageInfo.daysLeftMain}</strong> 天`;
  }

  const stageDoc = document.getElementById("stage-doc-link");
  if (stageDoc) stageDoc.textContent = `查看总纲：${main.doc}`;

  const subBadge = document.getElementById("stage-sub");
  if (subBadge) {
    subBadge.style.display = sub ? "inline-block" : "none";
    if (sub) subBadge.textContent = sub.id.replace(main.id + "·", "");
  }

  const quotaTotal = document.getElementById("quota-total");
  if (quotaTotal) quotaTotal.textContent = `${mainTotal} h`;

  const subQuotaCard = document.querySelector(".quota-card-sub");
  if (sub && sub.id.includes("国庆")) {
    if (subQuotaCard) subQuotaCard.style.display = "block";
    const subQuotas = QUOTAS.filter(q => q.stage === sub.id && q.hoursPerDay > 0);
    const subDaily = subQuotas.reduce((sum, q) => sum + q.hoursPerDay, 0);
    const subWeekly = subDaily * 7;
    const quotaSubTotal = document.getElementById("quota-sub-total");
    if (quotaSubTotal) quotaSubTotal.textContent = `${subWeekly} h`;
    const subNote = document.querySelector(".quota-card-sub .quota-note");
    if (subNote) subNote.textContent = `每日 ${subDaily}h 封顶`;
  } else {
    if (subQuotaCard) subQuotaCard.style.display = "none";
  }

  const moduleListEl = document.getElementById("module-list");
  if (moduleListEl) {
    const title = moduleListEl.querySelector(".section-title");
    if (title) title.textContent = `${main.id} 模块周配额`;
    const ul = moduleListEl.querySelector("ul");
    if (ul) {
      ul.innerHTML = mainQuotas.map(q => {
        const hours = normalizeHours(q);
        const hoursText = q.hoursPerDay ? `${q.hoursPerDay} h/天` : `${hours} h`;
        return `
          <li class="module-item">
            <span class="module-name">${q.module}</span>
            <span class="module-hours">${hoursText}</span>
            <span class="module-note">${q.note || "暂无备注"}</span>
          </li>
        `;
      }).join("");
    }
  }
}

// ==================== 11. 更新：各类指标卡 ====================

function updateVocabularyCard() {
  const key = "vocabulary";
  const config = METRIC_CONFIGS[key];
  const todayStr = getToday();
  const todayValue = Number(getCheckinValue(key, todayStr)) || 0;
  const suggested = getSuggestedToday(key);
  const streak = getStreak(key);
  const estimated = getEstimatedCompletion(key);
  const totalCompleted = getTotalCompleted(key);
  const todayRatio = config.dailyTarget > 0 ? todayValue / config.dailyTarget : 0;
  const totalRatio = config.totalGoal > 0 ? totalCompleted / config.totalGoal : 0;

  const statusClass = todayValue <= 0 ? "status-danger" : (todayRatio >= 1 ? "status-normal" : "status-warning");
  const statusText = todayValue <= 0 ? "未打卡" : (todayRatio >= 1 ? "已达标" : "进行中");

  setText("vocabulary-status", statusText);
  setClass("vocabulary-status", `metric-status ${statusClass}`);
  setText("vocabulary-target", `${config.dailyTarget} ${config.unit}`);
  animateNumber("vocabulary-current", todayValue);
  setBarProgress("vocabulary", todayRatio * 100, statusClass);
  const weekly = getWeeklyAchievement("vocabulary");
  setHTML("vocabulary-streak", `${getLightningIcon()} 本周 ${weekly.achieved}/${weekly.total} 天`);
  setText("vocabulary-total", `累计 ${totalCompleted}/${config.totalGoal} ${config.unit} · 总进度 ${Math.round(totalRatio * 100)}%`);
  setText("vocabulary-suggest", `今日建议量：${suggested} ${config.unit} · 长期目标 ${totalCompleted}/${config.totalGoal} ${config.unit}`);

  const input = document.getElementById("vocabulary-input");
  if (input && !input.dataset.userEdited) {
    input.value = todayValue > 0 ? todayValue : suggested;
  }

  const est = document.getElementById("vocabulary-estimate");
  if (est) {
    if (estimated.dateStr) {
      const diffText = estimated.diffDays >= 0
        ? `预计提前 ${estimated.diffDays} 天完成`
        : `预计拖后 ${Math.abs(estimated.diffDays)} 天`;
      est.textContent = `预计完成日：${formatDateCN(estimated.dateStr)} · ${diffText}`;
      est.className = `metric-estimate ${estimated.onTrack ? "estimate-early" : "estimate-late"}`;
    } else {
      est.textContent = "预计完成日：暂无推算（样本不足3天）";
      est.className = "metric-estimate estimate-none";
    }
  }
}

function updateHabitCard(key) {
  const config = METRIC_CONFIGS[key];
  const todayStr = getToday();
  const todayValue = getCheckinValue(key, todayStr);
  const suggested = getSuggestedToday(key);
  const streak = getStreak(key);

  let displayValue, progressRatio, statusClass, statusText;

  if (config.type === "time-habit") {
    const targetMinutes = parseSleepTime(config.dailyTarget);
    const currentMinutes = parseSleepTime(todayValue);
    displayValue = todayValue || "--:--";
    progressRatio = currentMinutes && targetMinutes
      ? Math.min(1, Math.max(0, targetMinutes / currentMinutes))
      : 0;
    statusClass = todayValue ? (progressRatio >= 1 ? "status-normal" : "status-warning") : "status-danger";
    statusText = todayValue ? (progressRatio >= 1 ? "已达标" : "偏晚") : "未记录";
  } else {
    const current = Number(todayValue) || 0;
    displayValue = current;
    progressRatio = config.dailyTarget > 0 ? current / config.dailyTarget : 0;
    statusClass = current <= 0 ? "status-danger" : (progressRatio >= 1 ? "status-normal" : "status-warning");
    statusText = current <= 0 ? "未打卡" : (progressRatio >= 1 ? "已达标" : "进行中");
  }

  setText(`${key}-status`, statusText);
  setClass(`${key}-status`, `metric-status ${statusClass}`);
  if (config.type === "time-habit") {
    setText(`${key}-target`, String(config.dailyTarget));
  } else {
    setText(`${key}-target`, `${config.dailyTarget} ${config.unit}`);
  }
  if (typeof displayValue === "number") {
    animateNumber(`${key}-current`, displayValue);
  } else {
    setText(`${key}-current`, displayValue);
  }
  setRingProgress(key, progressRatio * 100, statusClass);
  const weekly = getWeeklyAchievement(key);
  setHTML(`${key}-streak`, `${getLightningIcon()} 本周 ${weekly.achieved}/${weekly.total} 天`);

  const input = document.getElementById(`${key}-input`);
  if (input && !input.dataset.userEdited) {
    if (config.type === "time-habit") {
      input.value = todayValue || "";
    } else {
      input.value = Number(todayValue) > 0 ? todayValue : suggested;
    }
  }

  if (config.type !== "time-habit") {
    setText(`${key}-suggest`, `今日建议量：${suggested} ${config.unit}`);
  }
}

function updateProgressCard(key) {
  const config = METRIC_CONFIGS[key];
  const totalCompleted = getTotalCompleted(key);
  const percent = Math.min(100, Math.round((totalCompleted / config.totalGoal) * 100));
  const estimated = getEstimatedCompletion(key);
  const suggested = getSuggestedToday(key);

  const today = new Date();
  const deadline = parseDate(config.deadline);
  const daysLeft = daysBetween(today, deadline);

  let statusClass, statusText;
  if (percent >= 100) {
    statusClass = "status-normal";
    statusText = "已完成";
  } else if (percent === 0 && daysLeft > 30) {
    statusClass = "status-warning";
    statusText = "未开始";
  } else if (percent >= 80) {
    statusClass = "status-warning";
    statusText = "进行中";
  } else {
    statusClass = "status-danger";
    statusText = "落后";
  }

  setText(`${key}-status`, statusText);
  setClass(`${key}-status`, `metric-status ${statusClass}`);
  animateNumber(`${key}-current`, totalCompleted);
  setRingProgress(key, percent, statusClass);
  setText(`${key}-percent-text`, `完成度 ${percent}%`);
  setText(`${key}-target`, `${config.totalGoal} ${config.unit}`);
  setText(`${key}-suggest`, `建议今日推进：${suggested} ${config.unit}`);

  const est = document.getElementById(`${key}-estimate`);
  if (est) {
    if (estimated.dateStr) {
      const diffText = estimated.diffDays >= 0
        ? `预计提前 ${estimated.diffDays} 天完成`
        : `预计拖后 ${Math.abs(estimated.diffDays)} 天`;
      est.textContent = `预计完成日：${formatDateCN(estimated.dateStr)} · ${diffText}`;
      est.className = `metric-estimate ${estimated.onTrack ? "estimate-early" : "estimate-late"}`;
    } else {
      est.textContent = "预计完成日：暂无推算（样本不足3天）";
      est.className = "metric-estimate estimate-none";
    }
  }
}

function updateWeeklyCapacityCard() {
  const config = METRIC_CONFIGS["weekly-capacity"];
  const weeklyHours = getWeeklyStats().totalHours;
  const todayHours = getDailyHours(getToday()).hours;

  let statusClass, statusText;
  if (weeklyHours >= config.target) {
    statusClass = "status-normal";
    statusText = "已达标";
  } else if (weeklyHours >= config.bottom) {
    statusClass = "status-warning";
    statusText = "底线以上";
  } else {
    statusClass = "status-danger";
    statusText = "低于底线";
  }

  setText("weekly-capacity-status", statusText);
  setClass("weekly-capacity-status", `metric-status ${statusClass}`);
  setText("weekly-capacity-target", `${config.target} ${config.unit}`);
  animateNumber("weekly-capacity-current", fmtHours(weeklyHours));

  const bar = document.getElementById("weekly-capacity-progress");
  if (bar) {
    const ratio = config.target > 0 ? Math.min(100, (weeklyHours / config.target) * 100) : 0;
    bar.style.width = ratio + "%";
    bar.className = "metric-bar-fill " + statusClass;
  }
  const percentText = document.getElementById("weekly-capacity-percent");
  if (percentText) {
    percentText.textContent = (config.target > 0 ? Math.round((weeklyHours / config.target) * 100) : 0) + "%";
  }
  setText("weekly-capacity-today", `今日已积累 ${fmtHours(todayHours)}h`);

  // 同步更新顶部"本周已用学时"卡片（原版遗漏）
  const quotaUsed = document.getElementById("quota-used");
  if (quotaUsed) quotaUsed.textContent = `${fmtHours(weeklyHours)} h`;
  setWidth(
    "quota-used-progress-bar",
    config.target > 0 ? Math.min(100, (weeklyHours / config.target) * 100) : 0
  );
}

function updateWeeklyCheckCard() {
  const items = getWeeklyCheckItems();
  const okCount = items.filter(i => i.ok).length;
  const statusClass = okCount === 5 ? "status-normal" : (okCount >= 3 ? "status-warning" : "status-danger");
  const statusText = okCount === 5 ? "全达标" : `${okCount}/5 达标`;

  setText("weekly-check-status", statusText);
  setClass("weekly-check-status", `metric-status ${statusClass}`);

  items.forEach((item, idx) => {
    setText(`weekly-check-item-${idx}-label`, item.label);
    setClass(`weekly-check-item-${idx}-dot`, `mini-dot ${item.ok ? "status-normal" : "status-danger"}`);
    setText(
      `weekly-check-item-${idx}-values`,
      `本周 ${fmtHours(item.thisWeek)}${item.unit} · 目标 ${item.target}${item.unit}`
    );
    const bar = document.getElementById(`weekly-check-item-${idx}-bar`);
    if (bar) {
      const ratio = item.target > 0 ? Math.min(100, (item.thisWeek / item.target) * 100) : 0;
      bar.style.width = ratio + "%";
      bar.className = "strip-item-bar-fill " + (item.ok ? "status-normal" : "status-danger");
    }
  });
}


// ==================== 12. 交互事件处理 ====================

function handleCheckin(metricKey) {
  const config = METRIC_CONFIGS[metricKey];
  const input = document.getElementById(`${metricKey}-input`);
  if (!input) return;

  let value = input.value;

  if (config.type === "time-habit") {
    if (!value) {
      notify("请选择或输入时间");
      return;
    }
    const before = getCheckins();
    addCheckin(metricKey, value, getToday(), false);
    pushUndo("打卡", { [STORAGE_KEYS.checkins]: before });
  } else {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) {
      notify("请输入有效数量");
      return;
    }
    const before = getCheckins();
    addCheckin(metricKey, num, getToday(), false);
    pushUndo("打卡", { [STORAGE_KEYS.checkins]: before });
  }

  input.dataset.userEdited = "";
  updateAllCards();
  pulseCardSuccess(metricKey);
}

function handleProgressCheckin(metricKey) {
  const input = document.getElementById(`${metricKey}-input`);
  if (!input) return;

  const increment = parseFloat(input.value);
  if (isNaN(increment) || increment < 0) {
    notify("请输入有效数量");
    return;
  }

  const before = getCheckins();
  addCheckin(metricKey, increment, getToday(), false);
  pushUndo("进度推进", { [STORAGE_KEYS.checkins]: before });
  input.value = "";
  updateAllCards();
  pulseCardSuccess(metricKey);
}

function handleQuickCheckin(metricKey) {
  const config = METRIC_CONFIGS[metricKey];
  const input = document.getElementById(`${metricKey}-input`);
  if (!config || !input) return;

  const suggested = getSuggestedToday(metricKey);
  input.value = suggested;

  if (config.type === "progress") {
    handleProgressCheckin(metricKey);
  } else {
    handleCheckin(metricKey);
  }
}

function handleMakeup(metricKey) {
  const config = METRIC_CONFIGS[metricKey];
  const dateSelect = document.getElementById(`${metricKey}-makeup-date`);
  const input = document.getElementById(`${metricKey}-makeup-input`);
  if (!dateSelect || !input) return;

  const dateStr = dateSelect.value;
  let value = input.value;

  if (config.type === "time-habit") {
    if (!value) {
      notify("请输入时间");
      return;
    }
  } else {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) {
      notify("请输入有效数量");
      return;
    }
    value = num;
  }

  const d = parseDate(dateStr);
  if (d.getDay() === 1 && metricKey !== "vocabulary") { // 单词7/7例外：补记不弹休息日确认
    if (!confirm("周一是自动休息日，确定要补记吗？")) return;
  }

  const before = getCheckins();
  addCheckin(metricKey, value, dateStr, true);
  pushUndo("补记", { [STORAGE_KEYS.checkins]: before });
  input.value = "";
  updateAllCards();
}

function handleProgressMakeup(metricKey) {
  const dateSelect = document.getElementById(`${metricKey}-makeup-date`);
  const input = document.getElementById(`${metricKey}-makeup-input`);
  if (!dateSelect || !input) return;

  const dateStr = dateSelect.value;
  const increment = parseFloat(input.value);

  if (isNaN(increment) || increment < 0) {
    notify("请输入有效数量");
    return;
  }

  const before = getCheckins();
  addCheckin(metricKey, increment, dateStr, true);
  pushUndo("进度补记", { [STORAGE_KEYS.checkins]: before });
  input.value = "";
  updateAllCards();
}

function toggleMakeup(metricKey) {
  const form = document.getElementById(`${metricKey}-makeup-form`);
  if (form) {
    form.style.display = form.style.display === "none" ? "flex" : "none";
  }
}

function fillTodayCheckin(metricKey) {
  const config = METRIC_CONFIGS[metricKey];
  const input = document.getElementById(`${metricKey}-input`);
  if (input) {
    if (config.type === "time-habit") {
      input.value = "23:00";
    } else {
      input.value = getSuggestedToday(metricKey);
    }
    input.focus();
  }
  const card = document.querySelector(`[data-metric="${metricKey}"]`);
  if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function openAdjustPlan(metricKey) {
  const config = METRIC_CONFIGS[metricKey];
  const hasTotalGoal = config.totalGoal !== undefined;
  const hasDailyTarget = typeof config.dailyTarget === "number";
  let changed = false;

  // 若两者都没有（例如 summary / auto-check 类型），直接返回
  if (!hasTotalGoal && !hasDailyTarget) {
    notify(`「${config.name}」没有可调整的目标值`);
    return;
  }

  // 询问总目标（如果该指标有）
  if (hasTotalGoal) {
    const input = prompt(
      `调整「${config.name}」总目标
当前：${config.totalGoal} ${config.unit}
（留空跳过，取消放弃）`,
      config.totalGoal
    );
    if (input !== null && input.trim() !== "") {
      const num = parseFloat(input);
      if (isNaN(num) || num < 1) {
        notify("总目标请输入有效数字（≥1）");
        return;
      }
      if (num !== config.totalGoal) {
        config.totalGoal = num;
        changed = true;
      }
    }
  }

  // 询问每日目标（如果该指标有）
  if (hasDailyTarget) {
    const input = prompt(
      `调整「${config.name}」每日目标
当前：${config.dailyTarget} ${config.unit}
（留空跳过，取消放弃）`,
      config.dailyTarget
    );
    if (input !== null && input.trim() !== "") {
      const num = parseFloat(input);
      if (isNaN(num) || num < 1) {
        notify("每日目标请输入有效数字（≥1）");
        return;
      }
      if (num !== config.dailyTarget) {
        config.dailyTarget = num;
        changed = true;
      }
    }
  }

  if (changed) {
    const before = loadData(STORAGE_KEYS.settings, {});
    saveSettings();
    pushUndo("调整计划", { [STORAGE_KEYS.settings]: before });
  } else {
    updateAllCards();
  }

  // 调整计划后的数学关系一致性检查（提示而非阻止）
  const c = METRIC_CONFIGS[metricKey];
  if (c && c.totalGoal !== undefined && typeof c.dailyTarget === "number" && c.deadline) {
    const completed = getTotalCompleted(metricKey);
    const remaining = Math.max(0, c.totalGoal - completed);
    const daysNeeded = remaining / c.dailyTarget;
    const daysLeft = Math.max(1, daysBetween(new Date(), parseDate(c.deadline)));
    if (daysNeeded > daysLeft) {
      notify(
        `按每日 ${c.dailyTarget} ${c.unit} 的节奏，完成 ${c.totalGoal} ${c.unit} 需 ${Math.ceil(daysNeeded)} 天，超出截止日 ${Math.ceil(daysNeeded - daysLeft)} 天`,
        "warning"
      );
    } else if (daysNeeded < daysLeft * 0.5) {
      notify(
        `按当前节奏 ${Math.ceil(daysNeeded)} 天即可完成，远低于截止日的 ${daysLeft} 天，可考虑上调每日目标`,
        "info"
      );
    }
  }
}

// 已迁移至 js/storage.js（批次8）

// ---------- 卡片系数与目标设置页（批次15 R-2a） ----------

function renderCoeffSettings() {
  const list = document.getElementById("coeff-settings-list");
  if (!list) return;
  const rows = getCoeffEditableMetricKeys().map(key => {
    const cfg = METRIC_CONFIGS[key];
    const rate = typeof cfg.hoursPerUnit === "number" ? cfg.hoursPerUnit : "";
    const dailyInput = typeof cfg.dailyTarget === "number"
      ? `<input type="number" class="global-stats-goal-input" id="coeff-daily-${key}" step="1" min="1" value="${cfg.dailyTarget}" data-original="${cfg.dailyTarget}" placeholder="每日目标">`
      : "";
    const goalInput = cfg.totalGoal !== undefined
      ? `<input type="number" class="global-stats-goal-input" id="coeff-goal-${key}" step="1" min="1" value="${cfg.totalGoal}" data-original="${cfg.totalGoal}" placeholder="总目标">`
      : "";
    return `<div class="global-stats-goal-form" style="margin-bottom: 8px; flex-wrap: wrap;">
      <span style="min-width: 110px;">${cfg.name}（${cfg.unit}）</span>
      <input type="number" class="global-stats-goal-input" id="coeff-rate-${key}" step="any" min="0" value="${rate}" data-original="${rate}" placeholder="系数 h/${cfg.unit}">
      ${dailyInput}
      ${goalInput}
    </div>`;
  });
  const sleepCfg = METRIC_CONFIGS.sleep;
  if (sleepCfg) {
    rows.push(`<div class="global-stats-goal-form" style="margin-bottom: 8px; opacity: 0.6;">
      <span style="min-width: 110px;">${sleepCfg.name}</span>
      <span class="settings-action-desc">就寝目标 ${sleepCfg.dailyTarget}，时间型习惯卡无折算系数，请在仪表盘卡片上调整</span>
    </div>`);
  }
  list.innerHTML = rows.join("");
}

function handleSaveCoeffSettings() {
  const before = loadData(STORAGE_KEYS.settings, {});
  let changed = false;
  const keys = getCoeffEditableMetricKeys();
  for (const key of keys) {
    const cfg = METRIC_CONFIGS[key];
    const fields = [
      { id: `coeff-rate-${key}`, prop: "hoursPerUnit", min: 0, label: "折算系数", exclusiveMin: true },
      { id: `coeff-daily-${key}`, prop: "dailyTarget", min: 1, label: "每日目标" },
      { id: `coeff-goal-${key}`, prop: "totalGoal", min: 1, label: "总目标" }
    ];
    for (const f of fields) {
      const el = document.getElementById(f.id);
      if (!el) continue;
      const raw = el.value.trim();
      if (raw === "" || raw === el.dataset.original) continue;
      const v = Number(raw);
      if (isNaN(v) || (f.exclusiveMin ? v <= f.min : v < f.min)) {
        notify(`「${cfg.name}」${f.label}输入无效`, "warning");
        return;
      }
      cfg[f.prop] = v;
      changed = true;
    }
  }
  if (!changed) {
    notify("没有改动", "info");
    return;
  }
  saveSettings();
  pushUndo("调整卡片系数与目标", { [STORAGE_KEYS.settings]: before });
  notify("已保存；新系数仅影响此后新打卡，历史记录封存不变", "success");
  updateAllCards();
  renderCoeffSettings();
}

// ==================== 13. 事件绑定 ====================

// 已迁移至 js/storage.js（批次8）

// 已迁移至 js/storage.js（批次8）


// ==================== 14. 模块周配额 收起/展开（批次24 补正5） ====================

function bindModuleListToggle() {
  const listEl = document.getElementById("module-list");
  const toggleBtn = document.getElementById("module-list-toggle");
  if (!listEl || !toggleBtn || toggleBtn.dataset.bound === "1") return;
  toggleBtn.dataset.bound = "1";
  toggleBtn.addEventListener("click", () => {
    const collapsed = listEl.classList.toggle("is-collapsed");
    toggleBtn.textContent = collapsed ? "展开" : "收起";
    toggleBtn.setAttribute("aria-expanded", String(!collapsed));
  });
}

// ==================== ESM 导出（批次20） ====================
export {
  bindModuleListToggle,
  fillTodayCheckin, getEstimatedCompletion, getLastWeekCheckItems, getRecentAverage, getStreak, getSuggestedToday, getWeeklyCheckItems, handleCheckin,
    handleMakeup, handleProgressCheckin, handleProgressMakeup, handleQuickCheckin, handleSaveCoeffSettings, isYesterdayMissed, openAdjustPlan, renderCoeffSettings,
    renderQuotas, toggleMakeup, updateHabitCard, updateProgressCard, updateVocabularyCard, updateWeeklyCapacityCard, updateWeeklyCheckCard
};
