// ==================== js/ui/command.js ====================
// 批次20（ESM-b）自 script.js 整切：命令面板域（S8-1 面板/S8-3 Markdown导出/快捷键提示/数字键切Tab）。函数体逐字节不变。
import { DAILY_CAP, METRIC_CONFIGS } from "../config.js";
import { WEEKLY_REVIEW_STORAGE_KEY, exportBackup, getCheckins, getCustomCommands, getDailyCards, loadCustomGoals, loadData } from "../storage.js";
import { getDailyHours } from "../aggregation.js";
import { SoundKit, notify, performUndo } from "./base.js";
import { handleSaveDailyCard } from "./daily-card.js";
import { scrollDashboardChartsToRight } from "./charts.js";
import { handleGenerateWeeklyReport } from "./weekly.js";
import { openNewGoalModal } from "./goals.js";

// ==================== 11.87 Command Palette 命令面板（S8-1） ====================

let cmdPaletteSelectedIndex = 0;
let cmdPaletteFilteredCommands = [];

const CMD_ICON = {
  tab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  jump: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>',
  action: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  backup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>'
};

function getCommandPaletteCommands() {
  const list = [];

  // 0. 动作（批次25：动作组置顶，「撤销上一步操作」为该组首条）
  list.push({ group: "动作", label: "撤销上一步操作", subtitle: "Ctrl+Z", keywords: "undo 撤销 回退", icon: CMD_ICON.undo, run: () => { performUndo(); } });
  list.push({ group: "动作", label: "新建学习目标", subtitle: "打开新建弹窗", keywords: "new goal 新建 目标", icon: CMD_ICON.action, run: () => { openNewGoalModal(); } });
  list.push({ group: "动作", label: "保存今日日卡", subtitle: "提交状态分 / 计划 / 实际", keywords: "save daily 保存 日卡", icon: CMD_ICON.action, run: () => { handleSaveDailyCard(); } });
  list.push({ group: "动作", label: "一键生成周报文本", subtitle: "含自动洞察", keywords: "weekly report 生成 周报", icon: CMD_ICON.report, run: () => { switchTabExternal("weekly"); setTimeout(() => handleGenerateWeeklyReport(), 220); } });

  // 1. 切换 Tab
  list.push({ group: "导航", label: "切换到 今日作战", subtitle: "Tab 1", keywords: "tab today 今日", icon: CMD_ICON.tab, run: () => { switchTabExternal("today"); } });
  list.push({ group: "导航", label: "切换到 进度看板", subtitle: "Tab 2", keywords: "tab progress 进度 看板 热力图", icon: CMD_ICON.tab, run: () => { switchTabExternal("progress"); } });
  list.push({ group: "导航", label: "切换到 周报复盘", subtitle: "Tab 3", keywords: "tab weekly 周报 复盘 洞察", icon: CMD_ICON.tab, run: () => { switchTabExternal("weekly"); } });
  list.push({ group: "导航", label: "切换到 我的设置", subtitle: "Tab 4", keywords: "tab settings 设置 备份 导出", icon: CMD_ICON.tab, run: () => { switchTabExternal("settings"); } });

  // 2. 跳转到指标卡
  for (const key in METRIC_CONFIGS) {
    const cfg = METRIC_CONFIGS[key];
    if (cfg.type === "summary" || cfg.type === "auto-check") continue;
    list.push({
      group: "跳转到卡片",
      label: `跳转到「${cfg.name}」`,
      subtitle: "滚动并高亮该卡片",
      keywords: `jump ${key} ${cfg.name}`,
      icon: CMD_ICON.jump,
      run: () => { jumpToCard(key); }
    });
  }

  // 3. 自定义目标
  const customGoals = loadCustomGoals();
  customGoals.forEach(goal => {
    list.push({
      group: "跳转到卡片",
      label: `跳转到「${goal.name}」`,
      subtitle: "自定义目标",
      keywords: `jump custom ${goal.name}`,
      icon: CMD_ICON.jump,
      run: () => { jumpToCard(goal.id); }
    });
  });

  // 4. 跳转区块
  list.push({ group: "跳转区块", label: "跳转到 今日 Top 3", subtitle: "今日待办", keywords: "top 3 今日 待办", icon: CMD_ICON.jump, run: () => { scrollToElement("top-tasks-card"); } });
  list.push({ group: "跳转区块", label: "跳转到 今日日卡", subtitle: "记录状态分", keywords: "daily 日卡 状态分", icon: CMD_ICON.jump, run: () => { scrollToElement("daily-card"); } });
  list.push({ group: "跳转区块", label: "跳转到 全年热力图", subtitle: "进度看板", keywords: "heatmap 热力图 打卡", icon: CMD_ICON.jump, run: () => { switchTabExternal("progress"); setTimeout(() => scrollToElement("year-heatmap"), 220); } });
  list.push({ group: "跳转区块", label: "跳转到 月测分曲线", subtitle: "数学 / 英语", keywords: "score 月测分 曲线", icon: CMD_ICON.jump, run: () => { switchTabExternal("progress"); setTimeout(() => scrollToElement("monthly-scores"), 220); } });
  list.push({ group: "跳转区块", label: "跳转到 周学时趋势", subtitle: "进度看板", keywords: "weekly trend 周学时 趋势", icon: CMD_ICON.jump, run: () => { switchTabExternal("progress"); setTimeout(() => scrollToElement("weekly-hours-trend"), 220); } });

  // 5. 动作（批次25：已移至命令列表最前，见函数开头）

  // 6. 数据
  list.push({ group: "数据", label: "导出备份 JSON", subtitle: "下载到本地", keywords: "export backup 导出 备份", icon: CMD_ICON.backup, run: () => { exportBackup(); } });
  list.push({ group: "数据", label: "导入备份 JSON", subtitle: "从文件恢复", keywords: "import backup 导入 备份", icon: CMD_ICON.backup, run: () => {
    const fileInput = document.getElementById("backup-file-input");
    if (fileInput) fileInput.click();
  }});

  // 7. 自定义命令
  const customCmds = getCustomCommands();
  customCmds.forEach(cc => {
    let run = null;
    if (cc.type === "jump") {
      run = () => { jumpToCard(cc.payload); };
    } else if (cc.type === "url") {
      run = () => {
        if (/^https?:\/\//i.test(cc.payload)) {
          window.open(cc.payload, "_blank", "noopener,noreferrer");
        } else {
          notify("链接需以 http:// 或 https:// 开头", "warning");
        }
      };
    } else if (cc.type === "text") {
      run = () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(cc.payload).then(
            () => notify("已复制到剪贴板", "success"),
            () => notify("复制失败", "error")
          );
        } else {
          notify("当前环境不支持剪贴板", "warning");
        }
      };
    }
    if (run) {
      list.push({
        group: "自定义",
        label: cc.label,
        subtitle: cc.type === "jump" ? "跳转" : (cc.type === "url" ? "打开链接" : "复制文本"),
        keywords: cc.keywords || "",
        icon: CMD_ICON.action,
        run
      });
    }
  });

  return list;
}

function switchTabExternal(tabId) {
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === "tab-" + tabId);
  });
  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.tab === tabId);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  SoundKit.switch();

  // 切到进度看板时，让图表滚到最右（显示最新数据）
  if (tabId === "progress") {
    setTimeout(scrollDashboardChartsToRight, 50);
  }
}

function jumpToCard(metricKey) {
  const card = document.querySelector(`[data-metric="${metricKey}"]`);
  if (!card) {
    notify("未找到该卡片");
    return;
  }
  // 若不在今日作战 Tab，先切回
  const todayPanel = document.getElementById("tab-today");
  if (todayPanel && !todayPanel.classList.contains("active")) {
    switchTabExternal("today");
  }
  setTimeout(() => {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("card-highlight");
    setTimeout(() => card.classList.remove("card-highlight"), 1400);
  }, 180);
}

function scrollToElement(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fuzzyMatch(text, query) {
  if (!query) return true;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0, qi = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) qi++;
    ti++;
  }
  return qi === q.length;
}

function filterCommands(commands, query) {
  if (!query) return commands;
  const q = query.toLowerCase().trim();
  if (!q) return commands;

  // 1. 精确子串优先
  const exact = commands.filter(cmd => {
    const haystack = `${cmd.label} ${cmd.subtitle || ""} ${cmd.keywords || ""} ${cmd.group || ""}`.toLowerCase();
    return haystack.indexOf(q) !== -1;
  });
  if (exact.length > 0) return exact;

  // 2. 兜底：模糊字符乱序匹配
  return commands.filter(cmd => {
    const haystack = `${cmd.label} ${cmd.subtitle || ""} ${cmd.keywords || ""}`;
    return fuzzyMatch(haystack, q);
  });
}

function renderCommandPaletteList(query) {
  const listEl = document.getElementById("cmd-palette-list");
  if (!listEl) return;

  const all = getCommandPaletteCommands();
  const filtered = filterCommands(all, query);
  cmdPaletteFilteredCommands = filtered;
  cmdPaletteSelectedIndex = 0;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="cmd-palette-empty">没有匹配的命令</div>`;
    return;
  }

  // 按 group 分组输出
  const groups = {};
  filtered.forEach(cmd => {
    const g = cmd.group || "其他";
    if (!groups[g]) groups[g] = [];
    groups[g].push(cmd);
  });

  let html = "";
  let idx = 0;
  for (const groupName in groups) {
    html += `<div class="cmd-palette-group-label">${groupName}</div>`;
    groups[groupName].forEach(cmd => {
      const isActive = idx === 0;
      html += `
        <div class="cmd-palette-item${isActive ? " active" : ""}" data-cmd-index="${idx}">
          <span class="cmd-palette-item-icon">${cmd.icon || ""}</span>
          <div class="cmd-palette-item-body">
            <span class="cmd-palette-item-label">${cmd.label}</span>
            ${cmd.subtitle ? `<span class="cmd-palette-item-subtitle">${cmd.subtitle}</span>` : ""}
          </div>
        </div>
      `;
      idx++;
    });
  }

  listEl.innerHTML = html;

  // 绑定点击
  listEl.querySelectorAll(".cmd-palette-item").forEach(item => {
    item.addEventListener("mouseenter", () => {
      setCmdPaletteSelection(Number(item.dataset.cmdIndex));
    });
    item.addEventListener("click", () => {
      executeCmdPaletteCommand(Number(item.dataset.cmdIndex));
    });
  });

  // 重置滚动位置
  listEl.scrollTop = 0;
}

function setCmdPaletteSelection(newIdx) {
  const listEl = document.getElementById("cmd-palette-list");
  if (!listEl) return;
  const items = listEl.querySelectorAll(".cmd-palette-item");
  if (items.length === 0) return;
  const clamped = Math.max(0, Math.min(newIdx, items.length - 1));
  cmdPaletteSelectedIndex = clamped;
  items.forEach((it, i) => it.classList.toggle("active", i === clamped));
  const active = items[clamped];
  if (active) {
    const listRect = listEl.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    if (itemRect.top < listRect.top) {
      listEl.scrollTop -= (listRect.top - itemRect.top) + 4;
    } else if (itemRect.bottom > listRect.bottom) {
      listEl.scrollTop += (itemRect.bottom - listRect.bottom) + 4;
    }
  }
}

function executeCmdPaletteCommand(idx) {
  const cmd = cmdPaletteFilteredCommands[idx];
  if (!cmd || typeof cmd.run !== "function") return;
  closeCmdPalette();
  // 让关闭动画先跑完再执行，避免视觉冲突
  setTimeout(() => {
    try { cmd.run(); } catch (e) { console.error("[CmdPalette] 执行失败", e); }
  }, 120);
}

function openCmdPalette() {
  const overlay = document.getElementById("cmd-palette-overlay");
  const input = document.getElementById("cmd-palette-input");
  if (!overlay || !input) return;
  overlay.classList.add("open");
  input.value = "";
  renderCommandPaletteList("");
  setTimeout(() => input.focus(), 30);
  SoundKit.pop();
}

function closeCmdPalette() {
  const overlay = document.getElementById("cmd-palette-overlay");
  const input = document.getElementById("cmd-palette-input");
  if (overlay) overlay.classList.remove("open");
  if (input) input.blur();
}

function bindCommandPalette() {
  if (document._cmdPaletteBound) return;
  document._cmdPaletteBound = true;

  const overlay = document.getElementById("cmd-palette-overlay");
  const input = document.getElementById("cmd-palette-input");
  if (!overlay || !input) return;

  // 全局快捷键（Ctrl+K / Cmd+K）
  document.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const trigger = (isMac ? e.metaKey : e.ctrlKey) && (e.key === "k" || e.key === "K");
    if (!trigger) return;
    e.preventDefault();
    if (overlay.classList.contains("open")) {
      closeCmdPalette();
    } else {
      openCmdPalette();
    }
  });

  // 输入过滤
  input.addEventListener("input", () => {
    renderCommandPaletteList(input.value);
  });

  // 键盘导航
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCmdPaletteSelection(cmdPaletteSelectedIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCmdPaletteSelection(cmdPaletteSelectedIndex - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeCmdPaletteCommand(cmdPaletteSelectedIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeCmdPalette();
    }
  });

  // 点击遮罩关闭
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeCmdPalette();
  });
}

// ==================== 11.86 Markdown 导出（S8-3） ====================

function downloadMarkdownFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getExportTimestamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return {
    fileSuffix: `${y}${m}${day}`,
    human: `${y}-${m}-${day} ${hh}:${mm}`
  };
}

function exportDailyCardsMarkdown() {
  const all = getDailyCards();
  const dates = Object.keys(all).sort();
  if (dates.length === 0) {
    notify("暂无日卡数据可导出");
    return;
  }

  const ts = getExportTimestamp();
  const lines = [
    "# 日卡汇总",
    "",
    `导出时间：${ts.human}`,
    `共 ${dates.length} 天记录`,
    "",
    "| 日期 | 上限h | 实际h | 比值 | 状态分 | 卡点 |",
    "|---|---|---|---|---|---|"
  ];

  dates.forEach(dateStr => {
    const c = all[dateStr];
    // 批次22 R3：计划h 口径废弃，改导出当日上限（DAILY_CAP 按星期几索引，周一=0）
    const cap = DAILY_CAP[(new Date(dateStr + "T00:00:00").getDay() + 6) % 7];
    const actual = getDailyHours(dateStr).hours;
    const ratio = cap > 0 ? (actual / cap).toFixed(2) : "--";
    const score = c.statusScore || "-";
    const blocker = (c.blocker || "").replace(/\|/g, "\\|") || "-";
    lines.push(`| ${dateStr} | ${cap} | ${actual} | ${ratio} | ${score} | ${blocker} |`);
  });

  const content = lines.join("\n") + "\n";
  downloadMarkdownFile(`学习工作台_日卡_${ts.fileSuffix}.md`, content);
  notify(`已导出 ${dates.length} 天日卡`);
}

function exportWeeklyReviewsMarkdown() {
  const all = loadData(WEEKLY_REVIEW_STORAGE_KEY, {});
  const weeks = Object.keys(all).sort();
  if (weeks.length === 0) {
    notify("暂无周报数据可导出");
    return;
  }

  const ts = getExportTimestamp();
  const lines = [
    "# 周报复盘汇总",
    "",
    `导出时间：${ts.human}`,
    `共 ${weeks.length} 周记录`,
    ""
  ];

  weeks.forEach((wk, idx) => {
    const data = all[wk] || {};
    lines.push(`## ${wk}`);
    lines.push("");
    lines.push("### 保持（本周做得好的）");
    lines.push(data.keep || "（待填写）");
    lines.push("");
    lines.push("### 问题（卡在哪里）");
    lines.push(data.problem || "（待填写）");
    lines.push("");
    lines.push("### 尝试（新方法）");
    lines.push(data.try || "（待填写）");
    lines.push("");
    lines.push("### 下周预案（对策）");
    lines.push(data.plan || "（待填写）");
    lines.push("");
    if (idx < weeks.length - 1) {
      lines.push("---");
      lines.push("");
    }
  });

  const content = lines.join("\n") + "\n";
  downloadMarkdownFile(`学习工作台_周报_${ts.fileSuffix}.md`, content);
  notify(`已导出 ${weeks.length} 周周报`);
}

function exportCheckinsMarkdown() {
  const checkins = getCheckins();
  const allGoals = loadCustomGoals();
  const ts = getExportTimestamp();

  const lines = [
    "# 打卡明细",
    "",
    `导出时间：${ts.human}`,
    ""
  ];

  let hasAny = false;

  const fixedKeys = ["vocabulary", "listening", "sleep", "cmc", "mock-exams", "advanced-math", "final-courses"];
  fixedKeys.forEach(key => {
    const cfg = METRIC_CONFIGS[key];
    if (!cfg) return;
    const list = (checkins[key] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    lines.push(`## ${cfg.name}`);
    lines.push("");
    if (list.length === 0) {
      lines.push("（无记录）");
    } else {
      hasAny = true;
      list.forEach(r => {
        const suffix = r.isMakeup ? "（补记）" : "";
        const unit = cfg.unit || "";
        const valueText = cfg.type === "time-habit" ? String(r.value) : `${r.value} ${unit}`.trim();
        lines.push(`- ${r.date}：${valueText}${suffix}`);
      });
    }
    lines.push("");
  });

  if (allGoals.length > 0) {
    lines.push("# 自定义目标");
    lines.push("");
    allGoals.forEach(g => {
      const list = (checkins[g.id] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
      lines.push(`## ${g.name}`);
      lines.push("");
      if (list.length === 0) {
        lines.push("（无记录）");
      } else {
        hasAny = true;
        list.forEach(r => {
          const suffix = r.isMakeup ? "（补记）" : "";
          lines.push(`- ${r.date}：${r.value} ${g.unit}${suffix}`);
        });
      }
      lines.push("");
    });
  }

  if (!hasAny) {
    notify("暂无打卡数据可导出");
    return;
  }

  const content = lines.join("\n") + "\n";
  downloadMarkdownFile(`学习工作台_打卡明细_${ts.fileSuffix}.md`, content);
  notify("已导出打卡明细");
}

// ==================== 11.88 提示快捷键（S8-1） ====================

function attachCmdPaletteHint() {
  // 在指标区 toolbar 右侧追加一个提示按钮，告知用户可以 Ctrl+K
  const toolbar = document.querySelector(".metrics-toolbar");
  if (!toolbar || toolbar.querySelector(".cmd-palette-hint-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cmd-palette-hint-btn";
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> 搜索命令 · Ctrl+K';
  btn.style.cssText = "margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--input-bg);color:var(--text-secondary);border:1px solid var(--input-border);border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;min-height:38px;transition:all 0.15s ease;";
  btn.addEventListener("mouseenter", () => { btn.style.borderColor = "var(--purple-400)"; btn.style.color = "var(--purple-600)"; });
  btn.addEventListener("mouseleave", () => { btn.style.borderColor = "var(--input-border)"; btn.style.color = "var(--text-secondary)"; });
  btn.addEventListener("click", openCmdPalette);
  toolbar.style.display = "flex";
  toolbar.style.alignItems = "center";
  toolbar.style.gap = "10px";
  toolbar.appendChild(btn);
}

// ==================== 11.89 数字键切 Tab（S8-2） ====================

const TAB_NUMBER_MAP = {
  "1": "today",
  "2": "progress",
  "3": "weekly",
  "4": "settings"
};

function bindTabNumberShortcut() {
  if (document._tabNumberBound) return;
  document._tabNumberBound = true;

  document.addEventListener("keydown", (e) => {
    // 有 Ctrl / Cmd / Alt 修饰键时不处理（避免与 Ctrl+K/Ctrl+Z 等冲突）
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // 焦点在输入框里时，不拦截（用户在打字）
    const tag = (e.target && e.target.tagName ? e.target.tagName : "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.target && e.target.isContentEditable) return;

    // 命令面板打开时也不处理（避免干扰搜索输入）
    const overlay = document.getElementById("cmd-palette-overlay");
    if (overlay && overlay.classList.contains("open")) return;

    const tab = TAB_NUMBER_MAP[e.key];
    if (!tab) return;

    e.preventDefault();
    switchTabExternal(tab);
  });
}


// ==================== ESM 导出（批次20） ====================
export {
  attachCmdPaletteHint, bindCommandPalette, bindTabNumberShortcut, exportCheckinsMarkdown, exportDailyCardsMarkdown, exportWeeklyReviewsMarkdown, getExportTimestamp, jumpToCard
};
