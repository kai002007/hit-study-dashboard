// ==================== js/ui/weekly.js ====================
// 批次20（ESM-b）自 script.js 整切：周报域（自动洞察/周报复盘/KPTA 智能建议）。函数体逐字节不变。
import { METRIC_CONFIGS, MILESTONES } from "../config.js";
import { hasCheckin, loadWeeklyReview, saveWeeklyReview } from "../storage.js";
import { fmtHours, getWeeklyStats } from "../aggregation.js";
import { bindClick, daysBetween, formatDateISO, notify, parseDate, setInputValue, setText } from "./base.js";
import { getStatusScoreTrend } from "./daily-card.js";
import { getLastWeekCheckItems, getWeeklyCheckItems } from "./checkin.js";
import { jumpToCard } from "./command.js";

// ==================== 11.86 周报自动洞察（S7-3） ====================

function generateWeeklyInsights() {
  const items = getWeeklyCheckItems();
  const weekHours = getWeeklyStats().totalHours;
  const lastWeek = getLastWeekCheckItems();
  const lines = [];

  // 1. 最稳指标：本周达标率最高的（排除 summary / auto-check）
  const habitStats = [];
  const keys = ["vocabulary", "listening", "sleep", "cmc", "mock-exams", "advanced-math", "final-courses"];
  keys.forEach(key => {
    const cfg = METRIC_CONFIGS[key];
    if (!cfg) return;
    let done = 0;
    let total = 0;
    const today = new Date();
    const diffToMonday = (today.getDay() + 6) % 7;
    for (let i = 0; i <= diffToMonday; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - diffToMonday + i);
      if (d.getDay() === 1 && key !== "vocabulary") continue; // 单词7/7裁决：周一不跳过
      total++;
      if (hasCheckin(key, formatDateISO(d))) done++;
    }
    if (total > 0) habitStats.push({ key, name: cfg.name, done, total, ratio: done / total });
  });

  if (habitStats.length > 0) {
    const best = habitStats.slice().sort((a, b) => b.ratio - a.ratio)[0];
    if (best.ratio >= 0.6) {
      lines.push(`- **${best.name}** 是本周最稳的指标：${best.done}/${best.total} 天达标`);
    } else {
      lines.push(`- 本周没有稳定的指标：最稳的「${best.name}」也只有 ${best.done}/${best.total} 天达标`);
    }
  }

  // 2. 最弱指标：连续未推进或漏打最多的
  const missedThisWeek = habitStats
    .filter(h => h.ratio < 0.5)
    .sort((a, b) => a.ratio - b.ratio);

  if (missedThisWeek.length > 0) {
    const worst = missedThisWeek.slice(0, 2).map(w => w.name).join("、");
    lines.push(`- **${worst}** 本周进展落后，建议下周优先处理`);
  }

  // 3. 周学时对比
  const diff = fmtHours(weekHours - lastWeek.totalHours);
  const diffText = diff > 0 ? `↑+${diff}h` : (diff < 0 ? `↓${diff}h` : "→持平");
  const status = weekHours >= 30 ? "已达标" : (weekHours >= 21 ? "高于底线 21h" : "低于底线 21h");
  lines.push(`- 周学时 **${fmtHours(weekHours)}h**（${status}）· 环比上周 ${diffText}`);

  // 4. 状态分趋势
  const trend = getStatusScoreTrend();
  if (trend.recent !== null) {
    let text = `- 状态分近 7 天均值 **${trend.recent}**`;
    if (trend.hasTrend && trend.diff !== null) {
      const arrow = trend.diff > 0 ? "↑" : (trend.diff < 0 ? "↓" : "→");
      const sign = trend.diff > 0 ? "+" : "";
      text += `，环比上周 ${arrow}${sign}${trend.diff}`;
    }
    if (trend.recent < 3.5) {
      text += ` · **低于熔断线 3.5，下周考虑切 A 案**`;
    }
    lines.push(text);
  }

  // 5. 距下一个关键节点
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = MILESTONES
    .map(m => ({ ...m, d: parseDate(m.date) }))
    .filter(m => m.d >= today)
    .sort((a, b) => a.d - b.d);
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const days = daysBetween(today, next.d);
    lines.push(`- 距「${next.label}」还有 **${days}** 天`);
  }

  const okCount = items.filter(i => i.ok).length;
  lines.push(`- 周检 5 数字 **${okCount}/5** 项达标`);

  return lines.join("\n");
}


// ==================== 16. 周报复盘（Tab 3）====================

// 已迁移至 js/storage.js（批次8）

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getCurrentWeekKey() {
  return getWeekNumber(new Date());
}

// 已迁移至 js/storage.js（批次8）

function collectWeeklyReviewData() {
  const prev = loadWeeklyReview(getCurrentWeekKey());
  return {
    keep: document.getElementById("weekly-keep")?.value || "",
    problem: document.getElementById("weekly-problem")?.value || "",
    try: document.getElementById("weekly-try")?.value || "",
    plan: document.getElementById("weekly-plan")?.value || "",
    draftKeep: prev.draftKeep || "",
    draftProblem: prev.draftProblem || ""
  };
}

function generateWeeklyFormDraft() {
  const items = getWeeklyCheckItems();
  const okList = items.filter(i => i.ok);
  const failList = items.filter(i => !i.ok);

  // keep 草稿：告诉用户本周做得好的是什么
  let keep = "";
  if (okList.length === 0) {
    keep = "本周无达标项，先恢复基本节奏。（草稿，可修改）";
  } else if (okList.length === items.length) {
    keep = `本周 ${items.length} 项全部达标，状态很好。（草稿，可修改）`;
  } else {
    const names = okList.map(i => {
      const short = i.label.split("≥")[0].trim();
      return `${short} ${i.thisWeek}${i.unit}`;
    }).join("、");
    keep = `本周达标 ${okList.length}/${items.length} 项：${names}。保持这个节奏。（草稿，可修改）`;
  }

  // problem 草稿：告诉用户本周卡在哪里
  let problem = "";
  if (failList.length === 0) {
    problem = "本周无明显卡点。（草稿，可修改）";
  } else {
    const names = failList.map(i => {
      const short = i.label.split("≥")[0].trim();
      return `${short} 仅 ${i.thisWeek}${i.unit}`;
    }).join("、");
    problem = `本周未达标 ${failList.length}/${items.length} 项：${names}。下周重点关注。（草稿，可修改）`;
  }

  return { keep, problem };
}

function renderWeeklyReview() {
  const weekKey = getCurrentWeekKey();
  setText("weekly-review-week", weekKey);

  const grid = document.getElementById("weekly-review-check-grid");
  if (grid) {
    const items = getWeeklyCheckItems();
    grid.innerHTML = items.map(item => `
      <div class="weekly-check-card ${item.ok ? "weekly-check-ok" : "weekly-check-fail"}">
        <span class="weekly-check-dot"></span>
        <div class="weekly-check-body">
          <span class="weekly-check-label">${item.label}</span>
          <span class="weekly-check-values">本周 ${item.thisWeek}${item.unit} · 目标 ${item.target}${item.unit} · 上周 ${item.lastWeek}${item.unit}</span>
        </div>
        <span class="weekly-check-status">${item.ok ? "已达标" : "未达标"}</span>
      </div>
    `).join("");
  }

  let data = loadWeeklyReview(weekKey);

  // 草稿指纹机制（批次11修正令2）：keep/problem 为空或仍等于上次生成的草稿（未人工编辑）时，
  // 每次渲染随最新数据重新生成并更新指纹；用户手改或采纳 KPTA 追加后值≠指纹，永久锁定不再覆盖。
  const draft = generateWeeklyFormDraft();
  let draftChanged = false;
  if (!(data.keep || "").trim() || data.keep === (data.draftKeep || "")) {
    data.keep = draft.keep;
    data.draftKeep = draft.keep;
    draftChanged = true;
  }
  if (!(data.problem || "").trim() || data.problem === (data.draftProblem || "")) {
    data.problem = draft.problem;
    data.draftProblem = draft.problem;
    draftChanged = true;
  }
  if (draftChanged) saveWeeklyReview(weekKey, data);

  setInputValue("weekly-keep", data.keep);
  setInputValue("weekly-problem", data.problem);
  setInputValue("weekly-try", data.try);
  setInputValue("weekly-plan", data.plan);

  // 隐藏上周报输出区，避免旧内容干扰
  const output = document.getElementById("weekly-report-output");
  if (output) output.style.display = "none";

  // 批次 18：同步刷新 KPTA 建议卡
  renderKPTACard();
}

// ==================== 16.5 KPTA 智能建议卡片（批次 18） ====================

let currentKPTAItems = [];

function getActiveDaysThisWeek() {
  const today = new Date();
  const diffToMonday = (today.getDay() + 6) % 7;
  let count = 0;
  for (let i = 0; i <= diffToMonday; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - diffToMonday + i);
    const ds = formatDateISO(d);
    const hasAny = Object.keys(METRIC_CONFIGS).some(key => {
      const cfg = METRIC_CONFIGS[key];
      if (cfg.type === "summary" || cfg.type === "auto-check") return false;
      return hasCheckin(key, ds);
    });
    if (hasAny) count++;
  }
  return count;
}

function buildKPTAItems() {
  const activeDays = getActiveDaysThisWeek();

  // 数据不足（本周有效记录 < 3 天）→ 降级显示
  if (activeDays < 3) {
    return {
      sufficient: false,
      items: [
        { type: "keep", label: "Keep", text: "数据积累中（本周有效记录 <strong>" + activeDays + "</strong> 天），连续打卡 3 天后开始生成个性化建议", clickTarget: null },
        { type: "problem", label: "Problem", text: "暂无足够数据判断卡点，先保证每日至少 1 张卡片打卡", clickTarget: null },
        { type: "try", label: "Try", text: "建议从「单词 / 听力 / 睡眠」三个基础习惯开始，每天固定时段执行", clickTarget: null },
        { type: "action", label: "Action", text: "本周剩余天数先稳定打卡节奏，让数据说话", clickTarget: null }
      ]
    };
  }

  // 数据充足 → 生成真实建议
  const items = [];
  const weekHours = getWeeklyStats().totalHours;
  const lastWeek = getLastWeekCheckItems();
  const trend = getStatusScoreTrend();
  const checkItems = getWeeklyCheckItems();

  // ---- K：本周最稳指标 ----
  const habitStats = [];
  const trackKeys = ["vocabulary", "listening", "sleep", "cmc", "mock-exams", "advanced-math", "final-courses"];
  const today = new Date();
  const diffToMonday = (today.getDay() + 6) % 7;
  trackKeys.forEach(key => {
    const cfg = METRIC_CONFIGS[key];
    if (!cfg) return;
    let done = 0, total = 0;
    for (let i = 0; i <= diffToMonday; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - diffToMonday + i);
      if (d.getDay() === 1 && key !== "vocabulary") continue; // 单词7/7裁决：周一不跳过
      total++;
      if (hasCheckin(key, formatDateISO(d))) done++;
    }
    if (total > 0) habitStats.push({ key, name: cfg.name, done, total, ratio: done / total });
  });

  let kText = "";
  let kTarget = null;
  if (habitStats.length > 0) {
    const best = habitStats.slice().sort((a, b) => b.ratio - a.ratio)[0];
    if (best.ratio >= 0.6) {
      kText = "<strong>" + best.name + "</strong> 是本周最稳的指标：" + best.done + "/" + best.total + " 天达标，继续保持";
      kTarget = best.key;
    } else {
      kText = "本周暂无稳定指标：最稳的「" + best.name + "」只有 " + best.done + "/" + best.total + " 天达标，先恢复基本节奏";
      kTarget = best.key;
    }
  } else {
    kText = "本周数据不足，建议先建立每日打卡习惯";
  }
  items.push({ type: "keep", label: "Keep", text: kText, clickTarget: kTarget });

  // ---- P：本周最弱指标 ----
  let pText = "";
  let pTarget = null;
  if (habitStats.length > 0) {
    const worst = habitStats.slice().sort((a, b) => a.ratio - b.ratio)[0];
    if (worst.ratio < 0.5) {
      pText = "<strong>" + worst.name + "</strong> 本周进展落后：" + worst.done + "/" + worst.total + " 天达标，下周优先处理";
      pTarget = worst.key;
    } else {
      pText = "本周各指标无明显卡点，节奏保持良好";
    }
  } else {
    pText = "本周暂无数据判断卡点";
  }
  items.push({ type: "problem", label: "Problem", text: pText, clickTarget: pTarget });

  // ---- T：尝试建议 ----
  let tText = "";
  let tTarget = null;
  const competitionHours = checkItems[2] ? checkItems[2].thisWeek : 0;
  if (competitionHours < 10.5 && typeof competitionHours === "number") {
    tText = "竞赛本周仅 <strong>" + fmtHours(competitionHours) + "h</strong>，试试把三步法移到上午 9–12 整块时间";
    tTarget = "cmc";
  } else if (weekly_checkItemBelows(checkItems)) {
    tText = "有指标连续落后，试试把它拆成 15 分钟最小单元，降低启动门槛";
  } else if (weekHours < 30 && weekHours >= 21) {
    tText = "周学时 <strong>" + fmtHours(weekHours) + "h</strong> 在底线以上，试试每天固定 21:15 健身锚点后再学 30 分钟";
  } else {
    tText = "节奏稳定，下周试试在周日晚定好周三大块任务";
  }
  items.push({ type: "try", label: "Try", text: tText, clickTarget: tTarget });

  // ---- A：下周对策 ----
  let aText = "";
  let aTarget = null;
  const upcoming = MILESTONES
    .map(m => ({ ...m, d: parseDate(m.date) }))
    .filter(m => m.d >= new Date())
    .sort((a, b) => a.d - b.d);
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const days = daysBetween(new Date(), next.d);
    aText = "距「<strong>" + next.label + "</strong>」还有 <strong>" + days + "</strong> 天，下周优先补齐落后项";
  } else {
    aText = "下周围绕当前落后指标定 1 个核心动作";
  }
  items.push({ type: "action", label: "Action", text: aText, clickTarget: aTarget });

  return { sufficient: true, items };
}

function weekly_checkItemBelows(items) {
  // 辅助：判断 5 项周检是否有 2 项以上未达标
  if (!items || items.length === 0) return false;
  return items.filter(i => !i.ok).length >= 2;
}

function renderKPTACard() {
  const el = document.getElementById("kpta-card");
  if (!el) return;

  const result = buildKPTAItems();
  currentKPTAItems = result.items;

  const placeholderClass = result.sufficient ? "" : " is-placeholder";

  el.innerHTML = result.items.map(item => `
    <div class="kpta-item kpta-${item.type}${placeholderClass}" data-kpta-type="${item.type}">
      <div class="kpta-badge">${item.label.charAt(0)}</div>
      <div class="kpta-body">
        <span class="kpta-label">${item.label}</span>
        <span class="kpta-text">${item.text}</span>
      </div>
      <div class="kpta-actions">
        <button type="button" class="kpta-btn kpta-btn-adopt" data-adopt-type="${item.type}">采纳</button>
      </div>
    </div>
  `).join("");

  // 采纳按钮事件
  el.querySelectorAll(".kpta-btn-adopt").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleAdoptKPTA(btn.dataset.adoptType);
    });
  });

  // 卡片本身点击 → 跳转目标卡片
  el.querySelectorAll(".kpta-item").forEach(itemEl => {
    if (itemEl.classList.contains("is-placeholder")) return;
    itemEl.style.cursor = "pointer";
    itemEl.addEventListener("click", (e) => {
      // 点击「采纳」按钮时不触发跳转
      if (e.target.closest(".kpta-btn-adopt")) return;
      const type = itemEl.dataset.kptaType;
      const item = currentKPTAItems.find(i => i.type === type);
      if (item && item.clickTarget) {
        jumpToCard(item.clickTarget);
      }
    });
  });
}

function handleAdoptKPTA(type) {
  const textareaMap = {
    keep: "weekly-keep",
    problem: "weekly-problem",
    try: "weekly-try",
    action: "weekly-plan"
  };
  const textarea = document.getElementById(textareaMap[type]);
  if (!textarea) return;

  const item = currentKPTAItems.find(i => i.type === type);
  if (!item) return;

  // 剔除 HTML 标签后的纯文本（采纳到 textarea 里不能带标签）
  const plainText = item.text.replace(/<[^>]+>/g, "");

  // 追加换行
  const prefix = textarea.value.trim() ? "\n" : "";
  textarea.value = textarea.value + prefix + "· " + plainText;

  // 触发保存
  handleWeeklyReviewInput();

  // 提示
  const labelMap = { keep: "保持", problem: "问题", try: "尝试", action: "下周预案" };
  notify(`已采纳到「${labelMap[type]}」栏`, "success");
}

function handleWeeklyReviewInput() {
  const weekKey = getCurrentWeekKey();
  saveWeeklyReview(weekKey, collectWeeklyReviewData());
}

function generateWeeklyReportText() {
  const weekKey = getCurrentWeekKey();
  const items = getWeeklyCheckItems();
  const data = collectWeeklyReviewData();
  const okCount = items.filter(i => i.ok).length;
  const insights = generateWeeklyInsights();
  // 批次11修正令4：人工四栏可能为冻结历史文本，与实时自动洞察数值可合法并存，头部注记防误读
  const rec = loadWeeklyReview(weekKey);
  const manualNote = rec.updatedAt
    ? `> 保持/问题/尝试/下周预案四栏为人工维护文本（最后更新 ${new Date(rec.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）；下方自动洞察为实时计算，两者数值可能不同`
    : "> 保持/问题/尝试/下周预案四栏为人工维护文本；下方自动洞察为实时计算，两者数值可能不同";

  const lines = [
    `## 周报复盘 · ${weekKey}`,
    "",
    manualNote,
    "",
    "### 📊 本周自动洞察",
    insights,
    "",
    "### 周检 5 数字",
    `共 ${okCount}/5 项达标`,
    "",
    ...items.map(item => `- ${item.label}：${item.ok ? "✓ 已达标" : "✗ 未达标"}`),
    "",
    "### 保持（本周做得好的）",
    data.keep || "（待填写）",
    "",
    "### 问题（卡在哪里）",
    data.problem || "（待填写）",
    "",
    "### 尝试（新方法）",
    data.try || "（待填写）",
    "",
    "### 下周预案（对策）",
    data.plan || "（待填写）",
    ""
  ];

  return lines.join("\n");
}

function handleGenerateWeeklyReport() {
  const text = generateWeeklyReportText();
  const output = document.getElementById("weekly-report-output");
  const textarea = document.getElementById("weekly-report-text");

  if (textarea) textarea.value = text;
  if (output) {
    output.style.display = "block";
    output.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // 生成前先保存当前输入
  handleWeeklyReviewInput();
}

function handleCopyWeeklyReport() {
  const textarea = document.getElementById("weekly-report-text");
  if (!textarea) return;

  textarea.select();
  textarea.setSelectionRange(0, 999999);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textarea.value).then(() => {
      notify("周报文本已复制到剪贴板");
    }).catch(err => {
      console.error("[Weekly] 复制失败", err);
      fallbackCopyWeeklyReport(textarea);
    });
  } else {
    fallbackCopyWeeklyReport(textarea);
  }
}

function fallbackCopyWeeklyReport(textarea) {
  try {
    const ok = document.execCommand("copy");
    if (ok) {
      notify("周报文本已复制到剪贴板");
    } else {
      notify("复制失败，请手动选中上方文本后复制");
    }
  } catch (e) {
    console.error("[Weekly] execCommand 复制失败", e);
    notify("复制失败，请手动选中上方文本后复制");
  }
}

function handleClearWeeklyReport() {
  const textarea = document.getElementById("weekly-report-text");
  if (!textarea) return;
  textarea.value = "";
  textarea.focus();
}

function bindWeeklyReviewEvents() {
  ["weekly-keep", "weekly-problem", "weekly-try", "weekly-plan"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", handleWeeklyReviewInput);
    }
  });

  bindClick("weekly-report-generate-btn", handleGenerateWeeklyReport);
  bindClick("weekly-report-copy-btn", handleCopyWeeklyReport);
  bindClick("weekly-report-clear-btn", handleClearWeeklyReport);
}


// ==================== ESM 导出（批次20） ====================
export {
  bindWeeklyReviewEvents, handleGenerateWeeklyReport, renderWeeklyReview
};
