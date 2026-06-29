(() => {
  if (window.__PGY_EXPORTER_CONTENT_INSTALLED__) return;
  window.__PGY_EXPORTER_CONTENT_INSTALLED__ = true;

  const EXT_SOURCE = "pgy-exporter-extension";
  const PAGE_SOURCE = "pgy-exporter-page";
  const DEFAULT_OPTIONS = {
    feishuAppId: "",
    feishuAppSecret: "",
    feishuUrl: "",
    feishuSheetId: "",
    detailFeishuUrl: "",
    detailFeishuSheetId: "",
    pageSize: 50,
    maxRows: 5000,
    delayMs: 250
  };

  let latestRows = [];
  let latestCapture = null;
  let latestProgress = "";
  let exporting = false;

  function injectPageHook() {
    if (document.getElementById("pgy-exporter-page-hook")) return;
    const script = document.createElement("script");
    script.id = "pgy-exporter-page-hook";
    script.src = chrome.runtime.getURL("page-hook.js");
    script.onload = () => script.remove();
    (document.documentElement || document.head).appendChild(script);
  }

  function loadOptions() {
    return chrome.storage.local.get(DEFAULT_OPTIONS);
  }

  function saveOptions(patch) {
    return chrome.storage.local.set(patch);
  }

  function requestFromPage(type, options = {}, timeoutMs = 180000) {
    const requestId = `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("页面响应超时，请确认蒲公英列表页已加载完成。"));
      }, timeoutMs);

      function onMessage(event) {
        const message = event.data || {};
        if (event.source !== window || message.source !== PAGE_SOURCE || message.requestId !== requestId) return;
        if (message.type === "EXPORT_PROGRESS") {
          latestProgress = message.payload?.message || "";
          renderPanel();
          return;
        }
        if (message.type.endsWith("_RESULT")) {
          clearTimeout(timeout);
          window.removeEventListener("message", onMessage);
          if (message.payload?.ok === false) reject(new Error(message.payload.message || "蒲公英页面执行失败"));
          else resolve(message.payload || {});
        }
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ source: EXT_SOURCE, type, requestId, options }, "*");
    });
  }

  async function getCapture() {
    latestCapture = await requestFromPage("GET_CAPTURE", {}, 8000);
    renderPanel();
    return latestCapture;
  }

  async function exportAll({ download = true } = {}) {
    const options = await loadOptions();
    exporting = true;
    latestProgress = "正在读取蒲公英 API...";
    renderPanel();
    try {
      const result = await requestFromPage("EXPORT_ALL", {
        pageSize: Number(options.pageSize),
        maxRows: Number(options.maxRows),
        delayMs: Number(options.delayMs)
      });
      latestRows = Array.isArray(result.rows) ? result.rows : [];
      latestProgress = result.stopped ? `已停止，保留 ${latestRows.length} 位达人` : `已采集 ${latestRows.length} 位达人`;
      renderPanel();
      if (download && latestRows.length) {
        await chrome.runtime.sendMessage({
          type: "DOWNLOAD_PGY_CSV",
          rows: latestRows,
          filename: `pgy-creators-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`
        });
      }
      return { ...result, rows: latestRows };
    } finally {
      exporting = false;
      renderPanel();
    }
  }

  async function stopExport() {
    latestProgress = "正在停止采集...";
    renderPanel();
    const result = await requestFromPage("STOP_EXPORT", {}, 8000);
    latestProgress = "已发送停止采集指令";
    renderPanel();
    return result;
  }

  async function syncFeishu() {
    const options = await loadOptions();
    const missingFeishuConfig = !options.feishuAppId || !options.feishuAppSecret;
    const missingFeishuTable = !options.feishuUrl;
    if (missingFeishuConfig && missingFeishuTable) {
      throw new Error("请打开侧边栏设置填入飞书配置和飞书表格。");
    }
    if (missingFeishuConfig) {
      throw new Error("请打开侧边栏设置填入飞书配置。");
    }
    if (missingFeishuTable) {
      throw new Error("请打开侧边栏设置填入飞书表格。");
    }
    await exportAll({ download: false });
    latestProgress = "正在写入飞书...";
    renderPanel();
    const payload = await chrome.runtime.sendMessage({ type: "SYNC_FEISHU_DIRECT", rows: latestRows, options });
    if (!payload?.ok) throw new Error(payload?.message || "同步飞书失败");
    const targetText = payload.resourceType === "bitable" ? "多维表格" : "电子表格";
    latestProgress = `采集并写入飞书${targetText}完成，已写入 ${payload.writtenCount || latestRows.length} 条`;
    renderPanel();
    return payload;
  }

  function setPanelStatus(text, isError = false) {
    latestProgress = text;
    renderPanel(isError);
  }

  function ensurePanelVisible() {
    let panel = document.getElementById("pgy-exporter-panel");
    if (!panel) {
      createPanel();
      panel = document.getElementById("pgy-exporter-panel");
    }
    if (!panel) return;
    const host = document.body || document.documentElement;
    if (panel.parentElement !== host) {
      host.appendChild(panel);
    }
    panel.style.display = "";
    panel.style.visibility = "visible";
    panel.style.opacity = "1";
    panel.classList.add("pgy-exporter-repaint");
    panel.getBoundingClientRect();
    requestAnimationFrame(() => panel.classList.remove("pgy-exporter-repaint"));
  }

  function createPanel() {
    if (document.getElementById("pgy-exporter-panel")) return;
    const panel = document.createElement("section");
    panel.id = "pgy-exporter-panel";
    panel.title = "右键打开侧边栏设置";
    panel.innerHTML = `
      <div class="pgy-exporter-head">
        <strong>蒲公英达人同步飞书</strong>
        <button type="button" data-action="collapse" title="收起">-</button>
      </div>
      <div class="pgy-exporter-body">
        <div class="pgy-exporter-status">等待采集当前筛选达人</div>
        <div class="pgy-exporter-actions">
          <button type="button" data-action="export">导出当前达人</button>
          <button type="button" data-action="stop" disabled>停止采集</button>
          <button type="button" data-action="sync">直接采集达人到飞书</button>
          <button type="button" data-action="side-settings">打开侧边栏设置</button>
          <button type="button" data-action="feishu-settings">打开飞书配置</button>
        </div>
      </div>
    `;
    panel.addEventListener("click", async (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      try {
        if (action === "collapse") {
          panel.classList.toggle("is-collapsed");
          return;
        }
        if (action === "export") {
          await exportAll({ download: true });
        }
        if (action === "stop") {
          await stopExport();
        }
        if (action === "sync") {
          await syncFeishu();
        }
        if (action === "side-settings") {
          const result = await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
          ensurePanelVisible();
          setTimeout(ensurePanelVisible, 150);
          setTimeout(ensurePanelVisible, 500);
          if (!result?.ok) throw new Error(result?.message || "打开侧边栏失败，请点击扩展图标打开。");
        }
        if (action === "feishu-settings") {
          await chrome.runtime.sendMessage({ type: "OPEN_OPTIONS_PAGE" });
        }
      } catch (error) {
        setPanelStatus(error?.message || String(error), true);
      }
    });
    panel.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }).then(ensurePanelVisible).catch(() => null);
    });
    (document.body || document.documentElement).appendChild(panel);
  }

  function renderPanel(isError = false) {
    const panel = document.getElementById("pgy-exporter-panel");
    if (!panel) return;
    const status = panel.querySelector(".pgy-exporter-status");
    if (!status) return;
    const captureText = latestCapture?.ok
      ? `已识别：首屏 ${latestCapture.firstPageCount || 0} / 建议总量 ${latestCapture.totalCount || "未知"}`
      : "未采集当前筛选达人";
    status.textContent = latestProgress || captureText;
    status.classList.toggle("is-error", Boolean(isError));
    const stopButton = panel.querySelector('[data-action="stop"]');
    if (stopButton) stopButton.disabled = !exporting;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      if (message?.type === "PGY_GET_CAPTURE") sendResponse(await getCapture());
      if (message?.type === "PGY_EXPORT_ALL") sendResponse(await exportAll({ download: Boolean(message.download) }));
      if (message?.type === "PGY_STOP_EXPORT") sendResponse(await stopExport());
      if (message?.type === "PGY_SYNC_FEISHU") sendResponse(await syncFeishu());
      if (message?.type === "PGY_SAVE_OPTIONS") {
        await saveOptions(message.options || {});
        sendResponse({ ok: true });
      }
    })().catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
    return true;
  });

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (event.source !== window || message.source !== PAGE_SOURCE) return;
    if (message.type === "CAPTURE_UPDATED") {
      latestCapture = message.payload;
      renderPanel();
    }
  });

  window.addEventListener("resize", () => {
    requestAnimationFrame(ensurePanelVisible);
  });

  injectPageHook();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createPanel, { once: true });
  } else {
    createPanel();
  }
})();
