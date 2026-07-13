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
    detailCaptureFansScreenshot: true,
    detailCaptureNoteScreenshot: true,
    collectionMode: "detail",
    syncUpdateExisting: false,
    syncUseFirstSheet: false,
    pageSize: 50,
    maxRows: 5000,
    delayMs: 250
  };

  let latestRows = [];
  let latestCapture = null;
  let latestProgress = "";
  let exporting = false;
  let exportTicker = 0;
  let exportTask = {
    phase: "idle",
    step: 0,
    label: "等待任务",
    detail: "先在找达人页面完成筛选，再开始导出",
    collected: 0,
    total: 0,
    startedAt: 0,
    finishedAt: 0,
    error: false
  };
  let inviteState = {
    step: 1,
    linksText: "",
    bloggers: [],
    brandKeyword: "",
    brandResults: [],
    brandLoading: false,
    brandError: "",
    brand: null,
    form: {
      contentType: "1",
      productName: "",
      startDate: "",
      endDate: "",
      productDesc: "",
      contactType: "1",
      contact: ""
    },
    loading: false,
    status: "",
    error: "",
    draft: null,
    submitResult: null
  };

  function isBloggerDetailPage() {
    return location.pathname.includes("/solar/pre-trade/blogger-detail/");
  }

  function currentDetailLink() {
    return isBloggerDetailPage() ? location.href : "";
  }

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
          updateExportTask({
            phase: "list",
            step: 1,
            label: "读取达人列表",
            detail: latestProgress,
            collected: Number(message.payload?.collectedCount || 0),
            total: Number(message.payload?.totalCount || 0)
          });
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

  function updateExportTask(patch = {}) {
    exportTask = { ...exportTask, ...patch };
    if (exportTask.phase !== "idle" && !exportTask.startedAt) exportTask.startedAt = Date.now();
    renderPanel(Boolean(exportTask.error));
  }

  function resetExportTask() {
    exportTask = {
      phase: "list",
      step: 1,
      label: "读取达人列表",
      detail: "正在连接蒲公英列表接口",
      collected: 0,
      total: 0,
      startedAt: Date.now(),
      finishedAt: 0,
      error: false
    };
    clearInterval(exportTicker);
    exportTicker = window.setInterval(() => renderPanel(), 1000);
  }

  function finishExportTask(patch = {}) {
    clearInterval(exportTicker);
    exportTicker = 0;
    updateExportTask({ finishedAt: Date.now(), ...patch });
  }

  function exportElapsedText() {
    if (!exportTask.startedAt) return "--:--";
    const endAt = exportTask.finishedAt || Date.now();
    const seconds = Math.max(0, Math.floor((endAt - exportTask.startedAt) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function exportXlsxFilename(count) {
    const now = new Date();
    const part = (value) => String(value).padStart(2, "0");
    const time = `${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}-${part(now.getMinutes())}-${part(now.getSeconds())}`;
    return `蒲公英达人导出-${Number(count || 0)}人-${time}.xlsx`;
  }

  async function exportAll({ download = true, enrichDetails = false } = {}) {
    const options = await loadOptions();
    exporting = true;
    resetExportTask();
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
      updateExportTask({
        collected: latestRows.length,
        total: Number(result.totalCount || latestRows.length),
        detail: latestProgress
      });
      renderPanel();
      if (enrichDetails && options.collectionMode === "detail" && latestRows.length) {
        latestProgress = `列表采集完成，正在极速补采 ${latestRows.length} 位达人数据...`;
        updateExportTask({
          phase: "detail",
          step: 2,
          label: "极速补全数据",
          detail: `正在并行补全 ${latestRows.length} 位达人的表现与粉丝画像`
        });
        renderPanel();
        const directExportOptions = {
          ...options,
          detailCaptureFansScreenshot: false,
          detailCaptureNoteScreenshot: false,
          directExportFastMode: true
        };
        const detailResult = await chrome.runtime.sendMessage({
          type: "ENRICH_ROWS_WITH_DETAILS",
          rows: latestRows,
          options: directExportOptions
        });
        if (!detailResult?.ok) throw new Error(detailResult?.message || "详情补采失败");
        latestRows = Array.isArray(detailResult.rows) ? detailResult.rows : latestRows;
        const firstError = Array.isArray(detailResult.errorSamples) && detailResult.errorSamples.length
          ? `，首个失败原因：${detailResult.errorSamples[0].message}`
          : "";
        latestProgress = `详情补采完成：成功 ${detailResult.completed || 0}，失败 ${detailResult.failed || 0}${firstError}`;
        updateExportTask({
          phase: "file",
          step: 3,
          label: download ? "生成导出文件" : "整理同步数据",
          detail: `已补全 ${detailResult.completed || 0} 位，跳过 ${detailResult.failed || 0} 位`
        });
        renderPanel();
      }
      if (download && latestRows.length) {
        await chrome.runtime.sendMessage({
          type: "DOWNLOAD_PGY_XLSX",
          rows: latestRows,
          filename: exportXlsxFilename(latestRows.length)
        });
      }
      finishExportTask({
        phase: result.stopped ? "stopped" : "done",
        step: result.stopped ? exportTask.step : 3,
        label: result.stopped ? "任务已停止" : (download ? "导出完成" : "采集完成"),
        detail: `${latestRows.length} 位达人 · ${download ? "文件已生成" : "数据已就绪"}`,
        collected: latestRows.length,
        total: latestRows.length
      });
      return { ...result, rows: latestRows };
    } finally {
      exporting = false;
      clearInterval(exportTicker);
      exportTicker = 0;
      renderPanel();
    }
  }

  async function stopExport() {
    latestProgress = "正在停止采集...";
    updateExportTask({ phase: "stopping", label: "正在停止", detail: "正在安全结束当前请求" });
    renderPanel();
    const [result] = await Promise.all([
      requestFromPage("STOP_EXPORT", {}, 8000),
      chrome.runtime.sendMessage({ type: "STOP_DETAIL_BACKFILL" }).catch(() => null)
    ]);
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
    await exportAll({ download: false, enrichDetails: true });
    exporting = true;
    exportTask.finishedAt = 0;
    exportTicker = window.setInterval(() => renderPanel(), 1000);
    latestProgress = "正在写入飞书...";
    updateExportTask({ phase: "file", step: 3, label: "写入飞书", detail: `正在写入 ${latestRows.length} 位达人` });
    try {
      const payload = await chrome.runtime.sendMessage({ type: "SYNC_FEISHU_DIRECT", rows: latestRows, options });
      if (!payload?.ok) throw new Error(payload?.message || "同步飞书失败");
      const targetText = payload.resourceType === "bitable" ? "多维表格" : "电子表格";
      latestProgress = `采集并写入飞书${targetText}完成，已写入 ${payload.writtenCount || latestRows.length} 条`;
      finishExportTask({
        phase: "done",
        step: 3,
        label: "同步完成",
        detail: `${targetText}已写入 ${payload.writtenCount || latestRows.length} 位达人`
      });
      return payload;
    } finally {
      exporting = false;
      clearInterval(exportTicker);
      exportTicker = 0;
      renderPanel();
    }
  }

  function parseInviteInputs(text) {
    return Array.from(new Set(String(text || "")
      .split(/[\n,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)));
  }

  function moneyText(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "-";
    return `¥${Math.round(number / 100).toLocaleString("zh-CN")}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setInviteStatus(text, isError = false) {
    inviteState.status = isError ? "" : text;
    inviteState.error = isError ? text : "";
    renderInviteModal();
  }

  async function resolveInviteBloggers() {
    const inputs = parseInviteInputs(inviteState.linksText);
    if (!inputs.length) {
      setInviteStatus("请先输入至少 1 条博主链接。", true);
      return;
    }
    if (inputs.length > 100) {
      setInviteStatus("单次最多输入 100 条博主链接。", true);
      return;
    }
    inviteState.loading = true;
    inviteState.bloggers = [];
    inviteState.draft = null;
    renderInviteModal();
    try {
      const result = await requestFromPage("PGY_INVITE_RESOLVE_BLOGGERS", { inputs }, 90000);
      inviteState.bloggers = Array.isArray(result.results) ? result.results : [];
      const okCount = inviteState.bloggers.filter((item) => item.ok).length;
      inviteState.step = okCount ? 2 : 1;
      setInviteStatus(okCount ? `已识别 ${okCount}/${inviteState.bloggers.length} 位博主。` : "没有识别到可邀约博主。", !okCount);
    } catch (error) {
      setInviteStatus(error?.message || String(error), true);
    } finally {
      inviteState.loading = false;
      renderInviteModal();
    }
  }

  let brandSearchTimer = 0;
  let inviteComposingField = "";
  let pendingBrandRender = false;

  function removeBrandMenu() {
    document.querySelector("#pgy-invite-modal .pgy-invite-brand-menu")?.remove();
  }

  async function searchInviteBrands(keyword) {
    const value = String(keyword || "").trim();
    inviteState.brandKeyword = value;
    inviteState.brand = inviteState.brand?.label === value || inviteState.brand?.brandName === value ? inviteState.brand : null;
    inviteState.brandResults = [];
    inviteState.brandError = "";
    inviteState.submitResult = null;
    clearTimeout(brandSearchTimer);
    removeBrandMenu();
    updateInviteActionState();
    if (!value) return;
    inviteState.brandLoading = true;
    renderBrandMenuOnly();
    brandSearchTimer = setTimeout(async () => {
      try {
        const result = await requestFromPage("PGY_INVITE_SEARCH_BRAND", { keyword: value }, 20000);
        if (inviteState.brandKeyword !== value) return;
        inviteState.brandResults = Array.isArray(result.brands) ? result.brands : [];
        inviteState.brandError = inviteState.brandResults.length ? "" : "没有匹配到可报备品牌";
      } catch (error) {
        if (inviteState.brandKeyword !== value) return;
        inviteState.brandResults = [];
        inviteState.brandError = error?.message || String(error);
      } finally {
        if (inviteState.brandKeyword === value) inviteState.brandLoading = false;
      }
      if (inviteComposingField) {
        pendingBrandRender = true;
      } else {
        renderBrandMenuOnly() || renderInviteModal();
      }
    }, 260);
  }

  function inviteFormComplete() {
    return Boolean(
      inviteState.brand &&
      inviteState.form.productName.trim() &&
      inviteState.form.productDesc.trim() &&
      inviteState.form.startDate &&
      inviteState.form.endDate &&
      inviteState.form.contact.trim() &&
      inviteState.bloggers.some((item) => item.ok)
    );
  }

  async function buildInviteDraft() {
    if (!inviteFormComplete()) {
      setInviteStatus("请补齐品牌、产品、档期、合作内容和联系方式。", true);
      return;
    }
    inviteState.loading = true;
    inviteState.draft = null;
    inviteState.submitResult = null;
    renderInviteModal();
    try {
      const result = await requestFromPage("PGY_INVITE_BUILD_DRAFT", {
        bloggers: inviteState.bloggers,
        form: { ...inviteState.form, brand: inviteState.brand }
      }, 20000);
      inviteState.draft = result;
      setInviteStatus(result.message || "已生成邀约草稿。");
    } catch (error) {
      setInviteStatus(error?.message || String(error), true);
    } finally {
      inviteState.loading = false;
      renderInviteModal();
    }
  }

  async function submitRealInvite() {
    if (!inviteFormComplete()) {
      setInviteStatus("请补齐品牌、产品、档期、合作内容和联系方式。", true);
      return;
    }
    const okBloggers = inviteState.bloggers.filter((item) => item.ok);
    const brandName = inviteState.brand?.label || inviteState.brand?.brandName || "";
    const confirmed = window.confirm(
      `将真实提交 ${okBloggers.length} 位达人的邀约。\n品牌：${brandName}\n产品：${inviteState.form.productName}\n\n提交后会消耗蒲公英邀约次数，且会每个达人间隔 1 秒依次提交。\n点击“确定”继续提交。`
    );
    if (!confirmed) {
      setInviteStatus("已取消真实提交。");
      return;
    }
    inviteState.loading = true;
    inviteState.submitResult = null;
    inviteState.draft = null;
    setInviteStatus("正在真实提交邀约，请不要关闭页面...");
    renderInviteModal();
    try {
      const result = await requestFromPage("PGY_INVITE_SUBMIT", {
        bloggers: inviteState.bloggers,
        form: { ...inviteState.form, brand: inviteState.brand }
      }, 900000);
      inviteState.submitResult = result;
      setInviteStatus(`真实提交完成：成功 ${result.successCount || 0} 个，失败 ${result.failedCount || 0} 个。`);
    } catch (error) {
      setInviteStatus(error?.message || String(error), true);
    } finally {
      inviteState.loading = false;
      renderInviteModal();
    }
  }

  function openNativeInvitePage() {
    const first = inviteState.bloggers.find((item) => item.ok && item.userId);
    if (!first) {
      setInviteStatus("没有可打开的博主邀约页。", true);
      return;
    }
    window.open(`https://pgy.xiaohongshu.com/solar/pre-trade/invite-form?id=${encodeURIComponent(first.userId)}&fromRoute=BloggerDetail`, "_blank", "noopener");
  }

  function openInviteModal() {
    const detailLink = currentDetailLink();
    inviteState = {
      ...inviteState,
      step: 1,
      linksText: detailLink && !inviteState.linksText ? detailLink : inviteState.linksText,
      status: detailLink ? "已自动带入当前详情页博主链接。" : "",
      error: "",
      draft: null,
      submitResult: null
    };
    if (!document.getElementById("pgy-invite-modal")) {
      const modal = document.createElement("div");
      modal.id = "pgy-invite-modal";
      modal.addEventListener("click", handleInviteClick);
      modal.addEventListener("input", handleInviteInput);
      modal.addEventListener("change", handleInviteInput);
      modal.addEventListener("compositionstart", handleInviteCompositionStart);
      modal.addEventListener("compositionend", handleInviteCompositionEnd);
      (document.body || document.documentElement).appendChild(modal);
    }
    renderInviteModal();
  }

  function closeInviteModal() {
    document.getElementById("pgy-invite-modal")?.remove();
  }

  function renderBloggerList() {
    if (!inviteState.bloggers.length) return "";
    return `
      <div class="pgy-invite-bloggers">
        ${inviteState.bloggers.map((item) => `
          <div class="pgy-invite-blogger ${item.ok ? "" : "is-error"}">
            <img src="${escapeHtml(item.avatar || "")}" alt="">
            <div>
              <strong>${escapeHtml(item.name || item.userId || item.input)}</strong>
              <span>${item.ok ? `图文 ${moneyText(item.picturePrice)} / 视频 ${moneyText(item.videoPrice)}` : escapeHtml(item.message || "识别失败")}</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderBrandResults() {
    if (!inviteState.brandKeyword || inviteState.brand) return "";
    if (inviteState.brandLoading) {
      return `<div class="pgy-invite-brand-menu"><div class="pgy-invite-empty">正在查询可报备品牌...</div></div>`;
    }
    if (inviteState.brandError) {
      return `<div class="pgy-invite-brand-menu"><div class="pgy-invite-empty is-error">${escapeHtml(inviteState.brandError)}</div></div>`;
    }
    if (!inviteState.brandResults.length) {
      return `<div class="pgy-invite-brand-menu"><div class="pgy-invite-empty">输入后会查询可报备品牌</div></div>`;
    }
    return `
      <div class="pgy-invite-brand-menu">
        ${inviteState.brandResults.map((brand, index) => `
          <button type="button" data-action="select-brand" data-index="${index}" ${brand.disabled ? "disabled" : ""}>
            <img src="${escapeHtml(brand.avatar || brand.brandAvatar || "")}" alt="">
            <span><strong>${escapeHtml(brand.label || brand.brandName || "")}</strong><small>ID: ${escapeHtml(brand.value || brand.brandUserId || "-")}</small></span>
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderInviteDraft() {
    if (!inviteState.draft) return "";
    const payload = JSON.stringify(inviteState.draft.payload || {}, null, 2);
    return `
      <div class="pgy-invite-draft">
        <div class="pgy-invite-draft-head">
          <strong>安全草稿</strong>
          <span>未发送真实邀约</span>
        </div>
        <pre>${escapeHtml(payload)}</pre>
      </div>
    `;
  }

  function renderInviteSubmitResult() {
    if (!inviteState.submitResult) return "";
    const results = Array.isArray(inviteState.submitResult.results) ? inviteState.submitResult.results : [];
    return `
      <div class="pgy-invite-submit-result">
        <div class="pgy-invite-draft-head">
          <strong>真实提交结果</strong>
          <span>成功 ${Number(inviteState.submitResult.successCount || 0)} / 失败 ${Number(inviteState.submitResult.failedCount || 0)}</span>
        </div>
        <div class="pgy-invite-submit-list">
          ${results.map((item) => `
            <div class="${item.ok ? "is-ok" : "is-error"}">
              <strong>${escapeHtml(item.kolId || "-")}</strong>
              <span>${item.ok ? "邀约成功" : escapeHtml(item.message || "邀约失败")}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderBrandMenuOnly() {
    const field = document.querySelector("#pgy-invite-modal .pgy-invite-brand-field");
    if (!field) return false;
    field.querySelector(".pgy-invite-brand-menu")?.remove();
    field.insertAdjacentHTML("beforeend", renderBrandResults());
    return true;
  }

  function updateInviteActionState() {
    const modal = document.getElementById("pgy-invite-modal");
    if (!modal) return;
    const buildButton = modal.querySelector('[data-action="build-draft"]');
    if (buildButton) buildButton.disabled = inviteState.loading || !inviteFormComplete();
    const message = modal.querySelector(".pgy-invite-message");
    if (message && (inviteState.draft || inviteState.submitResult)) {
      inviteState.draft = null;
      inviteState.submitResult = null;
      const draft = modal.querySelector(".pgy-invite-draft");
      draft?.remove();
      modal.querySelector(".pgy-invite-submit-result")?.remove();
    }
    const counter = modal.querySelector(".pgy-invite-field em");
    if (counter && inviteState.step === 1) counter.textContent = `${parseInviteInputs(inviteState.linksText).length}/100`;
  }

  function renderInviteModal() {
    const modal = document.getElementById("pgy-invite-modal");
    if (!modal) return;
    const active = document.activeElement;
    const activeField = active?.dataset?.field || "";
    const activeName = active?.name || "";
    const selectionStart = typeof active?.selectionStart === "number" ? active.selectionStart : null;
    const selectionEnd = typeof active?.selectionEnd === "number" ? active.selectionEnd : null;
    const okBloggers = inviteState.bloggers.filter((item) => item.ok);
    modal.innerHTML = `
      <div class="pgy-invite-backdrop"></div>
      <section class="pgy-invite-dialog" role="dialog" aria-modal="true" aria-label="一键邀约">
        <header class="pgy-invite-header">
          <div>
            <strong>一键邀约</strong>
            <span>${inviteState.step === 1 ? "输入博主链接，可输入多条" : `已选择 ${okBloggers.length} 位博主`}</span>
          </div>
          <button type="button" data-action="close-invite" title="关闭">×</button>
        </header>
        <div class="pgy-invite-steps">
          <button type="button" class="${inviteState.step === 1 ? "is-active" : "is-clickable"}" data-action="back-invite" ${inviteState.step === 1 ? "disabled" : ""}>1 链接</button>
          <span class="${inviteState.step === 2 ? "is-active" : ""}">2 信息</span>
        </div>
        <main class="pgy-invite-main">
          ${inviteState.step === 1 ? `
            <label class="pgy-invite-field">
              <span>博主链接</span>
              <textarea data-field="linksText" placeholder="请输入博主的蒲公英主页链接、详情页链接或小红书主页链接">${escapeHtml(inviteState.linksText)}</textarea>
              <em>${parseInviteInputs(inviteState.linksText).length}/100</em>
            </label>
            <div class="pgy-invite-note">注意：由于平台限制每日数据访问量，频繁使用可能会失败。</div>
            ${renderBloggerList()}
          ` : `
            ${renderBloggerList()}
            <div class="pgy-invite-form-grid">
              <label class="pgy-invite-field pgy-invite-brand-field">
                <span>品牌名 *</span>
                <input data-field="brandKeyword" value="${escapeHtml(inviteState.brand?.label || inviteState.brand?.brandName || inviteState.brandKeyword)}" placeholder="请输入或搜索报备品牌">
                ${renderBrandResults()}
              </label>
              <div class="pgy-invite-field">
                <span>合作类型 *</span>
                <div class="pgy-invite-radio-row">
                  <label><input type="radio" name="contentType" data-field="contentType" value="1" ${inviteState.form.contentType === "1" ? "checked" : ""}> 图文笔记一口价</label>
                  <label><input type="radio" name="contentType" data-field="contentType" value="2" ${inviteState.form.contentType === "2" ? "checked" : ""}> 视频笔记一口价</label>
                </div>
              </div>
              <label class="pgy-invite-field">
                <span>产品名称 *</span>
                <input data-field="productName" maxlength="20" value="${escapeHtml(inviteState.form.productName)}" placeholder="请输入产品名称">
              </label>
              <label class="pgy-invite-field pgy-invite-date-range">
                <span>期望发布时间 *</span>
                <input type="date" data-field="startDate" value="${escapeHtml(inviteState.form.startDate)}">
                <input type="date" data-field="endDate" value="${escapeHtml(inviteState.form.endDate)}">
              </label>
              <label class="pgy-invite-field pgy-invite-wide">
                <span>合作内容介绍 *</span>
                <textarea data-field="productDesc" maxlength="200" placeholder="请输入推广产品介绍与笔记制作要求">${escapeHtml(inviteState.form.productDesc)}</textarea>
              </label>
              <div class="pgy-invite-field">
                <span>联系方式 *</span>
                <div class="pgy-invite-radio-row">
                  <label><input type="radio" name="contactType" data-field="contactType" value="1" ${inviteState.form.contactType === "1" ? "checked" : ""}> 微信</label>
                  <label><input type="radio" name="contactType" data-field="contactType" value="2" ${inviteState.form.contactType === "2" ? "checked" : ""}> 手机号</label>
                </div>
              </div>
              <label class="pgy-invite-field">
                <span>联系信息 *</span>
                <input data-field="contact" value="${escapeHtml(inviteState.form.contact)}" placeholder="请输入联系信息">
              </label>
            </div>
            ${renderInviteDraft()}
            ${renderInviteSubmitResult()}
          `}
        </main>
        <footer class="pgy-invite-footer">
          <div class="pgy-invite-message ${inviteState.error ? "is-error" : ""}">${escapeHtml(inviteState.error || inviteState.status || "安全模式：不会自动发送真实邀约。")}</div>
          <button type="button" data-action="${inviteState.step === 1 ? "close-invite" : "back-invite"}">${inviteState.step === 1 ? "取消" : "上一步"}</button>
          ${inviteState.step === 1
            ? `<button type="button" class="is-primary" data-action="resolve-bloggers" ${inviteState.loading ? "disabled" : ""}>${inviteState.loading ? "识别中..." : "下一步"}</button>`
            : `<button type="button" data-action="open-native-invite">打开原生页</button><button type="button" data-action="build-draft" ${inviteState.loading || !inviteFormComplete() ? "disabled" : ""}>生成草稿</button><button type="button" class="is-primary is-danger" data-action="submit-real-invite" ${inviteState.loading || !inviteFormComplete() ? "disabled" : ""}>${inviteState.loading ? "提交中..." : "真实提交"}</button>`}
        </footer>
      </section>
    `;
    if (activeField || activeName) {
      const selector = activeField ? `[data-field="${activeField}"]` : `[name="${activeName}"]`;
      const next = modal.querySelector(selector);
      if (next && typeof next.focus === "function") {
        next.focus();
        if (selectionStart !== null && typeof next.setSelectionRange === "function") {
          const end = selectionEnd === null ? selectionStart : selectionEnd;
          next.setSelectionRange(selectionStart, end);
        }
      }
    }
  }

  function handleInviteCompositionStart(event) {
    inviteComposingField = event.target?.dataset?.field || "";
  }

  function handleInviteCompositionEnd(event) {
    inviteComposingField = "";
    handleInviteInput(event, { force: true });
    if (pendingBrandRender) {
      pendingBrandRender = false;
      renderInviteModal();
    }
  }

  function handleInviteInput(event, { force = false } = {}) {
    const field = event.target?.dataset?.field;
    if (!field) return;
    if (!force && (event.isComposing || inviteComposingField === field)) return;
    if (field === "linksText") {
      inviteState.linksText = event.target.value;
      inviteState.draft = null;
      inviteState.submitResult = null;
      updateInviteActionState();
      return;
    }
    if (field === "brandKeyword") {
      searchInviteBrands(event.target.value);
      return;
    }
    if (field in inviteState.form) {
      inviteState.form[field] = event.target.value;
      inviteState.draft = null;
      inviteState.submitResult = null;
      updateInviteActionState();
    }
  }

  function handleInviteClick(event) {
    const action = event.target?.closest("[data-action]")?.dataset?.action;
    if (!action) return;
    if (action === "close-invite") closeInviteModal();
    if (action === "back-invite") {
      inviteState.step = 1;
      inviteState.draft = null;
      inviteState.submitResult = null;
      renderInviteModal();
    }
    if (action === "resolve-bloggers") resolveInviteBloggers();
    if (action === "build-draft") buildInviteDraft();
    if (action === "submit-real-invite") submitRealInvite();
    if (action === "open-native-invite") openNativeInvitePage();
    if (action === "select-brand") {
      const brand = inviteState.brandResults[Number(event.target.closest("[data-action]").dataset.index)];
      if (!brand) return;
      inviteState.brand = brand;
      inviteState.brandKeyword = brand.label || brand.brandName || "";
      inviteState.brandResults = [];
      inviteState.brandError = "";
      inviteState.brandLoading = false;
      inviteState.draft = null;
      inviteState.submitResult = null;
      renderInviteModal();
    }
  }

  function setPanelStatus(text, isError = false) {
    latestProgress = text;
    if (isError) {
      finishExportTask({ phase: "error", label: "导出失败", detail: text, error: true });
      exporting = false;
    }
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
        <div class="pgy-exporter-brand"><span>SOLO专用</span><strong>达人数据台</strong></div>
        <button type="button" data-action="collapse" title="收起">-</button>
      </div>
      <div class="pgy-exporter-body">
        <div class="pgy-exporter-task" data-phase="idle">
          <div class="pgy-exporter-task-head">
            <span class="pgy-exporter-task-state"><i></i><b>等待任务</b></span>
            <time>--:--</time>
          </div>
          <strong class="pgy-exporter-task-label">先在找达人页面完成筛选</strong>
          <p class="pgy-exporter-status">准备好后点击导出当前达人</p>
          <div class="pgy-exporter-progress"><span></span></div>
          <div class="pgy-exporter-meta"><span>阶段 0/3</span><span>0 位达人</span></div>
        </div>
        <div class="pgy-exporter-actions">
          <button type="button" data-action="export">导出当前达人</button>
          <button type="button" data-action="invite">一键邀约</button>
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
          await exportAll({ download: true, enrichDetails: true });
        }
        if (action === "stop") {
          await stopExport();
        }
        if (action === "sync") {
          await syncFeishu();
        }
        if (action === "invite") {
          openInviteModal();
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
    const task = panel.querySelector(".pgy-exporter-task");
    if (!status || !task) return;
    const captureText = latestCapture?.ok
      ? `已识别：首屏 ${latestCapture.firstPageCount || 0} / 建议总量 ${latestCapture.totalCount || "未知"}`
      : "未采集当前筛选达人";
    const idle = exportTask.phase === "idle";
    const detail = idle ? captureText : exportTask.detail || latestProgress;
    const progress = exportTask.total > 0 ? Math.min(100, Math.round((exportTask.collected / exportTask.total) * 100)) : 0;
    task.dataset.phase = exportTask.phase;
    task.querySelector(".pgy-exporter-task-state b").textContent = exportTask.label;
    task.querySelector(".pgy-exporter-task-label").textContent = idle ? "当前筛选数据" : exportTask.label;
    task.querySelector("time").textContent = exportElapsedText();
    status.textContent = detail;
    status.classList.toggle("is-error", Boolean(isError || exportTask.error));
    task.querySelector(".pgy-exporter-progress span").style.width = `${progress}%`;
    const meta = task.querySelectorAll(".pgy-exporter-meta span");
    meta[0].textContent = `阶段 ${exportTask.step}/3`;
    meta[1].textContent = exportTask.collected
      ? `${exportTask.collected}${exportTask.total && exportTask.total !== exportTask.collected ? ` / ${exportTask.total}` : ""} 位达人`
      : "等待开始";
    const stopButton = panel.querySelector('[data-action="stop"]');
    if (stopButton) stopButton.disabled = !exporting;
    panel.querySelectorAll('[data-action="export"], [data-action="sync"]').forEach((button) => {
      button.disabled = exporting;
    });
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
