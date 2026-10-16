// ==================== js/config.js ====================
// 配置唯一真源（批次7 从 script.js 抽取）：阶段/配额/指标卡/里程碑/主题
// 本文件禁止访问 DOM / localStorage / fetch；必须是依赖链最底层
// 阶段2 起算日 2027-02-22（决策日志#60，对齐校历开学日）

// ==================== 0.3 日卡系统（S4-1） ====================

const STAGE0_START_DATE = "2026-09-21";
const MELTDOWN_THRESHOLD = 3.5;      // 连续 2 周均值 < 3.5 触发熔断预警
const STATUS_DROP_THRESHOLD = 0.5;   // 滑动平均下降 ≥ 0.5 触发下滑预警

// 日学习上限（批次22 R3）：按星期几索引，周一=0 → 周日=6，单位 h；调用处用 DAILY_CAP[(date.getDay() + 6) % 7]
const DAILY_CAP = [2.5, 6.0, 5.5, 5.0, 6.5, 8.0, 6.5];

// ==================== 1. 数据常量（由 CSV 转写） ====================

const STAGES = [
  {
    id: "阶段0·前段",
    start: "2026-09-21",
    end: "2026-10-07",
    goal: "工作台搭建期＋国庆双线期（9.21–10.7）· 该时段已结束，执行记录见归档",
    doc: "过渡期 · 2026-10-08 起正式进入阶段0",
    termLabel: "大二上 · 开学初"
  },
  {
    id: "阶段0",
    start: "2026-10-08",
    end: "2026-11-14",
    goal: "CMC压缩保参期：高数下收尾优先（微分方程→级数→多元积分→曲线曲面积分），真题3套（10.25摸底/11.7/11.11拼卷），11.14完赛即达标。模电数电专项冲90+，概率课内90+。执行细则见《阶段0执行手册v0.2》",
    doc: "第四章（§4.1周配额）＋《阶段0执行手册v0.2》",
    termLabel: "大二上 · 竞赛期"
  },
  {
    id: "阶段0·国庆13天（子阶段）",
    parentId: "阶段0",
    start: "2026-09-25",
    end: "2026-10-07",
    goal: "CMC高数收尾（多元积分→曲线曲面积分→级数→常微分方程，D2–D8）＋真题5套（D9–D13每日1套，第5套＝10.7基线模考）＋AI用中学；产出：10.7基线分数＋《AI使用清单：哪些真有用》",
    doc: "§4.3（本节由《国庆13天双线作战执行方案》接管）",
    termLabel: ""
  },
  {
    id: "阶段1",
    start: "2026-11-15",
    end: "2027-01-10",
    goal: "期末考试学年学分加权均分≥90（单科底线85）；六级专项11.16插入约4周；12月堆叠期降档；电子电路课程设计冲「优秀」",
    doc: "第七章·阶段1（降档配套§5.2）",
    termLabel: "大二上 · 期末季"
  },
  {
    id: "阶段1·12月期末周（§5.2降档）",
    parentId: "阶段1",
    start: "2026-12-14",
    end: "2027-01-10",
    goal: "期末周降档：总配额降至目标周配额70%，约20–22h/周",
    doc: "§5.2",
    termLabel: ""
  },
  {
    id: "阶段1.5",
    start: "2027-01-11",
    end: "2027-02-21",
    goal: "三件必完成：线代一轮（660线代正确率≥70%收口）、801前2章探路（裴润上册＋B站胡寿松课）、英语核心词第1轮收尾；C语言恢复性重学每周2h（大一上修完已遗忘）",
    doc: "第七章·阶段1.5",
    termLabel: "寒假"
  },
  {
    id: "阶段2",
    start: "2027-02-22",
    end: "2027-07-15",
    goal: "张宇基础30讲＋1000题A组；801胡寿松前四章；单片机冲95+＋独立开源项目；CMC获奖R值申请；5月数模（801进度达标才参加）；6月六级（若12月未过）",
    doc: "第七章·阶段2",
    termLabel: "大二下"
  },
  {
    id: "阶段3",
    start: "2027-07-16",
    end: "2027-08-31",
    goal: "强化期：暑假日均6–7h（不设8–10h）；书单口径：购李林880",
    doc: "第七章·「阶段3＆阶段4＆阶段5」合并节",
    termLabel: "大二暑假"
  },
  {
    id: "阶段4",
    start: "2027-09-01",
    end: "2028-08-31",
    goal: "大三上校内轨95+／考研轨推进；拆三个子阶段（大三上／大三下／大三暑假），各自配额与里程碑2027年8月阶段复盘时细化",
    doc: "第七章·「阶段3＆阶段4＆阶段5」合并节",
    termLabel: "大三全年"
  },
  {
    id: "阶段5",
    start: "2028-09-01",
    end: "2028-12-31",
    goal: "40h+冲刺；政治2028年9–10月启动（此前零投入）；2028.10按§1.4预裁表报名；硬约束：复试两门新教材＋风哥复试资料2028.11前买齐",
    doc: "第七章·「阶段3＆阶段4＆阶段5」合并节（政治启动＝第〇章#9）",
    termLabel: "大四上 · 冲刺"
  },
  {
    id: "复试90天",
    start: "2029-01-01",
    end: "2029-06-30",
    goal: "复试笔试五门（模电数电80分在学覆盖·回忆性一轮＋电路40分待重修＋新学80分）＋面试150分；量化目标：综合测试≥170/200、面试≥125/150",
    doc: "§7.6 初试后90天复试作战预案",
    termLabel: "大四下 · 复试"
  }
];

const QUOTAS = [
  { stage: "阶段0·前段", module: "（未启用 · 未记录学习）", hours: 0, note: "9.21–10.7 工作台搭建期，无学习产出" },
  { stage: "阶段0", module: "竞赛专项（高数下收尾＋CMC）", hours: 12, note: "周一至五每日1.5h三步法（7.5h）＋周六限时章节测2h与复盘1h（3h）＋周日1.5h；网课≤2h/天；归因：数一主线8h＋CMC特有4h" },
  { stage: "阶段0", module: "模电数电专项（学业90+／复试笔试80分双重身份）", hours: 3, note: "10.28／11.12结课为推算口径；边学边总复习，目标90+会解题" },
  { stage: "阶段0", module: "概率（课内＋作业）", hours: 4, note: "课内即备考，不欠账，目标90+" },
  { stage: "阶段0", module: "其他课（大物／外语／复变／力学）", hours: 4, note: "内部优先级：大物、外语各≥1.5h/周；复变、力学以课内为主" },
  { stage: "阶段0", module: "英语", hours: 4, note: "单词两段式（早20min＋睡前15min）＋每日30min听力（固定22:15宿舍段）" },
  { stage: "阶段0", module: "缓冲", hours: 2, note: "低谷日" },
  { stage: "阶段0", module: "周检", hours: 1, note: "周日晚间，并入周日4.1h内" },
  { stage: "阶段0·国庆13天（子阶段）", module: "竞赛（CMC主任务＋收尾／真题复盘）", hoursPerDay: 4, note: "09:00–12:00上午整块3h＋15:20–16:20收尾／真题复盘1h" },
  { stage: "阶段0·国庆13天（子阶段）", module: "AI用中学", hoursPerDay: 0.5, note: "14:00–14:30；全部服务当天CMC内容" },
  { stage: "阶段0·国庆13天（子阶段）", module: "英语单词两段式", hoursPerDay: 0, note: "早20min＋睡前15min；不计入4.5h，是习惯不是任务" },
  { stage: "阶段0·国庆13天（子阶段）", module: "日卡", hoursPerDay: 0, note: "晚间填写，必记状态分；不计入4.5h" },
  { stage: "阶段1", module: "校内期末（概率／复变／大物／外语／马原／力学）", hours: 10, note: "周检指标替换为「期末复习≥10h＋六级专项≥3h」" },
  { stage: "阶段1", module: "模电数电（若1月考）／六级专项（11.16–考前）", hours: 3, note: "六级专项约4周：每日45–60min＋每周1套真题计时" },
  { stage: "阶段1", module: "英语词汇＋听力", hours: 2, note: "降档期单词复习全额保障" },
  { stage: "阶段1", module: "缓冲", hours: 2, note: "" }
];

// ==================== 2. 指标配置（9张卡） ====================

const DEFAULT_CONFIGS = {
  vocabulary: {
    key: "vocabulary",
    name: "单词",
    unit: "词",
    dailyTarget: 50,
    totalGoal: 5000,
    deadline: "2026-11-14",
    type: "hybrid",
    hoursPerUnit: 0.01,
    contributesToCapacity: true
  },
  listening: {
    key: "listening",
    name: "听力",
    unit: "min",
    dailyTarget: 30,
    type: "habit",
    hoursPerUnit: 1 / 60,
    contributesToCapacity: true
  },
  sleep: {
    key: "sleep",
    name: "睡眠",
    unit: "",
    dailyTarget: "23:00",
    type: "time-habit"
  },
  cmc: {
    key: "cmc",
    name: "CMC 竞赛",
    unit: "天",
    totalGoal: 44,
    deadline: "2026-11-14",
    type: "progress",
    belongsTo: ["competition"],
    hoursPerUnit: 1.5,
    contributesToCapacity: true
  },
  "mock-exams": {
    key: "mock-exams",
    name: "全真模考",
    unit: "次",
    totalGoal: 3,
    deadline: "2026-11-14",
    type: "progress",
    belongsTo: ["competition"],
    hoursPerUnit: 3,
    contributesToCapacity: true
  },
  "advanced-math": {
    key: "advanced-math",
    name: "高数恢复",
    unit: "个",
    totalGoal: 70,
    deadline: "2026-11-14",
    type: "progress",
    hoursPerUnit: 0.5,
    contributesToCapacity: true
  },
  "final-courses": {
    key: "final-courses",
    name: "本学期单科",
    unit: "节",
    totalGoal: 100,
    deadline: "2027-01-10",
    type: "progress",
    hoursPerUnit: 0.75,
    contributesToCapacity: true
  },
  "weekly-capacity": {
    key: "weekly-capacity",
    name: "周有效产能",
    unit: "h",
    type: "summary",
    target: 30,
    bottom: 21
  },
  "weekly-check": {
    key: "weekly-check",
    name: "阶段0周检5数字",
    type: "auto-check"
  }
};

// 运行时配置：从默认配置深拷贝，可被用户设置覆盖
const METRIC_CONFIGS = JSON.parse(JSON.stringify(DEFAULT_CONFIGS));

// ==================== 11.4 关键节点表（S2-2） ====================

const MILESTONES = [
  { date: "2026-10-09", label: "手册执行第一天（自测豁免，全量重建起点）" },
  { date: "2026-10-25", label: "真题#1摸底＋降级检查点A" },
  { date: "2026-11-07", label: "真题#2全真模考" },
  { date: "2026-11-11", label: "拼卷查漏" },
  { date: "2026-11-14", label: "CMC初赛日" },
  { date: "2026-12-14", label: "12月期末周开始（降档）" },
  { date: "2027-01-10", label: "阶段1结束" },
  { date: "2027-02-21", label: "阶段1.5结束" },
  { date: "2027-07-15", label: "阶段2结束" },
  { date: "2027-08-31", label: "阶段3结束" },
  { date: "2028-12-31", label: "阶段5结束" },
  { date: "2029-06-30", label: "复试90天结束" }
];

// ==================== 11.85 月测分双曲线（S7-2） ====================

const MONTHLY_SUBJECTS = {
  math: { key: "math", name: "数学一", max: 150, target: 130, fallback: 120 },
  english: { key: "english", name: "英语一", max: 100, target: 70, fallback: 60 }
};

// ==================== 主题顺序（批次 10） ====================

const THEME_ORDER = ["dark-purple", "midnight-blue", "cyber-cyan-purple", "warm-cream", "matcha-green", "minimal-white"];

// ==================== 批次7 新增配置（本批只定义不接线） ====================

// 达标天日阈值（裁决：当日 getDailyFinalHours ≥ 3h 记 1 达标天；批次9 接线）
const CAPACITY_DAILY_THRESHOLD = 3;

// 睡眠目标配置（周五/周六 B 案 23:40，其余 23:00；批次10 接线）
const SLEEP_PLAN = { default: "23:00", friSat: "23:40" };

// 周检指标集配置（批次9/10 接线；阈值口径见《数据字典与口径白皮书 v1.0》§5）
const STAGE_CHECK_RULES = {
  "阶段0": [
    { id: "total-hours",   label: "总小时",   threshold: 21,   unit: "h" },
    { id: "achieve-days",  label: "达标天",   threshold: 5,    unit: "天" },
    { id: "competition",   label: "竞赛专项", threshold: 10.5, unit: "h" },
    { id: "weekly-invest", label: "周总投入", threshold: 28,   unit: "h" },
    { id: "vocab",         label: "单词复习", threshold: 7,    unit: "天" }
  ],
  "阶段1": [
    { id: "total-hours",   label: "总小时",   threshold: 21,   unit: "h" },
    { id: "achieve-days",  label: "达标天",   threshold: 5,    unit: "天" },
    { id: "final-review",  label: "期末复习", threshold: 10,   unit: "h" },
    { id: "cet6",          label: "六级专项", threshold: 3,    unit: "h" },
    { id: "vocab",         label: "单词复习", threshold: 7,    unit: "天" }
  ]
};

// ==================== ESM 导出（批次19） ====================
export {
  STAGE0_START_DATE,
  MELTDOWN_THRESHOLD,
  STATUS_DROP_THRESHOLD,
  DAILY_CAP,
  STAGES,
  QUOTAS,
  DEFAULT_CONFIGS,
  METRIC_CONFIGS,
  MILESTONES,
  MONTHLY_SUBJECTS,
  THEME_ORDER,
  CAPACITY_DAILY_THRESHOLD,
  SLEEP_PLAN,
  STAGE_CHECK_RULES
};
