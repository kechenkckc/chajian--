(function installPgyExporterHook() {
  if (window.__PGY_EXPORTER_HOOK_INSTALLED__) return;
  window.__PGY_EXPORTER_HOOK_INSTALLED__ = true;

  const API_MARKER = "/api/solar/cooperator/blogger/v2";
  const EXT_SOURCE = "pgy-exporter-extension";
  const PAGE_SOURCE = "pgy-exporter-page";
  const state = {
    latestRequest: null,
    latestResponse: null,
    latestRows: [],
    totalCount: null,
    capturedAt: null,
    activeExportRequestId: "",
    stopRequested: false
  };
  const inviteSubmitPath = "/api/solar/invite/initiate_invite";

  function nowText() {
    const pad = (value) => String(value).padStart(2, "0");
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function absoluteUrl(url) {
    try {
      return new URL(url, location.origin).toString();
    } catch {
      return String(url || "");
    }
  }

  function isKolApi(url) {
    return absoluteUrl(url).includes(API_MARKER);
  }

  function headersToObject(headers) {
    const result = {};
    try {
      if (!headers) return result;
      if (headers instanceof Headers) {
        headers.forEach((value, key) => { result[key] = value; });
      } else if (Array.isArray(headers)) {
        for (const [key, value] of headers) result[key] = value;
      } else {
        Object.assign(result, headers);
      }
    } catch {
      return result;
    }
    return result;
  }

  function safeJson(text) {
    if (!text || typeof text !== "string") return {};
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function responseData(payload) {
    return payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload || {};
  }

  function extractItems(payload) {
    const data = responseData(payload);
    const candidates = [
      data.kols,
      data.list,
      data.items,
      data.records,
      payload?.kols,
      payload?.list,
      payload?.items
    ];
    const list = candidates.find(Array.isArray) || [];
    return list.filter((item) => item && typeof item === "object");
  }

  function extractTotal(payload, fallbackCount = 0) {
    const data = responseData(payload);
    const value = data.total ?? data.totalCount ?? data.count ?? payload?.total ?? payload?.totalCount;
    const parsed = Number(String(value ?? "").replace(/[,，]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackCount;
  }

  function nestedValue(payload, keys) {
    if (!payload || typeof payload !== "object") return "";
    for (const key of keys) {
      if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") return payload[key];
    }
    for (const value of Object.values(payload)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = nestedValue(value, keys);
        if (nested !== "") return nested;
      }
    }
    return "";
  }

  function deepFindByKeyPattern(payload, matcher) {
    if (!payload || typeof payload !== "object") return "";
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const nested = deepFindByKeyPattern(item, matcher);
        if (nested !== "") return nested;
      }
      return "";
    }
    for (const [key, value] of Object.entries(payload)) {
      if (matcher(String(key)) && value !== undefined && value !== null && value !== "") return value;
    }
    for (const value of Object.values(payload)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = deepFindByKeyPattern(value, matcher);
        if (nested !== "") return nested;
      }
    }
    return "";
  }

  function fallbackFollowersValue(kol) {
    return deepFindByKeyPattern(kol, (key) => {
      const normalized = key.toLowerCase();
      if (!normalized.includes("fans") && !normalized.includes("follower")) return false;
      return !/(rate|ratio|percent|percentile|lv|level|growth|active|engage|age|gender)/i.test(normalized);
    });
  }

  function fallbackLikedCollectedValue(kol) {
    return deepFindByKeyPattern(kol, (key) => {
      const normalized = key.toLowerCase();
      return /(like|liked|collect|favorite|praise|赞|藏|收藏|获赞)/i.test(normalized) &&
        /(count|cnt|num|total|info|数|量)/i.test(normalized) &&
        !/(rate|ratio|percent|unit|price|cost|state|status|iscollect|inCart)/i.test(normalized);
    });
  }

  function fallbackNoteTypeValue(kol) {
    const noteTypes = Array.isArray(kol?.noteList)
      ? Array.from(new Set(kol.noteList.map((note) => normalizedNoteTypeValue(note?.noteType)).filter(Boolean)))
      : [];
    if (noteTypes.length) {
      return noteTypes.join("/");
    }
    const available = [];
    if (Number(kol?.pictureState) === 1 || Number(kol?.picturePrice) > 0) available.push("图文");
    if (Number(kol?.videoState) === 1 || Number(kol?.videoPrice) > 0) available.push("视频");
    if (available.length) return available.join("/");
    return normalizedNoteTypeValue(deepFindByKeyPattern(kol, (key) => {
      const normalized = key.toLowerCase();
      return /(note.*type|content.*type|media.*type|笔记类型|内容形式)/i.test(normalized);
    }));
  }

  function normalizedNoteTypeValue(value) {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "boolean") return value ? "视频" : "图文";
    if (typeof value === "number") {
      if (value === 1) return "图文";
      if (value === 2) return "视频";
    }
    const text = String(value).trim().toLowerCase();
    const hasVideo = /视频|video|动态/.test(text);
    const hasPicture = /图文|图片|image|picture|photo/.test(text);
    if (hasVideo && hasPicture) return "";
    if (hasVideo) return "视频";
    if (hasPicture) return "图文";
    if (/^1(?:\.0+)?$/.test(text)) return "图文";
    if (/^2(?:\.0+)?$/.test(text)) return "视频";
    return "";
  }

  function fallbackCooperationOrderValue(kol) {
    return deepFindByKeyPattern(kol, (key) => {
      const normalized = key.toLowerCase();
      return /(coop|cooperation|order|finish|complete|合作|订单|商单)/i.test(normalized) &&
        /(order|cnt|count|num|total|订单|数|量)/i.test(normalized) &&
        !/(rate|ratio|percent|price|cost|unit|note|笔记|state|status|type|auth)/i.test(normalized);
    });
  }

  function fallbackCooperationNoteValue(kol) {
    return deepFindByKeyPattern(kol, (key) => {
      const normalized = key.toLowerCase();
      return /(note|笔记)/i.test(normalized) &&
        /(coop|cooperation|business|finish|complete|合作|商业|商单|已)/i.test(normalized) &&
        !/(rate|ratio|percent|price|cost|unit|order|订单)/i.test(normalized);
    });
  }

  function firstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== "");
  }

  function cleanJsonText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function safeJsonValue(value) {
    if (!value || typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function compactTagText(value) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "string") {
      const parsed = /^[\[{]/.test(value.trim()) ? safeJsonValue(value) : null;
      if (parsed && typeof parsed === "object") return compactTagText(parsed);
      return cleanJsonText(value);
    }
    if (Array.isArray(value)) return value.map(compactTagText).filter(Boolean).join("；");
    if (typeof value === "object") {
      const direct = firstDefined(value.name, value.label, value.tag, value.contentTag, value.taxonomy1Tag, value.industryTag);
      const children = firstDefined(value.taxonomy2Tags, value.children, value.tags);
      const parts = [direct, compactTagText(children)].map((item) => cleanJsonText(item)).filter(Boolean);
      return parts.join("-");
    }
    return cleanJsonText(value);
  }

  function detailUrl(userId) {
    return userId ? `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${userId}` : "";
  }

  function profileUrl(userId) {
    return userId ? `https://www.xiaohongshu.com/user/profile/${userId}` : "";
  }

  function normalizeKol(kol, pageNumber, rowIndex) {
    const userId = String(nestedValue(kol, ["userId", "user_id", "bloggerId", "blogger_id", "kolId", "kol_id"]) || "").trim();
    const nickname = String(nestedValue(kol, ["name", "nickName", "nickname"]) || "").trim();
    const redId = nestedValue(kol, ["redId", "red_id", "xiaohongshuId", "xiaohongshu_id"]);
    return {
      creator_id: userId ? `pgy-api:${userId}` : `pgy-api:${nickname || pageNumber + "-" + rowIndex}`,
      nickname,
      pgy_url: detailUrl(userId),
      profile_url: profileUrl(userId),
      xiaohongshu_id: redId || "",
      followers_count: nestedValue(kol, ["fansNum", "fansCount", "fans_count", "followerCount", "followersCount", "followers"]) || fallbackFollowersValue(kol),
      liked_collected_count: nestedValue(kol, ["likeCollectCountInfo", "likedCollectedCount", "likeCollectCount", "likeAndCollectCount", "likeCollectNum", "likedCollectNum", "collectCount", "favoriteCount", "likedCount"]) || fallbackLikedCollectedValue(kol),
      quote_price: nestedValue(kol, ["picturePrice", "price", "quotePrice", "imageQuotePrice", "picPrice"]),
      video_quote_price: nestedValue(kol, ["videoPrice", "videoQuotePrice"]),
      note_type: normalizedNoteTypeValue(nestedValue(kol, ["noteType", "contentType", "noteContentType", "mediaType", "contentForm", "noteForm"])) || fallbackNoteTypeValue(kol),
      cooperation_order_count: nestedValue(kol, ["progressOrderCnt", "cooperationOrderCnt", "coopOrderCnt", "orderCnt", "orderCount", "completedOrderCnt", "finishOrderCnt", "tradeOrderCnt", "businessOrderCnt"]) || fallbackCooperationOrderValue(kol),
      cooperation_note_count: nestedValue(kol, ["businessNoteCount", "cooperatedNoteCnt", "cooperationNoteCnt", "businessNoteCnt", "bizNoteCnt", "noteCooperateCnt", "progressNoteCnt", "finishedNoteCnt", "coopNoteNum30d"]) || fallbackCooperationNoteValue(kol),
      daily_exposure_median: nestedValue(kol, ["accumCommonImpMedinNum30d", "impMedian", "mAccumImpNum", "exposureMedian"]),
      daily_read_median: nestedValue(kol, ["clickMidNum", "readMedian", "readMedianNum"]),
      daily_interaction_median: nestedValue(kol, ["mEngagementNum", "mengagementNum", "interactionMedian"]),
      cooperation_exposure_median: nestedValue(kol, ["accumCoopImpMedinNum30d"]),
      cooperation_read_median: nestedValue(kol, ["readMidCoop30"]),
      cooperation_interaction_median: nestedValue(kol, ["interMidCoop30"]),
      image_read_unit_price: nestedValue(kol, ["pictureReadCost", "pictureReadUnitPrice", "imageReadUnitPrice"]),
      image_interaction_unit_price: nestedValue(kol, ["estimatePictureEngageCost", "pictureInteractionUnitPrice", "imageInteractionUnitPrice"]),
      video_read_unit_price: nestedValue(kol, ["videoReadCost", "videoReadCostV2", "videoReadUnitPrice"]),
      video_interaction_unit_price: nestedValue(kol, ["estimateVideoEngageCost", "videoInteractionUnitPrice"]),
      reply_rate_48h: nestedValue(kol, ["inviteReply48hNumRatio", "responseRate", "replyRate48h"]),
      fans_growth_ratio: nestedValue(kol, ["fans30GrowthRate", "fansGrowthRate"]),
      active_fans_ratio: nestedValue(kol, ["fansActiveIn28dLv", "activeFansRate"]),
      interaction_fans_ratio: nestedValue(kol, ["fansEngageNum30dLv", "engageFansRate"]),
      video_completion_rate: nestedValue(kol, ["videoFinishRate", "videoFullViewRate"]),
      thousand_like_note_ratio: nestedValue(kol, ["thousandLikePercent30"]),
      hundred_like_note_ratio: nestedValue(kol, ["hundredLikePercent30"]),
      creator_category: compactTagText(nestedValue(kol, ["categoryName", "category", "contentTags", "tradeType", "industryTag", "type"])),
      ip_city: nestedValue(kol, ["location", "city"]),
      source: "pgy_browser_extension",
      collected_at: nowText(),
      collection_page: pageNumber,
      collection_row_index: rowIndex,
      raw_payload: kol
    };
  }

  function rememberRequest(request, payload) {
    if (!request?.url || !isKolApi(request.url)) return;
    state.latestRequest = request;
    if (payload && typeof payload === "object") {
      const rows = extractItems(payload);
      state.latestRows = rows.map((item, index) => normalizeKol(item, Number(safeJson(request.body).pageNum || 1), index + 1));
      state.latestResponse = payload;
      state.totalCount = extractTotal(payload, state.latestRows.length);
    }
    state.capturedAt = nowText();
    window.postMessage({ source: PAGE_SOURCE, type: "CAPTURE_UPDATED", payload: publicCapture() }, "*");
  }

  function publicCapture() {
    return {
      ok: Boolean(state.latestRequest),
      request: state.latestRequest,
      totalCount: state.totalCount,
      firstPageCount: state.latestRows.length,
      sampleRows: state.latestRows.slice(0, 3),
      capturedAt: state.capturedAt
    };
  }

  function setPage(body, pageNumber, pageSize) {
    const next = { ...(body || {}) };
    const pageKeys = ["pageNum", "page_num", "page", "current"];
    const sizeKeys = ["pageSize", "page_size", "size", "limit"];
    const pageKey = pageKeys.find((key) => key in next) || "pageNum";
    const sizeKey = sizeKeys.find((key) => key in next) || "pageSize";
    next[pageKey] = pageNumber;
    next[sizeKey] = pageSize;
    return next;
  }

  function cleanHeaders(headers) {
    const result = {};
    for (const [key, value] of Object.entries(headers || {})) {
      const lower = key.toLowerCase();
      if (["cookie", "host", "origin", "referer", "content-length", "user-agent"].includes(lower)) continue;
      result[key] = value;
    }
    if (!Object.keys(result).some((key) => key.toLowerCase() === "content-type")) {
      result["content-type"] = "application/json";
    }
    return result;
  }

  async function fetchPage(request, pageNumber, pageSize) {
    const method = String(request.method || "POST").toUpperCase();
    const headers = cleanHeaders(request.headers || {});
    const body = setPage(safeJson(request.body), pageNumber, pageSize);
    let url = request.url;
    const init = { method, headers, credentials: "include" };
    if (method === "GET") {
      const parsed = new URL(url, location.origin);
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) parsed.searchParams.set(key, String(value));
      }
      url = parsed.toString();
    } else {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`蒲公英接口返回非 JSON：${text.slice(0, 120)}`);
    }
    if (!response.ok || (payload && payload.success === false)) {
      throw new Error(payload?.msg || payload?.message || `蒲公英接口请求失败：HTTP ${response.status}`);
    }
    return payload;
  }

  function apiPayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    if (payload.data !== undefined) return payload.data;
    return payload;
  }

  async function fetchPgyApi(path, { method = "GET", query = {}, body = null, allowSubmit = false } = {}) {
    if (!allowSubmit && String(path || "").includes(inviteSubmitPath)) {
      throw new Error("安全模式已拦截真实发起邀约请求。");
    }
    const parsed = new URL(path, location.origin);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") parsed.searchParams.set(key, String(value));
    }
    const init = {
      method: String(method || "GET").toUpperCase(),
      credentials: "include",
      headers: { "content-type": "application/json" }
    };
    if (init.method !== "GET" && init.method !== "HEAD") {
      init.body = JSON.stringify(body || {});
    }
    const response = await fetch(parsed.toString(), init);
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`蒲公英接口返回非 JSON：${text.slice(0, 120)}`);
    }
    if (!response.ok || payload?.success === false || Number(payload?.code || 0) !== 0 && payload?.code !== undefined) {
      throw new Error(payload?.msg || payload?.message || `蒲公英接口请求失败：HTTP ${response.status}`);
    }
    return { ok: true, status: response.status, payload, data: apiPayload(payload) };
  }

  function extractUserIdFromText(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const decoded = (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })();
    const patterns = [
      /\/blogger-detail\/([A-Za-z0-9_-]{6,})/,
      /\/user\/profile\/([A-Za-z0-9_-]{6,})/,
      /[?&](?:id|userId|kolId|bloggerId)=([A-Za-z0-9_-]{6,})/,
      /\bpgy-api:([A-Za-z0-9_-]{6,})/
    ];
    for (const pattern of patterns) {
      const match = decoded.match(pattern);
      if (match?.[1]) return match[1];
    }
    return /^[A-Za-z0-9_-]{6,}$/.test(decoded) ? decoded : "";
  }

  async function searchBrands(keyword) {
    const name = String(keyword || "").trim();
    if (!name) return { ok: true, brands: [] };
    const result = await fetchPgyApi("/api/solar/brand/search_brand", {
      query: { name, pageSize: 50, scene: 14 }
    });
    const list = Array.isArray(result.data?.list) ? result.data.list : Array.isArray(result.data) ? result.data : [];
    return {
      ok: true,
      brands: list.map((item) => ({
        ...item,
        label: item.brandName || item.name || "",
        value: item.brandUserId || item.userId || item.id || "",
        avatar: item.brandAvatar || item.avatar || "",
        disabled: Boolean(item.disabled || item.disableSelected)
      })).filter((item) => item.label || item.value)
    };
  }

  async function resolveInviteBloggers(inputs = []) {
    const links = Array.isArray(inputs) ? inputs : [];
    const results = [];
    for (const input of links) {
      const text = String(input || "").trim();
      const userId = extractUserIdFromText(text);
      if (!userId) {
        results.push({ input: text, ok: false, message: "无法识别博主 ID" });
        continue;
      }
      try {
        const detail = await fetchPgyApi(`/api/solar/cooperator/user/blogger/${encodeURIComponent(userId)}`);
        const permission = await fetchPgyApi("/api/solar/invite/check_invite_permission", {
          query: { kol_id: userId }
        }).catch((error) => ({ ok: false, message: error?.message || String(error), data: {} }));
        const data = detail.data || {};
        results.push({
          input: text,
          ok: true,
          userId,
          name: data.name || data.nickName || data.nickname || "",
          avatar: data.headPhoto || data.avatar || "",
          redId: data.redId || "",
          picturePrice: data.picturePrice,
          videoPrice: data.videoPrice,
          pictureState: data.pictureState,
          videoState: data.videoState,
          permission: permission.data || {},
          raw: data
        });
      } catch (error) {
        results.push({ input: text, ok: false, userId, message: error?.message || String(error) });
      }
      await new Promise((resolve) => setTimeout(resolve, 160));
    }
    return { ok: true, results };
  }

  async function buildInviteDraft(options = {}) {
    const bloggers = Array.isArray(options.bloggers) ? options.bloggers.filter((item) => item?.ok && item.userId) : [];
    const form = options.form || {};
    const brand = form.brand || {};
    const kolIds = bloggers.map((item) => item.userId);
    const userInfo = await fetchPgyApi("/api/solar/user/info").catch(() => ({ data: {} }));
    const inviteData = {
      cooperateBrandName: brand.brandName || brand.label || "",
      cooperateBrandId: brand.brandUserId || brand.value || "",
      productName: String(form.productName || "").trim(),
      inviteType: Number(form.contentType || 1),
      expectedPublishTimeStart: form.startDate || "",
      expectedPublishTimeEnd: form.endDate || "",
      inviteContent: String(form.productDesc || "").trim(),
      contactType: Number(form.contactType || 1),
      contactInfo: String(form.contact || "").trim(),
      brandUserId: userInfo.data?.userId || ""
    };
    return {
      ok: true,
      safeMode: true,
      message: "已生成邀约草稿。安全模式不会调用真实发起邀约接口。",
      payload: {
        kolIds,
        inviteData,
        perKolPayloads: kolIds.map((kolId) => ({ kolId, ...inviteData }))
      },
      inviteUrls: bloggers.map((item) => `https://pgy.xiaohongshu.com/solar/pre-trade/invite-form?id=${encodeURIComponent(item.userId)}&fromRoute=BloggerDetail`)
    };
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function submitInvites(options = {}) {
    const draft = await buildInviteDraft(options);
    const perKolPayloads = Array.isArray(draft.payload?.perKolPayloads) ? draft.payload.perKolPayloads : [];
    if (!perKolPayloads.length) throw new Error("没有可提交的邀约达人。");
    const results = [];
    let remainTimes = null;
    for (let index = 0; index < perKolPayloads.length; index += 1) {
      const payload = perKolPayloads[index];
      if (index > 0) await wait(1000);
      try {
        const response = await fetchPgyApi("https://pgy.xiaohongshu.com/api/solar/invite/initiate_invite", {
          method: "POST",
          body: payload,
          allowSubmit: true
        });
        const data = response.data || response.payload || {};
        if (!data.inviteSucceed) throw new Error(data.hint || data.msg || data.message || "邀约失败");
        remainTimes = data.remainTimes ?? remainTimes;
        const overview = await fetchPgyApi("https://pgy.xiaohongshu.com/api/solar/invite/get_invites_overview", {
          method: "POST",
          body: {
            kolIntention: -1,
            inviteStatus: -1,
            kolType: 0,
            kolId: payload.kolId,
            showWechat: 0,
            searchDateType: 1,
            pageNum: 1,
            pageSize: 10
          }
        }).catch(() => null);
        results.push({
          ok: true,
          kolId: payload.kolId,
          remainTimes,
          invite: overview?.data?.invites?.[0] || null
        });
      } catch (error) {
        results.push({
          ok: false,
          kolId: payload.kolId,
          message: error?.message || String(error)
        });
      }
    }
    const successCount = results.filter((item) => item.ok).length;
    return {
      ok: true,
      submitted: true,
      intervalMs: 1000,
      total: perKolPayloads.length,
      successCount,
      failedCount: perKolPayloads.length - successCount,
      remainTimes,
      results
    };
  }

  async function exportAll(options = {}, requestId) {
    if (!state.latestRequest) {
      throw new Error("还没有捕获到蒲公英找博主列表 API，请先刷新列表或点击筛选条件。");
    }
    state.activeExportRequestId = requestId || "";
    state.stopRequested = false;
    const pageSize = Math.max(1, Math.min(Number(options.pageSize || 50), 100));
    const maxRows = Math.max(1, Math.min(Number(options.maxRows || 5000), 20000));
    const rows = [];
    let total = state.totalCount || maxRows;
    let pageNumber = 1;
    let emptyPages = 0;
    while (rows.length < Math.min(total, maxRows) && emptyPages < 2) {
      if (state.stopRequested) break;
      const payload = await fetchPage(state.latestRequest, pageNumber, pageSize);
      const items = extractItems(payload);
      total = extractTotal(payload, total || items.length);
      if (!items.length) {
        emptyPages += 1;
      } else {
        emptyPages = 0;
      }
      rows.push(...items.map((item, index) => normalizeKol(item, pageNumber, index + 1)));
      window.postMessage({
        source: PAGE_SOURCE,
        type: "EXPORT_PROGRESS",
        requestId,
        payload: {
          pageNumber,
          pageSize,
          collectedCount: rows.length,
          totalCount: total,
          message: `已读取 ${rows.length}/${Math.min(total || maxRows, maxRows)}`
        }
      }, "*");
      if (state.stopRequested || (items.length < pageSize && rows.length >= total)) break;
      pageNumber += 1;
      await new Promise((resolve) => setTimeout(resolve, Number(options.delayMs || 250)));
    }
    const stopped = Boolean(state.stopRequested);
    state.activeExportRequestId = "";
    state.stopRequested = false;
    return {
      ok: true,
      rows: rows.slice(0, maxRows),
      totalCount: total,
      capturedAt: state.capturedAt,
      request: state.latestRequest,
      stopped
    };
  }

  const nativeFetch = window.fetch;
  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    const method = init?.method || input?.method || "GET";
    const body = init?.body || "";
    const headers = { ...headersToObject(input?.headers), ...headersToObject(init?.headers) };
    const response = await nativeFetch.apply(this, arguments);
    if (isKolApi(url)) {
      response.clone().json()
        .then((payload) => rememberRequest({ url: absoluteUrl(url), method, body: typeof body === "string" ? body : "", headers }, payload))
        .catch(() => rememberRequest({ url: absoluteUrl(url), method, body: typeof body === "string" ? body : "", headers }, null));
    }
    return response;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  const nativeSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__pgyExporter = { method, url: absoluteUrl(url), headers: {} };
    return nativeOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function patchedSetHeader(key, value) {
    if (this.__pgyExporter) this.__pgyExporter.headers[key] = value;
    return nativeSetRequestHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function patchedSend(body) {
    const capture = this.__pgyExporter;
    if (capture && isKolApi(capture.url)) {
      capture.body = typeof body === "string" ? body : "";
      this.addEventListener("load", () => {
        rememberRequest(capture, safeJson(this.responseText));
      });
    }
    return nativeSend.apply(this, arguments);
  };

  window.addEventListener("message", async (event) => {
    const message = event.data || {};
    if (event.source !== window || message.source !== EXT_SOURCE) return;
    const requestId = message.requestId;
    try {
      if (message.type === "GET_CAPTURE") {
        window.postMessage({ source: PAGE_SOURCE, type: "GET_CAPTURE_RESULT", requestId, payload: publicCapture() }, "*");
      }
      if (message.type === "EXPORT_ALL") {
        const payload = await exportAll(message.options || {}, requestId);
        window.postMessage({ source: PAGE_SOURCE, type: "EXPORT_ALL_RESULT", requestId, payload }, "*");
      }
      if (message.type === "STOP_EXPORT") {
        state.stopRequested = true;
        window.postMessage({
          source: PAGE_SOURCE,
          type: "STOP_EXPORT_RESULT",
          requestId,
          payload: { ok: true, activeRequestId: state.activeExportRequestId }
        }, "*");
      }
      if (message.type === "PGY_INVITE_SEARCH_BRAND") {
        const payload = await searchBrands(message.options?.keyword || "");
        window.postMessage({ source: PAGE_SOURCE, type: "PGY_INVITE_SEARCH_BRAND_RESULT", requestId, payload }, "*");
      }
      if (message.type === "PGY_INVITE_RESOLVE_BLOGGERS") {
        const payload = await resolveInviteBloggers(message.options?.inputs || []);
        window.postMessage({ source: PAGE_SOURCE, type: "PGY_INVITE_RESOLVE_BLOGGERS_RESULT", requestId, payload }, "*");
      }
      if (message.type === "PGY_INVITE_BUILD_DRAFT") {
        const payload = await buildInviteDraft(message.options || {});
        window.postMessage({ source: PAGE_SOURCE, type: "PGY_INVITE_BUILD_DRAFT_RESULT", requestId, payload }, "*");
      }
      if (message.type === "PGY_INVITE_SUBMIT") {
        const payload = await submitInvites(message.options || {});
        window.postMessage({ source: PAGE_SOURCE, type: "PGY_INVITE_SUBMIT_RESULT", requestId, payload }, "*");
      }
    } catch (error) {
      window.postMessage({
        source: PAGE_SOURCE,
        type: `${message.type}_RESULT`,
        requestId,
        payload: { ok: false, message: error?.message || String(error) }
      }, "*");
    }
  });
})();
