const STORAGE_KEY = "pgyPreFavorites";
const TAG_LIBRARY_KEY = "pgyPreFavoriteTagLibrary";
const DEFAULT_CUSTOM_COLUMNS = ["返点比例", "达人评价", "合作备注"];
const RATING_FIELD_ALIASES = new Set(["达人评分", "达人评价", "评分", "星级", "达人星级"]);
const LATEST_NOTE_LINK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CUSTOM_COLUMNS_INITIALIZED_KEY = "favoriteCustomColumnsInitialized";

const favoriteCount = document.getElementById("favoriteCount");
const favoriteList = document.getElementById("favoriteList");
const statusNode = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const clearBtn = document.getElementById("clearBtn");
const selectAll = document.getElementById("selectAll");
const selectedCount = document.getElementById("selectedCount");
const writePanel = document.getElementById("writePanel");
const closeWritePanelBtn = document.getElementById("closeWritePanelBtn");
const openWritePanelBtn = document.getElementById("openWritePanelBtn");
const writeFeishuBtn = document.getElementById("writeFeishuBtn");
const favoriteConfiguredTable = document.getElementById("favoriteConfiguredTable");
const activeWriteTarget = document.getElementById("activeWriteTarget");
const stickyWriteTarget = document.getElementById("stickyWriteTarget");
const refreshFeishuConfigsBtn = document.getElementById("refreshFeishuConfigsBtn");
const manageFeishuConfigsBtn = document.getElementById("manageFeishuConfigsBtn");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const acquisitionFilter = document.getElementById("acquisitionFilter");
const latestNoteFilter = document.getElementById("latestNoteFilter");
const quickStatusFilter = document.getElementById("quickStatusFilter");
const quickAcquisitionFilter = document.getElementById("quickAcquisitionFilter");
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
const selectUntaggedBtn = document.getElementById("selectUntaggedBtn");
const addTagBtn = document.getElementById("addTagBtn");
const tagLibraryChips = document.getElementById("tagLibraryChips");
const TAG_LIBRARY_VISIBLE_LIMIT = 12;
const exportBtn = document.getElementById("exportBtn");
const importFile = document.getElementById("importFile");
const ratingColumnInput = document.getElementById("ratingColumnInput");
const ratingDisplaySelect = document.getElementById("ratingDisplaySelect");
const customColumnInputs = Array.from(document.querySelectorAll("[data-custom-column-input]"));
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

function configuredCustomColumnNames() {
  return normalizeCustomColumnNames(customColumnInputs.map((input) => input.value)).slice(0, 3);
}

function hasCustomFieldValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function normalizeCustomFields(item) {
  const configuredFields = Object.fromEntries(configuredCustomColumnNames()
    .filter((fieldName) => hasCustomFieldValue(item?.[fieldName]))
    .map((fieldName) => [fieldName, item[fieldName]]));
  return Object.fromEntries(Object.entries({ ...configuredFields, ...(item?.customFields || {}) })
    .map(([key, value]) => [String(key || "").trim(), String(value ?? "").trim()])
    .filter(([key, value]) => key && hasCustomFieldValue(value)));
}

function normalizeRating(value, fallbackDisplay = "stars", fallbackColumn = "达人评分") {
  const rawValue = typeof value === "object" && value !== null ? value.value : value;
  const number = Number(rawValue);
  if (!Number.isFinite(number)) return null;
  const sourceMax = Number(value?.max);
  const normalizedValue = sourceMax === 5 ? number * 2 : number;
  return {
    value: Math.max(0, Math.min(10, normalizedValue)),
    max: 10,
    display: (value?.display || fallbackDisplay) === "score" ? "score" : "stars",
    columnName: String(value?.columnName || fallbackColumn || "达人评分").trim() || "达人评分"
  };
}

function ratingFieldKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_\-—:：()（）/\\]+/g, "");
}

function ratingFromCustomFields(fields) {
  for (const [fieldName, rawValue] of Object.entries(fields || {})) {
    if (!RATING_FIELD_ALIASES.has(ratingFieldKey(fieldName))) continue;
    const text = String(rawValue ?? "").trim();
    const stars = (text.match(/[★⭐]/g) || []).length;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match && !stars) continue;
    const denominator = Number((text.match(/\/\s*(5|10)(?:\D|$)/) || [])[1]);
    const number = match ? Number(match[0]) : stars;
    if (!Number.isFinite(number)) continue;
    return normalizeRating({ value: number, max: denominator === 5 ? 5 : 10, columnName: fieldName });
  }
  return null;
}

function importFieldOptions() {
  return {
    ratingColumn: String(ratingColumnInput.value || "").trim(),
    ratingDisplay: ratingDisplaySelect.value === "score" ? "score" : "stars",
    customColumns: configuredCustomColumnNames()
  };
}

async function saveImportFieldOptions() {
  const options = importFieldOptions();
  await chrome.storage.local.set({
    favoriteRatingColumn: options.ratingColumn,
    favoriteRatingDisplay: options.ratingDisplay,
    favoriteCustomColumns: options.customColumns,
    [CUSTOM_COLUMNS_INITIALIZED_KEY]: true
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

function acquisitionSourceDirectUrl(entry) {
  const key = String(entry?.key || "").trim();
  const url = String(entry?.url || "").trim();
  if (!key.startsWith("online:") || !url) return "";
  try {
    const target = new URL(url);
    const resourceId = String(entry?.resourceId || "").trim();
    const sourceType = String(entry?.type || "").trim();
    const isFeishu = target.hostname.endsWith("feishu.cn") || target.hostname.endsWith("larksuite.com");
    if (!isFeishu || !resourceId) return target.toString();

    const pathParts = target.pathname.split("/").filter(Boolean);
    const isBitable = /多维表格|bitable|base/i.test(sourceType) || pathParts.includes("base");
    const isSpreadsheet = /电子表格|spreadsheet|sheet/i.test(sourceType) || pathParts.includes("sheets") || pathParts.includes("sheet");
    if (isBitable) {
      target.searchParams.delete("table_id");
      target.searchParams.set("table", resourceId);
    } else if (isSpreadsheet) {
      target.searchParams.delete("sheet_id");
      target.searchParams.set("sheet", resourceId);
    }
    return target.toString();
  } catch {
    return "";
  }
}

function acquisitionSourceHtml(entry) {
  const label = String(entry?.label || "未知渠道").trim();
  const directUrl = acquisitionSourceDirectUrl(entry);
  const timeText = entry?.acquiredAt ? ` · ${formatTime(entry.acquiredAt)}` : "";
  const title = `${label}${timeText}${directUrl ? " · 点击直达子表" : ""}`;
  if (!directUrl) return `<span class="write-history-item" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
  return `<a class="write-history-item is-link" href="${escapeHtml(directUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}" aria-label="直达 ${escapeHtml(label)}"><span>${escapeHtml(label)}</span></a>`;
}

function cooperationCountFromAcquisitionSources(value) {
  const childKeys = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    const key = String(entry?.key || "").trim();
    const resourceId = String(entry?.resourceId || "").trim();
    if (!key.startsWith("online:") || !resourceId) continue;
    const url = String(entry?.url || "").trim();
    childKeys.add(`${url || key.slice(0, key.lastIndexOf(":"))}:${resourceId}`);
  }
  return childKeys.size ? String(childKeys.size) : "";
}

function needsCooperationCountMigration(items) {
  return (Array.isArray(items) ? items : []).some((item) => (
    String(item?.cooperationCount ?? item?.["合作次数"] ?? "").trim() === ""
    && cooperationCountFromAcquisitionSources(item?.acquisitionSources)
  ));
}

function syncSelectOptions(source, target) {
  const previous = source.value;
  target.textContent = "";
  Array.from(source.options).forEach((option) => target.append(option.cloneNode(true)));
  target.value = previous;
  target.disabled = source.disabled;
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
  syncSelectOptions(statusFilter, quickStatusFilter);
  if (quickStatusFilter.options[0]) quickStatusFilter.options[0].textContent = "全部状态";
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
  syncSelectOptions(acquisitionFilter, quickAcquisitionFilter);
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
  stickyWriteTarget.value = activeTable ? configuredTableValue(activeTable) : "";
  stickyWriteTarget.title = title;
}

function renderConfiguredTableOptions() {
  [favoriteConfiguredTable, stickyWriteTarget].forEach((select) => {
    select.textContent = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = configuredTables.length ? "请选择已配置表格" : "暂无已配置表格";
    select.append(placeholder);
    configuredTables.forEach((config, index) => {
      const option = document.createElement("option");
      option.value = configuredTableValue(config);
      option.textContent = configuredTableLabel(config, index);
      select.append(option);
    });
    select.disabled = configuredTables.length === 0;
    select.value = activeTable ? configuredTableValue(activeTable) : "";
  });
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
  renderConfiguredTableOptions();
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

async function applyConfiguredTableSelection(source = favoriteConfiguredTable) {
  activeTable = configuredTables.find((config) => configuredTableValue(config) === source.value) || null;
  favoriteConfiguredTable.value = activeTable ? configuredTableValue(activeTable) : "";
  stickyWriteTarget.value = favoriteConfiguredTable.value;
  updateActiveWriteTarget();
  await chrome.storage.local.set({
    favoriteFeishuUrl: activeTable?.url || "",
    favoriteFeishuSheetId: activeTable?.sheetId || ""
  });
  updateSelectionState();
  setStatus(activeTable
    ? `选择已生效，预收藏达人将写入：${activeTableLabel()}。`
    : "当前没有可写入的飞书表格。", !activeTable);
  if (activeTable) await refreshCooperationCounts({ announce: true });
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
  const result = await chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_PAGE" });
  if (!result?.ok) throw new Error(result?.message || "配置页打开失败");
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

function normalizeNoteUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function noteIdFromValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const decoded = (() => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  })();
  return (decoded.match(/\/(?:explore|discovery\/item)\/([0-9a-f]{24})(?:[/?#]|$)/i) || [])[1]
    || (decoded.match(/(?:noteId|note_id)=([0-9a-f]{24})(?:[&#]|$)/i) || [])[1]
    || (/^[0-9a-f]{24}$/i.test(decoded) ? decoded : "");
}

function normalizeLatestNoteDate(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{5}(?:\.\d+)?$/.test(text)) return text;
  const serial = Number(text);
  if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return text;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
  return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
}

function hasLatestCooperationNote(item) {
  return Boolean(
    String(item?.latestCooperationNoteId || "").trim()
    || String(item?.latestCooperationNoteTitle || "").trim()
    || String(item?.latestCooperationNotePublishedAt || "").trim()
    || String(item?.latestCooperationNoteSourceUrl || "").trim()
    || String(item?.latestCooperationNoteUrl || "").trim()
  );
}

function isResolvedPgyNoteUrl(value) {
  const url = normalizeNoteUrl(value);
  return Boolean(url && /[?&]xsec_token=/i.test(url));
}

function cachedLatestNoteUrl(item) {
  const url = normalizeNoteUrl(item?.latestCooperationNoteUrl);
  if (!isResolvedPgyNoteUrl(url)) return "";
  const fetchedAt = Date.parse(String(item?.latestCooperationNoteLinkFetchedAt || ""));
  if (!Number.isFinite(fetchedAt)) return "";
  const age = Date.now() - fetchedAt;
  return age >= 0 && age < LATEST_NOTE_LINK_CACHE_TTL_MS ? url : "";
}

function latestNoteTarget(item) {
  const sourceUrl = normalizeNoteUrl(item?.latestCooperationNoteSourceUrl)
    || normalizeNoteUrl(item?.latestCooperationNoteUrl);
  const noteId = noteIdFromValue(item?.latestCooperationNoteId) || noteIdFromValue(sourceUrl);
  return {
    key: String(item?.userId || ""),
    userId: String(item?.userId || ""),
    noteId,
    sourceUrl
  };
}

function canResolveLatestNoteLink(item) {
  const target = latestNoteTarget(item);
  return Boolean(target.noteId || target.sourceUrl);
}

function latestNoteRecoverySource(item) {
  return [...(item?.acquisitionSources || [])].reverse().find((entry) => {
    const url = String(entry?.url || "").trim();
    const resourceId = String(entry?.resourceId || "").trim();
    const sourceType = `${entry?.type || ""} ${entry?.key || ""}`;
    return Boolean(url && resourceId && /飞书|feishu|sheet|spreadsheet/i.test(sourceType));
  }) || null;
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

function isOfficialCategorySource(value) {
  return ["pgy_profile", "pgy_detail"].includes(String(value || "").trim());
}

function needsCategorySourceMigration(items) {
  return (Array.isArray(items) ? items : []).some((item) => {
    const categorySource = String(item?.categorySource || "").trim();
    const storedCategoryTags = normalizeCategoryTags(item?.categoryTags, categorySource);
    if (!storedCategoryTags.length) return false;
    if (!isOfficialCategorySource(categorySource)) return true;
    return storedCategoryTags.some((tag) => !DEFAULT_CATEGORIES.includes(tag));
  });
}

function normalizeFavorites(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const categorySource = String(item?.categorySource || "").trim();
      const storedCategoryTags = normalizeCategoryTags(item?.categoryTags, categorySource);
      const officialCategoryTags = isOfficialCategorySource(categorySource)
        ? storedCategoryTags.filter((tag) => DEFAULT_CATEGORIES.includes(tag))
        : [];
      const migratedCustomTags = storedCategoryTags.filter((tag) => !officialCategoryTags.includes(tag));
      const acquisitionSources = normalizeAcquisitionSources(item?.acquisitionSources, item?.source);
      const storedCooperationCount = String(item?.cooperationCount ?? item?.["合作次数"] ?? "").trim();
      const normalizedCustomFields = normalizeCustomFields(item);
      const normalizedRating = normalizeRating(item?.rating) || ratingFromCustomFields(normalizedCustomFields);
      if (normalizedRating) {
        Object.keys(normalizedCustomFields).forEach((fieldName) => {
          if (ratingFieldKey(fieldName) === ratingFieldKey(normalizedRating.columnName)) delete normalizedCustomFields[fieldName];
        });
      }
      return {
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
      cooperationCount: storedCooperationCount || cooperationCountFromAcquisitionSources(acquisitionSources),
      cooperationNoteCount: String(item?.cooperationNoteCount ?? "").trim(),
      latestCooperationNoteId: noteIdFromValue(item?.latestCooperationNoteId)
        || noteIdFromValue(item?.latestCooperationNoteSourceUrl)
        || noteIdFromValue(item?.latestCooperationNoteUrl),
      latestCooperationNoteTitle: String(item?.latestCooperationNoteTitle || "").trim(),
      latestCooperationNotePublishedAt: String(item?.latestCooperationNotePublishedAt || "").trim(),
      latestCooperationNoteSourceUrl: normalizeNoteUrl(item?.latestCooperationNoteSourceUrl)
        || normalizeNoteUrl(item?.latestCooperationNoteUrl),
      latestCooperationNoteUrl: normalizeNoteUrl(item?.latestCooperationNoteUrl),
      latestCooperationNoteLinkFetchedAt: String(item?.latestCooperationNoteLinkFetchedAt || "").trim(),
      latestCooperationNoteLinkError: String(item?.latestCooperationNoteLinkError || "").trim(),
      cpmText: String(item?.cpmText ?? item?.cpm ?? item?.CPM ?? "").trim(),
      cpeText: String(item?.cpeText ?? item?.cpe ?? item?.CPE ?? "").trim(),
      contentForm: String(item?.contentForm || item?.noteType || item?.note_type || "").trim(),
      categoryText: String(item?.categoryText || (isOfficialCategorySource(categorySource) ? normalizeTagList(item?.categoryTags).join("；") : "")).trim(),
      quoteStatus: String(item?.quoteStatus || "").trim(),
      bio: sanitizeBio(item?.bio),
      categoryTags: officialCategoryTags,
      customTags: normalizeTagList([...normalizeTagList(item?.customTags), ...migratedCustomTags]),
      rating: normalizedRating,
      customFields: normalizedCustomFields,
      categorySource: officialCategoryTags.length ? categorySource : "",
      source: String(item?.source || "").trim(),
      acquisitionSources,
      xhsUrl: String(item?.xhsUrl || "").trim(),
      pgyUrl: String(item?.pgyUrl || "").trim(),
      status: String(item?.status || "预收藏").trim(),
      createdAt: String(item?.createdAt || "").trim(),
      updatedAt: String(item?.updatedAt || "").trim(),
      quoteFetchedAt: String(item?.quoteFetchedAt || "").trim(),
      lastDataRefreshAt: String(item?.lastDataRefreshAt || item?.quoteFetchedAt || "").trim(),
      dataRefreshSource: String(item?.dataRefreshSource || "").trim(),
      lastRefreshFailedAt: String(item?.lastRefreshFailedAt || "").trim(),
      feishuWriteHistory: normalizeWriteHistory(item?.feishuWriteHistory, String(item?.status || "").trim())
      };
    })
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
    item.latestCooperationNoteId,
    item.latestCooperationNoteTitle,
    item.latestCooperationNotePublishedAt,
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
  const notePublishedAt = Date.parse(String(item?.latestCooperationNotePublishedAt || "").trim());
  return {
    followers: parsePriceValue(item.followersText),
    picturePrice: parsePriceValue(item.picturePriceText),
    videoPrice: parsePriceValue(item.videoPriceText),
    notePublishedAt: Number.isFinite(notePublishedAt) ? notePublishedAt : null,
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
    const value = String(item.customFields?.[fieldName] ?? "").toLowerCase();
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
  if (ratingDisplaySelect.value === "score") return `${rating.value}/10 分`;
  const fullStars = Math.max(0, Math.min(10, Math.floor(rating.value)));
  return `${"★".repeat(fullStars)}${"☆".repeat(10 - fullStars)} · ${rating.value}/10`;
}

function headlineRatingText(rating) {
  if (rating) return ratingDisplayText(rating);
  return ratingDisplaySelect.value === "score" ? "0/10 分" : "☆☆☆☆☆☆☆☆☆☆ · 0/10";
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
  const latestNote = latestNoteFilter.value;
  const writeHistory = item.feishuWriteHistory || [];
  if (status === "never" && writeHistory.length) return false;
  if (status === "any" && !writeHistory.length) return false;
  if (status.startsWith("table:") && !writeHistory.some((entry) => entry.key === status.slice(6))) return false;
  if (acquisition && !(item.acquisitionSources || []).some((entry) => entry.key === acquisition)) return false;
  if (latestNote === "has" && !hasLatestCooperationNote(item)) return false;
  if (latestNote === "none" && hasLatestCooperationNote(item)) return false;
  if (!ignoreCategory) {
    if (activeCategory === "未识别官方类目" && (item.categoryTags || []).length) return false;
    if (activeCategory && activeCategory !== "未识别官方类目" && !(item.categoryTags || []).includes(activeCategory)) return false;
  }
  if (!ignoreTag) {
    if (activeTag === "无用户标签" && (item.customTags || []).length) return false;
    if (activeTag && activeTag !== "无用户标签" && !(item.customTags || []).includes(activeTag)) return false;
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
    const tags = (item.categoryTags || []).length ? item.categoryTags : ["未识别官方类目"];
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
    const tags = (item.customTags || []).length ? item.customTags : ["无用户标签"];
    for (const tag of tags) counts.set(tag, 0);
  }
  if (activeTag && !counts.has(activeTag)) counts.set(activeTag, 0);
  const matchingFavorites = favorites.filter((item) => matchesFavoriteFilters(item, { ignoreTag: true }));
  for (const item of matchingFavorites) {
    const tags = (item.customTags || []).length ? item.customTags : ["无用户标签"];
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
  if (!tagLibrary.length) {
    tagLibraryChips.innerHTML = `<span>首次输入标签后，会作为快捷选项保存在这里。</span>`;
    return;
  }
  const visibleLibraryTags = tagLibrary.slice(0, TAG_LIBRARY_VISIBLE_LIMIT);
  const hiddenLibraryTags = tagLibrary.slice(TAG_LIBRARY_VISIBLE_LIMIT);
  const libraryTagButton = (tag) => `<button type="button" data-library-tag="${escapeHtml(tag)}">+ ${escapeHtml(tag)}</button>`;
  tagLibraryChips.innerHTML = [
    `<span>常用标签，点击快速打标：</span>`,
    ...visibleLibraryTags.map(libraryTagButton),
    hiddenLibraryTags.length
      ? `<details class="facet-more tag-library-more"><summary>其余标签 ${hiddenLibraryTags.length}</summary><div>${hiddenLibraryTags.map(libraryTagButton).join("")}</div></details>`
      : ""
  ].join("");
}

function availableCustomFieldNames() {
  return Array.from(new Set([
    ...configuredCustomColumnNames(),
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
  if (latestNoteFilter.value) chips.push({ key: "latest-note", label: latestNoteFilter.selectedOptions[0]?.textContent || "最新合作笔记" });
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
  if (activeCategory) chips.push({ key: "category", label: `官方类目：${activeCategory}` });
  if (activeTag) chips.push({ key: "tag", label: `用户标签：${activeTag}` });
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
  else if (key === "latest-note") latestNoteFilter.value = "";
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
  latestNoteFilter.value = "";
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
  const visibleUntagged = visible.filter((item) => !(item.customTags || []).length);
  const selected = selectedUserIds.size;
  selectedCount.textContent = `已选 ${selected} 位`;
  writeFeishuBtn.disabled = writing || selected === 0 || !activeTable;
  selectUntaggedBtn.disabled = writing || dataBusy || visibleUntagged.length === 0;
  selectUntaggedBtn.textContent = visibleUntagged.length ? `选择无标签达人（${visibleUntagged.length}）` : "暂无无标签达人";
  addTagBtn.disabled = writing || dataBusy || selected === 0;
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
  customColumnInputs.forEach((input) => { input.disabled = dataBusy; });
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

async function refreshLatestNoteLinks(targets, { announce = false } = {}) {
  const targetItems = (Array.isArray(targets) ? targets : [])
    .filter((item) => item?.userId && canResolveLatestNoteLink(item));
  if (!targetItems.length) return { total: 0, completed: 0, failed: 0, results: [] };
  const result = await chrome.runtime.sendMessage({
    type: "RESOLVE_PGY_NOTE_LINKS",
    notes: targetItems.map(latestNoteTarget)
  });
  if (!result?.ok) throw new Error(result?.message || "最新合作笔记链接获取失败");
  const resolvedByUserId = new Map((Array.isArray(result.results) ? result.results : [])
    .map((item) => [String(item?.userId || item?.key || ""), item]));
  const fetchedAt = new Date().toISOString();
  const nextFavorites = favorites.map((item) => {
    const resolved = resolvedByUserId.get(item.userId);
    if (!resolved) return item;
    if (!resolved.ok) {
      return {
        ...item,
        latestCooperationNoteId: item.latestCooperationNoteId || resolved.noteId || "",
        latestCooperationNoteLinkError: String(resolved.message || "获取笔记链接失败")
      };
    }
    return {
      ...item,
      latestCooperationNoteId: resolved.noteId || item.latestCooperationNoteId || "",
      latestCooperationNoteTitle: resolved.title || item.latestCooperationNoteTitle || "",
      latestCooperationNotePublishedAt: item.latestCooperationNotePublishedAt || resolved.publishedAt || "",
      latestCooperationNoteSourceUrl: item.latestCooperationNoteSourceUrl || resolved.sourceUrl || "",
      latestCooperationNoteUrl: resolved.noteLink || item.latestCooperationNoteUrl || "",
      latestCooperationNoteLinkFetchedAt: fetchedAt,
      latestCooperationNoteLinkError: ""
    };
  });
  await saveFavorites(nextFavorites);
  if (announce) {
    setStatus(`最新合作笔记链接已刷新：成功 ${result.completed || 0} 条，失败 ${result.failed || 0} 条。`, (result.failed || 0) > 0);
  }
  return result;
}

async function recoverLatestNoteFromSource(item) {
  const source = latestNoteRecoverySource(item);
  if (!source) throw new Error("该达人没有可用于补取笔记链接的在线表格来源。");
  const result = await chrome.runtime.sendMessage({
    type: "RECOVER_ONLINE_CREATOR_NOTE",
    url: source.url,
    sheetId: source.resourceId,
    identity: {
      userId: item.userId,
      redId: item.redId,
      name: item.name
    }
  });
  if (!result?.ok) throw new Error(result?.message || "在线表格读取失败");
  const recovered = {
    latestCooperationNoteId: String(result.note?.noteId || "").trim(),
    latestCooperationNoteTitle: String(result.note?.title || "").trim(),
    latestCooperationNotePublishedAt: normalizeLatestNoteDate(result.note?.publishedAt),
    latestCooperationNoteSourceUrl: normalizeNoteUrl(result.note?.sourceUrl),
    latestCooperationNoteUrl: normalizeNoteUrl(result.note?.sourceUrl),
    latestCooperationNoteLinkFetchedAt: new Date().toISOString()
  };
  if (!canResolveLatestNoteLink(recovered)) {
    throw new Error("原飞书子表中未识别到该达人的笔记链接，请检查发布链接单元格。");
  }
  const nextFavorites = favorites.map((current) => current.userId === item.userId
    ? {
        ...current,
        latestCooperationNoteId: recovered.latestCooperationNoteId || current.latestCooperationNoteId || "",
        latestCooperationNoteTitle: recovered.latestCooperationNoteTitle || current.latestCooperationNoteTitle || "",
        latestCooperationNotePublishedAt: recovered.latestCooperationNotePublishedAt || current.latestCooperationNotePublishedAt || "",
        latestCooperationNoteSourceUrl: recovered.latestCooperationNoteSourceUrl || recovered.latestCooperationNoteUrl || current.latestCooperationNoteSourceUrl || "",
        latestCooperationNoteUrl: recovered.latestCooperationNoteUrl || current.latestCooperationNoteUrl || "",
        latestCooperationNoteLinkFetchedAt: recovered.latestCooperationNoteLinkFetchedAt
      }
    : current);
  await saveFavorites(nextFavorites);
  return favorites.find((current) => current.userId === item.userId) || item;
}

async function openLatestCooperationNote(userId) {
  let current = favorites.find((item) => item.userId === userId);
  if (!current || !hasLatestCooperationNote(current)) throw new Error("该达人没有最新合作笔记。");
  if (!canResolveLatestNoteLink(current)) {
    setStatus(`正在从原表获取「${current.name || current.userId}」的笔记链接...`);
    current = await recoverLatestNoteFromSource(current);
  }
  const cachedUrl = cachedLatestNoteUrl(current);
  if (cachedUrl) {
    await chrome.tabs.create({ url: cachedUrl });
    setStatus(`已打开「${current.latestCooperationNoteTitle || current.name || "最新合作笔记"}」。`);
    return;
  }
  setStatus(`笔记链接缓存已过期，正在通过蒲公英刷新...`);
  let noteUrl = "";
  let usedStoredUrl = false;
  try {
    const result = await refreshLatestNoteLinks([current]);
    const resolved = (result.results || []).find((item) => String(item?.userId || item?.key || "") === userId);
    noteUrl = normalizeNoteUrl(resolved?.noteLink);
    if (!noteUrl && isResolvedPgyNoteUrl(current.latestCooperationNoteUrl)) {
      noteUrl = normalizeNoteUrl(current.latestCooperationNoteUrl);
      usedStoredUrl = true;
    }
  } catch (error) {
    noteUrl = isResolvedPgyNoteUrl(current.latestCooperationNoteUrl) ? normalizeNoteUrl(current.latestCooperationNoteUrl) : "";
    if (!noteUrl) throw error;
    usedStoredUrl = true;
  }
  if (!noteUrl) throw new Error("蒲公英未返回可访问的笔记链接，请确认登录状态后重试。");
  await chrome.tabs.create({ url: noteUrl });
  if (usedStoredUrl) {
    await saveFavorites(favorites.map((item) => item.userId === userId
      ? { ...item, latestCooperationNoteLinkFetchedAt: new Date().toISOString() }
      : item));
  }
  setStatus(`已打开「${current.latestCooperationNoteTitle || current.name || "最新合作笔记"}」。`);
}

async function importFavoriteObjects(rows, sourceLabel, options = {}) {
  const imported = FavoriteDataTools.objectsToFavorites(rows, options);
  if (!imported.length) throw new Error("表格中没有识别到达人 ID，请检查“达人ID / 博主ID / 蒲公英主页”列。");
  const result = FavoriteDataTools.mergeFavorites(favorites, imported);
  await saveFavorites(result.items);
  const importedIds = new Set(imported.map((item) => item.userId));
  const noteTargets = favorites.filter((item) => importedIds.has(item.userId) && canResolveLatestNoteLink(item));
  let noteResult = { completed: 0, failed: 0 };
  if (noteTargets.length) {
    showDataProgress(`正在获取 ${noteTargets.length} 条最新合作笔记的可访问链接...`, 0, noteTargets.length);
    noteResult = await refreshLatestNoteLinks(noteTargets);
  }
  const noteSummary = noteTargets.length
    ? `；笔记链接成功 ${noteResult.completed || 0} 条${noteResult.failed ? `，失败 ${noteResult.failed} 条` : ""}`
    : "";
  setStatus(`${sourceLabel}完成：新增 ${result.added} 位，更新 ${result.updated} 位，共识别 ${imported.length} 位达人${noteSummary}。`, (noteResult.failed || 0) > 0);
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
  return !dataRefreshTimestamp(item);
}

function timestampsAreClose(left, right, toleranceMs) {
  const leftTime = Date.parse(left || "");
  const rightTime = Date.parse(right || "");
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && Math.abs(leftTime - rightTime) <= toleranceMs;
}

function isLegacyInitialQuoteEnrichment(item) {
  if (String(item?.dataRefreshSource || "").trim()) return false;
  const refreshedAt = String(item?.lastDataRefreshAt || "").trim();
  const quoteFetchedAt = String(item?.quoteFetchedAt || "").trim();
  const createdAt = String(item?.createdAt || "").trim();
  if (!refreshedAt || !quoteFetchedAt || !createdAt) return false;
  return timestampsAreClose(refreshedAt, quoteFetchedAt, 5000)
    && timestampsAreClose(refreshedAt, createdAt, 10 * 60 * 1000);
}

function dataRefreshTimestamp(item) {
  const refreshSource = String(item?.dataRefreshSource || "").trim();
  if (refreshSource === "quote_enrichment" || isLegacyInitialQuoteEnrichment(item)) return "";
  return String(item?.lastDataRefreshAt || "").trim();
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
    const refreshedIds = new Set(targetItems.map((item) => item.userId));
    const noteTargets = favorites.filter((item) => refreshedIds.has(item.userId) && canResolveLatestNoteLink(item));
    const noteResult = noteTargets.length ? await refreshLatestNoteLinks(noteTargets) : { completed: 0, failed: 0 };
    const noteSummary = noteTargets.length
      ? `；笔记链接成功 ${noteResult.completed || 0} 条${noteResult.failed ? `，失败 ${noteResult.failed} 条` : ""}`
      : "";
    setStatus(`${label}完成：达人成功 ${result.completed} 位，失败 ${result.failed} 位${noteSummary}。${result.failed ? "失败达人已保留原数据并标记原因。" : ""}`, result.failed > 0 || noteResult.failed > 0);
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

async function loadFavorites() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [], [TAG_LIBRARY_KEY]: [] });
  const storedFavorites = stored[STORAGE_KEY];
  const shouldMigrateCategories = needsCategorySourceMigration(storedFavorites);
  const shouldMigrateCooperationCounts = needsCooperationCountMigration(storedFavorites);
  favorites = normalizeFavorites(storedFavorites);
  tagLibrary = normalizeTagList([
    ...normalizeTagList(stored[TAG_LIBRARY_KEY]),
    ...favorites.flatMap((item) => item.customTags || [])
  ], 200);
  if (shouldMigrateCategories || shouldMigrateCooperationCounts) {
    await chrome.storage.local.set({ [STORAGE_KEY]: favorites, [TAG_LIBRARY_KEY]: tagLibrary });
  }
  renderFavorites();
}

async function refreshCooperationCounts({ announce = false } = {}) {
  if (!activeTable?.url || !favorites.length) return;
  const result = await chrome.runtime.sendMessage({
    type: "INSPECT_CREATOR_COOPERATION_COUNTS",
    url: activeTable.url,
    rows: favorites.map((item) => ({
      "达人ID": item.userId,
      "小红书号": item.redId,
      "主页链接": item.xhsUrl,
      "蒲公英链接": item.pgyUrl
    }))
  });
  if (!result?.ok) throw new Error(result?.message || "合作次数统计失败");
  const counts = Array.isArray(result.counts) ? result.counts : [];
  let changed = false;
  const nextFavorites = favorites.map((item, index) => {
    const nextCount = counts[index];
    const inspectedCount = nextCount !== "" && nextCount !== null && nextCount !== undefined && Number.isFinite(Number(nextCount))
      ? String(Math.max(0, Math.round(Number(nextCount))))
      : "";
    const sourceCount = cooperationCountFromAcquisitionSources(item.acquisitionSources);
    const normalizedCount = inspectedCount && sourceCount
      ? String(Math.max(Number(inspectedCount), Number(sourceCount)))
      : inspectedCount || sourceCount || item.cooperationCount;
    if (normalizedCount === item.cooperationCount) return item;
    changed = true;
    return { ...item, cooperationCount: normalizedCount };
  });
  if (changed) await saveFavorites(nextFavorites);
  if (announce) setStatus(`合作次数已刷新：检查 ${result.inspectedChildCount || 0} 个子表。`);
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
    const categoryTags = (item.categoryTags || []).length ? item.categoryTags : ["未识别官方类目"];
    const customTags = item.customTags || [];
    const performance = cooperationMetricValues(item);
    const quoteStatus = item.quoteStatus || (!item.picturePriceText && !item.videoPriceText ? "报价待补充" : "");
    const latestNotePublishedAt = String(item.latestCooperationNotePublishedAt || "").trim();
    const latestNoteUrl = normalizeNoteUrl(item.latestCooperationNoteUrl);
    const latestNoteTitle = String(item.latestCooperationNoteTitle || "").trim();
    const latestNoteId = String(item.latestCooperationNoteId || "").trim();
    const latestNoteCanOpen = Boolean(latestNoteUrl || latestNoteId || item.latestCooperationNoteSourceUrl || latestNoteRecoverySource(item));
    const latestNoteHtml = hasLatestCooperationNote(item) ? `
      <div class="latest-note">
        <span>最新合作笔记</span>
        ${latestNoteTitle ? `<strong title="${escapeHtml(latestNoteTitle)}">${escapeHtml(latestNoteTitle)}</strong>` : ""}
        ${latestNotePublishedAt ? `<small>${escapeHtml(latestNotePublishedAt)}</small>` : ""}
        ${latestNoteCanOpen ? `<button type="button" data-action="open-latest-note">查看笔记</button>` : ""}
      </div>
    ` : "";
    const dataRefreshAt = dataRefreshTimestamp(item);
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
        ${acquisitionSources.map(acquisitionSourceHtml).join("")}
      </div>
    ` : "";
    const customFieldEntries = Object.entries(item.customFields || {}).filter(([, value]) => hasCustomFieldValue(value));
    const cooperationCountNumber = Number(item.cooperationCount);
    const cooperationCountKnown = item.cooperationCount !== "" && Number.isFinite(cooperationCountNumber) && cooperationCountNumber >= 0;
    const cooperationCountText = cooperationCountKnown ? `${Math.round(cooperationCountNumber)} 次` : "待统计";
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
            <button type="button" class="headline-rating ${item.rating ? "has-rating" : ""}" data-action="edit-rating" title="${escapeHtml(item.rating?.columnName || ratingColumnInput.value || "达人评分")}，点击设置 0-10 分">${escapeHtml(headlineRatingText(item.rating))}</button>
            <div class="cooperation-count-badge ${cooperationCountKnown ? "is-known" : "is-pending"}" title="优先按当前在线大表中出现过该达人的不同子表数量统计；旧版导入记录会用已读取的来源子表数量补齐">
              <span>合作次数</span><strong>${escapeHtml(cooperationCountText)}</strong>
            </div>
            <div class="tag-list" title="蒲公英官方类目">${categoryTags.map((tag) => `<span class="tag category-tag">${escapeHtml(tag)}</span>`).join("")}</div>
          </div>
          <div class="custom-tag-list">
            <span class="custom-tag-label">用户标签</span>
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
          ${latestNoteHtml}
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
  const value = window.prompt("设置达人评分（0-10，支持 0.5 分；清空表示移除评分）", item.rating?.value ?? "");
  if (value === null) return;
  const text = String(value).trim();
  const rating = text === "" ? null : normalizeRating({
    value: Number(text),
    display: ratingDisplaySelect.value,
    columnName: ratingColumnInput.value || item.rating?.columnName || "达人评分"
  });
  if (text && (!rating || Number(text) < 0 || Number(text) > 10)) throw new Error("评分必须是 0-10 之间的数字。");
  await saveImportFieldOptions();
  await saveFavorites(favorites.map((favorite) => favorite.userId === userId
    ? { ...favorite, rating, updatedAt: new Date().toISOString() }
    : favorite));
  setStatus(rating ? `已将 ${item.name || userId} 评分设为 ${ratingDisplayText(rating)}。` : `已移除 ${item.name || userId} 的评分。`);
}

function selectedFavorites() {
  return favorites.filter((item) => selectedUserIds.has(item.userId));
}

async function applyTagsToSelected(providedTags = null) {
  const tags = normalizeTagList(providedTags || customTagInput.value);
  if (!tags.length) throw new Error("请输入至少一个标签。");
  if (!selectedUserIds.size) throw new Error("请先勾选要分配用户标签的达人。");
  const selected = new Set(selectedUserIds);
  tagLibrary = normalizeTagList([...tagLibrary, ...tags], 200);
  const next = favorites.map((item) => {
    if (!selected.has(item.userId)) return item;
    const current = item.customTags || [];
    return {
      ...item,
      customTags: Array.from(new Set([...current, ...tags])),
      updatedAt: new Date().toISOString()
    };
  });
  await saveFavorites(next);
  customTagInput.value = "";
  setStatus(`已为 ${selected.size} 位达人添加标签：${tags.join("、")}。`);
}

async function editFavoriteTags(userId) {
  const item = favorites.find((favorite) => favorite.userId === userId);
  if (!item) return;
  const value = window.prompt("编辑用户标签（多个值可用逗号或顿号分隔，清空表示移除全部）", (item.customTags || []).join("、"));
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
  setStatus(`已为「${item.name || item.userId}」添加用户标签：${addedTags.join("、")}。`);
}

function favoriteToFeishuRow(item) {
  const pgyUrl = item.pgyUrl || `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${encodeURIComponent(item.userId)}`;
  const xhsUrl = item.xhsUrl || `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(item.userId)}`;
  const collectedAt = item.createdAt || new Date().toISOString();
  const performance = cooperationMetricValues(item);
  const followersCount = parsePriceValue(item.followersCount ?? item.followersText);
  const followersInWan = followersCount === null ? "" : Math.round((followersCount / 10000) * 10000) / 10000;
  const extraFields = { ...(item.customFields || {}) };
  const creatorCategory = item.categoryText || (item.categoryTags || []).join("、");
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
    "内容形式": item.contentForm || "",
    "标签": (item.customTags || []).join("、"),
    "达人标签": (item.customTags || []).join("、"),
    "自定义标签": (item.customTags || []).join("、"),
    "曝光中位数（合作）": item.cooperationExposureMedian || "",
    "阅读中位数（合作）": item.cooperationReadMedian || "",
    "互动中位数（合作）": item.cooperationInteractionMedian || "",
    "已合作笔记数": item.cooperationNoteCount || "",
    "发布时间": item.latestCooperationNotePublishedAt || "",
    "发布链接": item.latestCooperationNoteUrl || "",
    "账号类型": creatorCategory,
    "达人类型": creatorCategory,
    "达人类目": creatorCategory,
    "内容类目": creatorCategory,
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
    syncUpdateExisting: true,
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
  if (button.dataset.action === "open-latest-note") {
    const originalText = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "正在打开...";
    button.closest(".latest-note")?.classList.add("is-opening");
    openLatestCooperationNote(userId).then(() => {
      if (!button.isConnected) return;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = originalText;
      button.closest(".latest-note")?.classList.remove("is-opening");
    }).catch((error) => {
      setStatus(error.message, true);
      if (!button.isConnected) return;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = "重试";
      button.title = error.message;
      button.closest(".latest-note")?.classList.remove("is-opening");
      window.setTimeout(() => {
        if (!button.isConnected || button.disabled) return;
        button.textContent = originalText;
      }, 3000);
    });
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
latestNoteFilter.addEventListener("change", renderFavorites);
quickStatusFilter.addEventListener("change", () => {
  statusFilter.value = quickStatusFilter.value;
  renderFavorites();
});
quickAcquisitionFilter.addEventListener("change", () => {
  acquisitionFilter.value = quickAcquisitionFilter.value;
  renderFavorites();
});
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
  applyTagsToSelected([tag]).catch((error) => setStatus(error.message, true));
});

selectUntaggedBtn.addEventListener("click", () => {
  const untaggedIds = filteredFavorites()
    .filter((item) => !(item.customTags || []).length)
    .map((item) => item.userId);
  selectedUserIds = new Set(untaggedIds);
  renderFavorites();
  setStatus(`已选中当前筛选结果中的 ${untaggedIds.length} 位无标签达人。`);
});

closeWritePanelBtn.addEventListener("click", () => {
  writePanel.hidden = true;
  openWritePanelBtn.hidden = false;
});

openWritePanelBtn.addEventListener("click", () => {
  writePanel.hidden = false;
  openWritePanelBtn.hidden = true;
  closeWritePanelBtn.focus();
});

addTagBtn.addEventListener("click", () => applyTagsToSelected().catch((error) => setStatus(error.message, true)));
customTagInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  applyTagsToSelected().catch((error) => setStatus(error.message, true));
});

writeFeishuBtn.addEventListener("click", () => syncSelectedToFeishu().catch((error) => {
  writing = false;
  updateSelectionState();
  setStatus(error.message, true);
}));
favoriteConfiguredTable.addEventListener("change", () => applyConfiguredTableSelection().catch((error) => setStatus(error.message, true)));
stickyWriteTarget.addEventListener("change", () => applyConfiguredTableSelection(stickyWriteTarget).catch((error) => setStatus(error.message, true)));
refreshFeishuConfigsBtn.addEventListener("click", () => refreshConfiguredTables().catch((error) => setStatus(error.message, true)));
manageFeishuConfigsBtn.addEventListener("click", () => openFeishuConfigPage().catch((error) => setStatus(error.message, true)));

refreshBtn.addEventListener("click", () => Promise.all([loadFavorites(), loadConfiguredTables()])
  .then(() => refreshCooperationCounts({ announce: true }))
  .catch((error) => setStatus(error.message, true)));
clearBtn.addEventListener("click", () => clearFavorites().catch((error) => setStatus(error.message, true)));
exportBtn.addEventListener("click", () => exportFavorites().catch((error) => setStatus(error.message, true)));
importFile.addEventListener("change", () => importFavoriteFile(importFile.files?.[0]).catch((error) => setStatus(error.message, true)));
ratingColumnInput.addEventListener("change", () => saveImportFieldOptions().catch((error) => setStatus(error.message, true)));
ratingDisplaySelect.addEventListener("change", () => {
  saveImportFieldOptions()
    .then(() => saveFavorites(favorites.map((item) => item.rating ? { ...item, rating: { ...item.rating, display: ratingDisplaySelect.value } } : item)))
    .catch((error) => setStatus(error.message, true));
});
customColumnInputs.forEach((input) => input.addEventListener("change", () => {
  saveImportFieldOptions().then(renderFavorites).catch((error) => setStatus(error.message, true));
}));
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
  favoriteCustomColumns: [],
  [CUSTOM_COLUMNS_INITIALIZED_KEY]: false
}).then(async (stored) => {
  onlineTableUrl.value = stored.favoriteOnlineTableUrl || "";
  onlineTagColumn.value = stored.favoriteOnlineTagColumn || "";
  ratingColumnInput.value = stored.favoriteRatingColumn || "达人评分";
  ratingDisplaySelect.value = stored.favoriteRatingDisplay === "score" ? "score" : "stars";
  const savedCustomColumns = normalizeCustomColumnNames(stored.favoriteCustomColumns);
  const customColumns = stored[CUSTOM_COLUMNS_INITIALIZED_KEY]
    ? savedCustomColumns
    : normalizeCustomColumnNames([...DEFAULT_CUSTOM_COLUMNS, ...savedCustomColumns]);
  customColumnInputs.forEach((input, index) => {
    input.value = customColumns[index] || "";
  });
  if (!stored[CUSTOM_COLUMNS_INITIALIZED_KEY]) {
    await chrome.storage.local.set({
      favoriteCustomColumns: customColumns,
      [CUSTOM_COLUMNS_INITIALIZED_KEY]: true
    });
  }
  renderFavorites();
}).catch(() => null);

Promise.all([loadFavorites(), loadConfiguredTables()])
  .then(() => refreshCooperationCounts())
  .catch((error) => setStatus(error.message, true));
