const DEFAULT_OPTIONS = {
  feishuAppId: "",
  feishuAppSecret: "",
  feishuUrl: "",
  feishuSheetId: "",
  detailFeishuUrl: "",
  detailFeishuSheetId: "",
  detailTraverseAllSheets: false,
  detailCaptureFansScreenshot: true,
  detailCaptureNoteScreenshot: true,
  syncUpdateExisting: false,
  syncUseFirstSheet: false,
  pageSize: 50,
  maxRows: 5000,
  detailLimit: "",
  collectionMode: "detail",
  delayMs: 250,
  fullCollectionDefaultApplied: false,
  feishuTableConfigs: []
};
const FEISHU_CONFIG_KEYS = ["feishuAppId", "feishuAppSecret", "feishuUrl", "feishuSheetId", "detailFeishuUrl", "detailFeishuSheetId", "feishuTableConfigs"];

const fields = {
  feishuAppId: document.getElementById("feishuAppId"),
  feishuAppSecret: document.getElementById("feishuAppSecret"),
  feishuUrl: document.getElementById("feishuUrl"),
  feishuSheetId: document.getElementById("feishuSheetId"),
  detailFeishuUrl: document.getElementById("detailFeishuUrl"),
  detailFeishuSheetId: document.getElementById("detailFeishuSheetId"),
  pageSize: document.getElementById("pageSize"),
  maxRows: document.getElementById("maxRows"),
  detailLimit: document.getElementById("detailLimit"),
  collectionMode: document.getElementById("collectionMode")
};

const detailTraverseAllSheets = document.getElementById("detailTraverseAllSheets");
const detailCaptureFansScreenshot = document.getElementById("detailCaptureFansScreenshot");
const detailCaptureNoteScreenshot = document.getElementById("detailCaptureNoteScreenshot");
const syncUpdateExisting = document.getElementById("syncUpdateExisting");
const syncUseFirstSheet = document.getElementById("syncUseFirstSheet");
const statusNode = document.getElementById("status");
const extensionId = document.getElementById("extensionId");
const appIdState = document.getElementById("appIdState");
const syncTargetState = document.getElementById("syncTargetState");
const tableConfigList = document.getElementById("tableConfigList");
const addTableConfigBtn = document.getElementById("addTableConfigBtn");

let tableConfigs = [];

function setStatus(text, isError = false) {
  statusNode.textContent = text;
  statusNode.classList.toggle("is-error", Boolean(isError));
}

function setState(node, text, state = "idle") {
  node.textContent = text;
  node.dataset.state = state;
}

function createTableConfig() {
  return {
    name: "",
    url: "",
    sheetId: "",
    tableName: "",
    sheetName: "",
    resourceType: "",
    sheets: []
  };
}

function normalizeTableConfigs(configs) {
  return (Array.isArray(configs) ? configs : [])
    .map((item) => ({
      name: String(item?.name || "").trim(),
      url: String(item?.url || "").trim(),
      sheetId: String(item?.sheetId || item?.tableId || "").trim(),
      tableName: String(item?.tableName || "").trim(),
      sheetName: String(item?.sheetName || "").trim(),
      resourceType: String(item?.resourceType || "").trim()
    }))
    .filter((item) => item.name || item.url || item.sheetId);
}

function mapTableConfigsForUi(configs) {
  return (Array.isArray(configs) ? configs : []).map((item) => ({
    name: String(item?.name || "").trim(),
    url: String(item?.url || "").trim(),
    sheetId: String(item?.sheetId || item?.tableId || "").trim(),
    tableName: String(item?.tableName || "").trim(),
    sheetName: String(item?.sheetName || "").trim(),
    resourceType: String(item?.resourceType || "").trim(),
    sheets: Array.isArray(item?.sheets) ? item.sheets : []
  }));
}

function ensureVisibleTableConfigs(configs) {
  const mapped = mapTableConfigsForUi(configs);
  return mapped.length ? mapped : [createTableConfig()];
}

function readTableConfigsFromDom() {
  return Array.from(tableConfigList.querySelectorAll(".table-config-row")).map((row) => ({
    name: row.querySelector('[data-field="name"]').value.trim(),
    url: row.querySelector('[data-field="url"]').value.trim(),
    sheetId: row.querySelector('[data-field="sheetId"]').value.trim(),
    tableName: row.dataset.tableName || "",
    sheetName: row.querySelector('[data-field="sheetId"]')?.selectedOptions?.[0]?.dataset.title || row.dataset.sheetName || "",
    resourceType: row.dataset.resourceType || "",
    sheets: Array.from(row.querySelector('[data-field="sheetId"]')?.options || []).filter((option) => option.value).map((option) => ({
      sheetId: option.value,
      title: option.dataset.title || option.textContent
    }))
  }));
}

function sheetOptions(config) {
  const sheets = Array.isArray(config.sheets) ? config.sheets : [];
  if (!sheets.length && config.sheetId) return [{ sheetId: config.sheetId, title: config.sheetName || config.sheetId }];
  return sheets;
}

function renderTableConfigs(configs = tableConfigs) {
  tableConfigs = ensureVisibleTableConfigs(configs);
  tableConfigList.textContent = "";
  tableConfigs.forEach((config, index) => {
    const row = document.createElement("div");
    row.className = "table-config-row";
    row.dataset.index = String(index);
    row.dataset.tableName = config.tableName || "";
    row.dataset.sheetName = config.sheetName || "";
    row.dataset.resourceType = config.resourceType || "";
    row.innerHTML = `
      <label>
        <span>备注</span>
        <input data-field="name" type="text" placeholder="如：7月达人详情" />
      </label>
      <label>
        <span>飞书表格链接</span>
        <input data-field="url" type="url" placeholder="https://xxx.feishu.cn/sheets/..." />
      </label>
      <div class="table-config-actions">
        <button data-action="check" type="button" class="secondary compact">检测</button>
        <button data-action="remove" type="button" class="danger compact">删除</button>
      </div>
      <div class="detected-table-info${config.tableName ? " is-visible" : ""}" data-role="detectedInfo">
        <div><span>表格名称</span><strong data-role="tableName">等待检测</strong></div>
        <label>
          <span>选择子表</span>
          <select data-field="sheetId" ${config.tableName ? "" : "disabled"}>
            <option value="">请选择子表</option>
          </select>
        </label>
      </div>
    `;
    row.querySelector('[data-field="name"]').value = config.name || "";
    row.querySelector('[data-field="url"]').value = config.url || "";
    row.querySelector('[data-role="tableName"]').textContent = config.tableName || "等待检测";
    const select = row.querySelector('[data-field="sheetId"]');
    for (const sheet of sheetOptions(config)) {
      const option = document.createElement("option");
      option.value = sheet.sheetId || sheet.tableId || "";
      option.textContent = sheet.title || option.value;
      option.dataset.title = option.textContent;
      select.append(option);
    }
    select.value = config.sheetId || "";
    tableConfigList.append(row);
  });
}

async function inspectTableConfig(row) {
  const appId = fields.feishuAppId.value.trim();
  const appSecret = fields.feishuAppSecret.value.trim();
  const url = row.querySelector('[data-field="url"]').value.trim();
  if (!appId || !appSecret) throw new Error("请先填写飞书 App ID 和 App Secret。");
  if (!url) throw new Error("请先填写要检测的飞书表格链接。");
  const button = row.querySelector('[data-action="check"]');
  button.disabled = true;
  button.textContent = "检测中...";
  try {
    const result = await chrome.runtime.sendMessage({ type: "INSPECT_FEISHU_TABLE_CONFIG", options: { feishuAppId: appId, feishuAppSecret: appSecret, feishuUrl: url } });
    if (!result?.ok) throw new Error(result?.message || "表格检测失败");
    const select = row.querySelector('[data-field="sheetId"]');
    select.textContent = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "请选择子表";
    select.append(placeholder);
    for (const sheet of result.sheets || []) {
      const option = document.createElement("option");
      option.value = sheet.sheetId;
      option.textContent = sheet.title;
      option.dataset.title = sheet.title;
      select.append(option);
    }
    row.dataset.tableName = result.tableName;
    row.dataset.resourceType = result.resourceType || "";
    row.dataset.sheetName = "";
    row.querySelector('[data-role="tableName"]').textContent = row.dataset.tableName;
    row.querySelector('[data-role="detectedInfo"]').classList.add("is-visible");
    select.disabled = false;
    if ((result.sheets || []).length === 1) select.value = result.sheets[0].sheetId;
    setStatus(`检测通过：${row.dataset.tableName}。请选择子表后保存。`);
  } finally {
    button.disabled = false;
    button.textContent = "重新检测";
  }
}

function currentOptions() {
  return {
    feishuAppId: fields.feishuAppId.value.trim(),
    feishuAppSecret: fields.feishuAppSecret.value.trim(),
    feishuUrl: fields.feishuUrl.value.trim(),
    feishuSheetId: fields.feishuSheetId.value.trim(),
    detailFeishuUrl: fields.detailFeishuUrl.value.trim(),
    detailFeishuSheetId: fields.detailFeishuSheetId.value.trim(),
    detailTraverseAllSheets: detailTraverseAllSheets.checked,
    detailCaptureFansScreenshot: detailCaptureFansScreenshot.checked,
    detailCaptureNoteScreenshot: detailCaptureNoteScreenshot.checked,
    syncUpdateExisting: syncUpdateExisting.checked,
    syncUseFirstSheet: syncUseFirstSheet.checked,
    pageSize: Number(fields.pageSize.value || DEFAULT_OPTIONS.pageSize),
    maxRows: Number(fields.maxRows.value || DEFAULT_OPTIONS.maxRows),
    detailLimit: fields.detailLimit.value ? Number(fields.detailLimit.value) : "",
    collectionMode: fields.collectionMode.value === "detail" ? "detail" : "fast",
    delayMs: DEFAULT_OPTIONS.delayMs,
    feishuTableConfigs: normalizeTableConfigs(readTableConfigsFromDom())
  };
}

function mergePersistentOptions(saved, next) {
  const merged = { ...next };
  for (const key of FEISHU_CONFIG_KEYS) {
    if ((merged[key] === "" || merged[key] === null || merged[key] === undefined) && saved[key]) {
      merged[key] = saved[key];
    }
  }
  return merged;
}

function savedConfigSummary(options) {
  const saved = [];
  if (options.feishuAppId) saved.push("App ID");
  if (options.feishuAppSecret) saved.push("App Secret");
  const configCount = normalizeTableConfigs(options.feishuTableConfigs).length;
  if (configCount) saved.push(`${configCount} 个表格`);
  return saved.length ? `已读取配置：${saved.join("、")}。` : "当前插件实例没有读取到已保存的飞书配置。";
}

async function applyFullCollectionDefault(options) {
  if (options.fullCollectionDefaultApplied) return options;
  const next = {
    ...options,
    collectionMode: "detail",
    detailCaptureFansScreenshot: true,
    detailCaptureNoteScreenshot: true,
    fullCollectionDefaultApplied: true
  };
  await chrome.storage.local.set({
    collectionMode: next.collectionMode,
    detailCaptureFansScreenshot: next.detailCaptureFansScreenshot,
    detailCaptureNoteScreenshot: next.detailCaptureNoteScreenshot,
    fullCollectionDefaultApplied: true
  });
  return next;
}

function refreshState(options = currentOptions()) {
  extensionId.textContent = chrome.runtime.id;
  setState(appIdState, options.feishuAppId || "未填写", options.feishuAppId ? "ok" : "warn");

  if (!options.feishuAppId || !options.feishuAppSecret) {
    setState(syncTargetState, "缺少飞书配置", "warn");
  } else {
    setState(syncTargetState, "已填写，未检测", "idle");
  }

}

async function loadOptions() {
  const options = await applyFullCollectionDefault(await chrome.storage.local.get(DEFAULT_OPTIONS));
  renderTableConfigs(options.feishuTableConfigs);
  for (const [key, input] of Object.entries(fields)) {
    input.value = options[key] ?? DEFAULT_OPTIONS[key] ?? "";
  }
  detailTraverseAllSheets.checked = Boolean(options.detailTraverseAllSheets);
  detailCaptureFansScreenshot.checked = Boolean(options.detailCaptureFansScreenshot);
  detailCaptureNoteScreenshot.checked = Boolean(options.detailCaptureNoteScreenshot);
  syncUpdateExisting.checked = Boolean(options.syncUpdateExisting);
  syncUseFirstSheet.checked = Boolean(options.syncUseFirstSheet);
  refreshState(options);
  setStatus(`${savedConfigSummary(options)}扩展 ID：${chrome.runtime.id}`);
}

async function saveOptions({ silent = false } = {}) {
  const incompleteConfig = readTableConfigsFromDom().find((config) => config.url && (!config.tableName || !config.sheetId));
  if (incompleteConfig) throw new Error(`表格配置“${incompleteConfig.name || incompleteConfig.url}”尚未检测或未选择子表。`);
  const previous = await chrome.storage.local.get(DEFAULT_OPTIONS);
  const options = mergePersistentOptions(previous, currentOptions());
  await chrome.storage.local.set(options);
  const saved = await chrome.storage.local.get(DEFAULT_OPTIONS);
  const missing = ["feishuAppId", "feishuAppSecret", "feishuUrl", "detailFeishuUrl"].filter((key) => options[key] && !saved[key]);
  if (missing.length) throw new Error(`配置保存后读回失败：${missing.join(", ")}`);
  tableConfigs = ensureVisibleTableConfigs(saved.feishuTableConfigs);
  renderTableConfigs(tableConfigs);
  refreshState(saved);
  if (!silent) setStatus(`${savedConfigSummary(saved)}扩展 ID：${chrome.runtime.id}`);
  return saved;
}

async function checkSync() {
  const options = await saveOptions({ silent: true });
  setState(syncTargetState, "检测中...", "idle");
  const result = await chrome.runtime.sendMessage({ type: "VALIDATE_FEISHU_CREDENTIALS", options });
  if (!result?.ok) throw new Error(result?.message || "飞书配置不可用");
  setState(syncTargetState, "飞书配置可用", "ok");
  const checked = (result.checks || []).filter((item) => item.ok).map((item) => item.name);
  setStatus(checked.length ? `飞书配置检测通过：${checked.join("、")}。` : "飞书配置检测通过。");
}

document.getElementById("saveBtn").addEventListener("click", () => saveOptions().catch((error) => setStatus(error.message, true)));
document.getElementById("checkSyncBtn").addEventListener("click", () => checkSync().catch((error) => {
  setState(syncTargetState, "不可用", "bad");
  setStatus(error.message, true);
}));
document.getElementById("openFavoritesBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_FAVORITES_PAGE" }).catch((error) => setStatus(error.message, true));
});

for (const input of Object.values(fields)) {
  input.addEventListener("change", () => saveOptions().catch((error) => setStatus(error.message, true)));
  input.addEventListener("input", () => refreshState());
}

addTableConfigBtn.addEventListener("click", () => {
  renderTableConfigs([...readTableConfigsFromDom(), createTableConfig()]);
  setStatus("已新增一行表格配置，填写后会随设置保存。");
});

tableConfigList.addEventListener("input", (event) => {
  if (event.target.matches('[data-field="url"]')) {
    const row = event.target.closest(".table-config-row");
    row.dataset.tableName = "";
    row.dataset.sheetName = "";
    row.dataset.resourceType = "";
    row.querySelector('[data-role="detectedInfo"]').classList.remove("is-visible");
    row.querySelector('[data-field="sheetId"]').disabled = true;
  }
  tableConfigs = readTableConfigsFromDom();
  refreshState();
});

tableConfigList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest(".table-config-row");
  if (button.dataset.action === "check") {
    inspectTableConfig(row).catch((error) => setStatus(error.message, true));
    return;
  }
  const next = readTableConfigsFromDom().filter((_, index) => index !== Number(row?.dataset.index || -1));
  renderTableConfigs(next);
  setStatus("已删除表格配置，点击“保存设置”后生效。");
});

tableConfigList.addEventListener("change", (event) => {
  const row = event.target.closest(".table-config-row");
  if (!row) return;
  if (event.target.matches('[data-field="sheetId"]')) row.dataset.sheetName = event.target.selectedOptions[0]?.dataset.title || "";
});

detailTraverseAllSheets.addEventListener("change", () => saveOptions().catch((error) => setStatus(error.message, true)));
detailCaptureFansScreenshot.addEventListener("change", () => saveOptions().catch((error) => setStatus(error.message, true)));
detailCaptureNoteScreenshot.addEventListener("change", () => saveOptions().catch((error) => setStatus(error.message, true)));

loadOptions().catch((error) => setStatus(error.message, true));
