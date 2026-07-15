const STORAGE_KEY = "pgyPreFavorites";
const TAG_LIBRARY_KEY = "pgyPreFavoriteTagLibrary";

const favoriteCount = document.getElementById("favoriteCount");
const favoriteList = document.getElementById("favoriteList");
const statusNode = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const clearBtn = document.getElementById("clearBtn");
const selectAll = document.getElementById("selectAll");
const selectedCount = document.getElementById("selectedCount");
const batchRemoveBtn = document.getElementById("batchRemoveBtn");
const writeFeishuBtn = document.getElementById("writeFeishuBtn");
const favoriteConfiguredTable = document.getElementById("favoriteConfiguredTable");
const activeWriteTarget = document.getElementById("activeWriteTarget");
const stickyWriteTarget = document.getElementById("stickyWriteTarget");
const refreshFeishuConfigsBtn = document.getElementById("refreshFeishuConfigsBtn");
const manageFeishuConfigsBtn = document.getElementById("manageFeishuConfigsBtn");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const acquisitionFilter = document.getElementById("acquisitionFilter");
const categoryFilters = document.getElementById("categoryFilters");
const tagFilters = document.getElementById("tagFilters");
const priceTypeFilter = document.getElementById("priceTypeFilter");
const priceMinInput = document.getElementById("priceMinInput");
const priceMaxInput = document.getElementById("priceMaxInput");
const clearPriceFilterBtn = document.getElementById("clearPriceFilterBtn");
const performanceSort = document.getElementById("performanceSort");
const activeFilterBar = document.getElementById("activeFilterBar");
const activeFilterChips = document.getElementById("activeFilterChips");
const clearAllFiltersBtn = document.getElementById("clearAllFiltersBtn");
const performanceFilterSummary = document.getElementById("performanceFilterSummary");
const performancePresetButtons = Array.from(document.querySelectorAll("[data-performance-preset]"));
const clearPerformanceFiltersBtn = document.getElementById("clearPerformanceFiltersBtn");
const cooperationExposureMin = document.getElementById("cooperationExposureMin");
const cooperationExposureMax = document.getElementById("cooperationExposureMax");
const cooperationReadMin = document.getElementById("cooperationReadMin");
const cooperationReadMax = document.getElementById("cooperationReadMax");
const cooperationInteractionMin = document.getElementById("cooperationInteractionMin");
const cooperationInteractionMax = document.getElementById("cooperationInteractionMax");
const cpmMin = document.getElementById("cpmMin");
const cpmMax = document.getElementById("cpmMax");
const cpeMin = document.getElementById("cpeMin");
const cpeMax = document.getElementById("cpeMax");
const customTagInput = document.getElementById("customTagInput");
const customTagSuggestions = document.getElementById("customTagSuggestions");
const addTagBtn = document.getElementById("addTagBtn");
const removeTagBtn = document.getElementById("removeTagBtn");
const tagLibraryChips = document.getElementById("tagLibraryChips");
const exportBtn = document.getElementById("exportBtn");
const importFile = document.getElementById("importFile");
const ratingColumnInput = document.getElementById("ratingColumnInput");
const ratingDisplaySelect = document.getElementById("ratingDisplaySelect");
const customColumnsInput = document.getElementById("customColumnsInput");
const updatePendingBtn = document.getElementById("updatePendingBtn");
const updateAllBtn = document.getElementById("updateAllBtn");
const onlineTableUrl = document.getElementById("onlineTableUrl");
const loadOnlineSheetsBtn = document.getElementById("loadOnlineSheetsBtn");
const importOnlineBtn = document.getElementById("importOnlineBtn");
const onlineTagColumn = document.getElementById("onlineTagColumn");
const onlineSheetPicker = document.getElementById("onlineSheetPicker");
const onlineSheetSelectAll = document.getElementById("onlineSheetSelectAll");
const onlineSheetSelectionCount = document.getElementById("onlineSheetSelectionCount");
const onlineSheetOptions = document.getElementById("onlineSheetOptions");
const dataProgress = document.getElementById("dataProgress");
const dataProgressLabel = document.getElementById("dataProgressLabel");
const dataProgressValue = document.getElementById("dataProgressValue");
const dataProgressBar = document.getElementById("dataProgressBar");
const ratingMinInput = document.getElementById("ratingMinInput");
const ratingMaxInput = document.getElementById("ratingMaxInput");
const customFieldFilters = document.getElementById("customFieldFilters");
const customDataFilterSummary = document.getElementById("customDataFilterSummary");
const clearCustomDataFiltersBtn = document.getElementById("clearCustomDataFiltersBtn");
const tagPickerDialog = document.getElementById("tagPickerDialog");
const tagPickerCreator = document.getElementById("tagPickerCreator");
const tagPickerExistingTags = document.getElementById("tagPickerExistingTags");
const tagPickerNewInput = document.getElementById("tagPickerNewInput");
const tagPickerSelection = document.getElementById("tagPickerSelection");
const tagPickerError = document.getElementById("tagPickerError");
const closeTagPickerBtn = document.getElementById("closeTagPickerBtn");
const cancelTagPickerBtn = document.getElementById("cancelTagPickerBtn");
const saveTagPickerBtn = document.getElementById("saveTagPickerBtn");
const DEFAULT_CATEGORIES = [
  "美妆",
  "护肤",
  "个人护理",
  "母婴",
  "时尚",
  "美食",
  "家居家装",
  "影视综资讯",
  "运动健身",
  "宠物",
  "文化艺术",
  "兴趣爱好",
  "生活记录",
  "教育",
  "职场",
  "情感",
  "摄影",
  "游戏",
  "科技数码",
  "出行旅游",
  "音乐",
  "搞笑",
  "健康养生",
  "汽车",
  "婚嫁",
  "商业财经",
  "素材"
];

let favorites = [];
let selectedUserIds = new Set();
let writing = false;
let dataBusy = false;
let activeCategory = "";
let activeTag = "";
let tagLibrary = [];
let configuredTables = [];
let activeTable = null;
let tagPickerUserId = "";
let tagPickerSelectedTags = new Set();
let onlineSheets = [];
let inspectedOnlineTableUrl = "";
let customFieldFilterValues = new Map();

function normalizeCustomColumnNames(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\n,，、;；]+/);
  return Array.from(new Set(source.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 30);
}

function normalizeRating(value, fallbackDisplay = "stars", fallbackColumn = "达人评分") {
  const rawValue = typeof value === "object" && value !== null ? value.value : value;
  const number = Number(rawValue);
  if (!Number.isFinite(number)) return null;
  return {
    value: Math.max(0, Math.min(5, number)),
    max: 5,
    display: (value?.display || fallbackDisplay) === "score" ? "score" : "stars",
    columnName: String(value?.columnName || fallbackColumn || "达人评分").trim() || "达人评分"
  };
}

function importFieldOptions() {
  return {
    ratingColumn: String(ratingColumnInput.value || "").trim(),
    ratingDisplay: ratingDisplaySelect.value === "score" ? "score" : "stars",
    customColumns: normalizeCustomColumnNames(customColumnsInput.value)
  };
}

async function saveImportFieldOptions() {
  const options = importFieldOptions();
  await chrome.storage.local.set({
    favoriteRatingColumn: options.ratingColumn,
    favoriteRatingDisplay: options.ratingDisplay,
    favoriteCustomColumns: options.customColumns
  });
}

function normalizeTableConfigs(configs) {
  return (Array.isArray(configs) ? configs : [])
    .map((item) => ({
      name: String(item?.name || "").trim(),
      url: String(item?.url || "").trim(),
      sheetId: String(item?.sheetId || item?.tableId || "").trim(),
      tableName: String(item?.tableName || "").trim(),
      sheetName: String(item?.sheetName || "").trim()
    }))
    .filter((item) => item.url);
}

function configuredTableValue(config) {
  return writeTargetKey(config.url, config.sheetId);
}

function writeTargetKey(url, sheetId) {
  return JSON.stringify([String(url || "").trim(), String(sheetId || "").trim()]);
}

function configuredTableLabel(config, index) {
  const remark = config.name || `配置 ${index + 1}`;
  const target = [config.tableName, config.sheetName].filter(Boolean).join(" / ");
  return target ? `${remark}（${target}）` : remark;
}

function normalizeWriteHistory(value, legacyStatus = "") {
  const history = (Array.isArray(value) ? value : [])
    .map((entry) => {
      const url = String(entry?.url || "").trim();
      const sheetId = String(entry?.sheetId || "").trim();
      const key = url || sheetId
        ? writeTargetKey(url, sheetId)
        : String(entry?.key || "").trim();
      return {
        key,
        url,
        sheetId,
        label: String(entry?.label || "已配置表格").trim(),
        writtenAt: String(entry?.writtenAt || entry?.updatedAt || "").trim()
      };
    })
    .filter((entry) => entry.key);
  if (!history.length && legacyStatus === "已写入飞书") {
    history.push({ key: "legacy-unknown", url: "", sheetId: "", label: "旧记录（表格未知）", writtenAt: "" });
  }
  return history.filter((entry, index) => history.findIndex((candidate) => candidate.key === entry.key) === index);
}

function legacyAcquisitionSource(source) {
  const definitions = {
    xhs_profile: ["xhs-profile", "xhs_profile", "小红书主页"],
    pgy_detail_prefavorite: ["pgy-profile", "pgy_profile", "蒲公英主页"],
    pgy_similar_prefavorite: ["pgy-similar", "pgy_similar", "蒲公英相似达人"],
    spreadsheet_import: ["spreadsheet-import-legacy", "spreadsheet", "表格导入（旧记录）"]
  };
  const definition = definitions[String(source || "").trim()];
  return definition ? { key: definition[0], type: definition[1], label: definition[2], acquiredAt: "" } : null;
}

function normalizeAcquisitionSources(value, legacySource = "") {
  const sources = (Array.isArray(value) ? value : []).map((entry) => ({
    key: String(entry?.key || "").trim(),
    type: String(entry?.type || "").trim(),
    label: String(entry?.label || "未知渠道").trim(),
    resourceId: String(entry?.resourceId || "").trim(),
    url: String(entry?.url || "").trim(),
    acquiredAt: String(entry?.acquiredAt || "").trim()
  })).filter((entry) => entry.key);
  const legacy = legacyAcquisitionSource(legacySource);
  if (!sources.length && legacy) sources.push(legacy);
  return sources.filter((entry, index) => sources.findIndex((candidate) => candidate.key === entry.key) === index);
}

function renderFeishuStatusOptions() {
  const previous = statusFilter.value;
  const targets = new Map();
  favorites.forEach((item) => {
    (item.feishuWriteHistory || []).forEach((entry) => targets.set(entry.key, entry.label || "已配置表格"));
  });
  configuredTables.forEach((config, index) => targets.set(configuredTableValue(config), configuredTableLabel(config, index)));
  statusFilter.textContent = "";
  const baseOptions = [
    ["", "全部飞书状态"],
    ["never", "未写回过"],
    ["any", "已写回过任意表格"]
  ];
  for (const [value, label] of baseOptions) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    statusFilter.append(option);
  }
  for (const [key, label] of targets) {
    const option = document.createElement("option");
    option.value = `table:${key}`;
    option.textContent = key === "legacy-unknown" ? "已写回：旧记录（表格未知）" : `已写回：${label}`;
    statusFilter.append(option);
  }
  statusFilter.value = Array.from(statusFilter.options).some((option) => option.value === previous) ? previous : "";
}

function renderAcquisitionOptions() {
  const previous = acquisitionFilter.value;
  const targets = new Map();
  favorites.forEach((item) => {
    (item.acquisitionSources || []).forEach((entry) => {
      const current = targets.get(entry.key) || { label: entry.label || "未知渠道", count: 0 };
      current.count += 1;
      targets.set(entry.key, current);
    });
  });
  acquisitionFilter.textContent = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "全部获取渠道";
  acquisitionFilter.append(allOption);
  Array.from(targets.entries())
    .sort((left, right) => right[1].count - left[1].count || left[1].label.localeCompare(right[1].label, "zh-CN"))
    .forEach(([key, target]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = `${target.label}（${target.count}）`;
      acquisitionFilter.append(option);
    });
  acquisitionFilter.value = Array.from(acquisitionFilter.options).some((option) => option.value === previous) ? previous : "";
}

function activeTableLabel() {
  if (!activeTable) return "暂无可写入表格";
  const index = configuredTables.indexOf(activeTable);
  return configuredTableLabel(activeTable, Math.max(index, 0));
}

function updateActiveWriteTarget() {
  const label = activeTableLabel();
  const title = activeTable
    ? `${label}\n${activeTable.url}${activeTable.sheetId ? `\n子表 ID：${activeTable.sheetId}` : ""}`
    : "";
  activeWriteTarget.textContent = activeTable ? `当前生效：${label}` : "当前生效：暂无可写入表格";
  activeWriteTarget.title = title;
  activeWriteTarget.classList.toggle("is-empty", !activeTable);
  stickyWriteTarget.textContent = label;
  stickyWriteTarget.title = title;
}

async function loadConfiguredTables({ announce = false } = {}) {
  const stored = await chrome.storage.local.get({
    feishuTableConfigs: [],
    favoriteFeishuUrl: "",
    favoriteFeishuSheetId: ""
  });
  configuredTables = normalizeTableConfigs(stored.feishuTableConfigs);
  const previousIndex = configuredTables.findIndex((config) => (
    config.url === String(stored.favoriteFeishuUrl || "").trim()
    && (config.sheetId || "") === String(stored.favoriteFeishuSheetId || "").trim()
  ));
  activeTable = configuredTables[previousIndex >= 0 ? previousIndex : 0] || null;
  favoriteConfiguredTable.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = configuredTables.length ? "请选择已配置表格" : "暂无已配置表格";
  favoriteConfiguredTable.append(placeholder);
  configuredTables.forEach((config, index) => {
    const option = document.createElement("option");
    option.value = configuredTableValue(config);
    option.textContent = configuredTableLabel(config, index);
    favoriteConfiguredTable.append(option);
  });
  favoriteConfiguredTable.disabled = configuredTables.length === 0;
  favoriteConfiguredTable.value = activeTable ? configuredTableValue(activeTable) : "";
  updateActiveWriteTarget();
  renderFeishuStatusOptions();
  const nextUrl = activeTable?.url || "";
  const nextSheetId = activeTable?.sheetId || "";
  if (nextUrl !== (stored.favoriteFeishuUrl || "") || nextSheetId !== (stored.favoriteFeishuSheetId || "")) {
    await chrome.storage.local.set({ favoriteFeishuUrl: nextUrl, favoriteFeishuSheetId: nextSheetId });
  }
  updateSelectionState();
  if (announce) setStatus(activeTable
    ? `写入表格已更新，当前生效：${activeTableLabel()}。`
    : "飞书配置页暂无可用表格，请先添加并保存配置。", !activeTable);
}

async function applyConfiguredTableSelection() {
  activeTable = configuredTables.find((config) => configuredTableValue(config) === favoriteConfiguredTable.value) || null;
  updateActiveWriteTarget();
  await chrome.storage.local.set({
    favoriteFeishuUrl: activeTable?.url || "",
    favoriteFeishuSheetId: activeTable?.sheetId || ""
  });
  updateSelectionState();
  setStatus(activeTable
    ? `选择已生效，预收藏达人将写入：${activeTableLabel()}。`
    : "当前没有可写入的飞书表格。", !activeTable);
}

async function refreshConfiguredTables() {
  refreshFeishuConfigsBtn.disabled = true;
  try {
    await loadConfiguredTables({ announce: true });
  } finally {
    refreshFeishuConfigsBtn.disabled = false;
  }
}

async function openFeishuConfigPage() {
  await chrome.runtime.openOptionsPage();
}

function setStatus(text, isError = false) {
  statusNode.textContent = text;
  statusNode.classList.toggle("is-error", Boolean(isError));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAvatarUrl(value) {
  const url = String(value || "").trim();
  if (url.startsWith("//")) return `https:${url}`;
  return /^https?:\/\//i.test(url) || /^data:image\//i.test(url) ? url : "";
}

function avatarInitial(name) {
  return Array.from(String(name || "?").trim())[0] || "?";
}

function activateAvatarFallbacks() {
  for (const image of favoriteList.querySelectorAll(".favorite-avatar img")) {
    const showFallback = () => image.closest(".favorite-avatar")?.classList.add("is-fallback");
    image.addEventListener("error", showFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) showFallback();
  }
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isBadProfileText(text) {
  return /©|copyright|行吟|信息科技|有限公司|公司地址|地址[:：]|电话[:：]|沪ICP备|公网安备|隐私政策|用户协议|营业执照|违法和不良信息|9501-3888/i.test(text);
}

function sanitizeBio(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || isBadProfileText(text)) return "";
  if (/小红书号|IP属地|关注|粉丝|获赞|收藏|登录|编辑资料/.test(text)) return "";
  return text.length > 90 ? `${text.slice(0, 88)}...` : text;
}

function normalizeCategoryTags(value, source = "") {
  const rawTags = normalizeTagList(value);
  const hasLegacyPgyShape = rawTags.some((tag) => /[-—>；;]/.test(String(tag || "")));
  const tags = [];
  for (const rawTag of rawTags) {
    const parts = source === "pgy_profile" || hasLegacyPgyShape
      ? String(rawTag || "").split(/[;；]+/)
      : [rawTag];
    for (const part of parts) {
      const text = part.trim();
      if (!text) continue;
      const primary = text.split(/\s*[-—>]\s*/)[0]?.trim() || text;
      const tag = DEFAULT_CATEGORIES.includes(primary) ? primary : text;
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  return tags.slice(0, 30);
}

function normalizeTagList(value, limit = 30) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\n、,，/|｜;；]+/);
  const tags = [];
  for (const item of source) {
    const tag = String(item || "").trim();
    if (!tag || tags.includes(tag)) continue;
    tags.push(tag);
    if (tags.length >= limit) break;
  }
  return tags;
}

function normalizeFavorites(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      userId: String(item?.userId || "").trim(),
      name: String(item?.name || "").trim(),
      avatar: normalizeAvatarUrl(item?.avatar),
      redId: String(item?.redId || "").trim(),
      location: String(item?.location || "").trim(),
      followersText: String(item?.followersText || "").trim(),
      followersCount: parsePriceValue(item?.followersCount ?? item?.followersText) ?? "",
      likesText: String(item?.likesText || "").trim(),
      picturePriceText: String(item?.picturePriceText || item?.picturePrice || item?.quotePrice || "").trim(),
      videoPriceText: String(item?.videoPriceText || item?.videoPrice || "").trim(),
      cooperationExposureMedian: String(item?.cooperationExposureMedian ?? "").trim(),
      cooperationReadMedian: String(item?.cooperationReadMedian ?? "").trim(),
      cooperationInteractionMedian: String(item?.cooperationInteractionMedian ?? "").trim(),
      cooperationNoteCount: String(item?.cooperationNoteCount ?? "").trim(),
      cpmText: String(item?.cpmText ?? item?.cpm ?? item?.CPM ?? "").trim(),
      cpeText: String(item?.cpeText ?? item?.cpe ?? item?.CPE ?? "").trim(),
      quoteStatus: String(item?.quoteStatus || "").trim(),
      bio: sanitizeBio(item?.bio),
      categoryTags: normalizeCategoryTags(item?.categoryTags, item?.categorySource),
      customTags: normalizeTagList(item?.customTags),
      rating: normalizeRating(item?.rating),
      customFields: Object.fromEntries(Object.entries(item?.customFields || {})
        .map(([key, value]) => [String(key || "").trim(), String(value ?? "").trim()])
        .filter(([key, value]) => key && value)),
      categorySource: String(item?.categorySource || "").trim(),
      source: String(item?.source || "").trim(),
      acquisitionSources: normalizeAcquisitionSources(item?.acquisitionSources, item?.source),
      xhsUrl: String(item?.xhsUrl || "").trim(),
      pgyUrl: String(item?.pgyUrl || "").trim(),
      status: String(item?.status || "预收藏").trim(),
      createdAt: String(item?.createdAt || "").trim(),
      updatedAt: String(item?.updatedAt || "").trim(),
      quoteFetchedAt: String(item?.quoteFetchedAt || "").trim(),
      lastDataRefreshAt: String(item?.lastDataRefreshAt || item?.quoteFetchedAt || "").trim(),
      lastRefreshFailedAt: String(item?.lastRefreshFailedAt || "").trim(),
      feishuWriteHistory: normalizeWriteHistory(item?.feishuWriteHistory, String(item?.status || "").trim())
    }))
    .filter((item) => item.userId);
}

function pruneSelection() {
  const validIds = new Set(favorites.map((item) => item.userId));
  selectedUserIds = new Set(Array.from(selectedUserIds).filter((userId) => validIds.has(userId)));
}

function favoriteSearchText(item) {
  return [
    item.userId,
    item.name,
    item.redId,
    item.location,
    item.followersText,
    item.likesText,
    item.picturePriceText,
    item.videoPriceText,
    item.quoteStatus,
    item.bio,
    item.status,
    ...(item.acquisitionSources || []).map((entry) => entry.label),
    ...(item.feishuWriteHistory || []).map((entry) => entry.label),
    ...(item.categoryTags || []),
    ...(item.customTags || []),
    item.rating?.value ?? "",
    ...Object.entries(item.customFields || {}).flat()
  ].join(" ").toLowerCase();
}

function parsePriceValue(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[￥¥元\s,，]/g, "");
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  let amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (/万|w/.test(text)) amount *= 10000;
  else if (/千|k/.test(text)) amount *= 1000;
  return amount;
}

function cooperationMetricValues(item) {
  const exposure = parsePriceValue(item.cooperationExposureMedian);
  const read = parsePriceValue(item.cooperationReadMedian);
  const interaction = parsePriceValue(item.cooperationInteractionMedian);
  const quote = parsePriceValue(item.picturePriceText) ?? parsePriceValue(item.videoPriceText);
  const directCpm = parsePriceValue(item.cpmText);
  const directCpe = parsePriceValue(item.cpeText);
  return {
    exposure,
    read,
    interaction,
    cpm: directCpm ?? (quote !== null && exposure ? (quote / exposure) * 1000 : null),
    cpe: directCpe ?? (quote !== null && interaction ? quote / interaction : null)
  };
}

function sortableMetricValues(item) {
  return {
    followers: parsePriceValue(item.followersText),
    picturePrice: parsePriceValue(item.picturePriceText),
    videoPrice: parsePriceValue(item.videoPriceText),
    ...cooperationMetricValues(item)
  };
}

const performanceRangeFields = [
  ["exposure", cooperationExposureMin, cooperationExposureMax],
  ["read", cooperationReadMin, cooperationReadMax],
  ["interaction", cooperationInteractionMin, cooperationInteractionMax],
  ["cpm", cpmMin, cpmMax],
  ["cpe", cpeMin, cpeMax]
];

function matchesPerformanceFilters(item) {
  const metrics = cooperationMetricValues(item);
  return performanceRangeFields.every(([field, minimumInput, maximumInput]) => {
    const minimum = parsePriceValue(minimumInput.value);
    const maximum = parsePriceValue(maximumInput.value);
    if (minimum === null && maximum === null) return true;
    const value = metrics[field];
    return value !== null
      && (minimum === null || value >= minimum)
      && (maximum === null || value <= maximum);
  });
}

function matchesCustomDataFilters(item) {
  const minimum = ratingMinInput.value === "" ? null : Number(ratingMinInput.value);
  const maximum = ratingMaxInput.value === "" ? null : Number(ratingMaxInput.value);
  if (minimum !== null || maximum !== null) {
    const value = item.rating?.value;
    if (!Number.isFinite(value) || (minimum !== null && value < minimum) || (maximum !== null && value > maximum)) return false;
  }
  for (const [fieldName, keyword] of customFieldFilterValues) {
    const query = String(keyword || "").trim().toLowerCase();
    if (!query) continue;
    const value = String(item.customFields?.[fieldName] || "").toLowerCase();
    if (!value.includes(query)) return false;
  }
  return true;
}

function sortByPerformance(items) {
  const [field, direction] = String(performanceSort.value || "").split(":");
  if (!field || !direction) return items;
  const multiplier = direction === "asc" ? 1 : -1;
  return items.sort((left, right) => {
    const leftValue = sortableMetricValues(left)[field];
    const rightValue = sortableMetricValues(right)[field];
    if (leftValue === null && rightValue === null) return 0;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    return (leftValue - rightValue) * multiplier;
  });
}

function compactMetricText(value) {
  if (value === null || !Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 10000) return `${Math.round((value / 10000) * 10) / 10}万`;
  return Math.round(value).toLocaleString("zh-CN");
}

function costMetricText(value) {
  if (value === null || !Number.isFinite(value)) return "--";
  return value >= 100 ? Math.round(value).toLocaleString("zh-CN") : value.toFixed(value < 10 ? 2 : 1);
}

function ratingDisplayText(rating) {
  if (!rating || !Number.isFinite(rating.value)) return "未评分";
  if ((rating.display || ratingDisplaySelect.value) === "score") return `${rating.value}/5 分`;
  const fullStars = Math.max(0, Math.min(5, Math.floor(rating.value)));
  return `${"★".repeat(fullStars)}${"☆".repeat(5 - fullStars)} · ${rating.value}/5`;
}

function headlineRatingText(rating) {
  if (rating) return ratingDisplayText(rating);
  return ratingDisplaySelect.value === "score" ? "0/5 分" : "☆☆☆☆☆ · 0/5";
}

function matchesPriceFilter(item) {
  const minimum = priceMinInput.value === "" ? null : Number(priceMinInput.value);
  const maximum = priceMaxInput.value === "" ? null : Number(priceMaxInput.value);
  if (minimum === null && maximum === null) return true;
  const values = priceTypeFilter.value === "picture"
    ? [parsePriceValue(item.picturePriceText)]
    : priceTypeFilter.value === "video"
      ? [parsePriceValue(item.videoPriceText)]
      : [parsePriceValue(item.picturePriceText), parsePriceValue(item.videoPriceText)];
  return values.some((price) => price !== null
    && (minimum === null || price >= minimum)
    && (maximum === null || price <= maximum));
}

function matchesFavoriteFilters(item, { ignoreCategory = false, ignoreTag = false } = {}) {
  const keyword = String(searchInput.value || "").trim().toLowerCase();
  const status = statusFilter.value;
  const acquisition = acquisitionFilter.value;
  const writeHistory = item.feishuWriteHistory || [];
  if (status === "never" && writeHistory.length) return false;
  if (status === "any" && !writeHistory.length) return false;
  if (status.startsWith("table:") && !writeHistory.some((entry) => entry.key === status.slice(6))) return false;
  if (acquisition && !(item.acquisitionSources || []).some((entry) => entry.key === acquisition)) return false;
  if (!ignoreCategory) {
    if (activeCategory === "未分类" && (item.categoryTags || []).length) return false;
    if (activeCategory && activeCategory !== "未分类" && !(item.categoryTags || []).includes(activeCategory)) return false;
  }
  if (!ignoreTag) {
    if (activeTag === "未标签" && (item.customTags || []).length) return false;
    if (activeTag && activeTag !== "未标签" && !(item.customTags || []).includes(activeTag)) return false;
  }
  if (!matchesPriceFilter(item)) return false;
  if (!matchesPerformanceFilters(item)) return false;
  if (!matchesCustomDataFilters(item)) return false;
  if (keyword && !favoriteSearchText(item).includes(keyword)) return false;
  return true;
}

function filteredFavorites() {
  const items = favorites.filter((item) => matchesFavoriteFilters(item));
  return sortByPerformance(items);
}

function allCategoryTags() {
  const counts = new Map();
  for (const category of DEFAULT_CATEGORIES) counts.set(category, 0);
  const matchingFavorites = favorites.filter((item) => matchesFavoriteFilters(item, { ignoreCategory: true }));
  for (const item of matchingFavorites) {
    const tags = (item.categoryTags || []).length ? item.categoryTags : ["未分类"];
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return Array.from(counts.entries()).sort((a, b) => {
    const ai = DEFAULT_CATEGORIES.indexOf(a[0]);
    const bi = DEFAULT_CATEGORIES.indexOf(b[0]);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN");
  });
}

function renderCategoryFilters() {
  const tags = allCategoryTags();
  const allActive = activeCategory === "";
  const visibleTags = tags.filter(([tag, count]) => count > 0 || activeCategory === tag);
  const hiddenTags = tags.filter(([tag, count]) => count === 0 && activeCategory !== tag);
  const tagButton = ([tag, count]) => `
    <button type="button" class="category-chip ${activeCategory === tag ? "is-active" : ""}" data-category="${escapeHtml(tag)}"><span>${escapeHtml(tag)}</span>${count ? `<em>${count}</em>` : ""}</button>
  `;
  categoryFilters.innerHTML = [
    `<button type="button" class="category-chip ${allActive ? "is-active" : ""}" data-category="">全部</button>`,
    ...visibleTags.map(tagButton),
    hiddenTags.length ? `<details class="facet-more"><summary>其余类目 ${hiddenTags.length}</summary><div>${hiddenTags.map(tagButton).join("")}</div></details>` : ""
  ].join("");
}

function allCustomTags() {
  const counts = new Map();
  for (const item of favorites) {
    const tags = (item.customTags || []).length ? item.customTags : ["未标签"];
    for (const tag of tags) counts.set(tag, 0);
  }
  if (activeTag && !counts.has(activeTag)) counts.set(activeTag, 0);
  const matchingFavorites = favorites.filter((item) => matchesFavoriteFilters(item, { ignoreTag: true }));
  for (const item of matchingFavorites) {
    const tags = (item.customTags || []).length ? item.customTags : ["未标签"];
    for (const tag of tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
}

function renderTagFilters() {
  const tags = allCustomTags();
  const visibleTags = tags.filter(([tag, count]) => count > 0 || activeTag === tag);
  const hiddenTags = tags.filter(([tag, count]) => count === 0 && activeTag !== tag);
  const tagButton = ([tag, count]) => `<button type="button" class="category-chip tag-chip ${activeTag === tag ? "is-active" : ""}" data-tag="${escapeHtml(tag)}"><span>${escapeHtml(tag)}</span>${count ? `<em>${count}</em>` : ""}</button>`;
  tagFilters.innerHTML = [
    `<button type="button" class="category-chip ${activeTag === "" ? "is-active" : ""}" data-tag="">全部</button>`,
    ...visibleTags.map(tagButton),
    hiddenTags.length ? `<details class="facet-more"><summary>其余标签 ${hiddenTags.length}</summary><div>${hiddenTags.map(tagButton).join("")}</div></details>` : ""
  ].join("");
  customTagSuggestions.innerHTML = tagLibrary
    .map((tag) => `<option value="${escapeHtml(tag)}"></option>`)
    .join("");
  tagLibraryChips.innerHTML = tagLibrary.length
    ? `<span>已有标签，点击添加：</span>${tagLibrary.map((tag) => `<button type="button" data-library-tag="${escapeHtml(tag)}">+ ${escapeHtml(tag)}</button>`).join("")}`
    : `<span>新增标签后会保存在这里，可继续分配给其他博主。</span>`;
}

function availableCustomFieldNames() {
  return Array.from(new Set([
    ...normalizeCustomColumnNames(customColumnsInput.value),
    ...favorites.flatMap((item) => Object.keys(item.customFields || {})),
    ...customFieldFilterValues.keys()
  ])).sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function renderCustomFieldFilters() {
  const fieldNames = availableCustomFieldNames();
  customFieldFilters.innerHTML = fieldNames.length
    ? fieldNames.map((fieldName) => `
        <label>
          <span>${escapeHtml(fieldName)}</span>
          <input type="search" data-custom-field-filter="${escapeHtml(fieldName)}" value="${escapeHtml(customFieldFilterValues.get(fieldName) || "")}" placeholder="包含文本" />
        </label>
      `).join("")
    : "";
}

function performanceFilterCount() {
  return performanceRangeFields.reduce((count, [, minimumInput, maximumInput]) => count + Number(Boolean(minimumInput.value || maximumInput.value)), 0);
}

function renderActiveFilters() {
  const chips = [];
  const keyword = String(searchInput.value || "").trim();
  if (keyword) chips.push({ key: "search", label: `搜索：${keyword}` });
  if (statusFilter.value) chips.push({ key: "status", label: statusFilter.selectedOptions[0]?.textContent || "飞书状态" });
  if (acquisitionFilter.value) chips.push({ key: "acquisition", label: `获取：${acquisitionFilter.selectedOptions[0]?.textContent || "已选择渠道"}` });
  const priceParts = [];
  if (priceTypeFilter.value !== "any") priceParts.push(priceTypeFilter.selectedOptions[0]?.textContent || "报价类型");
  if (priceMinInput.value) priceParts.push(`≥ ${priceMinInput.value}`);
  if (priceMaxInput.value) priceParts.push(`≤ ${priceMaxInput.value}`);
  if (priceParts.length) chips.push({ key: "price", label: `报价 ${priceParts.join(" · ")}` });
  if (performanceSort.value) chips.push({ key: "sort", label: `排序：${performanceSort.selectedOptions[0]?.textContent || "已设置"}` });
  const performanceLabels = {
    exposure: "合作曝光",
    read: "合作阅读",
    interaction: "合作互动",
    cpm: "CPM",
    cpe: "CPE"
  };
  performanceRangeFields.forEach(([field, minimumInput, maximumInput]) => {
    const parts = [];
    if (minimumInput.value) parts.push(`≥ ${minimumInput.value}`);
    if (maximumInput.value) parts.push(`≤ ${maximumInput.value}`);
    if (parts.length) chips.push({ key: `performance:${field}`, label: `${performanceLabels[field]} ${parts.join(" · ")}` });
  });
  if (activeCategory) chips.push({ key: "category", label: `类目：${activeCategory}` });
  if (activeTag) chips.push({ key: "tag", label: `标签：${activeTag}` });
  if (ratingMinInput.value || ratingMaxInput.value) {
    const parts = [];
    if (ratingMinInput.value) parts.push(`≥ ${ratingMinInput.value}`);
    if (ratingMaxInput.value) parts.push(`≤ ${ratingMaxInput.value}`);
    chips.push({ key: "rating", label: `评分 ${parts.join(" · ")}` });
  }
  for (const [fieldName, value] of customFieldFilterValues) {
    if (String(value || "").trim()) chips.push({ key: `custom:${fieldName}`, label: `${fieldName}：${value}` });
  }
  activeFilterBar.hidden = chips.length === 0;
  activeFilterChips.innerHTML = chips.map((chip) => `<button type="button" data-clear-filter="${escapeHtml(chip.key)}">${escapeHtml(chip.label)}<b>×</b></button>`).join("");
  const performanceCount = performanceFilterCount();
  performanceFilterSummary.textContent = `曝光、阅读、互动、CPM、CPE · 已启用 ${performanceCount} 项`;
  const customFilterCount = Number(Boolean(ratingMinInput.value || ratingMaxInput.value))
    + Array.from(customFieldFilterValues.values()).filter((value) => String(value || "").trim()).length;
  customDataFilterSummary.textContent = `评分、自定义文本 · 已启用 ${customFilterCount} 项`;
  const activePresets = new Set();
  if (cooperationReadMin.value === "1万") activePresets.add("high-read");
  if (cooperationInteractionMin.value === "500") activePresets.add("high-interaction");
  if (cpmMax.value === "80") activePresets.add("low-cpm");
  if (cpeMax.value === "3") activePresets.add("low-cpe");
  performancePresetButtons.forEach((button) => button.classList.toggle("is-active", activePresets.has(button.dataset.performancePreset)));
}

function clearFilter(key) {
  if (key === "search") searchInput.value = "";
  else if (key === "status") statusFilter.value = "";
  else if (key === "acquisition") acquisitionFilter.value = "";
  else if (key === "price") {
    priceTypeFilter.value = "any";
    priceMinInput.value = "";
    priceMaxInput.value = "";
  } else if (key === "sort") performanceSort.value = "";
  else if (key === "category") activeCategory = "";
  else if (key === "tag") activeTag = "";
  else if (key === "rating") {
    ratingMinInput.value = "";
    ratingMaxInput.value = "";
  } else if (key.startsWith("custom:")) customFieldFilterValues.delete(key.slice("custom:".length));
  else if (key.startsWith("performance:")) {
    const field = key.slice("performance:".length);
    const target = performanceRangeFields.find(([name]) => name === field);
    if (target) {
      target[1].value = "";
      target[2].value = "";
    }
  }
}

function clearAllFilters() {
  searchInput.value = "";
  statusFilter.value = "";
  acquisitionFilter.value = "";
  priceTypeFilter.value = "any";
  priceMinInput.value = "";
  priceMaxInput.value = "";
  performanceSort.value = "";
  performanceRangeFields.forEach(([, minimumInput, maximumInput]) => {
    minimumInput.value = "";
    maximumInput.value = "";
  });
  activeCategory = "";
  activeTag = "";
  ratingMinInput.value = "";
  ratingMaxInput.value = "";
  customFieldFilterValues.clear();
  renderFavorites();
}

function updateSelectionState() {
  pruneSelection();
  const visible = filteredFavorites();
  const visibleIds = visible.map((item) => item.userId);
  const visibleSelected = visibleIds.filter((userId) => selectedUserIds.has(userId)).length;
  const selected = selectedUserIds.size;
  selectedCount.textContent = `已选 ${selected} 位`;
  batchRemoveBtn.disabled = writing || dataBusy || visible.length === 0;
  batchRemoveBtn.textContent = visible.length ? `批量移除筛选结果（${visible.length}）` : "批量移除筛选结果";
  writeFeishuBtn.disabled = writing || selected === 0 || !activeTable;
  addTagBtn.disabled = writing || dataBusy || selected === 0;
  removeTagBtn.disabled = writing || dataBusy || selected === 0;
  customTagInput.disabled = writing || dataBusy;
  tagLibraryChips.querySelectorAll("button").forEach((button) => {
    button.disabled = writing || dataBusy || selected === 0;
  });
  clearBtn.disabled = writing || favorites.length === 0;
  selectAll.disabled = writing || visible.length === 0;
  selectAll.checked = visible.length > 0 && visibleSelected === visible.length;
  selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
  exportBtn.disabled = dataBusy || favorites.length === 0;
  importFile.disabled = dataBusy;
  ratingColumnInput.disabled = dataBusy;
  ratingDisplaySelect.disabled = dataBusy;
  customColumnsInput.disabled = dataBusy;
  onlineTableUrl.disabled = dataBusy;
  loadOnlineSheetsBtn.disabled = dataBusy;
  onlineTagColumn.disabled = dataBusy;
  onlineSheetSelectAll.disabled = dataBusy || onlineSheets.length === 0;
  onlineSheetOptions.querySelectorAll("input").forEach((input) => { input.disabled = dataBusy; });
  importOnlineBtn.disabled = dataBusy || selectedOnlineSheetIds().length === 0;
  const pendingCount = favorites.filter(needsDataRefresh).length;
  updatePendingBtn.disabled = dataBusy || pendingCount === 0;
  updatePendingBtn.textContent = pendingCount ? `更新未更新达人（${pendingCount}）` : "暂无未更新达人";
  updateAllBtn.disabled = dataBusy || favorites.length === 0;
  favoriteList.querySelectorAll('[data-action="update"]').forEach((button) => { button.disabled = dataBusy; });
}

function setDataBusy(value) {
  dataBusy = Boolean(value);
  updateSelectionState();
}

function showDataProgress(label, completed = 0, total = 0) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  dataProgress.hidden = false;
  dataProgressLabel.textContent = label;
  dataProgressValue.textContent = `${percentage}%`;
  dataProgressBar.value = percentage;
}

function hideDataProgress() {
  dataProgress.hidden = true;
  dataProgressBar.value = 0;
}

async function importFavoriteObjects(rows, sourceLabel, options = {}) {
  const imported = FavoriteDataTools.objectsToFavorites(rows, options);
  if (!imported.length) throw new Error("表格中没有识别到达人 ID，请检查“达人ID / 博主ID / 蒲公英主页”列。");
  const result = FavoriteDataTools.mergeFavorites(favorites, imported);
  await saveFavorites(result.items);
  setStatus(`${sourceLabel}完成：新增 ${result.added} 位，更新 ${result.updated} 位，共识别 ${imported.length} 位达人。`);
  return result;
}

function selectedOnlineSheetIds() {
  return Array.from(onlineSheetOptions.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
}

function updateOnlineSheetSelection() {
  const selectedCount = selectedOnlineSheetIds().length;
  onlineSheetSelectionCount.textContent = `已选 ${selectedCount} / ${onlineSheets.length} 个子表`;
  onlineSheetSelectAll.checked = onlineSheets.length > 0 && selectedCount === onlineSheets.length;
  onlineSheetSelectAll.indeterminate = selectedCount > 0 && selectedCount < onlineSheets.length;
  importOnlineBtn.disabled = dataBusy || selectedCount === 0;
}

function renderOnlineSheets(sheets, preferredId = "") {
  onlineSheets = Array.isArray(sheets) ? sheets : [];
  if (!onlineSheets.length) throw new Error("该在线表格没有可读取的子表。");
  const shouldSelectAll = !preferredId;
  onlineSheetOptions.innerHTML = onlineSheets.map((sheet) => {
    const checked = shouldSelectAll || sheet.id === preferredId ? " checked" : "";
    return `<label title="${escapeHtml(sheet.title || sheet.id)}"><input type="checkbox" value="${escapeHtml(sheet.id)}"${checked} /><span>${escapeHtml(sheet.title || sheet.id)}</span></label>`;
  }).join("");
  onlineSheetPicker.hidden = false;
  updateOnlineSheetSelection();
}

function resetOnlineSheets() {
  onlineSheets = [];
  inspectedOnlineTableUrl = "";
  onlineSheetOptions.innerHTML = "";
  onlineSheetPicker.hidden = true;
  onlineSheetSelectAll.checked = false;
  onlineSheetSelectAll.indeterminate = false;
}

async function loadOnlineSheets() {
  const url = String(onlineTableUrl.value || "").trim();
  if (!url) throw new Error("请先填写在线表格地址。");
  setDataBusy(true);
  showDataProgress("正在获取在线表格的子表清单...");
  try {
    const result = await chrome.runtime.sendMessage({ type: "LIST_ONLINE_CREATOR_TABLE_SHEETS", url });
    if (!result?.ok) throw new Error(result?.message || "子表清单读取失败");
    inspectedOnlineTableUrl = url;
    renderOnlineSheets(result.sheets, result.preferredId || "");
    setStatus(`已获取 ${result.sheets.length} 个子表，请勾选后导入。`);
  } finally {
    hideDataProgress();
    setDataBusy(false);
    updateOnlineSheetSelection();
  }
}

async function exportFavorites() {
  if (!favorites.length) throw new Error("达人库暂无可导出的数据。");
  setDataBusy(true);
  setStatus(`正在导出 ${favorites.length} 位达人...`);
  try {
    const rows = favorites.map(FavoriteDataTools.toExportRow);
    const timestamp = new Date().toISOString().replace(/[:T]/g, "-").replace(/\.\d{3}Z$/, "");
    const result = await chrome.runtime.sendMessage({
      type: "DOWNLOAD_FAVORITES_XLSX",
      rows,
      filename: `达人库-${timestamp}.xlsx`
    });
    if (!result?.ok) throw new Error(result?.message || "导出失败");
    setStatus(`已生成 ${favorites.length} 位达人的 Excel 表格。`);
  } finally {
    setDataBusy(false);
  }
}

async function importFavoriteFile(file) {
  if (!file) return;
  setDataBusy(true);
  showDataProgress(`正在读取 ${file.name}...`);
  try {
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    const matrix = isCsv
      ? FavoriteDataTools.parseCsv(await file.text())
      : await FavoriteDataTools.parseXlsx(file);
    const rows = FavoriteDataTools.matrixToObjects(matrix);
    const options = importFieldOptions();
    await saveImportFieldOptions();
    await importFavoriteObjects(rows, `导入 ${file.name}`, {
      ...options,
      acquisitionSource: {
        key: `file:${file.name}`,
        type: "local_spreadsheet",
        label: `本地表格 · ${file.name}`,
        acquiredAt: new Date().toISOString()
      }
    });
  } finally {
    importFile.value = "";
    hideDataProgress();
    setDataBusy(false);
  }
}

async function importOnlineTable() {
  const url = String(onlineTableUrl.value || "").trim();
  if (!url) throw new Error("请先填写在线表格地址。");
  if (url !== inspectedOnlineTableUrl) throw new Error("在线表格地址已变化，请重新获取子表。");
  const sheetIds = selectedOnlineSheetIds();
  if (!sheetIds.length) throw new Error("请至少选择一个子表。");
  const customTagColumn = String(onlineTagColumn.value || "").trim();
  const fieldOptions = importFieldOptions();
  setDataBusy(true);
  showDataProgress(`正在读取 ${sheetIds.length} 个子表...`);
  try {
    const result = await chrome.runtime.sendMessage({ type: "READ_ONLINE_CREATOR_TABLE", url, sheetIds });
    if (!result?.ok) throw new Error(result?.message || "在线表格读取失败");
    const rows = (Array.isArray(result.datasets) ? result.datasets : []).flatMap((dataset) => {
      const datasetRows = Array.isArray(dataset.rows)
        ? dataset.rows
        : FavoriteDataTools.matrixToObjects(Array.isArray(dataset.matrix) ? dataset.matrix : FavoriteDataTools.parseCsv(dataset.csv || ""));
      const acquisitionSource = {
        key: `online:${url}:${dataset.id || dataset.title || "default"}`,
        type: result.source || "online_spreadsheet",
        label: `${result.source || "在线表格"} · ${dataset.title || dataset.id || "当前表格"}`,
        resourceId: String(dataset.id || ""),
        url,
        acquiredAt: new Date().toISOString()
      };
      return datasetRows.map((row) => ({ ...row, __favoriteAcquisitionSource: acquisitionSource }));
    });
    await chrome.storage.local.set({ favoriteOnlineTableUrl: url, favoriteOnlineTagColumn: customTagColumn });
    await saveImportFieldOptions();
    await importFavoriteObjects(rows, `在线表格导入（${sheetIds.length} 个子表）`, { customTagColumn, ...fieldOptions });
  } finally {
    hideDataProgress();
    setDataBusy(false);
  }
}

function needsDataRefresh(item) {
  return !String(item?.lastDataRefreshAt || item?.quoteFetchedAt || "").trim();
}

async function refreshFavorites(targets, label) {
  const targetItems = Array.isArray(targets) ? targets.filter((item) => item?.userId) : [];
  if (!targetItems.length) throw new Error("没有需要更新的达人。");
  setDataBusy(true);
  showDataProgress(`准备${label} ${targetItems.length} 位达人...`, 0, targetItems.length);
  setStatus(`正在${label}的最新头像、粉丝量、赞藏与报价，请保持蒲公英登录状态。`);
  try {
    const result = await chrome.runtime.sendMessage({
      type: "REFRESH_ALL_PREFAVORITES",
      userIds: targetItems.map((item) => item.userId)
    });
    if (!result?.ok) throw new Error(result?.message || "达人信息更新失败");
    await loadFavorites();
    setStatus(`${label}完成：成功 ${result.completed} 位，失败 ${result.failed} 位。${result.failed ? "失败达人已保留原数据并标记原因。" : ""}`, result.failed > 0);
  } finally {
    hideDataProgress();
    setDataBusy(false);
  }
}

async function updateAllFavorites() {
  if (!favorites.length) throw new Error("达人库暂无可更新的数据。");
  return refreshFavorites(favorites, "更新全部达人");
}

async function updatePendingFavorites() {
  const pendingFavorites = favorites.filter(needsDataRefresh);
  if (!pendingFavorites.length) throw new Error("当前没有未更新数据的达人。");
  return refreshFavorites(pendingFavorites, "更新未更新达人");
}

async function updateFavorite(userId) {
  const favorite = favorites.find((item) => item.userId === userId);
  if (!favorite) throw new Error("没有找到该达人。");
  return refreshFavorites([favorite], `更新「${favorite.name || favorite.userId}」`);
}

async function loadFavorites() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [], [TAG_LIBRARY_KEY]: [] });
  favorites = normalizeFavorites(stored[STORAGE_KEY]);
  tagLibrary = normalizeTagList([
    ...normalizeTagList(stored[TAG_LIBRARY_KEY]),
    ...favorites.flatMap((item) => item.customTags || [])
  ], 200);
  renderFavorites();
}

async function saveFavorites(nextFavorites) {
  favorites = normalizeFavorites(nextFavorites);
  tagLibrary = normalizeTagList([
    ...tagLibrary,
    ...favorites.flatMap((item) => item.customTags || [])
  ], 200);
  await chrome.storage.local.set({ [STORAGE_KEY]: favorites, [TAG_LIBRARY_KEY]: tagLibrary });
  renderFavorites();
}

function renderEmpty() {
  favoriteList.innerHTML = `
    <div class="empty">
      ${favorites.length ? "当前筛选条件下没有匹配的达人。" : "还没有预收藏达人。从小红书或蒲公英达人主页点击“预收藏”后，会出现在这里。"}
    </div>
  `;
}

function renderFavorites() {
  renderFeishuStatusOptions();
  renderAcquisitionOptions();
  renderCustomFieldFilters();
  renderActiveFilters();
  renderCategoryFilters();
  renderTagFilters();
  const visibleFavorites = filteredFavorites();
  favoriteCount.textContent = String(favorites.length);
  updateSelectionState();

  if (!visibleFavorites.length) {
    renderEmpty();
    setStatus(favorites.length ? `共 ${favorites.length} 位预收藏达人，当前筛选无结果。` : "当前没有预收藏达人。");
    return;
  }

  favoriteList.innerHTML = visibleFavorites.map((item) => {
    const name = item.name || item.userId;
    const avatar = normalizeAvatarUrl(item.avatar);
    const initial = avatarInitial(name);
    const pgyUrl = item.pgyUrl || `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${encodeURIComponent(item.userId)}`;
    const xhsUrl = item.xhsUrl || `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(item.userId)}`;
    const categoryTags = (item.categoryTags || []).length ? item.categoryTags : ["未分类"];
    const customTags = item.customTags || [];
    const performance = cooperationMetricValues(item);
    const quoteStatus = item.quoteStatus || (!item.picturePriceText && !item.videoPriceText ? "报价待补充" : "");
    const dataRefreshAt = item.lastDataRefreshAt || item.quoteFetchedAt || "";
    const dataStatusHtml = dataRefreshAt
      ? `<span class="data-status is-updated">数据已更新 · ${escapeHtml(formatTime(dataRefreshAt))}</span>`
      : `<span class="data-status is-pending">数据未更新</span>`;
    const writeHistory = item.feishuWriteHistory || [];
    const acquisitionSources = item.acquisitionSources || [];
    const writeHistoryHtml = writeHistory.length ? `
      <div class="write-history">
        <span class="write-history-label">已写入</span>
        ${writeHistory.map((entry) => `<span class="write-history-item" title="${escapeHtml(`${entry.label}${entry.writtenAt ? ` · ${formatTime(entry.writtenAt)}` : ""}`)}">${escapeHtml(entry.label)}</span>`).join("")}
      </div>
    ` : "";
    const acquisitionHtml = acquisitionSources.length ? `
      <div class="write-history acquisition-history">
        <span class="write-history-label">获取自</span>
        ${acquisitionSources.map((entry) => `<span class="write-history-item" title="${escapeHtml(`${entry.label}${entry.acquiredAt ? ` · ${formatTime(entry.acquiredAt)}` : ""}`)}">${escapeHtml(entry.label)}</span>`).join("")}
      </div>
    ` : "";
    const customFieldEntries = Object.entries(item.customFields || {}).filter(([, value]) => String(value || "").trim());
    const customDataHtml = customFieldEntries.length ? `
      <div class="custom-data-strip">
        ${customFieldEntries.map(([fieldName, value]) => `
          <div class="custom-data-item" title="${escapeHtml(`${fieldName}：${value}`)}">
            <span>${escapeHtml(fieldName)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join("")}
      </div>
    ` : "";
    return `
      <article class="favorite-card" data-user-id="${escapeHtml(item.userId)}">
        <input class="favorite-select" type="checkbox" aria-label="选择 ${escapeHtml(name)}" ${selectedUserIds.has(item.userId) ? "checked" : ""} />
        <div class="favorite-avatar" aria-hidden="true">
          <span>${escapeHtml(initial)}</span>
          ${avatar ? `<img src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer" />` : ""}
        </div>
        <div class="favorite-info">
          <div class="headline">
            <a class="profile-link nickname-link" href="${escapeHtml(pgyUrl)}" target="_blank" rel="noopener" title="打开 ${escapeHtml(name)} 的蒲公英主页">${escapeHtml(name)}</a>
            <button type="button" class="headline-rating ${item.rating ? "has-rating" : ""}" data-action="edit-rating" title="${escapeHtml(item.rating?.columnName || ratingColumnInput.value || "达人评分")}，点击设置 0-5 分">${escapeHtml(headlineRatingText(item.rating))}</button>
            <div class="tag-list">${categoryTags.map((tag) => `<span class="tag category-tag">${escapeHtml(tag)}</span>`).join("")}</div>
          </div>
          <div class="custom-tag-list">
            <span class="custom-tag-label">标签</span>
            ${customTags.length
              ? customTags.map((tag) => `<span class="tag custom-tag">${escapeHtml(tag)}</span>`).join("")
              : `<span class="no-custom-tag">未设置</span>`}
            <button type="button" class="tag-add-button" data-action="add-tag" title="添加标签" aria-label="为 ${escapeHtml(name)} 添加标签">+</button>
          </div>
          <div class="profile-data">
            <a class="profile-link red-id-link" href="${escapeHtml(xhsUrl)}" target="_blank" rel="noopener" title="打开 ${escapeHtml(name)} 的小红书主页">红书号：${escapeHtml(item.redId || item.userId)}</a>
            ${item.location ? `<span>${escapeHtml(item.location)}</span>` : ""}
          </div>
          <div class="metrics-row">
            <div class="key-metrics">
              <div><span>粉丝</span><strong>${escapeHtml(item.followersText || "-")}</strong></div>
              <div><span>图文报价</span><strong>${escapeHtml(item.picturePriceText || "待补充")}</strong></div>
              <div><span>视频报价</span><strong>${escapeHtml(item.videoPriceText || "待补充")}</strong></div>
            </div>
            <div class="cooperation-metrics" title="CPM / CPE 优先使用已有数据；缺失时按图文报价（无图文则视频报价）在本地计算，不增加抓取时间。">
              <div><span>合作曝光</span><strong>${compactMetricText(performance.exposure)}</strong></div>
              <div><span>合作阅读</span><strong>${compactMetricText(performance.read)}</strong></div>
              <div><span>合作互动</span><strong>${compactMetricText(performance.interaction)}</strong></div>
              <div><span>CPM</span><strong>${costMetricText(performance.cpm)}</strong></div>
              <div><span>CPE</span><strong>${costMetricText(performance.cpe)}</strong></div>
            </div>
          </div>
          ${customDataHtml}
          ${item.bio ? `<div class="bio">${escapeHtml(item.bio)}</div>` : ""}
          ${acquisitionHtml}
          ${writeHistoryHtml}
          <div class="meta">${dataStatusHtml}<span>${escapeHtml(item.status || "预收藏")} · 入库 ${escapeHtml(formatTime(item.createdAt))}${quoteStatus ? ` · ${escapeHtml(quoteStatus)}` : ""}</span></div>
        </div>
        <div class="card-actions">
          <button type="button" data-action="update" ${dataBusy ? "disabled" : ""}>更新数据</button>
          <button type="button" data-action="edit-tags">编辑标签</button>
          <a class="button" href="${escapeHtml(xhsUrl)}" target="_blank" rel="noopener">小红书主页</a>
          <a class="button primary" href="${escapeHtml(pgyUrl)}" target="_blank" rel="noopener">蒲公英详情</a>
          <button type="button" class="danger" data-action="remove">移除</button>
        </div>
      </article>
    `;
  }).join("");
  activateAvatarFallbacks();
  setStatus(`共 ${favorites.length} 位预收藏达人，当前显示 ${visibleFavorites.length} 位。`);
}

async function removeFavorite(userId) {
  selectedUserIds.delete(userId);
  await saveFavorites(favorites.filter((item) => item.userId !== userId));
  setStatus("已移除该预收藏达人。");
}

async function removeFilteredFavorites() {
  const targets = filteredFavorites();
  if (!targets.length) return;
  const targetIds = new Set(targets.map((item) => item.userId));
  const removingAll = targetIds.size === favorites.length;
  const message = removingAll
    ? `当前筛选结果包含全部 ${targetIds.size} 位达人，确定全部移除吗？`
    : `确定移除当前筛选结果中的 ${targetIds.size} 位达人吗？`;
  if (!window.confirm(message)) return;
  targetIds.forEach((userId) => selectedUserIds.delete(userId));
  await saveFavorites(favorites.filter((item) => !targetIds.has(item.userId)));
  setStatus(`已批量移除 ${targetIds.size} 位达人。`);
}

async function clearFavorites() {
  if (!favorites.length) return;
  const confirmed = window.confirm(`确定清空 ${favorites.length} 位预收藏达人吗？`);
  if (!confirmed) return;
  selectedUserIds.clear();
  await saveFavorites([]);
  setStatus("已清空预收藏。");
}

async function editFavoriteRating(userId) {
  const item = favorites.find((favorite) => favorite.userId === userId);
  if (!item) return;
  const value = window.prompt("设置达人评分（0-5，支持 0.5 分；清空表示移除评分）", item.rating?.value ?? "");
  if (value === null) return;
  const text = String(value).trim();
  const rating = text === "" ? null : normalizeRating({
    value: Number(text),
    display: ratingDisplaySelect.value,
    columnName: ratingColumnInput.value || item.rating?.columnName || "达人评分"
  });
  if (text && (!rating || Number(text) < 0 || Number(text) > 5)) throw new Error("评分必须是 0-5 之间的数字。");
  await saveImportFieldOptions();
  await saveFavorites(favorites.map((favorite) => favorite.userId === userId
    ? { ...favorite, rating, updatedAt: new Date().toISOString() }
    : favorite));
  setStatus(rating ? `已将 ${item.name || userId} 评分设为 ${ratingDisplayText(rating)}。` : `已移除 ${item.name || userId} 的评分。`);
}

function selectedFavorites() {
  return favorites.filter((item) => selectedUserIds.has(item.userId));
}

async function applyTagsToSelected(mode, providedTags = null) {
  const tags = normalizeTagList(providedTags || customTagInput.value);
  if (!tags.length) throw new Error("请输入至少一个标签。");
  if (!selectedUserIds.size) throw new Error("请先勾选要分配标签的达人。");
  const selected = new Set(selectedUserIds);
  if (mode !== "remove") tagLibrary = normalizeTagList([...tagLibrary, ...tags], 200);
  const next = favorites.map((item) => {
    if (!selected.has(item.userId)) return item;
    const current = item.customTags || [];
    return {
      ...item,
      customTags: mode === "remove"
        ? current.filter((tag) => !tags.includes(tag))
        : Array.from(new Set([...current, ...tags])),
      updatedAt: new Date().toISOString()
    };
  });
  await saveFavorites(next);
  customTagInput.value = "";
  setStatus(`已为 ${selected.size} 位达人${mode === "remove" ? "移除" : "添加"}标签：${tags.join("、")}。`);
}

async function editFavoriteTags(userId) {
  const item = favorites.find((favorite) => favorite.userId === userId);
  if (!item) return;
  const value = window.prompt("编辑达人标签（多个标签可用逗号或顿号分隔，清空表示移除全部标签）", (item.customTags || []).join("、"));
  if (value === null) return;
  const customTags = normalizeTagList(value);
  tagLibrary = normalizeTagList([...tagLibrary, ...customTags], 200);
  await saveFavorites(favorites.map((favorite) => favorite.userId === userId
    ? { ...favorite, customTags, updatedAt: new Date().toISOString() }
    : favorite));
  setStatus(`已更新「${item.name || item.userId}」的标签。`);
}

function tagPickerItem() {
  return favorites.find((favorite) => favorite.userId === tagPickerUserId) || null;
}

function tagPickerPendingTags() {
  const assignedTags = new Set(tagPickerItem()?.customTags || []);
  return normalizeTagList([...tagPickerSelectedTags, ...normalizeTagList(tagPickerNewInput.value)], 30)
    .filter((tag) => !assignedTags.has(tag));
}

function renderTagPicker() {
  const item = tagPickerItem();
  if (!item) return;
  const assignedTags = new Set(item.customTags || []);
  const availableTags = normalizeTagList([...tagLibrary, ...assignedTags], 200);
  tagPickerExistingTags.innerHTML = availableTags.length
    ? availableTags.map((tag) => {
        const assigned = assignedTags.has(tag);
        const selected = tagPickerSelectedTags.has(tag);
        return `<button type="button" class="${assigned ? "is-assigned" : selected ? "is-selected" : ""}" data-picker-tag="${escapeHtml(tag)}" ${assigned ? "disabled" : ""}><span>${escapeHtml(tag)}</span><b>${assigned ? "已添加" : selected ? "✓" : "+"}</b></button>`;
      }).join("")
    : `<p class="tag-picker-empty">标签库还是空的，可以直接在下方创建第一个标签。</p>`;
  const pendingTags = tagPickerPendingTags();
  tagPickerSelection.textContent = pendingTags.length ? `本次将添加：${pendingTags.join("、")}` : "暂未选择标签";
  saveTagPickerBtn.disabled = pendingTags.length === 0;
}

function openTagPicker(userId) {
  const item = favorites.find((favorite) => favorite.userId === userId);
  if (!item) return;
  tagPickerUserId = userId;
  tagPickerSelectedTags = new Set();
  tagPickerNewInput.value = "";
  tagPickerCreator.textContent = `正在为「${item.name || item.userId}」添加标签。`;
  tagPickerError.hidden = true;
  tagPickerError.textContent = "";
  renderTagPicker();
  tagPickerDialog.showModal();
}

function closeTagPicker() {
  if (tagPickerDialog.open) tagPickerDialog.close();
  tagPickerUserId = "";
  tagPickerSelectedTags = new Set();
}

async function saveTagPicker() {
  const item = tagPickerItem();
  if (!item) return;
  const userId = item.userId;
  const addedTags = tagPickerPendingTags();
  if (!addedTags.length) throw new Error("请输入至少一个标签。");
  const customTags = Array.from(new Set([...(item.customTags || []), ...addedTags]));
  tagLibrary = normalizeTagList([...tagLibrary, ...addedTags], 200);
  await saveFavorites(favorites.map((favorite) => favorite.userId === userId
    ? { ...favorite, customTags, updatedAt: new Date().toISOString() }
    : favorite));
  closeTagPicker();
  setStatus(`已为「${item.name || item.userId}」添加标签：${addedTags.join("、")}。`);
}

function favoriteToFeishuRow(item) {
  const pgyUrl = item.pgyUrl || `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${encodeURIComponent(item.userId)}`;
  const xhsUrl = item.xhsUrl || `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(item.userId)}`;
  const collectedAt = item.createdAt || new Date().toISOString();
  const performance = cooperationMetricValues(item);
  const followersCount = parsePriceValue(item.followersCount ?? item.followersText);
  const followersInWan = followersCount === null ? "" : Math.round((followersCount / 10000) * 10000) / 10000;
  const extraFields = { ...(item.customFields || {}) };
  if (item.rating) extraFields[item.rating.columnName || "达人评分"] = item.rating.value;
  return {
    "达人ID": `pgy-api:${item.userId}`,
    "达人昵称": item.name || "",
    "达人名称": item.name || "",
    "小红书号": item.redId || "",
    "蒲公英链接": pgyUrl,
    "主页链接": xhsUrl,
    "粉丝数": followersCount ?? (item.followersText || ""),
    "粉丝量": followersCount ?? (item.followersText || ""),
    "粉丝数w": followersInWan,
    "粉丝数（万）": followersInWan,
    "获赞与收藏": item.likesText || "",
    "图文报价": item.picturePriceText || "",
    "视频报价": item.videoPriceText || "",
    "CPM": performance.cpm ?? "",
    "CPE": performance.cpe ?? "",
    "标签": (item.customTags || []).join("、"),
    "达人标签": (item.customTags || []).join("、"),
    "自定义标签": (item.customTags || []).join("、"),
    "曝光中位数（合作）": item.cooperationExposureMedian || "",
    "阅读中位数（合作）": item.cooperationReadMedian || "",
    "互动中位数（合作）": item.cooperationInteractionMedian || "",
    "已合作笔记数": item.cooperationNoteCount || "",
    "账号类型": (item.categoryTags || []).join("、"),
    "内容类目": (item.categoryTags || []).join("、"),
    "IP城市": item.location || "",
    "数据来源": "xhs_profile_prefavorite",
    "采集时间": formatTime(collectedAt),
    "详情补采状态": item.status || "预收藏",
    "个人简介": item.bio || "",
    "详情补采备注": "来自小红书达人主页预收藏",
    "蒲公英原始JSON": JSON.stringify(item),
    ...extraFields
  };
}

async function syncSelectedToFeishu() {
  const targets = selectedFavorites();
  if (!targets.length) throw new Error("请先勾选要写入飞书的达人。");
  const options = await chrome.storage.local.get({
    feishuAppId: "",
    feishuAppSecret: "",
    syncUpdateExisting: false,
    syncUseFirstSheet: false
  });
  if (!activeTable) throw new Error("请先选择要写入的已配置飞书表格。");
  options.feishuUrl = activeTable.url;
  options.feishuSheetId = activeTable.sheetId || "";
  options.forceTagColumn = true;
  options.customFieldNames = Array.from(new Set(targets.flatMap((item) => [
    ...Object.keys(item.customFields || {}),
    ...(item.rating ? [item.rating.columnName || "达人评分"] : [])
  ])));
  if (!options.feishuAppId || !options.feishuAppSecret) {
    throw new Error("请先在飞书配置页填写 App ID 和 App Secret。");
  }

  const validation = await chrome.runtime.sendMessage({ type: "VALIDATE_FEISHU_SYNC_TARGET", options });
  if (!validation?.ok) throw new Error(validation?.message || "目标飞书表格检测失败");
  options.collectionMode = validation.collectionMode === "detail" ? "detail" : "fast";
  options.detailCaptureFansScreenshot = Boolean(validation.detailCaptureFansScreenshot);
  options.detailCaptureNoteScreenshot = Boolean(validation.detailCaptureNoteScreenshot);

  writing = true;
  updateSelectionState();
  const targetLabel = activeTableLabel();
  setStatus(`正在按目标表要求准备 ${targets.length} 位预收藏达人...`);
  try {
    let rows = targets.map(favoriteToFeishuRow);
    if (options.collectionMode === "detail") {
      setStatus(`目标表需要详情数据，正在补采 ${rows.length} 位预收藏达人...`);
      const enrichment = await chrome.runtime.sendMessage({ type: "ENRICH_ROWS_WITH_DETAILS", rows, options });
      if (!enrichment?.ok) throw new Error(enrichment?.message || "预收藏达人详情补采失败");
      rows = Array.isArray(enrichment.rows) ? enrichment.rows : rows;
    }
    setStatus(`正在写入 ${rows.length} 位预收藏达人到「${targetLabel}」...`);
    const result = await chrome.runtime.sendMessage({ type: "SYNC_FEISHU_DIRECT", rows, options });
    if (!result?.ok) throw new Error(result?.message || "写入飞书失败");
    const now = new Date().toISOString();
    const targetIds = new Set(targets.map((item) => item.userId));
    await saveFavorites(favorites.map((item) => targetIds.has(item.userId)
      ? {
          ...item,
          status: "已写入飞书",
          updatedAt: now,
          feishuWriteHistory: [
            ...(item.feishuWriteHistory || []).filter((entry) => entry.key !== configuredTableValue(activeTable)),
            {
              key: configuredTableValue(activeTable),
              url: activeTable.url,
              sheetId: activeTable.sheetId || "",
              label: targetLabel,
              writtenAt: now
            }
          ]
        }
      : item
    ));
    const parts = [];
    if (result.appendedCount !== undefined) parts.push(`新增 ${result.appendedCount}`);
    if (result.updatedCount !== undefined) parts.push(`更新 ${result.updatedCount}`);
    if (result.skippedCount !== undefined) parts.push(`跳过 ${result.skippedCount}`);
    setStatus(`已写入「${targetLabel}」：${parts.length ? parts.join("，") : `处理 ${targets.length}`}。`);
  } finally {
    writing = false;
    updateSelectionState();
  }
}

favoriteList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const card = button.closest(".favorite-card");
  const userId = card?.dataset?.userId || "";
  if (!userId) return;
  if (button.dataset.action === "edit-tags") {
    editFavoriteTags(userId).catch((error) => setStatus(error.message, true));
    return;
  }
  if (button.dataset.action === "add-tag") {
    openTagPicker(userId);
    return;
  }
  if (button.dataset.action === "edit-rating") {
    editFavoriteRating(userId).catch((error) => setStatus(error.message, true));
    return;
  }
  if (button.dataset.action === "update") {
    updateFavorite(userId).catch((error) => setStatus(error.message, true));
    return;
  }
  if (button.dataset.action === "remove") {
    removeFavorite(userId).catch((error) => setStatus(error.message, true));
  }
});

favoriteList.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".favorite-select");
  if (!checkbox) return;
  const userId = checkbox.closest(".favorite-card")?.dataset?.userId || "";
  if (!userId) return;
  if (checkbox.checked) selectedUserIds.add(userId);
  else selectedUserIds.delete(userId);
  updateSelectionState();
});

tagPickerExistingTags.addEventListener("click", (event) => {
  const button = event.target.closest("[data-picker-tag]");
  if (!button || button.disabled) return;
  const tag = button.dataset.pickerTag || "";
  if (!tag) return;
  if (tagPickerSelectedTags.has(tag)) tagPickerSelectedTags.delete(tag);
  else tagPickerSelectedTags.add(tag);
  renderTagPicker();
});

tagPickerNewInput.addEventListener("input", () => {
  tagPickerError.hidden = true;
  renderTagPicker();
});

tagPickerNewInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  saveTagPicker().catch((error) => {
    tagPickerError.textContent = error.message;
    tagPickerError.hidden = false;
  });
});

closeTagPickerBtn.addEventListener("click", closeTagPicker);
cancelTagPickerBtn.addEventListener("click", closeTagPicker);
saveTagPickerBtn.addEventListener("click", () => saveTagPicker().catch((error) => {
  tagPickerError.textContent = error.message;
  tagPickerError.hidden = false;
}));
tagPickerDialog.addEventListener("click", (event) => {
  if (event.target === tagPickerDialog) closeTagPicker();
});
tagPickerDialog.addEventListener("close", () => {
  tagPickerUserId = "";
  tagPickerSelectedTags = new Set();
});

selectAll.addEventListener("change", () => {
  const visibleIds = filteredFavorites().map((item) => item.userId);
  if (selectAll.checked) {
    selectedUserIds = new Set([...Array.from(selectedUserIds), ...visibleIds]);
  } else {
    const visibleSet = new Set(visibleIds);
    selectedUserIds = new Set(Array.from(selectedUserIds).filter((userId) => !visibleSet.has(userId)));
  }
  renderFavorites();
});

searchInput.addEventListener("input", renderFavorites);
statusFilter.addEventListener("change", renderFavorites);
acquisitionFilter.addEventListener("change", renderFavorites);
priceTypeFilter.addEventListener("change", renderFavorites);
priceMinInput.addEventListener("input", renderFavorites);
priceMaxInput.addEventListener("input", renderFavorites);
clearPriceFilterBtn.addEventListener("click", () => {
  priceTypeFilter.value = "any";
  priceMinInput.value = "";
  priceMaxInput.value = "";
  renderFavorites();
});
performanceSort.addEventListener("change", renderFavorites);
ratingMinInput.addEventListener("input", renderFavorites);
ratingMaxInput.addEventListener("input", renderFavorites);
customFieldFilters.addEventListener("input", (event) => {
  const input = event.target.closest("[data-custom-field-filter]");
  if (!input) return;
  const fieldName = input.dataset.customFieldFilter || "";
  const cursor = input.selectionStart;
  if (input.value) customFieldFilterValues.set(fieldName, input.value);
  else customFieldFilterValues.delete(fieldName);
  renderFavorites();
  const nextInput = Array.from(customFieldFilters.querySelectorAll("[data-custom-field-filter]"))
    .find((item) => item.dataset.customFieldFilter === fieldName);
  nextInput?.focus();
  if (nextInput && cursor !== null) nextInput.setSelectionRange(cursor, cursor);
});
clearCustomDataFiltersBtn.addEventListener("click", () => {
  ratingMinInput.value = "";
  ratingMaxInput.value = "";
  customFieldFilterValues.clear();
  renderFavorites();
});
performanceRangeFields.forEach(([, minimumInput, maximumInput]) => {
  minimumInput.addEventListener("input", renderFavorites);
  maximumInput.addEventListener("input", renderFavorites);
});
clearPerformanceFiltersBtn.addEventListener("click", () => {
  performanceRangeFields.forEach(([, minimumInput, maximumInput]) => {
    minimumInput.value = "";
    maximumInput.value = "";
  });
  renderFavorites();
});
performancePresetButtons.forEach((button) => button.addEventListener("click", () => {
  const preset = button.dataset.performancePreset;
  if (preset === "high-read") cooperationReadMin.value = "1万";
  else if (preset === "high-interaction") cooperationInteractionMin.value = "500";
  else if (preset === "low-cpm") cpmMax.value = "80";
  else if (preset === "low-cpe") cpeMax.value = "3";
  renderFavorites();
}));
activeFilterBar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-clear-filter]");
  if (!button) return;
  clearFilter(button.dataset.clearFilter || "");
  renderFavorites();
});
clearAllFiltersBtn.addEventListener("click", clearAllFilters);

categoryFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category || "";
  renderFavorites();
});

tagFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag]");
  if (!button) return;
  activeTag = button.dataset.tag || "";
  renderFavorites();
});

tagLibraryChips.addEventListener("click", (event) => {
  const button = event.target.closest("[data-library-tag]");
  if (!button) return;
  const tag = button.dataset.libraryTag || "";
  customTagInput.value = tag;
  applyTagsToSelected("add", [tag]).catch((error) => setStatus(error.message, true));
});

addTagBtn.addEventListener("click", () => applyTagsToSelected("add").catch((error) => setStatus(error.message, true)));
removeTagBtn.addEventListener("click", () => applyTagsToSelected("remove").catch((error) => setStatus(error.message, true)));
customTagInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  applyTagsToSelected("add").catch((error) => setStatus(error.message, true));
});

writeFeishuBtn.addEventListener("click", () => syncSelectedToFeishu().catch((error) => {
  writing = false;
  updateSelectionState();
  setStatus(error.message, true);
}));
favoriteConfiguredTable.addEventListener("change", () => applyConfiguredTableSelection().catch((error) => setStatus(error.message, true)));
refreshFeishuConfigsBtn.addEventListener("click", () => refreshConfiguredTables().catch((error) => setStatus(error.message, true)));
manageFeishuConfigsBtn.addEventListener("click", () => openFeishuConfigPage().catch((error) => setStatus(error.message, true)));

refreshBtn.addEventListener("click", () => loadFavorites().catch((error) => setStatus(error.message, true)));
clearBtn.addEventListener("click", () => clearFavorites().catch((error) => setStatus(error.message, true)));
batchRemoveBtn.addEventListener("click", () => removeFilteredFavorites().catch((error) => setStatus(error.message, true)));
exportBtn.addEventListener("click", () => exportFavorites().catch((error) => setStatus(error.message, true)));
importFile.addEventListener("change", () => importFavoriteFile(importFile.files?.[0]).catch((error) => setStatus(error.message, true)));
ratingColumnInput.addEventListener("change", () => saveImportFieldOptions().catch((error) => setStatus(error.message, true)));
ratingDisplaySelect.addEventListener("change", () => {
  saveImportFieldOptions()
    .then(() => saveFavorites(favorites.map((item) => item.rating ? { ...item, rating: { ...item.rating, display: ratingDisplaySelect.value } } : item)))
    .catch((error) => setStatus(error.message, true));
});
customColumnsInput.addEventListener("change", () => saveImportFieldOptions().then(renderFavorites).catch((error) => setStatus(error.message, true)));
loadOnlineSheetsBtn.addEventListener("click", () => loadOnlineSheets().catch((error) => setStatus(error.message, true)));
importOnlineBtn.addEventListener("click", () => importOnlineTable().catch((error) => setStatus(error.message, true)));
onlineTableUrl.addEventListener("input", resetOnlineSheets);
onlineSheetSelectAll.addEventListener("change", () => {
  onlineSheetOptions.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = onlineSheetSelectAll.checked; });
  updateOnlineSheetSelection();
});
onlineSheetOptions.addEventListener("change", updateOnlineSheetSelection);
updatePendingBtn.addEventListener("click", () => updatePendingFavorites().catch((error) => setStatus(error.message, true)));
updateAllBtn.addEventListener("click", () => updateAllFavorites().catch((error) => setStatus(error.message, true)));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[STORAGE_KEY]) {
    favorites = normalizeFavorites(changes[STORAGE_KEY].newValue);
    renderFavorites();
  }
  if (changes[TAG_LIBRARY_KEY]) {
    tagLibrary = normalizeTagList(changes[TAG_LIBRARY_KEY].newValue, 200);
    renderFavorites();
  }
  if (changes.feishuTableConfigs) {
    loadConfiguredTables({ announce: true }).catch((error) => setStatus(error.message, true));
  }
  if (changes.pgyPreFavoriteRefreshProgress?.newValue) {
    const progress = changes.pgyPreFavoriteRefreshProgress.newValue;
    if (progress.running) {
      showDataProgress(
        `正在更新 ${progress.currentName || progress.currentUserId || "达人"}（成功 ${progress.completed || 0}，失败 ${progress.failed || 0}）`,
        (progress.completed || 0) + (progress.failed || 0),
        progress.total || favorites.length
      );
    }
  }
});

chrome.storage.local.get({
  favoriteOnlineTableUrl: "",
  favoriteOnlineTagColumn: "",
  favoriteRatingColumn: "达人评分",
  favoriteRatingDisplay: "stars",
  favoriteCustomColumns: []
}).then((stored) => {
  onlineTableUrl.value = stored.favoriteOnlineTableUrl || "";
  onlineTagColumn.value = stored.favoriteOnlineTagColumn || "";
  ratingColumnInput.value = stored.favoriteRatingColumn || "达人评分";
  ratingDisplaySelect.value = stored.favoriteRatingDisplay === "score" ? "score" : "stars";
  customColumnsInput.value = normalizeCustomColumnNames(stored.favoriteCustomColumns).join("、");
  renderFavorites();
}).catch(() => null);

Promise.all([loadFavorites(), loadConfiguredTables()]).catch((error) => setStatus(error.message, true));
