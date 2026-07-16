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
  syncUpdateExisting: true,
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
    id: crypto.randomUUID(),
    name: "",
    url: "",
    sheetId: "",
    tableName: "",
    sheetName: "",
    resourceType: "",
    sheets: [],
    noSheets: false,
    isDefault: false,
    persisted: false
  };
}

function normalizeTableConfigs(configs) {
  return (Array.isArray(configs) ? configs : [])
    .map((item) => ({
      id: String(item?.id || "").trim() || crypto.randomUUID(),
      name: String(item?.name || "").trim(),
      url: String(item?.url || "").trim(),
      sheetId: String(item?.sheetId || item?.tableId || "").trim(),
      tableName: String(item?.tableName || "").trim(),
      sheetName: String(item?.sheetName || "").trim(),
      resourceType: String(item?.resourceType || "").trim(),
      noSheets: Boolean(item?.noSheets),
      isDefault: Boolean(item?.isDefault)
    }))
    .filter((item) => item.name || item.url || item.sheetId);
}

function mapTableConfigsForUi(configs) {
  return (Array.isArray(configs) ? configs : []).map((item) => ({
    id: String(item?.id || "").trim() || crypto.randomUUID(),
    name: String(item?.name || "").trim(),
    url: String(item?.url || "").trim(),
    sheetId: String(item?.sheetId || item?.tableId || "").trim(),
    tableName: String(item?.tableName || "").trim(),
    sheetName: String(item?.sheetName || "").trim(),
    resourceType: String(item?.resourceType || "").trim(),
    sheets: Array.isArray(item?.sheets) ? item.sheets : [],
    noSheets: Boolean(item?.noSheets),
    isDefault: Boolean(item?.isDefault),
    persisted: item?.persisted !== false
  }));
}

function tableConfigsForUi(options) {
  const configs = mapTableConfigsForUi(options.feishuTableConfigs);
  const hasExplicitDefault = (Array.isArray(options.feishuTableConfigs) ? options.feishuTableConfigs : [])
    .some((item) => Object.prototype.hasOwnProperty.call(item || {}, "isDefault"));
  if (!hasExplicitDefault && options.feishuUrl) {
    const matched = configs.find((config) => config.url === options.feishuUrl && (!options.feishuSheetId || config.sheetId === options.feishuSheetId));
    if (matched) matched.isDefault = true;
  }
  return configs;
}

function ensureVisibleTableConfigs(configs) {
  const mapped = mapTableConfigsForUi(configs);
  return mapped.length ? mapped : [createTableConfig()];
}

function sheetChoicesFromRow(row) {
  return Array.from(row.querySelectorAll('[data-field="sheetChoice"]'));
}

function availableSheetsFromRow(row) {
  return sheetChoicesFromRow(row).map((input) => ({
    sheetId: input.value,
    title: input.dataset.title || input.value
  }));
}

function readTableConfigsFromRow(row) {
  const base = {
    name: row.querySelector('[data-field="name"]').value.trim(),
    url: row.querySelector('[data-field="url"]').value.trim(),
    tableName: row.dataset.tableName || "",
    resourceType: row.dataset.resourceType || "",
    persisted: row.dataset.persisted === "true",
    sheets: availableSheetsFromRow(row)
  };
  const selectedChoices = sheetChoicesFromRow(row).filter((input) => input.checked);
  if (selectedChoices.length) {
    return selectedChoices.map((input) => ({
      ...base,
      id: input.dataset.configId || crypto.randomUUID(),
      sheetId: input.value,
      sheetName: input.dataset.title || input.value,
      noSheets: false,
      isDefault: Boolean(row.querySelector(`[data-field="defaultSheet"][value="${CSS.escape(input.value)}"]`)?.checked)
    }));
  }
  return [{
    ...base,
    id: row.dataset.configId || crypto.randomUUID(),
    sheetId: "",
    sheetName: "",
    noSheets: row.dataset.noSheets === "true",
    isDefault: Boolean(row.querySelector('[data-field="defaultNoSheet"]')?.checked)
  }];
}

function readTableConfigsFromDom() {
  return Array.from(tableConfigList.querySelectorAll(".table-config-row")).flatMap(readTableConfigsFromRow);
}

function sheetOptions(config) {
  const sheets = Array.isArray(config.sheets) ? config.sheets : [];
  if (!sheets.length && config.sheetId) return [{ sheetId: config.sheetId, title: config.sheetName || config.sheetId }];
  return sheets;
}

function createSheetChoice(sheet, { checked = false, isDefault = false, configId = "" } = {}) {
  const choice = document.createElement("div");
  choice.className = "sheet-choice";
  const selectionLabel = document.createElement("label");
  selectionLabel.className = "sheet-choice-main";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.field = "sheetChoice";
  checkbox.value = sheet.sheetId || sheet.tableId || "";
  checkbox.dataset.title = sheet.title || checkbox.value;
  checkbox.dataset.configId = configId || crypto.randomUUID();
  checkbox.checked = checked;
  const title = document.createElement("span");
  title.className = "sheet-choice-title";
  title.textContent = checkbox.dataset.title;
  selectionLabel.append(checkbox, title);
  const defaultLabel = document.createElement("label");
  defaultLabel.className = "sheet-default-choice";
  const defaultInput = document.createElement("input");
  defaultInput.type = "radio";
  defaultInput.name = "defaultWriteTable";
  defaultInput.dataset.field = "defaultSheet";
  defaultInput.value = checkbox.value;
  defaultInput.checked = checked && isDefault;
  defaultInput.disabled = !checked;
  const defaultText = document.createElement("span");
  defaultText.textContent = "默认";
  defaultLabel.append(defaultInput, defaultText);
  choice.append(selectionLabel, defaultLabel);
  return choice;
}

function renderTableConfigs(configs = tableConfigs) {
  tableConfigs = ensureVisibleTableConfigs(configs);
  tableConfigList.textContent = "";
  tableConfigs.forEach((config, index) => {
    const row = document.createElement("div");
    row.className = "table-config-row";
    row.dataset.index = String(index);
    row.dataset.configId = config.id;
    row.dataset.persisted = String(Boolean(config.persisted));
    row.dataset.tableName = config.tableName || "";
    row.dataset.sheetName = config.sheetName || "";
    row.dataset.resourceType = config.resourceType || "";
    row.dataset.noSheets = String(Boolean(config.noSheets));
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
        <div class="sheet-selector">
          <span>选择子表</span>
          <div class="sheet-choice-list" data-role="sheetChoices"></div>
          <p class="sheet-empty-note${config.noSheets ? " is-visible" : ""}" data-role="sheetEmptyNote">未检测到子表，可直接保存当前表格。</p>
        </div>
        <div class="table-config-save${config.tableName && (config.sheetId || config.noSheets) ? " is-visible" : ""}" data-role="savePanel">
          <label class="default-table-choice no-sheet-default${config.noSheets ? " is-visible" : ""}" data-role="noSheetDefault">
            <input data-field="defaultNoSheet" name="defaultWriteTable" type="radio" />
            <span>设为默认写入表</span>
          </label>
          <span class="multi-select-tip${sheetOptions(config).length > 1 ? " is-visible" : ""}" data-role="multiSelectTip">可勾选多个子表批量保存</span>
          <div class="table-save-action">
            <span class="saved-table-badge${config.persisted ? " is-visible" : ""}" data-role="savedBadge">已保存</span>
            <button data-action="save-table" type="button" class="compact">${config.persisted ? "更新该表配置" : "保存该表配置"}</button>
          </div>
        </div>
      </div>
    `;
    row.querySelector('[data-field="name"]').value = config.name || "";
    row.querySelector('[data-field="url"]').value = config.url || "";
    row.querySelector('[data-role="tableName"]').textContent = config.tableName || "等待检测";
    const choices = row.querySelector('[data-role="sheetChoices"]');
    for (const sheet of sheetOptions(config)) {
      const sheetId = sheet.sheetId || sheet.tableId || "";
      choices.append(createSheetChoice(sheet, {
        checked: sheetId === config.sheetId,
        isDefault: Boolean(config.isDefault),
        configId: sheetId === config.sheetId ? config.id : ""
      }));
    }
    row.querySelector('[data-field="defaultNoSheet"]').checked = Boolean(config.noSheets && config.isDefault);
    tableConfigList.append(row);
  });
}

function updateTableSavePanel(row) {
  const selected = Boolean(row.dataset.tableName && (row.dataset.noSheets === "true" || sheetChoicesFromRow(row).some((input) => input.checked)));
  row.querySelector('[data-role="savePanel"]').classList.toggle("is-visible", selected);
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
    const sheets = result.sheets || [];
    const choices = row.querySelector('[data-role="sheetChoices"]');
    choices.textContent = "";
    sheets.forEach((sheet, index) => choices.append(createSheetChoice(sheet, {
      checked: sheets.length === 1,
      configId: index === 0 ? row.dataset.configId : ""
    })));
    row.dataset.tableName = result.tableName;
    row.dataset.resourceType = result.resourceType || "";
    row.dataset.sheetName = "";
    row.dataset.noSheets = String(sheets.length === 0);
    row.querySelector('[data-role="tableName"]').textContent = row.dataset.tableName;
    row.querySelector('[data-role="detectedInfo"]').classList.add("is-visible");
    row.querySelector('[data-role="sheetEmptyNote"]').classList.toggle("is-visible", sheets.length === 0);
    row.querySelector('[data-role="noSheetDefault"]').classList.toggle("is-visible", sheets.length === 0);
    row.querySelector('[data-role="multiSelectTip"]').classList.toggle("is-visible", sheets.length > 1);
    row.dataset.persisted = "false";
    updateTableSavePanel(row);
    if (!sheets.length) {
      setStatus(`检测通过：${row.dataset.tableName}。未发现子表，可直接保存当前表格。`);
    } else if (sheets.length === 1) {
      setStatus(`检测通过：${row.dataset.tableName}。已自动选择唯一子表，可直接保存。`);
    } else {
      setStatus(`检测通过：${row.dataset.tableName}。可勾选一个或多个子表后批量保存。`);
    }
  } finally {
    button.disabled = false;
    button.textContent = "重新检测";
  }
}

async function saveTableConfig(row) {
  const configs = readTableConfigsFromRow(row);
  const draft = configs[0];
  if (!fields.feishuAppId.value.trim() || !fields.feishuAppSecret.value.trim()) throw new Error("请先填写飞书 App ID 和 App Secret。");
  if (!draft?.tableName) throw new Error("请先检测飞书表格链接。");
  if (!draft.noSheets && !configs.some((config) => config.sheetId)) throw new Error("请至少勾选一个要保存的子表。");

  const saved = await chrome.storage.local.get(DEFAULT_OPTIONS);
  const savedConfigs = normalizeTableConfigs(tableConfigsForUi(saved));
  const nextBatch = normalizeTableConfigs(configs);
  const batchKeys = new Set(nextBatch.map((config) => JSON.stringify([config.url, config.sheetId])));
  let nextConfigs = savedConfigs.filter((item) => (
    item.id !== row.dataset.configId
    && !batchKeys.has(JSON.stringify([item.url, item.sheetId]))
  ));
  if (nextBatch.some((config) => config.isDefault)) nextConfigs = nextConfigs.map((item) => ({ ...item, isDefault: false }));
  nextConfigs.push(...nextBatch);
  const defaultConfig = nextConfigs.find((config) => config.isDefault);

  const next = {
    feishuAppId: fields.feishuAppId.value.trim(),
    feishuAppSecret: fields.feishuAppSecret.value.trim(),
    feishuTableConfigs: nextConfigs
  };
  if (defaultConfig) {
    next.feishuUrl = defaultConfig.url;
    next.feishuSheetId = defaultConfig.sheetId;
    fields.feishuUrl.value = defaultConfig.url;
    fields.feishuSheetId.value = defaultConfig.sheetId;
  } else if (hasManagedDefault(saved)) {
    next.feishuUrl = "";
    next.feishuSheetId = "";
    fields.feishuUrl.value = "";
    fields.feishuSheetId.value = "";
  }
  await chrome.storage.local.set(next);

  tableConfigs = ensureVisibleTableConfigs(nextConfigs);
  renderTableConfigs(tableConfigs);
  refreshState({ ...currentOptions(), ...next });
  const defaultText = nextBatch.some((config) => config.isDefault) ? "，并已设置默认写入表" : "";
  if (nextBatch.length === 1) {
    const config = nextBatch[0];
    setStatus(`已保存：${config.tableName}${config.sheetName ? ` / ${config.sheetName}` : "（无子表）"}${defaultText}。`);
  } else {
    setStatus(`已批量保存 ${nextBatch.length} 个子表配置：${nextBatch.map((config) => config.sheetName || config.sheetId).join("、")}${defaultText}。`);
  }
}

function currentOptions() {
  const feishuTableConfigs = normalizeTableConfigs(readTableConfigsFromDom());
  const defaultConfig = feishuTableConfigs.find((config) => config.isDefault);
  return {
    feishuAppId: fields.feishuAppId.value.trim(),
    feishuAppSecret: fields.feishuAppSecret.value.trim(),
    feishuUrl: defaultConfig ? defaultConfig.url : fields.feishuUrl.value.trim(),
    feishuSheetId: defaultConfig ? defaultConfig.sheetId : fields.feishuSheetId.value.trim(),
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
    feishuTableConfigs
  };
}

function hasManagedDefault(options) {
  const configs = Array.isArray(options.feishuTableConfigs) ? options.feishuTableConfigs : [];
  if (configs.some((config) => config?.isDefault)) return true;
  return Boolean(options.feishuUrl && configs.some((config) => config?.url === options.feishuUrl && (!options.feishuSheetId || (config.sheetId || config.tableId) === options.feishuSheetId)));
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
  renderTableConfigs(tableConfigsForUi(options));
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
  const incompleteConfig = readTableConfigsFromDom().find((config) => config.url && (!config.tableName || (!config.sheetId && !config.noSheets)));
  if (incompleteConfig) throw new Error(`表格配置“${incompleteConfig.name || incompleteConfig.url}”尚未检测或未勾选子表。`);
  const previous = await chrome.storage.local.get(DEFAULT_OPTIONS);
  const next = currentOptions();
  const shouldClearManagedDefault = hasManagedDefault(previous) && !next.feishuTableConfigs.some((config) => config.isDefault);
  const options = mergePersistentOptions(previous, next);
  if (shouldClearManagedDefault) {
    options.feishuUrl = "";
    options.feishuSheetId = "";
  }
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
  const row = event.target.closest(".table-config-row");
  if (row && event.target.matches('[data-field="name"], [data-field="url"]')) {
    row.dataset.persisted = "false";
    row.querySelector('[data-role="savedBadge"]').classList.remove("is-visible");
    row.querySelector('[data-action="save-table"]').textContent = "保存该表配置";
  }
  if (event.target.matches('[data-field="url"]')) {
    row.dataset.tableName = "";
    row.dataset.sheetName = "";
    row.dataset.resourceType = "";
    row.dataset.noSheets = "false";
    row.querySelector('[data-role="detectedInfo"]').classList.remove("is-visible");
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
  if (button.dataset.action === "save-table") {
    saveTableConfig(row).catch((error) => setStatus(error.message, true));
    return;
  }
  const removedIndex = Number(row?.dataset.index || -1);
  const next = Array.from(tableConfigList.querySelectorAll(".table-config-row")).flatMap((item, index) => (
    index === removedIndex ? [] : readTableConfigsFromRow(item)
  ));
  renderTableConfigs(next);
  setStatus("已删除表格配置，点击“保存设置”后生效。");
});

tableConfigList.addEventListener("change", (event) => {
  const row = event.target.closest(".table-config-row");
  if (!row) return;
  if (event.target.matches('[data-field="sheetChoice"]')) {
    const defaultInput = row.querySelector(`[data-field="defaultSheet"][value="${CSS.escape(event.target.value)}"]`);
    if (defaultInput) {
      defaultInput.disabled = !event.target.checked;
      if (!event.target.checked) defaultInput.checked = false;
    }
    row.dataset.persisted = "false";
    row.querySelector('[data-role="savedBadge"]').classList.remove("is-visible");
    row.querySelector('[data-action="save-table"]').textContent = "保存该表配置";
    updateTableSavePanel(row);
  }
  if (event.target.matches('[data-field="defaultSheet"], [data-field="defaultNoSheet"]')) {
    row.dataset.persisted = "false";
    row.querySelector('[data-role="savedBadge"]').classList.remove("is-visible");
    row.querySelector('[data-action="save-table"]').textContent = "保存该表配置";
  }
});

detailTraverseAllSheets.addEventListener("change", () => saveOptions().catch((error) => setStatus(error.message, true)));
detailCaptureFansScreenshot.addEventListener("change", () => saveOptions().catch((error) => setStatus(error.message, true)));
detailCaptureNoteScreenshot.addEventListener("change", () => saveOptions().catch((error) => setStatus(error.message, true)));

loadOptions().catch((error) => setStatus(error.message, true));
