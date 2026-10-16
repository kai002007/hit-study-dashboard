// ==================== js/ui/stage.js ====================
// 批次20（ESM-b）自 script.js 整切：阶段判断与视图切换域（阶段判定/抽屉/历史只读/查看阶段状态）。函数体逐字节不变。
import { STAGES } from "../config.js";
import { isHistoryReadonly } from "../storage.js";
import { SoundKit, daysBetween, getToday, isInStage, notify, parseDate } from "./base.js";
import { renderQuotas } from "./checkin.js";

// 当前用户选择的"查看阶段"（批次 2 只存状态，批次 3 才真正过滤数据）
let currentViewStageId = null;  // null 表示跟随真实日期

// ==================== 6. 核心逻辑：阶段判断 ====================

function getCurrentStage(date) {
  const sub = STAGES.find(s => s.parentId && isInStage(s, date)) || null;
  const main = STAGES.find(s => !s.parentId && isInStage(s, date)) || null;
  const daysLeftMain = main ? daysBetween(date, parseDate(main.end)) : null;
  const daysLeftSub = sub ? daysBetween(date, parseDate(sub.end)) : null;
  return { main, sub, daysLeftMain, daysLeftSub };
}

function getStageIdByDate(dateStr) {
  const d = parseDate(dateStr);
  for (const s of STAGES) {
    if (s.parentId) continue;
    if (d >= parseDate(s.start) && d <= parseDate(s.end)) return s.id;
  }
  return "未分类";
}

function getCurrentStageId() {
  return getStageIdByDate(getToday());
}

// 列出所有"主阶段"（不含 parentId 子阶段），按日期排序
function getAllMainStages() {
  return STAGES
    .filter(s => !s.parentId)
    .map(s => ({
      id: s.id,
      start: s.start,
      end: s.end,
      goal: s.goal || "",
      doc: s.doc || "",
      termLabel: s.termLabel || ""
    }));
}

// 判断某阶段相对今天是"过去/当前/未来"
function getStageTiming(stage) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s = parseDate(stage.start);
  const e = parseDate(stage.end);
  if (today >= s && today <= e) return "current";
  if (today > e) return "past";
  return "future";
}

// 渲染抽屉里的阶段列表
function renderStageDrawerList() {
  const listEl = document.getElementById("stage-drawer-list");
  if (!listEl) return;

  const stages = getAllMainStages();
  const viewId = getViewStageId();

  listEl.innerHTML = stages.map(s => {
    const timing = getStageTiming(s);
    const isViewing = s.id === viewId;
    const cls = "stage-drawer-item" +
      (isViewing ? " is-current" : "") +
      (timing === "past" ? " is-past" : "") +
      (timing === "future" ? " is-future" : "");
    const range = `${s.start} → ${s.end}`;
    return `
      <li class="${cls}" data-stage-id="${s.id}">
        <span class="stage-drawer-item-dot"></span>
        <div class="stage-drawer-item-body">
          <span class="stage-drawer-item-name">${s.id}</span>
          <span class="stage-drawer-item-range">${range}</span>
          ${s.termLabel ? `<span class="stage-drawer-item-term">${s.termLabel}</span>` : ""}
        </div>
      </li>
    `;
  }).join("");

  // 更新顶部按钮显示当前查看的阶段名
  const currentEl = document.getElementById("stage-switcher-current");
  if (currentEl) {
    const viewing = stages.find(s => s.id === viewId);
    currentEl.textContent = viewing ? viewing.id : "未知";
  }

  // 绑定点击
  listEl.querySelectorAll(".stage-drawer-item").forEach(item => {
    item.addEventListener("click", () => {
      handleStageSelect(item.dataset.stageId);
    });
  });
}

// 点击某阶段
function handleStageSelect(stageId) {
  closeStageDrawer();
  switchToStageView(stageId);
  SoundKit.tick();
}

// 打开/关闭抽屉
function openStageDrawer() {
  const overlay = document.getElementById("stage-drawer-overlay");
  if (!overlay) return;
  renderStageDrawerList();

  // 批次 8：footer 常驻"回到当前阶段"按钮（自动识别当前阶段名）
  const realId = getCurrentStageId();
  const footer = document.querySelector(".stage-drawer-footer");
  if (footer) {
    footer.innerHTML = `<button type="button" class="stage-drawer-exit-btn" id="stage-drawer-exit-btn">↩ 回到当前阶段「${realId}」</button>`;
    const exitBtn = document.getElementById("stage-drawer-exit-btn");
    if (exitBtn) {
      exitBtn.addEventListener("click", () => {
        closeStageDrawer();
        const viewId = getViewStageId();
        if (viewId !== realId) {
          exitHistoryView();
        }
        // 已经在当前阶段时仅关闭抽屉，不弹冗余 toast
      });
    }
  }

  overlay.classList.add("open");
  SoundKit.pop();
}

function closeStageDrawer() {
  const overlay = document.getElementById("stage-drawer-overlay");
  if (!overlay) return;
  overlay.classList.remove("open");
}

// 渲染只读总开关的初始状态
function renderHistoryReadonlyToggle() {
  const cb = document.getElementById("history-readonly-toggle");
  if (!cb) return;
  cb.checked = isHistoryReadonly();
}

// ==================== 阶段视图切换（批次 3） ====================

function getViewStageId() {
  if (currentViewStageId === null) return getCurrentStageId();
  return currentViewStageId;
}

function resolveViewStageInfo() {
  const viewId = getViewStageId();
  const stage = STAGES.find(s => s.id === viewId && !s.parentId);
  if (!stage) {
    // 兜底：找不到就用真实当前阶段
    return getCurrentStage(new Date());
  }
  const today = new Date();
  const daysLeftMain = daysBetween(today, parseDate(stage.end));
  return {
    main: stage,
    sub: null,          // 历史视图不显示子阶段
    daysLeftMain: daysLeftMain > 0 ? daysLeftMain : 0,
    daysLeftSub: null
  };
}

function applyViewModeClass() {
  const viewId = getViewStageId();
  const realId = getCurrentStageId();
  const isViewingHistory = viewId !== realId;
  const readonly = isViewingHistory && isHistoryReadonly();
  document.body.classList.toggle("viewing-history", isViewingHistory);
  document.body.classList.toggle("viewing-readonly", readonly);

  // 批次 6：查看未来阶段时给 body 加 viewing-future，触发顶部横幅
  const stage = STAGES.find(s => s.id === viewId && !s.parentId);
  const isFuture = stage ? getStageTiming(stage) === "future" : false;
  document.body.classList.toggle("viewing-future", isFuture);
}

function switchToStageView(stageId) {
  const realId = getCurrentStageId();
  // 判断是否是"回到当前"
  if (stageId === realId) {
    currentViewStageId = null;
  } else {
    currentViewStageId = stageId;
  }

  // 更新顶部按钮显示
  const currentEl = document.getElementById("stage-switcher-current");
  if (currentEl) currentEl.textContent = stageId;

  // 应用视图模式 class
  applyViewModeClass();

  // 重新渲染阶段头部 + 周配额 + 模块列表
  const viewInfo = resolveViewStageInfo();
  renderQuotas(viewInfo);

  // 重新渲染抽屉（让 is-current 高亮正确）
  renderStageDrawerList();

  // 只读提示
  const isViewingHistory = stageId !== realId;
  const readonly = isViewingHistory && isHistoryReadonly();
  if (isViewingHistory && readonly) {
    notify(`正在查看历史阶段「${stageId}」（只读）`, "info");
  } else if (isViewingHistory && !readonly) {
    notify(`正在查看历史阶段「${stageId}」（可编辑）`, "info");
  }
}

function exitHistoryView() {
  currentViewStageId = null;
  const realId = getCurrentStageId();
  const currentEl = document.getElementById("stage-switcher-current");
  if (currentEl) currentEl.textContent = realId;
  applyViewModeClass();
  renderQuotas(getCurrentStage(new Date()));
  renderStageDrawerList();
  notify(`已回到当前阶段「${realId}」`, "info");
}


// ==================== ESM 导出（批次20） ====================
export {
  applyViewModeClass, closeStageDrawer, getCurrentStage, getStageIdByDate, openStageDrawer, renderHistoryReadonlyToggle, renderStageDrawerList
};
