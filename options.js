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

const detailTraverseAllSheets = document.getElementById("detailTraverseAllSheets");
const statusNode = document.getElementById("status");
const extensionId = document.getElementById("extensionId");
const appIdState = document.getElementById("appIdState");
const syncTargetState = document.getElementById("syncTargetState");

function setStatus(text, isError = false) {
  statusNode.textContent = text;
  statusNode.classList.toggle("is-error", Boolean(isError));
}

function setState(node, text, state = "idle") {
  node.textContent = text;
  node.dataset.state = state;
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

function savedConfigSummary(options) {
  const saved = [];
  if (options.feishuAppId) saved.push("App ID");
  if (options.feishuAppSecret) saved.push("App Secret");
  return saved.length ? `已读取配置：${saved.join("、")}。` : "当前插件实例没有读取到已保存的飞书配置。";
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
  const options = await chrome.storage.local.get(DEFAULT_OPTIONS);
  for (const [key, input] of Object.entries(fields)) {
    input.value = options[key] ?? DEFAULT_OPTIONS[key] ?? "";
  }
  detailTraverseAllSheets.checked = Boolean(options.detailTraverseAllSheets);
  refreshState(options);
  setStatus(`${savedConfigSummary(options)}扩展 ID：${chrome.runtime.id}`);
}

async function saveOptions({ silent = false } = {}) {
  const previous = await chrome.storage.local.get(DEFAULT_OPTIONS);
  const options = mergePersistentOptions(previous, currentOptions());
  await chrome.storage.local.set(options);
  const saved = await chrome.storage.local.get(DEFAULT_OPTIONS);
  const missing = ["feishuAppId", "feishuAppSecret", "feishuUrl", "detailFeishuUrl"].filter((key) => options[key] && !saved[key]);
  if (missing.length) throw new Error(`配置保存后读回失败：${missing.join(", ")}`);
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

for (const input of Object.values(fields)) {
  input.addEventListener("change", () => saveOptions().catch((error) => setStatus(error.message, true)));
  input.addEventListener("input", () => refreshState());
}
detailTraverseAllSheets.addEventListener("change", () => saveOptions().catch((error) => setStatus(error.message, true)));

loadOptions().catch((error) => setStatus(error.message, true));
