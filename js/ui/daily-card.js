// ==================== js/ui/daily-card.js ====================
// 批次20（ESM-b）自 script.js 整切：日卡系统域（S4-1 状态分/渲染/保存/事件）。函数体逐字节不变。
import { MELTDOWN_THRESHOLD, STAGE0_START_DATE, STATUS_DROP_THRESHOLD, DAILY_CAP } from "../config.js";
import { STORAGE_KEYS, getDailyCard, getDailyCards, saveDailyCard } from "../storage.js";
import { fmtHours, getDailyHours } from "../aggregation.js";
import { bindClick, daysBetween, formatDateCN, formatDateISO, getToday, notify, parseDate, pushUndo } from "./base.js";

// ==================== 0.3 日卡系统（S4-1） ====================

// 配置常量已迁移至 js/config.js（批次7）

// 已迁移至 js/storage.js（批次8）

function getStatusScore(dateStr) {
  const card = getDailyCard(dateStr);
  return card && card.statusScore > 0 ? card.statusScore : null;
}

function getStatusScoreRange(days, offset) {
  // 返回最近 days 天（可加 offset 偏移，用于对比前一周期）的状态分数组，仅含有效记录
  const scores = [];
  const today = new Date();
  const off = offset || 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i - off * days);
    const ds = formatDateISO(d);
    const s = getStatusScore(ds);
    if (s !== null) scores.push(s);
  }
  return scores;
}

function getStatusScoreAvg(days, offset) {
  const scores = getStatusScoreRange(days, offset);
  if (scores.length === 0) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

function getStatusScoreTrend() {
  const recent = getStatusScoreAvg(7, 0);
  const previous = getStatusScoreAvg(7, 1);
  if (recent === null || previous === null) {
    return { recent, previous, diff: null, hasTrend: false };
  }
  const diff = Math.round((recent - previous) * 10) / 10;
  return { recent, previous, diff, hasTrend: true };
}

function isReduceWeek() {
  // 阶段0 起点起算，每第 6、12、18……周为减量周
  const daysSinceStart = daysBetween(parseDate(STAGE0_START_DATE), new Date());
  if (daysSinceStart < 0) return false;
  const weekIndex = Math.floor(daysSinceStart / 7);
  return (weekIndex + 1) % 6 === 0;
}

function isSundayAfternoon() {
  const now = new Date();
  return now.getDay() === 0 && now.getHours() >= 12;
}

function getTodayCap() {
  // DAILY_CAP 索引：周一=0 → 周日=6
  return DAILY_CAP[(new Date().getDay() + 6) % 7];
}

function paintDailyRatio(hours, cap) {
  // 新比值口径（批次22 R3）：今日学习时长 ÷ 上限值，百分比显示
  const ratioEl = document.getElementById("daily-ratio");
  if (!ratioEl) return;
  ratioEl.className = "daily-ratio-display";
  if (cap > 0) {
    const ratio = hours / cap;
    ratioEl.textContent = Math.round(ratio * 100) + "%";
    if (ratio >= 0.9) ratioEl.classList.add("ratio-good");
    else if (ratio >= 0.6) ratioEl.classList.add("ratio-ok");
    else ratioEl.classList.add("ratio-bad");
  } else {
    ratioEl.textContent = "--";
  }
}

function renderDailyCard() {
  const el = document.getElementById("daily-card");
  if (!el) return;

  const todayStr = getToday();
  const card = getDailyCard(todayStr);

  const actualInput = document.getElementById("daily-actual-hours");
  const blockerInput = document.getElementById("daily-blocker");

  if (actualInput && !actualInput.dataset.userEdited) {
    const prevAdj = card && Number.isFinite(Number(card.adjustment)) ? Number(card.adjustment) : 0;
    actualInput.value = prevAdj !== 0 ? prevAdj : "";
  }
  if (blockerInput && !blockerInput.dataset.userEdited) {
    blockerInput.value = card ? card.blocker : "";
  }

  // 今日学习时长 / 上限值 / 新比值（只读三件套，随打卡与调整自动重算）
  const dh = getDailyHours(todayStr);
  const cap = getTodayCap();
  const hoursEl = document.getElementById("daily-today-hours");
  if (hoursEl) hoursEl.textContent = fmtHours(dh.hours) + " h";
  const capEl = document.getElementById("daily-cap");
  if (capEl) capEl.textContent = cap + " h";
  // 调整额输入未保存时的即时预览：已存工时 + (输入值 - 已存调整额)
  let previewHours = dh.hours;
  if (actualInput && actualInput.dataset.userEdited === "true") {
    const prevAdj = card && Number.isFinite(Number(card.adjustment)) ? Number(card.adjustment) : 0;
    previewHours = dh.hours - prevAdj + (Number(actualInput.value) || 0);
  }
  paintDailyRatio(previewHours, cap);

  // 状态分按钮高亮
  const picker = document.getElementById("status-score-picker");
  if (picker) {
    picker.querySelectorAll(".status-score-btn").forEach(btn => {
      const s = Number(btn.dataset.score);
      btn.classList.toggle("active", card && card.statusScore === s);
    });
  }

  // 标签行
  const tagsEl = document.getElementById("daily-card-tags");
  if (tagsEl) {
    const tags = [];
    if (isReduceWeek()) tags.push('<span class="daily-tag daily-tag-reduce-week">减量周</span>');
    if (isSundayAfternoon()) tags.push('<span class="daily-tag daily-tag-sunday-rest">下午半天休</span>');

    const dhToday = getDailyHours(todayStr);
    if (dhToday.adjustment !== 0) {
      tags.push(`<span class="daily-tag daily-tag-diff">折算 ${fmtHours(dhToday.autoHours)}h，手动调整 ${dhToday.adjustment > 0 ? "+" : ""}${dhToday.adjustment}h</span>`);
    }

    const trend = getStatusScoreTrend();
    if (trend.hasTrend && trend.recent !== null && trend.recent < MELTDOWN_THRESHOLD) {
      tags.push('<span class="daily-tag daily-tag-meltdown">熔断预警</span>');
    }

    tagsEl.innerHTML = tags.join("");
  }

  // 洞察行
  const insightEl = document.getElementById("daily-card-insight");
  if (insightEl) {
    const recent = getStatusScoreAvg(7, 0);
    const trend = getStatusScoreTrend();
    let text = "";
    let cls = "daily-card-insight";

    if (recent === null) {
      text = `近 7 天状态分均值：<strong>暂无记录</strong>`;
    } else {
      text = `近 7 天状态分均值：<strong>${recent}</strong>`;
      if (trend.hasTrend && trend.diff !== null) {
        const arrow = trend.diff > 0 ? "↑" : (trend.diff < 0 ? "↓" : "→");
        const sign = trend.diff > 0 ? "+" : "";
        text += ` · 环比上周 ${arrow} <strong>${sign}${trend.diff}</strong>`;
      }
      if (recent < MELTDOWN_THRESHOLD) {
        text += ` · <strong>低于熔断线 3.5，考虑切 A 案（23:00 睡 7:30 起）</strong>`;
        cls += " insight-danger";
      } else if (trend.hasTrend && trend.diff !== null && trend.diff <= -STATUS_DROP_THRESHOLD) {
        text += ` · <strong>下滑 ≥ ${STATUS_DROP_THRESHOLD}，下周注意减量</strong>`;
        cls += " insight-warning";
      }
    }

    insightEl.innerHTML = text;
    insightEl.className = cls;
  }
}

function handleSaveDailyCard() {
  const todayStr = getToday();
  const actualInput = document.getElementById("daily-actual-hours");
  const blockerInput = document.getElementById("daily-blocker");
  const picker = document.getElementById("status-score-picker");

  const activeBtn = picker ? picker.querySelector(".status-score-btn.active") : null;
  const statusScore = activeBtn ? Number(activeBtn.dataset.score) : 0;

  if (statusScore <= 0) {
    notify("请先选择状态分（1–5）");
    return;
  }

  // 白皮书§4.3（批次14b 定稿）：输入框语义=当日调整额（默认 0、可负、仅当日生效）；编辑过即落盘，未编辑保留原 adjustment
  // 批次22 R3：planHours 字段保留不删（旧备份兼容），新卡落 0
  const prevCard = getDailyCard(todayStr);
  const actualEdited = !!(actualInput && actualInput.dataset.userEdited === "true");
  const prevAdj = prevCard && Number.isFinite(Number(prevCard.adjustment)) ? Number(prevCard.adjustment) : 0;
  const data = {
    planHours: 0,
    adjustment: actualEdited
      ? (actualInput ? Number(actualInput.value) || 0 : 0)
      : prevAdj,
    statusScore: statusScore,
    blocker: blockerInput ? blockerInput.value : ""
  };

  const before = getDailyCards();
  saveDailyCard(todayStr, data);
  pushUndo("保存日卡", { [STORAGE_KEYS.dailyCards]: before });

  // 熔断提示：状态分 ≤2 时按总纲规则进入轻量模式
  if (statusScore <= 2) {
    setTimeout(() => {
      notify(
        `状态分 ${statusScore} ≤ 2，按方案规则进入熔断：只做单词+错题翻看，双线全停，不补课不愧疚`,
        "warning"
      );
    }, 400);
  }

  const saveBtn = document.getElementById("daily-save-btn");
  if (saveBtn) {
    saveBtn.classList.add("saved");
    saveBtn.textContent = "已保存 ✓";
    setTimeout(() => {
      saveBtn.classList.remove("saved");
      saveBtn.textContent = "保存日卡";
    }, 1500);
  }

  renderDailyCard();
}

function bindDailyCardEvents() {
  const picker = document.getElementById("status-score-picker");
  if (picker && !picker.dataset.bound) {
    picker.dataset.bound = "1";
    picker.querySelectorAll(".status-score-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        picker.querySelectorAll(".status-score-btn").forEach(b => b.classList.remove("active"));
        this.classList.add("active");
      });
    });
  }

  const actualInput = document.getElementById("daily-actual-hours");
  const blockerInput = document.getElementById("daily-blocker");

  [actualInput, blockerInput].forEach(inp => {
    if (inp && !inp.dataset.bound) {
      inp.dataset.bound = "1";
      inp.addEventListener("input", function() {
        this.dataset.userEdited = "true";
        // 调整额输入即时预览新比值（今日时长÷上限口径）
        if (inp === actualInput) {
          const todayStr = getToday();
          const card = getDailyCard(todayStr);
          const dh = getDailyHours(todayStr);
          const prevAdj = card && Number.isFinite(Number(card.adjustment)) ? Number(card.adjustment) : 0;
          paintDailyRatio(dh.hours - prevAdj + (Number(actualInput.value) || 0), getTodayCap());
        }
      });
    }
  });

  bindClick("daily-save-btn", handleSaveDailyCard);
  bindDailyMakeupEvents();
}

// ==================== 0.4 补记日卡（批次25 需求③） ====================
// 目的：防「忘记打卡导致日卡空缺」。补记只写 dailyCards（状态分/卡点），
// 不改当日打卡数据；该日学习时长仍按当时已有记录由 getDailyHours 自动折算。

const MAKEUP_MAX_DAYS = 30; // 只允许补最近 30 天，避免误改太久远历史

function getMakeupDateOptions() {
  const opts = [];
  const today = new Date();
  for (let i = 1; i <= MAKEUP_MAX_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = formatDateISO(d);
    const card = getDailyCard(ds);
    const hasCard = !!(card && card.statusScore > 0);
    opts.push({ dateStr: ds, hasCard });
  }
  return opts;
}

function renderMakeupDateOptions() {
  const sel = document.getElementById("daily-makeup-date");
  if (!sel) return;
  const opts = getMakeupDateOptions();
  sel.innerHTML = opts.map(o =>
    `<option value="${o.dateStr}">${formatDateCN(o.dateStr)} 周${"日一二三四五六"[parseDate(o.dateStr).getDay()]}${o.hasCard ? "（已填）" : "（未填）"}</option>`
  ).join("");
}

function paintMakeupPreview() {
  const sel = document.getElementById("daily-makeup-date");
  const box = document.getElementById("daily-makeup-preview");
  const picker = document.getElementById("daily-makeup-score-picker");
  const blocker = document.getElementById("daily-makeup-blocker");
  if (!sel || !box) return;
  const ds = sel.value;
  if (!ds) { box.textContent = "该日学习时长：--"; return; }
  const dh = getDailyHours(ds);
  const card = getDailyCard(ds);
  const score = card && card.statusScore > 0 ? ` · 状态分 ${card.statusScore}` : " · 未记录状态分";
  box.textContent = `该日学习时长：${fmtHours(dh.hours)} h${score}`;
  if (picker) {
    picker.querySelectorAll(".status-score-btn").forEach(b => {
      b.classList.toggle("active", !!(card && Number(b.dataset.score) === card.statusScore));
    });
  }
  if (blocker) blocker.value = card && card.blocker ? card.blocker : "";
}

function openDailyMakeupModal() {
  const modal = document.getElementById("daily-makeup-modal");
  if (!modal) return;
  renderMakeupDateOptions();
  paintMakeupPreview();
  modal.style.display = "flex";
}

function closeDailyMakeupModal() {
  const modal = document.getElementById("daily-makeup-modal");
  if (modal) modal.style.display = "none";
}

function handleSaveMakeupDailyCard() {
  const sel = document.getElementById("daily-makeup-date");
  const picker = document.getElementById("daily-makeup-score-picker");
  const blocker = document.getElementById("daily-makeup-blocker");
  if (!sel) return;
  const dateStr = sel.value;
  if (!dateStr) { notify("请选择补记日期"); return; }
  if (dateStr === getToday()) { notify("当天日卡请用主卡保存，补记只处理往日"); return; }

  const active = picker ? picker.querySelector(".status-score-btn.active") : null;
  const statusScore = active ? Number(active.dataset.score) : 0;
  if (statusScore <= 0) { notify("请先选择状态分（1–5）"); return; }

  const prev = getDailyCard(dateStr) || {};
  const before = getDailyCards();
  // 关键：补记不动打卡数据，也不改学习时长口径——planHours 保 0、adjustment 沿用原值
  saveDailyCard(dateStr, {
    planHours: 0,
    adjustment: Number(prev.adjustment) || 0,
    statusScore: statusScore,
    blocker: blocker ? blocker.value : ""
  });
  pushUndo(`补记日卡 ${formatDateCN(dateStr)}`, { [STORAGE_KEYS.dailyCards]: before });
  notify(`已补记 ${formatDateCN(dateStr)} 的日卡`, "success");

  closeDailyMakeupModal();
  renderDailyCard();
}

function bindDailyMakeupEvents() {
  bindClick("daily-makeup-btn", openDailyMakeupModal);
  bindClick("daily-makeup-close-btn", closeDailyMakeupModal);
  bindClick("daily-makeup-cancel-btn", closeDailyMakeupModal);
  bindClick("daily-makeup-save-btn", handleSaveMakeupDailyCard);

  const modal = document.getElementById("daily-makeup-modal");
  if (modal && !modal.dataset.bound) {
    modal.dataset.bound = "1";
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeDailyMakeupModal();
    });
  }

  const sel = document.getElementById("daily-makeup-date");
  if (sel && !sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.addEventListener("change", paintMakeupPreview);
  }

  const picker = document.getElementById("daily-makeup-score-picker");
  if (picker && !picker.dataset.bound) {
    picker.dataset.bound = "1";
    picker.querySelectorAll(".status-score-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        picker.querySelectorAll(".status-score-btn").forEach(b => b.classList.remove("active"));
        this.classList.add("active");
      });
    });
  }
}


// ==================== ESM 导出（批次20） ====================
export {
  bindDailyCardEvents, getStatusScoreTrend, handleSaveDailyCard, isReduceWeek, isSundayAfternoon, renderDailyCard,
  // 批次25 需求③
  getMakeupDateOptions, openDailyMakeupModal, closeDailyMakeupModal, handleSaveMakeupDailyCard, paintMakeupPreview
};
