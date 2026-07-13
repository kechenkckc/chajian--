const STORAGE_KEY = "pgyPreFavorites";

const favoriteCount = document.getElementById("favoriteCount");
const favoriteList = document.getElementById("favoriteList");
const statusNode = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const clearBtn = document.getElementById("clearBtn");
const selectAll = document.getElementById("selectAll");
const selectedCount = document.getElementById("selectedCount");
const writeFeishuBtn = document.getElementById("writeFeishuBtn");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const categoryFilters = document.getElementById("categoryFilters");
const DEFAULT_CATEGORIES = [
  "美妆",
  "护肤",
  "个人护理",
  "母婴",
  "时尚",
  "美食",
  "家居家装",
  "影视综资讯",
  "运动健身",
  "宠物",
  "文化艺术",
  "兴趣爱好",
  "生活记录",
  "教育",
  "职场",
  "情感",
  "摄影",
  "游戏",
  "科技数码",
  "出行旅游",
  "音乐",
  "搞笑",
  "健康养生",
  "汽车",
  "婚嫁",
  "商业财经",
  "素材"
];

let favorites = [];
let selectedUserIds = new Set();
let writing = false;
let activeCategory = "";

function setStatus(text, isError = false) {
  statusNode.textContent = text;
  statusNode.classList.toggle("is-error", Boolean(isError));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAvatarUrl(value) {
  const url = String(value || "").trim();
  if (url.startsWith("//")) return `https:${url}`;
  return /^https?:\/\//i.test(url) || /^data:image\//i.test(url) ? url : "";
}

function avatarInitial(name) {
  return Array.from(String(name || "?").trim())[0] || "?";
}

function activateAvatarFallbacks() {
  for (const image of favoriteList.querySelectorAll(".favorite-avatar img")) {
    const showFallback = () => image.closest(".favorite-avatar")?.classList.add("is-fallback");
    image.addEventListener("error", showFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) showFallback();
  }
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isBadProfileText(text) {
  return /©|copyright|行吟|信息科技|有限公司|公司地址|地址[:：]|电话[:：]|沪ICP备|公网安备|隐私政策|用户协议|营业执照|违法和不良信息|9501-3888/i.test(text);
}

function sanitizeBio(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || isBadProfileText(text)) return "";
  if (/小红书号|IP属地|关注|粉丝|获赞|收藏|登录|编辑资料/.test(text)) return "";
  return text.length > 90 ? `${text.slice(0, 88)}...` : text;
}

function normalizeCategoryTags(value, source = "") {
  const rawTags = Array.isArray(value) ? value : [];
  const hasLegacyPgyShape = rawTags.some((tag) => /[-—>；;]/.test(String(tag || "")));
  if (source !== "pgy_profile" && !hasLegacyPgyShape) return [];
  const tags = [];
  for (const rawTag of rawTags) {
    const parts = String(rawTag || "").split(/[;；]+/);
    for (const part of parts) {
      const text = part.trim();
      if (!text) continue;
      const primary = text.split(/\s*[-—>]\s*/)[0]?.trim() || text;
      const tag = DEFAULT_CATEGORIES.includes(primary) ? primary : text;
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  return tags.slice(0, 5);
}

function normalizeFavorites(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      userId: String(item?.userId || "").trim(),
      name: String(item?.name || "").trim(),
      avatar: normalizeAvatarUrl(item?.avatar),
      redId: String(item?.redId || "").trim(),
      location: String(item?.location || "").trim(),
      followersText: String(item?.followersText || "").trim(),
      likesText: String(item?.likesText || "").trim(),
      picturePriceText: String(item?.picturePriceText || item?.picturePrice || item?.quotePrice || "").trim(),
      videoPriceText: String(item?.videoPriceText || item?.videoPrice || "").trim(),
      quoteStatus: String(item?.quoteStatus || "").trim(),
      bio: sanitizeBio(item?.bio),
      categoryTags: normalizeCategoryTags(item?.categoryTags, item?.categorySource),
      categorySource: String(item?.categorySource || "").trim(),
      xhsUrl: String(item?.xhsUrl || "").trim(),
      pgyUrl: String(item?.pgyUrl || "").trim(),
      status: String(item?.status || "预收藏").trim(),
      createdAt: String(item?.createdAt || "").trim(),
      updatedAt: String(item?.updatedAt || "").trim()
    }))
    .filter((item) => item.userId);
}

function pruneSelection() {
  const validIds = new Set(favorites.map((item) => item.userId));
  selectedUserIds = new Set(Array.from(selectedUserIds).filter((userId) => validIds.has(userId)));
}

function favoriteSearchText(item) {
  return [
    item.userId,
    item.name,
    item.redId,
    item.location,
    item.followersText,
    item.likesText,
    item.picturePriceText,
    item.videoPriceText,
    item.quoteStatus,
    item.bio,
    item.status,
    ...(item.categoryTags || [])
  ].join(" ").toLowerCase();
}

function filteredFavorites() {
  const keyword = String(searchInput.value || "").trim().toLowerCase();
  const status = statusFilter.value;
  return favorites.filter((item) => {
    if (status && item.status !== status) return false;
    if (activeCategory === "未分类" && (item.categoryTags || []).length) return false;
    if (activeCategory && activeCategory !== "未分类" && !(item.categoryTags || []).includes(activeCategory)) return false;
    if (keyword && !favoriteSearchText(item).includes(keyword)) return false;
    return true;
  });
}

function allCategoryTags() {
  const counts = new Map();
  for (const category of DEFAULT_CATEGORIES) counts.set(category, 0);
  for (const item of favorites) {
    const tags = (item.categoryTags || []).length ? item.categoryTags : ["未分类"];
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return Array.from(counts.entries()).sort((a, b) => {
    const ai = DEFAULT_CATEGORIES.indexOf(a[0]);
    const bi = DEFAULT_CATEGORIES.indexOf(b[0]);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN");
  });
}

function renderCategoryFilters() {
  const tags = allCategoryTags();
  const allActive = activeCategory === "";
  categoryFilters.innerHTML = [
    `<button type="button" class="category-chip ${allActive ? "is-active" : ""}" data-category="">全部</button>`,
    ...tags.map(([tag, count]) => `
      <button type="button" class="category-chip ${activeCategory === tag ? "is-active" : ""}" data-category="${escapeHtml(tag)}">${escapeHtml(tag)}${count ? ` ${count}` : ""}</button>
    `)
  ].join("");
}

function updateSelectionState() {
  pruneSelection();
  const visible = filteredFavorites();
  const visibleIds = visible.map((item) => item.userId);
  const visibleSelected = visibleIds.filter((userId) => selectedUserIds.has(userId)).length;
  const selected = selectedUserIds.size;
  selectedCount.textContent = `已选 ${selected} 位`;
  writeFeishuBtn.disabled = writing || selected === 0;
  clearBtn.disabled = writing || favorites.length === 0;
  selectAll.disabled = writing || visible.length === 0;
  selectAll.checked = visible.length > 0 && visibleSelected === visible.length;
  selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
}

async function loadFavorites() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  favorites = normalizeFavorites(stored[STORAGE_KEY]);
  renderFavorites();
}

async function saveFavorites(nextFavorites) {
  favorites = normalizeFavorites(nextFavorites);
  await chrome.storage.local.set({ [STORAGE_KEY]: favorites });
  renderFavorites();
}

function renderEmpty() {
  favoriteList.innerHTML = `
    <div class="empty">
      ${favorites.length ? "当前筛选条件下没有匹配的达人。" : "还没有预收藏达人。从小红书或蒲公英达人主页点击“预收藏”后，会出现在这里。"}
    </div>
  `;
}

function renderFavorites() {
  renderCategoryFilters();
  const visibleFavorites = filteredFavorites();
  favoriteCount.textContent = String(favorites.length);
  updateSelectionState();

  if (!visibleFavorites.length) {
    renderEmpty();
    setStatus(favorites.length ? `共 ${favorites.length} 位预收藏达人，当前筛选无结果。` : "当前没有预收藏达人。");
    return;
  }

  favoriteList.innerHTML = visibleFavorites.map((item) => {
    const name = item.name || item.userId;
    const avatar = normalizeAvatarUrl(item.avatar);
    const initial = avatarInitial(name);
    const pgyUrl = item.pgyUrl || `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${encodeURIComponent(item.userId)}`;
    const xhsUrl = item.xhsUrl || `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(item.userId)}`;
    const tags = (item.categoryTags || []).length ? item.categoryTags : ["未分类"];
    const quoteStatus = item.quoteStatus || (!item.picturePriceText && !item.videoPriceText ? "报价待补充" : "");
    return `
      <article class="favorite-card" data-user-id="${escapeHtml(item.userId)}">
        <input class="favorite-select" type="checkbox" aria-label="选择 ${escapeHtml(name)}" ${selectedUserIds.has(item.userId) ? "checked" : ""} />
        <div class="favorite-avatar" aria-hidden="true">
          <span>${escapeHtml(initial)}</span>
          ${avatar ? `<img src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer" />` : ""}
        </div>
        <div class="favorite-info">
          <div class="headline">
            <a class="profile-link nickname-link" href="${escapeHtml(pgyUrl)}" target="_blank" rel="noopener" title="打开 ${escapeHtml(name)} 的蒲公英主页">${escapeHtml(name)}</a>
            <div class="tag-list">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
          </div>
          <div class="profile-data">
            <a class="profile-link red-id-link" href="${escapeHtml(xhsUrl)}" target="_blank" rel="noopener" title="打开 ${escapeHtml(name)} 的小红书主页">红书号：${escapeHtml(item.redId || item.userId)}</a>
            ${item.location ? `<span>${escapeHtml(item.location)}</span>` : ""}
          </div>
          <div class="key-metrics">
            <div><span>粉丝</span><strong>${escapeHtml(item.followersText || "-")}</strong></div>
            <div><span>图文报价</span><strong>${escapeHtml(item.picturePriceText || "待补充")}</strong></div>
            <div><span>视频报价</span><strong>${escapeHtml(item.videoPriceText || "待补充")}</strong></div>
          </div>
          ${item.bio ? `<div class="bio">${escapeHtml(item.bio)}</div>` : ""}
          <div class="meta">${escapeHtml(item.status || "预收藏")} · 收藏 ${escapeHtml(formatTime(item.createdAt))}${quoteStatus ? ` · ${escapeHtml(quoteStatus)}` : ""}</div>
        </div>
        <div class="card-actions">
          <a class="button" href="${escapeHtml(xhsUrl)}" target="_blank" rel="noopener">小红书主页</a>
          <a class="button primary" href="${escapeHtml(pgyUrl)}" target="_blank" rel="noopener">蒲公英详情</a>
          <button type="button" class="danger" data-action="remove">移除</button>
        </div>
      </article>
    `;
  }).join("");
  activateAvatarFallbacks();
  setStatus(`共 ${favorites.length} 位预收藏达人，当前显示 ${visibleFavorites.length} 位。`);
}

async function removeFavorite(userId) {
  selectedUserIds.delete(userId);
  await saveFavorites(favorites.filter((item) => item.userId !== userId));
  setStatus("已移除该预收藏达人。");
}

async function clearFavorites() {
  if (!favorites.length) return;
  const confirmed = window.confirm(`确定清空 ${favorites.length} 位预收藏达人吗？`);
  if (!confirmed) return;
  selectedUserIds.clear();
  await saveFavorites([]);
  setStatus("已清空预收藏。");
}

function selectedFavorites() {
  return favorites.filter((item) => selectedUserIds.has(item.userId));
}

function favoriteToFeishuRow(item) {
  const pgyUrl = item.pgyUrl || `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${encodeURIComponent(item.userId)}`;
  const xhsUrl = item.xhsUrl || `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(item.userId)}`;
  const collectedAt = item.createdAt || new Date().toISOString();
  return {
    "达人ID": `pgy-api:${item.userId}`,
    "达人昵称": item.name || "",
    "达人名称": item.name || "",
    "小红书号": item.redId || "",
    "蒲公英链接": pgyUrl,
    "主页链接": xhsUrl,
    "粉丝数": item.followersText || "",
    "获赞与收藏": item.likesText || "",
    "图文报价": item.picturePriceText || "",
    "视频报价": item.videoPriceText || "",
    "账号类型": (item.categoryTags || []).join("、"),
    "IP城市": item.location || "",
    "数据来源": "xhs_profile_prefavorite",
    "采集时间": formatTime(collectedAt),
    "详情补采状态": item.status || "预收藏",
    "个人简介": item.bio || "",
    "详情补采备注": "来自小红书达人主页预收藏",
    "蒲公英原始JSON": JSON.stringify(item)
  };
}

async function syncSelectedToFeishu() {
  const targets = selectedFavorites();
  if (!targets.length) throw new Error("请先勾选要写入飞书的达人。");
  const options = await chrome.storage.local.get({
    feishuAppId: "",
    feishuAppSecret: "",
    feishuUrl: "",
    feishuSheetId: "",
    syncUpdateExisting: false,
    syncUseFirstSheet: false
  });
  if (!options.feishuAppId || !options.feishuAppSecret || !options.feishuUrl) {
    throw new Error("请先在侧边栏填写飞书 App ID、App Secret 和同步达人飞书表格。");
  }

  writing = true;
  updateSelectionState();
  setStatus(`正在写入 ${targets.length} 位预收藏达人到飞书...`);
  try {
    const rows = targets.map(favoriteToFeishuRow);
    const result = await chrome.runtime.sendMessage({ type: "SYNC_FEISHU_DIRECT", rows, options });
    if (!result?.ok) throw new Error(result?.message || "写入飞书失败");
    const now = new Date().toISOString();
    const targetIds = new Set(targets.map((item) => item.userId));
    await saveFavorites(favorites.map((item) => targetIds.has(item.userId)
      ? { ...item, status: "已写入飞书", updatedAt: now }
      : item
    ));
    const parts = [];
    if (result.appendedCount !== undefined) parts.push(`新增 ${result.appendedCount}`);
    if (result.updatedCount !== undefined) parts.push(`更新 ${result.updatedCount}`);
    if (result.skippedCount !== undefined) parts.push(`跳过 ${result.skippedCount}`);
    setStatus(`写入完成：${parts.length ? parts.join("，") : `处理 ${targets.length}`}。`);
  } finally {
    writing = false;
    updateSelectionState();
  }
}

favoriteList.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="remove"]');
  if (!button) return;
  const card = button.closest(".favorite-card");
  const userId = card?.dataset?.userId || "";
  if (!userId) return;
  removeFavorite(userId).catch((error) => setStatus(error.message, true));
});

favoriteList.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".favorite-select");
  if (!checkbox) return;
  const userId = checkbox.closest(".favorite-card")?.dataset?.userId || "";
  if (!userId) return;
  if (checkbox.checked) selectedUserIds.add(userId);
  else selectedUserIds.delete(userId);
  updateSelectionState();
});

selectAll.addEventListener("change", () => {
  const visibleIds = filteredFavorites().map((item) => item.userId);
  if (selectAll.checked) {
    selectedUserIds = new Set([...Array.from(selectedUserIds), ...visibleIds]);
  } else {
    const visibleSet = new Set(visibleIds);
    selectedUserIds = new Set(Array.from(selectedUserIds).filter((userId) => !visibleSet.has(userId)));
  }
  renderFavorites();
});

searchInput.addEventListener("input", renderFavorites);
statusFilter.addEventListener("change", renderFavorites);

categoryFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category || "";
  renderFavorites();
});

writeFeishuBtn.addEventListener("click", () => syncSelectedToFeishu().catch((error) => {
  writing = false;
  updateSelectionState();
  setStatus(error.message, true);
}));

refreshBtn.addEventListener("click", () => loadFavorites().catch((error) => setStatus(error.message, true)));
clearBtn.addEventListener("click", () => clearFavorites().catch((error) => setStatus(error.message, true)));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  favorites = normalizeFavorites(changes[STORAGE_KEY].newValue);
  renderFavorites();
});

loadFavorites().catch((error) => setStatus(error.message, true));
