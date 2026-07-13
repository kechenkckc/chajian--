(() => {
  if (window.__PGY_XHS_PROFILE_BRIDGE_INSTALLED__) return;
  window.__PGY_XHS_PROFILE_BRIDGE_INSTALLED__ = true;

  const BAR_ID = "pgy-xhs-profile-bridge-bar";
  const DETAIL_BUTTON_ID = "pgy-xhs-profile-bridge";
  const FAVORITE_BUTTON_ID = "pgy-xhs-profile-favorite";
  const FLOAT_CLASS = "pgy-xhs-profile-bridge-floating";
  const DETAIL_BASE = "https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/";
  const USER_ID_RE = /\/user\/profile\/([^/?#]+)/;


  let renderTimer = 0;
  let observer = null;
  let cachedProfileUserId = "";
  let cachedProfileAvatar = null;
  let cachedProfileAnchor = null;

  function currentXhsUserId() {
    const match = location.pathname.match(USER_ID_RE);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function pgyDetailUrl(userId = currentXhsUserId()) {
    return userId ? `${DETAIL_BASE}${encodeURIComponent(userId)}` : "";
  }

  function xhsProfileUrl(userId = currentXhsUserId()) {
    return userId ? `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(userId)}` : location.href;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isBadProfileText(text) {
    return /©|copyright|行吟|信息科技|有限公司|公司地址|地址[:：]|电话[:：]|沪ICP备|公网安备|隐私政策|用户协议|营业执照|违法和不良信息|9501-3888/i.test(text);
  }

  function profileName() {
    const heading = Array.from(document.querySelectorAll("h1, h2, .user-name, .name, [class*='name']"))
      .map((node) => cleanText(node.textContent))
      .find((text) => text && text.length <= 40 && !/小红书|登录|关注/.test(text));
    if (heading) return heading;
    return cleanText(document.title.replace(/-?\s*小红书.*$/i, ""));
  }

  function profileAvatar() {
    const avatar = findAvatar();
    const candidates = [avatar?.currentSrc, avatar?.src, avatar?.getAttribute("data-src")];
    return candidates.map((value) => String(value || "").trim()).find((value) => /^https?:\/\//i.test(value) || /^data:image\//i.test(value)) || "";
  }

  function visibleTextNodes() {
    const nodes = Array.from(document.querySelectorAll("h1, h2, h3, span, p, div"));
    const seen = new Set();
    const texts = [];
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight + 400) continue;
      const text = cleanText(node.textContent);
      if (!text || text.length > 140 || seen.has(text)) continue;
      seen.add(text);
      texts.push(text);
      if (texts.length >= 160) break;
    }
    return texts;
  }

  function firstMatch(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return cleanText(match[1]);
    }
    return "";
  }


  function profileSimpleData() {
    const texts = visibleTextNodes();
    const joined = texts.join(" | ");
    const redId = firstMatch(joined, [
      /小红书号[:：]?\s*([A-Za-z0-9._-]{3,})/,
      /红书号[:：]?\s*([A-Za-z0-9._-]{3,})/
    ]);
    const location = firstMatch(joined, [/IP属地[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9_-]{2,16})/]);
    const followersText = firstMatch(joined, [/([0-9.]+万?\+?)\s*粉丝/]);
    const likesText = firstMatch(joined, [/([0-9.]+万?\+?)\s*(?:获赞与收藏|赞藏|获赞)/]);
    const picturePriceText = firstMatch(joined, [
      /图文(?:笔记)?(?:一口价|报价|价格)?[:：]?\s*(?:¥|￥)?\s*([0-9.,]+(?:万)?)/,
      /图文[:：]\s*(?:¥|￥)?\s*([0-9.,]+(?:万)?)/
    ]);
    const videoPriceText = firstMatch(joined, [
      /视频(?:笔记)?(?:一口价|报价|价格)?[:：]?\s*(?:¥|￥)?\s*([0-9.,]+(?:万)?)/,
      /视频[:：]\s*(?:¥|￥)?\s*([0-9.,]+(?:万)?)/
    ]);
    const bio = texts.find((text) => {
      if (text.length < 10 || text.length > 90) return false;
      if (isBadProfileText(text)) return false;
      if (/小红书号|IP属地|关注|粉丝|获赞|收藏|登录|编辑资料/.test(text)) return false;
      return /[，。|｜、\s]/.test(text);
    }) || "";
    return { redId, location, followersText, likesText, picturePriceText, videoPriceText, bio };
  }

  async function storageGet(defaults) {
    return chrome.storage.local.get(defaults);
  }

  async function storageSet(values) {
    return chrome.storage.local.set(values);
  }

  function favoriteRecord() {
    const userId = currentXhsUserId();
    const simpleData = profileSimpleData();
    return {
      userId,
      name: profileName(),
      avatar: profileAvatar(),
      ...simpleData,
      xhsUrl: xhsProfileUrl(userId),
      pgyUrl: pgyDetailUrl(userId),
      source: "xhs_profile",
      categoryTags: [],
      categorySource: "pending",
      status: "预收藏",
      quoteStatus: "报价获取中",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async function isFavorited(userId = currentXhsUserId()) {
    const stored = await storageGet({ pgyPreFavorites: [] });
    return Array.isArray(stored.pgyPreFavorites) && stored.pgyPreFavorites.some((item) => item.userId === userId);
  }

  async function saveFavorite() {
    const record = favoriteRecord();
    if (!record.userId) return { ok: false, message: "没有识别到当前达人 ID。" };
    const stored = await storageGet({ pgyPreFavorites: [] });
    const favorites = Array.isArray(stored.pgyPreFavorites) ? stored.pgyPreFavorites : [];
    const existingIndex = favorites.findIndex((item) => item.userId === record.userId);
    const next = [...favorites];
    if (existingIndex >= 0) {
      const existing = next[existingIndex];
      next[existingIndex] = {
        ...existing,
        ...record,
        status: existing.status === "已写入飞书" || (Array.isArray(existing.feishuWriteHistory) && existing.feishuWriteHistory.length)
          ? "已写入飞书"
          : record.status,
        createdAt: existing.createdAt || record.createdAt
      };
    } else {
      next.unshift(record);
    }
    await storageSet({ pgyPreFavorites: next });
    return { ok: true, existing: existingIndex >= 0, count: next.length };
  }

  async function refreshFavoriteQuote(userId) {
    if (!userId) return;
    try {
      const result = await chrome.runtime.sendMessage({ type: "ENRICH_PREFAVORITE_QUOTE", userId });
      if (!result?.ok) throw new Error(result?.message || "报价获取失败");
    } catch (error) {
      const stored = await storageGet({ pgyPreFavorites: [] });
      const favorites = Array.isArray(stored.pgyPreFavorites) ? stored.pgyPreFavorites : [];
      const next = favorites.map((item) => item?.userId === userId
        ? { ...item, quoteStatus: `报价待补充：${error?.message || "请确认已登录蒲公英"}`, updatedAt: new Date().toISOString() }
        : item
      );
      await storageSet({ pgyPreFavorites: next });
    }
  }

  function visibleRect(element) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 48 || rect.height < 48) return null;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return null;
    return rect;
  }

  function scoreAvatarCandidate(img) {
    const rect = visibleRect(img);
    if (!rect) return -1;
    const radius = Number.parseFloat(getComputedStyle(img).borderRadius || "0") || 0;
    const roundness = radius >= Math.min(rect.width, rect.height) * 0.35 ? 80 : 0;
    const idealSize = rect.width >= 80 && rect.width <= 180 && rect.height >= 80 && rect.height <= 180 ? 80 : 0;
    const headerZone = rect.top >= 80 && rect.top <= 360 ? 60 : 0;
    const centerZone = rect.left >= window.innerWidth * 0.25 && rect.left <= window.innerWidth * 0.55 ? 50 : 0;
    const squareness = Math.max(0, 40 - Math.abs(rect.width - rect.height));
    return roundness + idealSize + headerZone + centerZone + squareness;
  }

  function findAvatar() {
    const images = Array.from(document.images || []);
    return images
      .map((img) => ({ img, score: scoreAvatarCandidate(img) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.img || null;
  }

  function profileAvatarNode(userId) {
    if (cachedProfileUserId !== userId) {
      cachedProfileUserId = userId;
      cachedProfileAvatar = null;
      cachedProfileAnchor = null;
    }
    if (cachedProfileAvatar?.isConnected) return cachedProfileAvatar;
    cachedProfileAvatar = findAvatar();
    return cachedProfileAvatar;
  }

  function createDetailButton() {
    const button = document.createElement("button");
    button.id = DETAIL_BUTTON_ID;
    button.type = "button";
    button.className = "pgy-xhs-profile-tool";
    button.title = "跳转到蒲公英达人详情页";
    button.innerHTML = `<span>蒲</span><strong>蒲公英详情</strong>`;
    button.addEventListener("click", () => {
      const url = pgyDetailUrl();
      if (!url) return;
      window.open(url, "_blank", "noopener");
    });
    return button;
  }

  function createFavoriteButton() {
    const button = document.createElement("button");
    button.id = FAVORITE_BUTTON_ID;
    button.type = "button";
    button.className = "pgy-xhs-profile-tool pgy-xhs-profile-favorite";
    button.title = "预收藏到后台收藏界面";
    button.innerHTML = `<span>收</span><strong>预收藏</strong>`;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await saveFavorite();
        if (!result.ok) throw new Error(result.message || "预收藏失败");
        refreshFavoriteQuote(currentXhsUserId());
        await updateFavoriteState();
        button.classList.add("is-saved");
        button.querySelector("strong").textContent = result.existing ? "已更新" : "已预收藏";
        setTimeout(updateFavoriteState, 1400);
      } catch (error) {
        button.querySelector("strong").textContent = error?.message || "收藏失败";
        setTimeout(updateFavoriteState, 1800);
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  function createFavoritesPageButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pgy-xhs-profile-tool pgy-xhs-profile-open-favorites";
    button.title = "打开后台收藏界面";
    button.innerHTML = `<span>夹</span><strong>收藏后台</strong>`;
    button.querySelector("strong").textContent = "\u6536\u85cf\u8fbe\u4eba\u5e93";
    button.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_FAVORITES_PAGE" });
    });
    return button;
  }

  function barNode() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.className = FLOAT_CLASS;
    bar.append(createDetailButton(), createFavoriteButton(), createFavoritesPageButton());
    return bar;
  }

  async function updateFavoriteState() {
    const button = document.getElementById(FAVORITE_BUTTON_ID);
    if (!button) return;
    const saved = await isFavorited();
    button.classList.toggle("is-saved", saved);
    button.querySelector("strong").textContent = saved ? "已预收藏" : "预收藏";
  }

  function placeAtProfileHeader(bar, avatar) {
    if (!cachedProfileAnchor) {
      const rect = avatar.getBoundingClientRect();
      cachedProfileAnchor = {
        left: window.scrollX + rect.left,
        top: window.scrollY + rect.top,
        height: rect.height
      };
    }
    const width = 126;
    const left = Math.max(16, Math.round(cachedProfileAnchor.left - width - 38));
    const top = Math.max(88, Math.round(cachedProfileAnchor.top + cachedProfileAnchor.height / 2 - 54));
    bar.className = FLOAT_CLASS;
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
    bar.style.position = "absolute";
    if (bar.parentElement !== document.body) document.body.append(bar);
  }

  function renderBridge() {
    const userId = currentXhsUserId();
    const bar = barNode();
    if (!userId) {
      bar.remove();
      return;
    }
    const avatar = profileAvatarNode(userId);
    if (!avatar) {
      bar.remove();
      return;
    }
    placeAtProfileHeader(bar, avatar);
    updateFavoriteState();
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderBridge, 120);
  }

  function watchUrlChanges() {
    let previous = location.href;
    setInterval(() => {
      if (location.href === previous) return;
      previous = location.href;
      scheduleRender();
    }, 500);
  }

  function startObserver() {
    observer?.disconnect();
    observer = new MutationObserver(scheduleRender);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener("resize", scheduleRender);
  startObserver();
  watchUrlChanges();
  scheduleRender();
})();
