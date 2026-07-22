(function installPgyDetailApiHook() {
  if (window.__PGY_DETAIL_API_HOOK_INSTALLED__) return;
  window.__PGY_DETAIL_API_HOOK_INSTALLED__ = true;

  const interestingRules = [
    ["blogger_profile", "/api/solar/cooperator/user/blogger/"],
    ["fans_summary", "/api/solar/kol/data_v3/fans_summary"],
    ["fans_profile", "/fans_profile"],
    ["data_summary", "/api/pgy/kol/data/data_summary"],
    ["notes_rate", "/api/solar/kol/data_v3/notes_rate"],
    ["notes_detail", "/api/solar/kol/data_v2/notes_detail"],
    ["kol_data", "/api/solar/kol/data/"]
  ];

  const state = {
    cache: {},
    responses: [],
    requests: []
  };

  function absoluteUrl(url) {
    try {
      return new URL(url, location.origin).toString();
    } catch {
      return String(url || "");
    }
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
    return payload && typeof payload === "object" && payload.data && typeof payload.data === "object" ? payload.data : payload;
  }

  function businessFromUrl(url) {
    try {
      const parsed = new URL(url, location.origin);
      const business = parsed.searchParams.get("business");
      return business === "1" ? "cooperation" : "daily";
    } catch {
      return String(url || "").includes("business=1") ? "cooperation" : "daily";
    }
  }

  function cleanHeaders(headers) {
    const result = {};
    const blocked = new Set(["host", "origin", "referer", "content-length", "cookie"]);
    for (const [key, value] of Object.entries(headers || {})) {
      const normalized = String(key || "").toLowerCase();
      if (!normalized || blocked.has(normalized) || normalized.startsWith(":")) continue;
      result[key] = value;
    }
    return result;
  }

  function requestWithBusiness(request, business) {
    if (!request?.url) return null;
    let url = "";
    try {
      const parsed = new URL(request.url, location.origin);
      parsed.searchParams.set("business", business === "cooperation" ? "1" : "0");
      url = parsed.toString();
    } catch {
      return null;
    }
    return {
      ...request,
      url,
      headers: cleanHeaders(request.headers),
      captured_at: new Date().toISOString()
    };
  }

  async function fetchFromSnapshot(request) {
    if (!request?.url) return null;
    const init = {
      method: request.method || "GET",
      credentials: "include",
      headers: cleanHeaders(request.headers)
    };
    if (init.method !== "GET" && init.method !== "HEAD" && request.body) init.body = request.body;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await nativeFetch(request.url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
    const text = await response.text();
    const payload = safeJson(text);
    cachePayload(request.url, payload, request);
    return { ok: response.ok, status: response.status, url: request.url, payload };
  }

  function requestListFor(kind, business) {
    const requests = state.cache.requests?.[kind];
    if (!requests) return [];
    if (kind === "notes_detail") {
      const flattened = [];
      const source = requests[business] || requests;
      for (const noteType of Object.keys(source || {})) {
        const pages = source[noteType];
        if (!pages || typeof pages !== "object") continue;
        for (const pageNumber of Object.keys(pages)) {
          if (pages[pageNumber]?.url) flattened.push(pages[pageNumber]);
        }
      }
      return flattened;
    }
    return requests[business]?.url ? [requests[business]] : [];
  }

  function hasCachedKind(kind, business) {
    if (kind === "notes_detail") {
      const byType = state.cache.notes_detail?.[business];
      return Boolean(byType && Object.values(byType).some((pages) => pages && Object.keys(pages).length));
    }
    return Boolean(state.cache[kind]?.[business]);
  }

  function hasRequiredKinds(kinds, business) {
    return kinds.every((kind) => hasCachedKind(kind, business));
  }

  async function triggerCooperationTab(requiredKinds) {
    const ready = () => hasRequiredKinds(requiredKinds, "cooperation");
    if (ready()) return { ok: true, triggered: false, ready: true };
    const candidates = Array.from(document.querySelectorAll("button, div, span"))
      .filter((element) => element.children.length === 0 && element.textContent.trim() === "合作笔记")
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    const target = candidates.find((element) => !/(active|selected)/i.test(String(element.className || ""))) || candidates[0];
    if (!target) return { ok: false, triggered: false, message: "未找到合作笔记页签" };
    target.click();
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (ready()) return { ok: true, triggered: true, ready: true };
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return { ok: false, triggered: true, ready: false, message: "合作笔记接口未在等待时间内返回" };
  }

  async function replayBusinessRequests(targetBusiness, kinds) {
    const fetched = [];
    const errors = [];
    const tasks = [];
    for (const kind of kinds) {
      const sourceRequests = requestListFor(kind, targetBusiness).length
        ? requestListFor(kind, targetBusiness)
        : requestListFor(kind, targetBusiness === "cooperation" ? "daily" : "cooperation");
      const selectedRequests = kind === "notes_detail"
        ? sourceRequests.filter((request, index, items) => {
          let noteType = "";
          try {
            noteType = new URL(request.url, location.origin).searchParams.get("noteType") || "unknown";
          } catch {
            noteType = "unknown";
          }
          return items.findIndex((item) => {
            try {
              return (new URL(item.url, location.origin).searchParams.get("noteType") || "unknown") === noteType;
            } catch {
              return noteType === "unknown";
            }
          }) === index;
        }).slice(0, 3)
        : sourceRequests.slice(0, 1);
      for (const sourceRequest of selectedRequests) {
        const nextRequest = requestWithBusiness(sourceRequest, targetBusiness);
        if (!nextRequest?.url) continue;
        tasks.push((async () => {
          try {
            const result = await fetchFromSnapshot(nextRequest);
            fetched.push({ kind, ok: result?.ok, status: result?.status, url: result?.url });
          } catch (error) {
            errors.push({ kind, url: nextRequest.url, message: error?.message || String(error) });
          }
        })());
      }
    }
    await Promise.all(tasks);
    return { fetched, errors };
  }

  async function prefetchBusinessData(targetBusiness = "cooperation", requestedKinds = []) {
    const allowedKinds = new Set(["data_summary", "notes_rate", "notes_detail"]);
    const kinds = (Array.isArray(requestedKinds) && requestedKinds.length
      ? requestedKinds
      : Array.from(allowedKinds)).filter((kind) => allowedKinds.has(kind));
    if (!kinds.length || hasRequiredKinds(kinds, targetBusiness)) {
      return { ok: true, skipped: !kinds.length, ready: true, business: targetBusiness, fetched: [], errors: [], source: "cache" };
    }

    const replayed = await replayBusinessRequests(targetBusiness, kinds);
    if (hasRequiredKinds(kinds, targetBusiness)) {
      return { ok: true, ready: true, business: targetBusiness, ...replayed, source: "api" };
    }

    if (targetBusiness === "cooperation") {
      const triggered = await triggerCooperationTab(kinds);
      return {
        ...triggered,
        ok: Boolean(triggered.ready),
        business: targetBusiness,
        ...replayed,
        source: triggered.ready ? "tab_fallback" : "api_and_tab_failed"
      };
    }
    return {
      ok: hasRequiredKinds(kinds, targetBusiness),
      ready: hasRequiredKinds(kinds, targetBusiness),
      business: targetBusiness,
      ...replayed,
      source: "api"
    };
  }

  function numberParam(url, name, fallback = 0) {
    try {
      const parsed = new URL(url, location.origin);
      const value = Number(parsed.searchParams.get(name));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    } catch {
      const match = String(url || "").match(new RegExp(`[?&]${name}=([^&]+)`));
      const value = Number(match?.[1]);
      return Number.isFinite(value) && value > 0 ? value : fallback;
    }
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

  function requestSnapshot(url, method, body, headers) {
    return {
      url: absoluteUrl(url),
      method: String(method || "GET").toUpperCase(),
      body: typeof body === "string" ? body : "",
      headers: headersToObject(headers),
      captured_at: new Date().toISOString()
    };
  }

  function cachePayload(url, payload, request) {
    const absolute = absoluteUrl(url);
    if (!absolute.includes("pgy.xiaohongshu.com") || !absolute.includes("/api/")) return;
    const matched = interestingRules.find(([, marker]) => absolute.includes(marker));
    if (!matched) return;
    const [kind] = matched;
    const data = responseData(payload);
    if (!data || typeof data !== "object") return;
    state.responses.push({ kind, url: absolute, data, captured_at: new Date().toISOString() });
    if (request) state.requests.push({ kind, ...request });

    if (kind === "data_summary" || kind === "notes_rate") {
      const business = businessFromUrl(absolute);
      state.cache[kind] = state.cache[kind] || {};
      state.cache[kind][business] = data;
      state.cache.requests = state.cache.requests || {};
      state.cache.requests[kind] = state.cache.requests[kind] || {};
      state.cache.requests[kind][business] = request;
      return;
    }
    if (kind === "notes_detail") {
      const business = businessFromUrl(absolute);
      const noteType = numberParam(absolute, "noteType", 0);
      const pageNumber = numberParam(absolute, "pageNumber", 1);
      state.cache.notes_detail = state.cache.notes_detail || {};
      state.cache.notes_detail[business] = state.cache.notes_detail[business] || {};
      state.cache.notes_detail[business][noteType] = state.cache.notes_detail[business][noteType] || {};
      state.cache.notes_detail[business][noteType][pageNumber] = data;
      state.cache.requests = state.cache.requests || {};
      state.cache.requests.notes_detail = state.cache.requests.notes_detail || {};
      state.cache.requests.notes_detail[business] = state.cache.requests.notes_detail[business] || {};
      state.cache.requests.notes_detail[business][noteType] = state.cache.requests.notes_detail[business][noteType] || {};
      state.cache.requests.notes_detail[business][noteType][pageNumber] = request;
      return;
    }
    state.cache[kind] = data;
    state.cache.requests = state.cache.requests || {};
    state.cache.requests[kind] = request;
  }

  const nativeFetch = window.fetch;
  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    const method = init?.method || input?.method || "GET";
    const body = init?.body || input?.body || "";
    const headers = { ...headersToObject(input?.headers), ...headersToObject(init?.headers) };
    const request = requestSnapshot(url, method, body, headers);
    const response = await nativeFetch.apply(this, arguments);
    response.clone().text()
      .then((text) => cachePayload(url, safeJson(text), request))
      .catch(() => null);
    return response;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  const nativeSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__pgyDetailApi = { method, url: absoluteUrl(url), headers: {} };
    return nativeOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function patchedSetHeader(key, value) {
    if (this.__pgyDetailApi) this.__pgyDetailApi.headers[key] = value;
    return nativeSetRequestHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function patchedSend(body) {
    const capture = this.__pgyDetailApi;
    if (capture) {
      capture.body = typeof body === "string" ? body : "";
      this.addEventListener("load", () => {
        const request = requestSnapshot(capture.url, capture.method, capture.body, capture.headers);
        cachePayload(capture.url, safeJson(this.responseText), request);
      });
    }
    return nativeSend.apply(this, arguments);
  };

  window.__PGY_DETAIL_API_CACHE__ = state;
  window.__PGY_DETAIL_API_PREFETCH__ = prefetchBusinessData;
})();
