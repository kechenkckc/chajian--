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
    const response = await nativeFetch(request.url, init);
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

  async function prefetchBusinessData(targetBusiness = "cooperation") {
    const fetched = [];
    const errors = [];
    const kinds = ["data_summary", "notes_rate", "notes_detail"];
    for (const kind of kinds) {
      const sourceRequests = requestListFor(kind, targetBusiness).length
        ? requestListFor(kind, targetBusiness)
        : requestListFor(kind, targetBusiness === "cooperation" ? "daily" : "cooperation");
      for (const sourceRequest of sourceRequests.slice(0, kind === "notes_detail" ? 6 : 2)) {
        const nextRequest = requestWithBusiness(sourceRequest, targetBusiness);
        if (!nextRequest?.url) continue;
        try {
          const result = await fetchFromSnapshot(nextRequest);
          fetched.push({ kind, ok: result?.ok, status: result?.status, url: result?.url });
        } catch (error) {
          errors.push({ kind, url: nextRequest.url, message: error?.message || String(error) });
        }
      }
    }
    return { ok: !errors.length, business: targetBusiness, fetched, errors };
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
