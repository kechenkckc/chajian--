const DEFAULT_OPTIONS = {
  feishuAppId: "",
  feishuAppSecret: "",
  feishuUrl: "",
  feishuSheetId: "",
  detailFeishuUrl: "",
  detailFeishuSheetId: "",
  detailTraverseAllSheets: false,
  pageSize: 50,
  maxRows: 5000,
  detailLimit: "",
  delayMs: 250
};
const FEISHU_CONFIG_KEYS = ["feishuAppId", "feishuAppSecret", "feishuUrl", "feishuSheetId", "detailFeishuUrl", "detailFeishuSheetId"];

const fields = {
  feishuAppId: document.getElementById("feishuAppId"),
  feishuAppSecret: document.getElementById("feishuAppSecret"),
  feishuUrl: document.getElementById("feishuUrl"),
  feishuSheetId: document.getElementById("feishuSheetId"),
  detailFeishuUrl: document.getElementById("detailFeishuUrl"),
  detailFeishuSheetId: document.getElementById("detailFeishuSheetId"),
  pageSize: document.getElementById("pageSize"),
  maxRows: document.getElementById("maxRows"),
  detailLimit: document.getElementById("detailLimit")
};

const writeToFeishuOnExport = document.getElementById("writeToFeishuOnExport");
const syncSourceCurrentBtn = document.getElementById("syncSourceCurrentBtn");
const syncSourceImportedBtn = document.getElementById("syncSourceImportedBtn");
const csvRow = document.getElementById("csvRow");
const csvFile = document.getElementById("csvFile");
const syncHint = document.getElementById("syncHint");
const exportHint = document.getElementById("exportHint");
const statusNode = document.getElementById("status");
const syncStateBadge = document.getElementById("syncStateBadge");
const detailStateBadge = document.getElementById("detailStateBadge");
const syncBtn = document.getElementById("syncBtn");
const syncValidateBtn = document.getElementById("syncValidateBtn");
const backfillBtn = document.getElementById("backfillBtn");
const detailTraverseAllSheets = document.getElementById("detailTraverseAllSheets");
const detailValidateBtn = document.getElementById("detailValidateBtn");
const detailHint = document.getElementById("detailHint");
const FEISHU_PERMISSION_HINT = "请检查权限，设为所有人可编辑";

let importedRows = [];
let latestRows = [];
let syncSource = "current";
let detailMultiSheetAvailable = false;

function setStatus(text, isError = false) {
  statusNode.textContent = text;
  statusNode.classList.toggle("is-error", Boolean(isError));
}

function savedConfigSummary(options) {
  const saved = [];
  if (options.feishuAppId) saved.push("App ID");
  if (options.feishuAppSecret) saved.push("App Secret");
  if (options.feishuUrl) saved.push("同步表格");
  if (options.detailFeishuUrl) saved.push("详情表格");
  return saved.length ? `已读取配置：${saved.join("、")}。` : "当前插件实例没有读取到已保存的飞书配置。";
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
    pageSize: Number(fields.pageSize.value || DEFAULT_OPTIONS.pageSize),
    maxRows: Number(fields.maxRows.value || DEFAULT_OPTIONS.maxRows),
    detailLimit: fields.detailLimit.value ? Number(fields.detailLimit.value) : "",
    delayMs: DEFAULT_OPTIONS.delayMs
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

function syncReady(options = currentOptions()) {
  return Boolean(options.feishuAppId && options.feishuAppSecret && options.feishuUrl);
}

function detailReady(options = currentOptions()) {
  return Boolean(
    options.feishuAppId &&
      options.feishuAppSecret &&
      options.detailFeishuUrl &&
      options.detailFeishuUrl !== options.feishuUrl
  );
}

function detailReadinessMessage(options = currentOptions()) {
  if (options.detailFeishuUrl && options.detailFeishuUrl === options.feishuUrl) {
    return "需补足详情的飞书表格不能和同步达人飞书表格相同。";
  }
  const missing = [];
  if (!options.feishuAppId) missing.push("App ID");
  if (!options.feishuAppSecret) missing.push("App Secret");
  if (!options.detailFeishuUrl) missing.push("详情表格链接");
  return missing.length ? `补足详情还缺：${missing.join("、")}。` : "补足详情需要填写 App ID、App Secret 和详情表格。";
}

function setSyncSource(nextSource) {
  syncSource = nextSource;
  const isImported = syncSource === "imported";
  syncSourceCurrentBtn.classList.toggle("active", !isImported);
  syncSourceCurrentBtn.setAttribute("aria-pressed", String(!isImported));
  syncSourceImportedBtn.classList.toggle("active", isImported);
  syncSourceImportedBtn.setAttribute("aria-pressed", String(isImported));
  csvRow.classList.toggle("hidden", !isImported);
  syncHint.textContent = isImported ? "选择本地已下载的达人 CSV，再写入飞书。" : "直接从当前蒲公英筛选条件采集并写入飞书。";
}

function updateCapabilityState() {
  const options = currentOptions();
  const syncOk = syncReady(options);
  const detailOk = detailReady(options);

  syncStateBadge.textContent = syncOk ? "同步已就绪" : "同步未就绪";
  syncStateBadge.classList.toggle("badge-alt", !syncOk);
  detailStateBadge.textContent = detailOk ? "详情已就绪" : "详情未就绪";
  detailStateBadge.classList.toggle("badge-alt", !detailOk);

  writeToFeishuOnExport.disabled = !syncOk;
  if (!syncOk) writeToFeishuOnExport.checked = false;

  exportHint.textContent = syncOk
    ? "勾选后，导出完成会直接写回飞书同步表格。"
    : "先补全飞书 App ID、App Secret 和同步达人飞书表格，才能勾选直写。";

  syncBtn.disabled = !syncOk;
  syncValidateBtn.disabled = !syncOk;
  backfillBtn.disabled = !detailOk;
  detailValidateBtn.disabled = !detailOk;
  detailTraverseAllSheets.disabled = !detailOk || !detailMultiSheetAvailable || Boolean(options.detailFeishuSheetId);
  if (detailTraverseAllSheets.disabled) detailTraverseAllSheets.checked = false;

  if (!detailOk) {
    const sameUrl = options.detailFeishuUrl && options.detailFeishuUrl === options.feishuUrl;
    syncHint.textContent = sameUrl
      ? "需补足详情的飞书表格不能和同步达人飞书表格相同。"
      : syncSource === "imported"
        ? "选择本地已下载的达人 CSV，再写入飞书。"
        : "直接从当前蒲公英筛选条件采集并写入飞书。";
  }

  if (!detailOk) {
    detailHint.textContent = detailReadinessMessage(options);
  } else if (options.detailFeishuSheetId) {
    detailHint.textContent = "已指定详情子表 ID，将只补足该子表。";
  } else if (detailMultiSheetAvailable) {
    detailHint.textContent = "检测到多个子表，可勾选遍历所有子表；每个子表会按自己的表头格式识别和写回。";
  } else {
    detailHint.textContent = "先检测详情表；如果有多个子表，会允许开启遍历。";
  }
}

async function loadOptions() {
  const options = await chrome.storage.local.get(DEFAULT_OPTIONS);
  for (const [key, input] of Object.entries(fields)) {
    input.value = options[key] ?? DEFAULT_OPTIONS[key] ?? "";
  }
  detailTraverseAllSheets.checked = Boolean(options.detailTraverseAllSheets);
  detailMultiSheetAvailable = Boolean(options.detailTraverseAllSheets);
  setSyncSource("current");
  updateCapabilityState();
  setStatus(`${savedConfigSummary(options)}扩展 ID：${chrome.runtime.id}`);
}

async function saveOptions() {
  const previous = await chrome.storage.local.get(DEFAULT_OPTIONS);
  const options = mergePersistentOptions(previous, currentOptions());
  await chrome.storage.local.set(options);
  const saved = await chrome.storage.local.get(DEFAULT_OPTIONS);
  const missing = ["feishuAppId", "feishuAppSecret", "feishuUrl", "detailFeishuUrl"].filter((key) => options[key] && !saved[key]);
  if (missing.length) throw new Error(`配置保存后读回失败：${missing.join(", ")}`);
  await sendToActiveTab({ type: "PGY_SAVE_OPTIONS", options }).catch(() => null);
  updateCapabilityState();
  setStatus(`${savedConfigSummary(saved)}扩展 ID：${chrome.runtime.id}`);
  return options;
}

async function activePgyTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !String(tab.url || "").includes("pgy.xiaohongshu.com")) {
    throw new Error("请先切到蒲公英页面。");
  }
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await activePgyTab();
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    const text = String(error?.message || error || "");
    if (!text.includes("Receiving end does not exist") && !text.includes("Could not establish connection")) {
      throw error;
    }
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] }).catch(() => null);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await new Promise((resolve) => setTimeout(resolve, 500));
    return chrome.tabs.sendMessage(tab.id, message);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  const headers = (rows.shift() || []).map((value) => value.trim());
  return rows
    .filter((line) => line.some((value) => String(value || "").trim()))
    .map((line) => {
      const item = {};
      headers.forEach((header, index) => {
        if (header) item[header] = line[index] ?? "";
      });
      return item;
    });
}

async function readImportedCsv() {
  const file = csvFile.files?.[0];
  if (!file) throw new Error("请先选择已下载的达人 CSV。");
  const text = await file.text();
  importedRows = parseCsv(text);
  if (!importedRows.length) throw new Error("CSV 里没有可同步的数据。");
  setStatus(`已读取 ${importedRows.length} 行本地表格。`);
  return importedRows;
}

async function validateSyncTarget() {
  const options = await saveOptions();
  const result = await chrome.runtime.sendMessage({ type: "VALIDATE_FEISHU_SYNC_TARGET", options });
  if (!result?.ok) throw new Error(FEISHU_PERMISSION_HINT);
  return options;
}

async function validateSyncTargetStatus() {
  const options = await saveOptions();
  const result = await chrome.runtime.sendMessage({ type: "VALIDATE_FEISHU_SYNC_TARGET", options });
  if (!result?.ok) throw new Error(FEISHU_PERMISSION_HINT);
  return result;
}

async function validateDetailTarget() {
  const options = await saveOptions();
  const result = await chrome.runtime.sendMessage({ type: "VALIDATE_FEISHU_DETAIL_TARGET", options });
  if (!result?.ok) throw new Error(FEISHU_PERMISSION_HINT);
  detailMultiSheetAvailable = Boolean((result.sheetCount > 1 || result.tableCount > 1) && !options.detailFeishuSheetId);
  updateCapabilityState();
  return { options, result };
}

function describeDetailValidation(result) {
  if (result?.resourceType === "bitable") {
    return `详情表检测通过，多维表格 ${result.tableId || "-"}。`;
  }
  if (result?.sheetCount > 1) {
    return result.traverseAllSheets || result.requiresMultiSheetChoice
      ? `检测到 ${result.sheetCount} 个子表，可开启遍历所有子表。`
      : `检测到 ${result.sheetCount} 个子表，当前将处理指定子表。`;
  }
  return "详情表检测通过，将按单子表补足。";
}

async function validateDetailTargetForRun() {
  const { options, result } = await validateDetailTarget();
  if (result?.requiresMultiSheetChoice && !options.detailTraverseAllSheets) {
    throw new Error(`检测到 ${result.sheetCount} 个子表。请勾选“遍历所有子表”，或填写详情子表 ID 后再补足。`);
  }
  return options;
}

async function exportCurrentRows(download = true) {
  const result = await sendToActiveTab({ type: "PGY_EXPORT_ALL", download });
  if (!result?.ok) throw new Error(result?.message || "导出失败");
  latestRows = Array.isArray(result.rows) ? result.rows : [];
  return result;
}

async function syncRows(rows, options) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("没有可同步的数据。");
  const result = await chrome.runtime.sendMessage({ type: "SYNC_FEISHU_DIRECT", rows, options });
  if (!result?.ok) throw new Error(result?.message || "同步失败");
  return result;
}

async function exportCsv() {
  const options = await saveOptions();
  if (writeToFeishuOnExport.checked) {
    await validateSyncTarget();
  }
  setStatus("正在导出当前筛选下的达人...");
  const result = await exportCurrentRows(true);
  if (writeToFeishuOnExport.checked) {
    setStatus("正在把导出的达人写回飞书...");
    await syncRows(latestRows, options);
    setStatus(`已导出并写回飞书，共 ${latestRows.length} 条。`);
    return;
  }
  setStatus(`已导出当前达人表格，共 ${latestRows.length} 条。`);
}

async function syncSelectedRows() {
  const options = await validateSyncTarget();
  let rows = [];
  if (syncSource === "imported") {
    rows = importedRows.length ? importedRows : await readImportedCsv();
  } else {
    setStatus("正在读取当前筛选下的达人...");
    const result = await exportCurrentRows(false);
    rows = result.rows || [];
  }
  setStatus("正在写入飞书...");
  const result = await syncRows(rows, options);
  const targetText = result.resourceType === "bitable" ? "多维表格" : "电子表格";
  setStatus(`同步完成，已写入飞书${targetText} ${result.writtenCount || rows.length} 条。`);
}

async function backfillDetails() {
  const options = await validateDetailTargetForRun();
  const limit = Number(fields.detailLimit.value || options.detailLimit || 0);
  setStatus("正在补足详情并写回飞书...");
  const result = await chrome.runtime.sendMessage({
    type: "BACKFILL_DETAILS_FROM_FEISHU",
    options,
    limit
  });
  if (!result?.ok) throw new Error(result?.message || "补足详情失败");
  const stoppedText = result.stopped ? "，已中止" : "";
  const targetText = result.resourceType === "bitable" ? "多维表格" : "电子表格";
  const firstError = Array.isArray(result.errorSamples) && result.errorSamples.length
    ? ` 首个失败原因：${result.errorSamples[0].message}`
    : "";
  const firstWarning = Array.isArray(result.warningSamples) && result.warningSamples.length
    ? ` 首个提示：${result.warningSamples[0].message}`
    : "";
  const firstWriteFailure = Array.isArray(result.writeFailures) && result.writeFailures.length
    ? ` 首个写入失败：${result.writeFailures[0].sheetTitle || result.writeFailures[0].tableTitle || ""} ${result.writeFailures[0].columnName || ""}${result.writeFailures[0].rowNumber || ""} ${result.writeFailures[0].message || ""}`.replace(/\s+/g, " ")
    : "";
  const firstNoop = Array.isArray(result.noopSamples) && result.noopSamples.length
    ? ` 首个未写入样本：${result.noopSamples[0].sheetTitle || result.noopSamples[0].tableTitle || ""} 第${result.noopSamples[0].rowNumber || "?"}行没有可写值。`.replace(/\s+/g, " ")
    : "";
  const writtenText = result.writtenCells ? `，写入 ${result.writtenCells} 个单元格` : "";
  setStatus(`补足详情完成${stoppedText}，已写回飞书${targetText}：成功 ${result.completed || 0}，失败 ${result.failed || 0}${writtenText}。${firstError}${firstWarning}${firstWriteFailure}${firstNoop}`);
}

async function stopExport() {
  const result = await sendToActiveTab({ type: "PGY_STOP_EXPORT" });
  if (!result?.ok) throw new Error(result?.message || "停止采集失败");
  setStatus("已发送停止采集指令。");
}

async function stopDetail() {
  const result = await chrome.runtime.sendMessage({ type: "STOP_DETAIL_BACKFILL" });
  if (!result?.ok) throw new Error(result?.message || "停止补足失败");
  setStatus("已发送停止补足指令。");
}

for (const input of Object.values(fields)) {
  input.addEventListener("input", () => {
    if (input === fields.detailFeishuUrl || input === fields.detailFeishuSheetId) {
      detailMultiSheetAvailable = false;
      detailTraverseAllSheets.checked = false;
    }
    updateCapabilityState();
  });

  input.addEventListener("change", () => {
    if (input === fields.detailFeishuUrl || input === fields.detailFeishuSheetId) {
      detailMultiSheetAvailable = false;
      detailTraverseAllSheets.checked = false;
    }
    saveOptions().catch((error) => setStatus(error.message, true));
  });
}

writeToFeishuOnExport.addEventListener("change", () => {
  const options = currentOptions();
  if (writeToFeishuOnExport.checked && !syncReady(options)) {
    writeToFeishuOnExport.checked = false;
    setStatus("先补全 App ID、App Secret 和同步飞书表格，才能勾选直写。", true);
    updateCapabilityState();
    return;
  }
  saveOptions().catch((error) => setStatus(error.message, true));
});
detailTraverseAllSheets.addEventListener("change", () => saveOptions().catch((error) => setStatus(error.message, true)));

syncSourceCurrentBtn.addEventListener("click", () => setSyncSource("current"));
syncSourceImportedBtn.addEventListener("click", () => setSyncSource("imported"));
csvFile.addEventListener("change", () => readImportedCsv().catch((error) => setStatus(error.message, true)));

document.getElementById("exportBtn").addEventListener("click", () => exportCsv().catch((error) => setStatus(error.message, true)));
document.getElementById("stopExportBtn").addEventListener("click", () => stopExport().catch((error) => setStatus(error.message, true)));
syncValidateBtn.addEventListener("click", () => validateSyncTargetStatus().then((result) => setStatus(describeSyncValidation(result))).catch((error) => setStatus(error.message, true)));
syncBtn.addEventListener("click", () => syncSelectedRows().catch((error) => setStatus(error.message, true)));
function describeSyncValidation(result) {
  if (result?.resourceType === "bitable") return `同步目标可写，多维表格 ${result.tableId || "-"}。`;
  return `同步目标可写，电子表格子表 ${result?.sheetId || "-"}。`;
}

detailValidateBtn.addEventListener("click", () => validateDetailTarget().then(({ result }) => setStatus(describeDetailValidation(result))).catch((error) => setStatus(error.message, true)));
backfillBtn.addEventListener("click", () => backfillDetails().catch((error) => setStatus(error.message, true)));
document.getElementById("stopDetailBtn").addEventListener("click", () => stopDetail().catch((error) => setStatus(error.message, true)));
document.getElementById("saveBtn").addEventListener("click", () => saveOptions().then(() => setStatus("配置已保存。")).catch((error) => setStatus(error.message, true)));
document.getElementById("openOptionsBtn").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_PAGE" }).catch((error) => setStatus(error.message, true)));

loadOptions().catch((error) => setStatus(error.message, true));
