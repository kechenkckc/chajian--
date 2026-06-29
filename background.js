const FEISHU_BASE = "https://open.feishu.cn/open-apis";
const DEFAULT_SHEET_RANGE = "A1:ZZ1";
const DETAIL_FIELDS = [
  "详情补采状态",
  "详情补采时间",
  "详情完整度",
  "详情API捕获摘要",
  "个人简介",
  "博主优势",
  "粉丝画像截图",
  "笔记数据截图",
  "粉丝画像文本",
  "笔记数据文本",
  "女性粉丝占比",
  "男性粉丝占比",
  "18-24粉丝占比",
  "25-34粉丝占比",
  "35-44粉丝占比",
  "44岁以上粉丝占比",
  "35岁以上粉丝占比",
  "活跃粉丝占比",
  "阅读粉丝占比",
  "互动粉丝占比",
  "下单粉丝占比",
  "粉丝增长率",
  "粉丝性别分布",
  "粉丝年龄分布",
  "粉丝地域分布",
  "用户设备分布",
  "用户兴趣",
  "近7天活跃天数",
  "近期笔记JSON",
  "详情原始JSON",
  "详情补采备注"
];

let tokenCache = {
  appId: "",
  token: "",
  expiresAt: 0
};

let detailStopRequested = false;
let detailCaptureLock = Promise.resolve();
const DETAIL_BACKFILL_CONCURRENCY = 1;
const DETAIL_REQUEST_DELAY_MIN_MS = 1000;
const DETAIL_REQUEST_DELAY_MAX_MS = 3000;
const DETAIL_RATE_LIMIT_COOLDOWN_MS = 3 * 60 * 1000;
const DETAIL_RATE_LIMIT_MAX_RETRIES = 3;
const DETAIL_HEADLESS_MODE = true;
const DETAIL_HEADLESS_CAPTURE_SCREENSHOTS = true;
const DETAIL_NOTIFICATION_ICON =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Crect width='128' height='128' rx='24' fill='%232f6bff'/%3E%3Cpath fill='white' d='M31 36h66v12H31zm0 22h66v12H31zm0 22h42v12H31z'/%3E%3C/svg%3E";

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => null);
}

function notifyDetailBackfill(title, message, { requireInteraction = false } = {}) {
  if (!chrome.notifications?.create) return;
  chrome.notifications.create({
    type: "basic",
    iconUrl: DETAIL_NOTIFICATION_ICON,
    title,
    message,
    priority: requireInteraction ? 2 : 1,
    requireInteraction
  }).catch(() => null);
}

class FeishuApiError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = "FeishuApiError";
    this.status = detail.status || 0;
    this.payload = detail.payload || {};
    this.url = detail.url || "";
  }
}

const STANDARD_FIELDS = [
  "达人ID",
  "达人昵称",
  "达人名称",
  "蒲公英链接",
  "主页链接",
  "小红书号",
  "粉丝数",
  "粉丝数w",
  "获赞与收藏",
  "平台报价",
  "图文报价",
  "视频报价",
  "笔记类型",
  "合作订单数",
  "已合作笔记数",
  "曝光中位数（日常）",
  "阅读中位数（日常）",
  "互动中位数（日常）",
  "曝光中位数（合作）",
  "阅读中位数（合作）",
  "互动中位数（合作）",
  "图文预估阅读单价",
  "图文预估互动单价",
  "视频预估阅读单价",
  "视频预估互动单价",
  "邀约48h回复率",
  "账号类型",
  "IP城市",
  "数据来源",
  "采集时间",
  ...DETAIL_FIELDS,
  "蒲公英原始JSON"
];

const FIELD_ALIASES = {
  "达人ID": ["达人ID", "博主ID", "账号ID", "creator_id", "userId", "bloggerId", "kolId"],
  "达人昵称": ["达人昵称", "达人名称", "博主昵称", "博主名称", "昵称", "nickname", "nickName", "name"],
  "达人名称": ["达人名称", "达人昵称", "博主名称", "博主昵称", "昵称", "nickname", "nickName", "name"],
  "蒲公英链接": ["蒲公英链接", "蒲公英达人链接", "达人链接", "博主链接", "蒲公英/LINK", "蒲公英link", "ID/Link", "蒲公英链接/星图链接", "pgy_url"],
  "主页链接": ["主页链接", "小红书主页", "小红书链接", "profile_url"],
  "小红书号": ["小红书号", "小红书ID", "redId", "xiaohongshu_id"],
  "粉丝数": ["粉丝数", "粉丝量", "followers_count", "fansNum", "fansCount", "fans_count", "followerCount", "followersCount"],
  "粉丝数w": ["粉丝数w", "粉丝量（w）", "followers_w"],
  "获赞与收藏": ["获赞与收藏", "赞藏数", "赞藏量", "liked_collected_count", "likeCollectCountInfo", "likedCollectedCount", "likeCollectCount"],
  "平台报价": ["平台报价", "报价", "合作报价", "图文报价", "quote_price", "picturePrice", "quotePrice", "imageQuotePrice", "picPrice", "price"],
  "图文报价": ["图文报价", "图文笔记一口价", "图文笔记报价", "quote_price", "picturePrice", "quotePrice", "imageQuotePrice", "picPrice"],
  "视频报价": ["视频报价", "视频笔记一口价", "video_quote_price", "videoPrice"],
  "笔记类型": ["笔记类型", "内容形式", "note_type", "noteType", "contentType"],
  "合作订单数": ["合作订单数", "已合作订单数", "商单数", "商业笔记数", "cooperation_order_count", "progressOrderCnt", "cooperationOrderCnt", "coopOrderCnt", "orderCnt", "orderCount", "completedOrderCnt", "finishOrderCnt"],
  "已合作笔记数": ["已合作笔记数", "已合作笔记", "合作笔记数", "商业笔记数", "cooperation_note_count", "businessNoteCount", "cooperatedNoteCnt", "cooperationNoteCnt", "businessNoteCnt", "bizNoteCnt", "noteCooperateCnt", "progressNoteCnt", "finishedNoteCnt", "coopNoteNum30d", "progressOrderCnt"],
  "曝光中位数（日常）": ["曝光中位数（日常）", "日常曝光中位数", "预估曝光量", "达人历史平均曝光量/阅读量/互动总量", "daily_exposure_median", "accumCommonImpMedinNum30d", "impMedian", "mAccumImpNum", "exposureMedian"],
  "阅读中位数（日常）": ["阅读中位数（日常）", "日常阅读中位数", "平均阅读量", "达人历史平均阅读量", "达人历史/平均阅读量", "达人历史 平均阅读量", "平均播放量/阅读量", "达人历史平均曝光量/阅读量/互动总量", "daily_read_median", "clickMidNum", "readMedian", "readMedianNum"],
  "互动中位数（日常）": ["互动中位数（日常）", "日常互动中位数", "预估互动", "平均互动量", "达人历史平均曝光量/阅读量/互动总量", "daily_interaction_median", "mEngagementNum", "mengagementNum", "interactionMedian"],
  "曝光中位数（合作）": ["曝光中位数（合作）", "合作曝光中位数", "cooperation_exposure_median", "accumCoopImpMedinNum30d"],
  "阅读中位数（合作）": ["阅读中位数（合作）", "合作阅读中位数", "cooperation_read_median", "readMidCoop30"],
  "互动中位数（合作）": ["互动中位数（合作）", "合作互动中位数", "cooperation_interaction_median", "interMidCoop30"],
  "图文预估阅读单价": ["图文预估阅读单价", "图文笔记阅读单价", "image_read_unit_price", "pictureReadCost", "pictureReadUnitPrice", "imageReadUnitPrice"],
  "图文预估互动单价": ["图文预估互动单价", "图文笔记互动单价", "image_interaction_unit_price", "estimatePictureEngageCost", "pictureInteractionUnitPrice", "imageInteractionUnitPrice"],
  "视频预估阅读单价": ["视频预估阅读单价", "视频笔记阅读单价", "video_read_unit_price", "videoReadCost", "videoReadCostV2", "videoReadUnitPrice"],
  "视频预估互动单价": ["视频预估互动单价", "视频笔记互动单价", "video_interaction_unit_price", "estimateVideoEngageCost", "videoInteractionUnitPrice"],
  "邀约48h回复率": ["邀约48h回复率", "邀约48小时回复率", "回复率", "reply_rate_48h", "inviteReply48hNumRatio", "responseRate", "replyRate48h"],
  "账号类型": ["账号类型", "达人类型", "博主类目", "creator_type", "categoryName", "category"],
  "IP城市": ["IP城市", "城市", "地域", "ip_city", "location", "city"],
  "数据来源": ["数据来源", "source"],
  "采集时间": ["采集时间", "collected_at"],
  "详情补采状态": ["详情补采状态", "detail_status"],
  "详情补采时间": ["详情补采时间", "detail_collected_at"],
  "详情完整度": ["详情完整度", "detail_completeness", "information_completeness"],
  "详情API捕获摘要": ["详情API捕获摘要", "detail_api_capture_summary"],
  "个人简介": ["个人简介", "personal_intro", "profile_intro"],
  "博主优势": ["博主优势", "blogger_advantage"],
  "粉丝画像截图": ["粉丝画像截图", "粉丝画像", "粉丝画像图片", "粉丝画像图", "fans_portrait_image"],
  "笔记数据截图": ["笔记数据截图", "商单案例截图", "阅读量", "read_count_image", "note_data_overview_image"],
  "粉丝画像文本": ["粉丝画像文本", "fans_portrait_text"],
  "笔记数据文本": ["笔记数据文本", "note_data_text"],
  "女性粉丝占比": ["女性粉丝占比", "female_fans_ratio"],
  "男性粉丝占比": ["男性粉丝占比", "male_fans_ratio"],
  "18-24粉丝占比": ["18-24粉丝占比", "fans_18_24_ratio"],
  "25-34粉丝占比": ["25-34粉丝占比", "fans_25_34_ratio"],
  "35-44粉丝占比": ["35-44粉丝占比", "fans_35_44_ratio"],
  "44岁以上粉丝占比": ["44岁以上粉丝占比", "fans_44_plus_ratio"],
  "35岁以上粉丝占比": ["35岁以上粉丝占比", "fans_35_plus_ratio"],
  "活跃粉丝占比": ["活跃粉丝占比", "active_fans_ratio"],
  "阅读粉丝占比": ["阅读粉丝占比", "read_fans_ratio"],
  "互动粉丝占比": ["互动粉丝占比", "interaction_fans_ratio"],
  "下单粉丝占比": ["下单粉丝占比", "order_fans_ratio"],
  "粉丝增长率": ["粉丝增长率", "fans_growth_ratio"],
  "粉丝性别分布": ["粉丝性别分布", "audience_gender_distribution"],
  "粉丝年龄分布": ["粉丝年龄分布", "audience_age_distribution"],
  "粉丝地域分布": ["粉丝地域分布", "audience_region_distribution"],
  "用户设备分布": ["用户设备分布", "audience_device_distribution"],
  "用户兴趣": ["用户兴趣", "topic_point"],
  "近7天活跃天数": ["近7天活跃天数", "active_days_7d"],
  "近期笔记JSON": ["近期笔记JSON", "recent_notes_json"],
  "详情原始JSON": ["详情原始JSON", "detail_raw_json"],
  "详情补采备注": ["详情补采备注", "备注", "补采备注", "详情备注", "detail_note"],
  "蒲公英原始JSON": ["蒲公英原始JSON", "raw_payload"]
};

function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => cellText(item)).filter(Boolean).join("");
  if (typeof value === "object") {
    if ((value.type && String(value.type).includes("image")) || value.fileToken) return jsonText(value);
    if (value.text !== undefined && value.text !== null && value.text !== "") return String(value.text);
    if (value.link !== undefined && value.link !== null && value.link !== "") return String(value.link);
    if (value.value !== undefined && value.value !== null) return cellText(value.value);
    try {
      return JSON.stringify(value);
    } catch (error) {
      return "";
    }
  }
  return String(value || "");
}

function normalizeKey(value) {
  return cellText(value)
    .trim()
    .toLowerCase()
    .replace(/[()\[\]{}_\-\s/\\.:：，,。"'“”‘’]/g, "")
    .replace(/（/g, "")
    .replace(/）/g, "");
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

function fallbackFollowersValue(row) {
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row;
  return deepFindByKeyPattern(raw, (key) => {
    const normalized = key.toLowerCase();
    if (!normalized.includes("fans") && !normalized.includes("follower")) return false;
    return !/(rate|ratio|percent|percentile|lv|level|growth|active|engage|age|gender)/i.test(normalized);
  });
}

function fallbackLikedCollectedValue(row) {
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row;
  return deepFindByKeyPattern(raw, (key) => {
    const normalized = key.toLowerCase();
    return /(like|liked|collect|favorite|praise|赞|藏|收藏|获赞)/i.test(normalized) &&
      /(count|cnt|num|total|info|数|量)/i.test(normalized) &&
      !/(rate|ratio|percent|unit|price|cost|state|status|iscollect|inCart)/i.test(normalized);
  });
}

function fallbackNoteTypeValue(row) {
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row;
  const noteTypes = Array.isArray(raw?.noteList)
    ? Array.from(new Set(raw.noteList.map((note) => Number(note?.noteType)).filter(Boolean)))
    : [];
  if (noteTypes.length) {
    const labels = noteTypes.map((type) => (type === 1 ? "图文" : type === 2 ? "视频" : `类型${type}`));
    return labels.join("/");
  }
  const available = [];
  if (Number(raw?.pictureState) === 1 || Number(raw?.picturePrice) > 0) available.push("图文");
  if (Number(raw?.videoState) === 1 || Number(raw?.videoPrice) > 0) available.push("视频");
  if (available.length) return available.join("/");
  return deepFindByKeyPattern(raw, (key) => {
    const normalized = key.toLowerCase();
    return /(note.*type|content.*type|media.*type|笔记类型|内容形式)/i.test(normalized);
  });
}

function fallbackCooperationOrderValue(row) {
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row;
  return deepFindByKeyPattern(raw, (key) => {
    const normalized = key.toLowerCase();
    return /(coop|cooperation|order|finish|complete|合作|订单|商单)/i.test(normalized) &&
      /(order|cnt|count|num|total|订单|数|量)/i.test(normalized) &&
      !/(rate|ratio|percent|price|cost|unit|note|笔记|state|status|type|auth)/i.test(normalized);
  });
}

function fallbackCooperationNoteValue(row) {
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row;
  return deepFindByKeyPattern(raw, (key) => {
    const normalized = key.toLowerCase();
    return /(note|笔记)/i.test(normalized) &&
      /(coop|cooperation|business|finish|complete|合作|商业|商单|已)/i.test(normalized) &&
      !/(rate|ratio|percent|price|cost|unit|order|订单)/i.test(normalized);
  });
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return value;
  const text = String(value).trim().replace(/,/g, "").replace(/，/g, "");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return value;
  let number = Number(match[0]);
  if (!Number.isFinite(number)) return value;
  if (/[万wW]/.test(text)) number *= 10000;
  return Number.isInteger(number) ? number : number;
}

function valueByAliases(row, targetField) {
  const aliases = FIELD_ALIASES[targetField] || [targetField];
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && row[alias] !== "") return row[alias];
  }
  const byNorm = {};
  for (const [key, value] of Object.entries(row || {})) byNorm[normalizeKey(key)] = value;
  for (const alias of aliases) {
    const value = byNorm[normalizeKey(alias)];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row;
  return nestedValue(raw, aliases);
}

function detailUrl(userId) {
  return userId ? `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${userId}` : "";
}

function profileUrl(userId) {
  return userId ? `https://www.xiaohongshu.com/user/profile/${userId}` : "";
}

function normalizeExportRow(row) {
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row;
  const userId = valueByAliases(row, "达人ID") || nestedValue(raw, ["userId", "user_id", "bloggerId", "blogger_id", "kolId", "kol_id"]);
  const nickname = valueByAliases(row, "达人昵称") || nestedValue(raw, ["name", "nickName", "nickname"]);
  const followers = valueByAliases(row, "粉丝数") || fallbackFollowersValue(row);
  const followersNumber = numericValue(followers);
  const output = {
    "达人ID": String(row?.creator_id || (userId ? `pgy-api:${userId}` : "")),
    "达人昵称": nickname || "",
    "达人名称": valueByAliases(row, "达人名称") || nickname || "",
    "蒲公英链接": valueByAliases(row, "蒲公英链接") || row?.pgy_url || detailUrl(userId),
    "主页链接": valueByAliases(row, "主页链接") || row?.profile_url || profileUrl(userId),
    "小红书号": valueByAliases(row, "小红书号"),
    "粉丝数": followersNumber,
    "粉丝数w": valueByAliases(row, "粉丝数w") || (Number(followersNumber) ? Math.round((Number(followersNumber) / 10000) * 10000) / 10000 : ""),
    "获赞与收藏": numericValue(valueByAliases(row, "获赞与收藏") || fallbackLikedCollectedValue(row)),
    "平台报价": numericValue(valueByAliases(row, "平台报价")),
    "图文报价": numericValue(valueByAliases(row, "图文报价")),
    "视频报价": numericValue(valueByAliases(row, "视频报价")),
    "笔记类型": valueByAliases(row, "笔记类型") || fallbackNoteTypeValue(row),
    "合作订单数": numericValue(valueByAliases(row, "合作订单数") || fallbackCooperationOrderValue(row)),
    "已合作笔记数": numericValue(valueByAliases(row, "已合作笔记数") || fallbackCooperationNoteValue(row)),
    "曝光中位数（日常）": numericValue(valueByAliases(row, "曝光中位数（日常）")),
    "阅读中位数（日常）": numericValue(valueByAliases(row, "阅读中位数（日常）")),
    "互动中位数（日常）": numericValue(valueByAliases(row, "互动中位数（日常）")),
    "曝光中位数（合作）": numericValue(valueByAliases(row, "曝光中位数（合作）")),
    "阅读中位数（合作）": numericValue(valueByAliases(row, "阅读中位数（合作）")),
    "互动中位数（合作）": numericValue(valueByAliases(row, "互动中位数（合作）")),
    "图文预估阅读单价": numericValue(valueByAliases(row, "图文预估阅读单价")),
    "图文预估互动单价": numericValue(valueByAliases(row, "图文预估互动单价")),
    "视频预估阅读单价": numericValue(valueByAliases(row, "视频预估阅读单价")),
    "视频预估互动单价": numericValue(valueByAliases(row, "视频预估互动单价")),
    "邀约48h回复率": valueByAliases(row, "邀约48h回复率"),
    "账号类型": valueByAliases(row, "账号类型"),
    "IP城市": valueByAliases(row, "IP城市"),
    "数据来源": valueByAliases(row, "数据来源") || "pgy_browser_extension",
    "采集时间": valueByAliases(row, "采集时间") || new Date().toISOString().slice(0, 19).replace("T", " "),
    "蒲公英原始JSON": typeof raw === "object" ? JSON.stringify(raw) : String(raw || "")
  };
  return { ...row, ...output };
}

function rowsToCsv(rows) {
  const normalized = rows.map(normalizeExportRow);
  const fields = [
    ...STANDARD_FIELDS,
    ...Array.from(new Set(normalized.flatMap((row) => Object.keys(row || {}))))
      .filter((key) => !STANDARD_FIELDS.includes(key) && key !== "raw_payload")
      .sort()
  ];
  const lines = [fields.map(escapeCsvCell).join(",")];
  for (const row of normalized) lines.push(fields.map((field) => escapeCsvCell(row?.[field])).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

function columnName(index) {
  let name = "";
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function columnIndex(name) {
  const letters = String(name || "").trim().toUpperCase();
  let result = 0;
  for (const char of letters) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) return 0;
    result = result * 26 + code - 64;
  }
  return result;
}

function parseA1Cell(cell) {
  const match = String(cell || "").match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return { column: columnIndex(match[1]), row: Number(match[2]) };
}

function dataUrlBase64(dataUrl) {
  return String(dataUrl || "").split(",").pop() || "";
}

function base64ToBytes(base64) {
  const binary = atob(String(base64 || ""));
  return Array.from(binary, (char) => char.charCodeAt(0));
}

function dataUrlBytes(dataUrl) {
  return base64ToBytes(dataUrlBase64(dataUrl));
}

function nowLocalText() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function extractPgyUserId(row) {
  const direct = valueByAliases(row, "达人ID");
  const url = valueByAliases(row, "蒲公英链接") || row?.pgy_url || "";
  const candidates = [direct, url, row?.creator_id, row?.userId, row?.bloggerId, row?.kolId];
  for (const candidate of candidates) {
    const text = cellText(candidate);
    const match = text.match(/(?:blogger-detail\/|pgy-api:)?([A-Za-z0-9_-]{6,})/);
    if (match) return match[1];
  }
  return "";
}

function detailUrlFromRow(row) {
  const existing = valueByAliases(row, "蒲公英链接") || row?.pgy_url || "";
  const existingText = cellText(existing);
  if (existingText.includes("pgy.xiaohongshu.com")) return existingText;
  const userId = extractPgyUserId(row);
  return detailUrl(userId);
}

function rowMatchKeys(row) {
  const normalized = normalizeExportRow(row);
  return [
    extractPgyUserId(normalized),
    valueByAliases(normalized, "达人ID"),
    valueByAliases(normalized, "蒲公英链接"),
    valueByAliases(normalized, "主页链接"),
    valueByAliases(normalized, "小红书号"),
    valueByAliases(normalized, "达人昵称")
  ]
    .map((value) => normalizeKey(value))
    .filter(Boolean);
}

function parseFeishuUrl(url) {
  const parsed = new URL(String(url || "").trim());
  const parts = parsed.pathname.split("/").filter(Boolean);
  const query = parsed.searchParams;
  if (!parsed.hostname.endsWith("feishu.cn") && !parsed.hostname.endsWith("larksuite.com")) {
    throw new Error("请输入飞书或 Lark 表格链接。");
  }
  if (parts.includes("sheets") || parts.includes("sheet")) {
    const marker = parts.includes("sheets") ? "sheets" : "sheet";
    const token = parts[parts.indexOf(marker) + 1];
    return { resourceType: "sheet", token, sheetId: query.get("sheet") || query.get("sheet_id") || "" };
  }
  if (parts.includes("base")) {
    const token = parts[parts.indexOf("base") + 1];
    return { resourceType: "bitable", token, tableId: query.get("table") || query.get("table_id") || "" };
  }
  if (parts.includes("wiki")) {
    const token = parts[parts.indexOf("wiki") + 1];
    return {
      resourceType: "wiki",
      token,
      sheetId: query.get("sheet") || query.get("sheet_id") || "",
      tableId: query.get("table") || query.get("table_id") || ""
    };
  }
  throw new Error("暂不支持该飞书链接格式。");
}

function collectFeishuLinks(value, links = new Set()) {
  if (!value) return links;
  if (typeof value === "string") {
    const matches = value.match(/https?:\/\/[^\s"'<>，。；]+/g) || [];
    for (const link of matches) links.add(link);
    return links;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFeishuLinks(item, links);
    return links;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/url|link|href|apply|auth|permission|scope/i.test(key)) collectFeishuLinks(item, links);
      else if (typeof item === "string") collectFeishuLinks(item, links);
      else if (typeof item === "object") collectFeishuLinks(item, links);
    }
  }
  return links;
}

function messageWithFeishuLinks(error) {
  const message = error?.message || String(error);
  const links = Array.from(new Set([...(error?.links || []), ...collectFeishuLinks(error?.payload || {})]));
  return links.length ? `${message}\n开通链接：${links.join(" ")}` : message;
}

function feishuPayloadMessage(payload, fallback) {
  return payload?.msg || payload?.message || payload?.error?.message || fallback;
}

async function feishuRequest(path, { token, method = "GET", body = null, params = null } = {}) {
  const url = new URL(`${FEISHU_BASE}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {})
    },
    body: body ? JSON.stringify(body) : null
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload, url: url.toString() };
}

async function feishuFetch(path, { token, method = "GET", body = null, params = null } = {}) {
  const { response, payload, url } = await feishuRequest(path, { token, method, body, params });
  if (!response.ok || payload.code !== 0) {
    throw new FeishuApiError(feishuPayloadMessage(payload, `飞书接口失败：HTTP ${response.status}`), {
      status: response.status,
      payload,
      url
    });
  }
  return payload.data || {};
}

async function tenantToken(appId, appSecret) {
  if (tokenCache.appId === appId && tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const response = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== 0) {
    throw new FeishuApiError(feishuPayloadMessage(payload, `飞书鉴权失败：HTTP ${response.status}`), {
      status: response.status,
      payload,
      url: `${FEISHU_BASE}/auth/v3/tenant_access_token/internal`
    });
  }
  const token = payload.tenant_access_token;
  if (!token) throw new Error("飞书鉴权没有返回 tenant_access_token。");
  tokenCache = { appId, token, expiresAt: Date.now() + 90 * 60 * 1000 };
  return token;
}

async function resolveWikiTarget(target, token) {
  if (target.resourceType !== "wiki") return target;
  const data = await feishuFetch("/wiki/v2/spaces/get_node", { token, params: { token: target.token } });
  const node = data.node || data;
  const objType = node.obj_type;
  const objToken = node.obj_token;
  if (objType === "sheet" || objType === "spreadsheet") {
    return { resourceType: "sheet", token: objToken, sheetId: target.sheetId };
  }
  if (objType === "bitable" || objType === "base") {
    return { resourceType: "bitable", token: objToken, tableId: target.tableId };
  }
  throw new Error(`暂不支持该 Wiki 对象：${objType || "unknown"}`);
}

async function listSheets(token, spreadsheetToken) {
  const data = await feishuFetch(`/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/query`, { token });
  return data.sheets || [];
}

async function chooseSheet(token, spreadsheetToken, preferredSheetId) {
  const sheets = await listSheets(token, spreadsheetToken);
  if (preferredSheetId) {
    const selected = sheets.find((sheet) => [sheet.sheet_id, sheet.id].includes(preferredSheetId));
    if (selected) return selected.sheet_id || selected.id;
    throw new Error("链接或配置里的飞书子表 ID 不存在。");
  }
  if (sheets.length === 1) return sheets[0].sheet_id || sheets[0].id;
  throw new Error("该飞书文件包含多个子表，请填写子表 ID。");
}

async function readSheetFields(token, spreadsheetToken, sheetId) {
  const data = await feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}!${DEFAULT_SHEET_RANGE}`, { token });
  const values = data.valueRange?.values || [];
  return (values[0] || []).map((field, index) => ({ fieldName: String(field || "").trim(), columnIndex: index })).filter((field) => field.fieldName);
}

async function readSheetValues(token, spreadsheetToken, sheetId, range = "A1:ZZ5000") {
  const data = await feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}!${range}`, { token });
  return data.valueRange?.values || [];
}

async function readSheetValuesFlexible(token, spreadsheetToken, sheetId) {
  const ranges = ["A1:ZZ20000", "A1:ZZ5000", "A1:AZ1000", "A1:AZ500", "A1:AB500"];
  let lastError = null;
  for (const range of ranges) {
    try {
      return await readSheetValues(token, spreadsheetToken, sheetId, range);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || "").toLowerCase();
      if (!message.includes("data exceeded") && !message.includes("too large") && !message.includes("10mb")) throw error;
    }
  }
  throw lastError || new Error("读取飞书表格失败。");
}

function exportFieldsForRows(rows) {
  const sourceFields = Array.from(new Set(rows.flatMap((row) => Object.keys(normalizeExportRow(row)))));
  return [...STANDARD_FIELDS, ...sourceFields.filter((field) => !STANDARD_FIELDS.includes(field) && field !== "raw_payload")];
}

async function writeSheetHeader(token, spreadsheetToken, sheetId, rows) {
  const fields = exportFieldsForRows(rows);
  const endColumn = columnName(fields.length);
  await feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values`, {
    token,
    method: "PUT",
    body: { valueRange: { range: `${sheetId}!A1:${endColumn}1`, values: [fields] } }
  });
  return fields.map((fieldName, index) => ({ fieldName, columnIndex: index }));
}

async function ensureSheetFields(token, spreadsheetToken, sheetId, rows, requiredFields = []) {
  let fields = await readSheetFields(token, spreadsheetToken, sheetId);
  if (!fields.length) fields = await writeSheetHeader(token, spreadsheetToken, sheetId, rows);
  const existingNames = new Set(fields.map((field) => field.fieldName));
  const nextFields = fields.map((field) => field.fieldName);
  for (const field of requiredFields) {
    if (!existingNames.has(field)) {
      existingNames.add(field);
      nextFields.push(field);
    }
  }
  if (nextFields.length !== fields.length) {
    const endColumn = columnName(nextFields.length);
    await feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values`, {
      token,
      method: "PUT",
      body: { valueRange: { range: `${sheetId}!A1:${endColumn}1`, values: [nextFields] } }
    });
    fields = nextFields.map((fieldName, index) => ({ fieldName, columnIndex: index }));
  }
  return fields;
}

function rowValueForField(row, fieldName) {
  const normalized = normalizeExportRow(row);
  const exact = normalized[fieldName];
  if (exact !== undefined && exact !== null && exact !== "") return exact;
  const aliases = FIELD_ALIASES[fieldName] || [fieldName];
  const value = valueByAliases(normalized, fieldName);
  if (value !== undefined && value !== null && value !== "") return value;
  for (const alias of aliases) {
    if (normalized[alias] !== undefined && normalized[alias] !== null) return normalized[alias];
  }
  return "";
}

async function writeSheetCells(token, spreadsheetToken, sheetId, fields, rowNumber, valuesByField) {
  const writes = Object.entries(valuesByField || {}).filter(([fieldName]) => fields.some((field) => field.fieldName === fieldName));
  for (const [fieldName, value] of writes) {
    const field = fields.find((item) => item.fieldName === fieldName);
    const column = columnName(field.columnIndex + 1);
    await feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values`, {
      token,
      method: "PUT",
      body: { valueRange: { range: `${sheetId}!${column}${rowNumber}:${column}${rowNumber}`, values: [[value ?? ""]] } }
    });
  }
}

async function writeSheetImage(token, spreadsheetToken, sheetId, fields, rowNumber, fieldName, dataUrl, name) {
  const field = fields.find((item) => item.fieldName === fieldName);
  if (!field || !dataUrl) return null;
  const column = columnName(field.columnIndex + 1);
  return feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values_image`, {
      token,
      method: "POST",
      body: {
        range: `${sheetId}!${column}${rowNumber}:${column}${rowNumber}`,
        image: dataUrlBytes(dataUrl),
        name: name || `pgy-fans-${rowNumber}.png`
      }
    });
}

async function writeSheetCellByColumn(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, value) {
  const column = columnName(columnIndexValue + 1);
  return feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values`, {
    token,
    method: "PUT",
    body: { valueRange: { range: `${sheetId}!${column}${rowNumber}:${column}${rowNumber}`, values: [[value ?? ""]] } }
  });
}

function normalizeSheetWriteValue(value, fieldName = "") {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  let text = "";
  if (typeof value === "string") {
    text = value;
  } else if (Array.isArray(value)) {
    text = value.map((item) => normalizeSheetWriteValue(item, fieldName)).filter((item) => item !== "").join("；");
  } else if (typeof value === "object") {
    text = cellText(value) || jsonText(value);
  } else {
    text = String(value);
  }
  text = text.replace(/\s+/g, " ").trim();
  if (/内容形式|笔记类型|合作形式/.test(fieldName)) {
    text = text
      .replace(/图文笔记/g, "图文")
      .replace(/视频笔记/g, "视频")
      .replace(/图文内容/g, "图文")
      .replace(/视频内容/g, "视频");
  }
  return text;
}

async function writeSheetCellByColumnBestEffort(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, value, fieldName = "") {
  const normalizedValue = normalizeSheetWriteValue(value, fieldName);
  try {
    await writeSheetCellByColumn(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, normalizedValue);
    return { ok: true };
  } catch (error) {
    const originalMessage = shortErrorMessage(error);
    const fallbackValue = cellText(value) || jsonText(value);
    if (fallbackValue && fallbackValue !== normalizedValue) {
      try {
        await writeSheetCellByColumn(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, fallbackValue);
        return { ok: true, retried: true };
      } catch (retryError) {
        return { ok: false, message: `${fieldName || `第${columnIndexValue + 1}列`}未写入：${originalMessage}；重试失败：${shortErrorMessage(retryError)}` };
      }
    }
    return { ok: false, message: `${fieldName || `第${columnIndexValue + 1}列`}未写入：${shortErrorMessage(error)}` };
  }
}

async function writeSheetImageByColumn(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, dataUrl, name) {
  if (!dataUrl) return null;
  const column = columnName(columnIndexValue + 1);
  return feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values_image`, {
    token,
    method: "POST",
    body: {
      range: `${sheetId}!${column}${rowNumber}:${column}${rowNumber}`,
      image: dataUrlBytes(dataUrl),
      name: name || `pgy-detail-${rowNumber}.png`
    }
  });
}

function shortErrorMessage(error) {
  return String(error?.message || error || "未知错误").replace(/\s+/g, " ").trim().slice(0, 300);
}

async function writeSheetImageByColumnBestEffort(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, dataUrl, name) {
  if (!dataUrl) return { ok: false, skipped: true, message: "没有截图数据" };
  try {
    await writeSheetImageByColumn(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, dataUrl, name);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `图片写入失败：${shortErrorMessage(error)}` };
  }
}

function sheetRowsToObjects(values) {
  const headers = (values[0] || []).map((value) => cellText(value).trim());
  return values.slice(1).map((line, index) => {
    const row = {};
    headers.forEach((header, column) => {
      if (header) row[header] = cellText(line[column]);
    });
    return { rowNumber: index + 2, row };
  });
}

function nonEmptyCell(value) {
  return cellText(value).trim() !== "";
}

function cellLooksLikeImage(value) {
  if (!value) return false;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return false;
    if (text.startsWith("data:image/")) return true;
    try {
      return cellLooksLikeImage(JSON.parse(text));
    } catch {
      return /"type"\s*:\s*"[^"]*image|"fileToken"\s*:|"file_token"\s*:|"image_key"\s*:/i.test(text);
    }
  }
  if (Array.isArray(value)) return value.some(cellLooksLikeImage);
  if (typeof value === "object") {
    const type = String(value.type || value.cell_type || value.valueType || "").toLowerCase();
    if (type.includes("image")) return true;
    if (value.fileToken || value.file_token || value.image_key || value.imageKey || value.img_key) return true;
    return Object.values(value).some((item) => item && typeof item === "object" && cellLooksLikeImage(item));
  }
  return false;
}

function nonEmptyDataRowCount(values) {
  return (values || []).slice(1).filter((row) => (row || []).some(nonEmptyCell)).length;
}

function effectiveSheetWidth(values) {
  let width = 0;
  for (const row of values || []) {
    for (let index = 0; index < row.length; index += 1) {
      if (nonEmptyCell(row[index])) width = Math.max(width, index + 1);
    }
  }
  return width;
}

function canonicalFieldForHeader(header) {
  const normalized = normalizeKey(header);
  if (!normalized) return "";
  for (const fieldName of [...STANDARD_FIELDS, ...DETAIL_FIELDS]) {
    if (normalizeKey(fieldName) === normalized) return fieldName;
  }
  for (const [fieldName, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases || []) {
      const aliasKey = normalizeKey(alias);
      if (!aliasKey) continue;
      if (aliasKey === normalized || normalized.includes(aliasKey) || aliasKey.includes(normalized)) return fieldName;
    }
  }
  return "";
}

function buildSheetShape(values, headerRows = 1) {
  const width = effectiveSheetWidth(values);
  const columns = [];
  let mappedCount = 0;
  for (let index = 0; index < width; index += 1) {
    const parts = [];
    for (let rowIndex = 0; rowIndex < headerRows; rowIndex += 1) {
      const value = values[rowIndex]?.[index];
      if (nonEmptyCell(value)) parts.push(cellText(value).trim());
    }
    const header = parts.join(" / ") || `Col${index + 1}`;
    const canonicalField = canonicalFieldForHeader(header);
    if (canonicalField) mappedCount += 1;
    columns.push({
      fieldName: header,
      canonicalField,
      columnIndex: index
    });
  }
  return { headerRows, dataStartRow: headerRows + 1, columns, mappedCount };
}

function detectSheetShape(values) {
  const oneRow = buildSheetShape(values, 1);
  const twoRows = values.length > 1 ? buildSheetShape(values, 2) : oneRow;
  const firstRowNonEmpty = (values[0] || []).filter(nonEmptyCell).length;
  const secondRowNonEmpty = (values[1] || []).filter(nonEmptyCell).length;
  if (
    values.length > 1 &&
    twoRows.mappedCount > oneRow.mappedCount &&
    (oneRow.mappedCount < 2 || firstRowNonEmpty < secondRowNonEmpty)
  ) {
    return twoRows;
  }
  return oneRow;
}

function rowObjectFromShape(line, columns) {
  const row = {};
  for (const column of columns) {
    if (!column.fieldName) continue;
    const value = cellText(line[column.columnIndex]);
    row[column.fieldName] = value;
    if (column.canonicalField && row[column.canonicalField] === undefined) row[column.canonicalField] = value;
  }
  return row;
}

function sheetRowsToShapeObjects(values, shape) {
  return values.slice(shape.headerRows).map((line, index) => ({
    rowNumber: shape.dataStartRow + index,
    row: rowObjectFromShape(line, shape.columns),
    line
  }));
}

function firstValidCreatorItem(items) {
  return (items || []).find((item) => {
    if (!Object.values(item.row || {}).some(nonEmptyCell)) return false;
    return Boolean(extractPgyUserId(item.row) || detailUrlFromRow(item.row));
  }) || null;
}

function columnUsesImageTemplate(column, templateItem) {
  if (!column || !templateItem) return false;
  return cellLooksLikeImage(templateItem.line?.[column.columnIndex]);
}

function readMetricValue(valuesByField) {
  const candidates = [
    "阅读中位数（日常）",
    "阅读中位数（合作）",
    "曝光中位数（日常）",
    "互动中位数（日常）"
  ];
  for (const fieldName of candidates) {
    const value = valueForCanonicalField(valuesByField, fieldName);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function canonicalBackfillValues(sourceRow, payload) {
  const captures = payload.captures || {};
  const userId = extractPgyUserId(sourceRow);
  const detailRow = {
    ...(payload.detail || {}),
    raw_payload: payload.detail?.raw_payload || {},
    pgy_url: payload.detailUrl || detailUrlFromRow(sourceRow),
    profile_url: profileUrl(userId)
  };
  const normalizedDetail = normalizeExportRow({ ...sourceRow, ...detailRow });
  const detailValues = detailValuesForSheet(payload.detail, captures, captures.audience?.found ? "已补足" : "已补足-未确认粉丝画像", payload.detailUrl || "");
  return { ...normalizedDetail, ...detailValues };
}

function valueForCanonicalField(valuesByField, canonicalField) {
  if (!canonicalField) return "";
  if (valuesByField[canonicalField] !== undefined && valuesByField[canonicalField] !== null && valuesByField[canonicalField] !== "") {
    return valuesByField[canonicalField];
  }
  const aliases = FIELD_ALIASES[canonicalField] || [];
  for (const alias of aliases) {
    if (valuesByField[alias] !== undefined && valuesByField[alias] !== null && valuesByField[alias] !== "") return valuesByField[alias];
  }
  return "";
}

function hasBlankMappedDetailCell(item, columns) {
  return columns.some((column) => {
    if (!column.canonicalField) return false;
    if (!DETAIL_FIELDS.includes(column.canonicalField) && !["达人昵称", "达人名称", "主页链接", "蒲公英链接", "小红书号", "粉丝数", "粉丝数w"].includes(column.canonicalField)) {
      return false;
    }
    return !nonEmptyCell(item.line[column.columnIndex]);
  });
}

function findSheetRowNumber(sheetRows, row) {
  const targetKeys = new Set(rowMatchKeys(row));
  if (!targetKeys.size) return 0;
  for (const item of sheetRows) {
    const keys = rowMatchKeys(item.row);
    if (keys.some((key) => targetKeys.has(key))) return item.rowNumber;
  }
  return 0;
}

async function appendSheetRows(token, spreadsheetToken, sheetId, fields, rows) {
  const ordered = fields.slice().sort((a, b) => a.columnIndex - b.columnIndex);
  const start = Math.min(...ordered.map((field) => field.columnIndex)) + 1;
  const end = Math.max(...ordered.map((field) => field.columnIndex)) + 1;
  const startColumn = columnName(start);
  const endColumn = columnName(end);
  const values = rows.map((row) => {
    const line = Array(end - start + 1).fill("");
    for (const field of ordered) {
      line[field.columnIndex + 1 - start] = rowValueForField(row, field.fieldName);
    }
    return line;
  });
  return feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values_append`, {
    token,
    method: "POST",
    body: { valueRange: { range: `${sheetId}!${startColumn}1:${endColumn}${Math.max(1, rows.length)}`, values } }
  });
}

function appendWrittenCount(result) {
  const candidates = [
    result?.updates?.updatedRows,
    result?.updates?.updated_rows,
    result?.updatedRows,
    result?.updated_rows
  ];
  const value = candidates.find((item) => typeof item === "number");
  return typeof value === "number" ? value : 0;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function listBitableTables(token, appToken) {
  const data = await feishuFetch(`/bitable/v1/apps/${appToken}/tables`, { token });
  return data.items || data.tables || data.table_list || [];
}

async function chooseBitableTable(token, appToken, preferredTableId) {
  const tables = await listBitableTables(token, appToken);
  if (preferredTableId) {
    const selected = tables.find((table) => [table.table_id, table.id].includes(preferredTableId));
    if (selected) return selected.table_id || selected.id;
    throw new Error("链接或配置里的飞书多维表格 table ID 不存在。");
  }
  const first = tables[0];
  if (first) return first.table_id || first.id;
  throw new Error("该飞书多维表格没有可写入的数据表。");
}

async function listBitableFields(token, appToken, tableId) {
  const data = await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, { token });
  return data.items || data.fields || [];
}

async function createBitableField(token, appToken, tableId, fieldName) {
  const data = await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
    token,
    method: "POST",
    body: { field_name: fieldName, type: 1 }
  });
  return data.field || data;
}

async function ensureBitableFields(token, appToken, tableId, rows) {
  return ensureBitableFieldNames(token, appToken, tableId, exportFieldsForRows(rows));
}

async function ensureBitableFieldNames(token, appToken, tableId, requiredFields) {
  const fields = await listBitableFields(token, appToken, tableId);
  const existingNames = new Set(fields.map((field) => field.field_name || field.name).filter(Boolean));
  for (const fieldName of requiredFields) {
    if (!existingNames.has(fieldName)) {
      const created = await createBitableField(token, appToken, tableId, fieldName);
      fields.push(created);
      existingNames.add(fieldName);
    }
  }
  return requiredFields;
}

function bitableFieldsForRow(row, fieldNames) {
  const values = {};
  for (const fieldName of fieldNames) {
    const value = rowValueForField(row, fieldName);
    if (value === undefined || value === null) values[fieldName] = "";
    else if (typeof value === "number" || typeof value === "boolean") values[fieldName] = value;
    else if (typeof value === "object") values[fieldName] = JSON.stringify(value);
    else values[fieldName] = String(value);
  }
  return values;
}

async function appendBitableRecords(token, appToken, tableId, fieldNames, rows) {
  let writtenCount = 0;
  const batches = chunkArray(rows, 500);
  for (const batch of batches) {
    const records = batch.map((row) => ({ fields: bitableFieldsForRow(row, fieldNames) }));
    const data = await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`, {
      token,
      method: "POST",
      body: { records }
    });
    writtenCount += (data.records || data.items || []).length || records.length;
  }
  return { writtenCount };
}

async function syncRowsToBitable({ token, parsed, rows, options }) {
  const tableId = await chooseBitableTable(token, parsed.token, options.feishuSheetId || parsed.tableId || "");
  const fieldNames = await ensureBitableFields(token, parsed.token, tableId, rows);
  const result = await appendBitableRecords(token, parsed.token, tableId, fieldNames, rows);
  if (result.writtenCount < rows.length) {
    throw new Error(`飞书多维表格实际写入记录不足：应写入 ${rows.length} 条，实际 ${result.writtenCount} 条。`);
  }
  return {
    ok: true,
    resourceType: "bitable",
    tableId,
    fieldCount: fieldNames.length,
    writtenCount: result.writtenCount,
    result
  };
}

async function readBitableRecords(token, appToken, tableId) {
  const records = [];
  let pageToken = "";
  do {
    const data = await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
      token,
      params: { page_size: 500, page_token: pageToken }
    });
    records.push(...(data.items || data.records || []));
    pageToken = data.page_token || data.pageToken || "";
  } while (pageToken);
  return records;
}

function bitableRecordToDetailItem(record) {
  const row = record.fields || {};
  return {
    recordId: record.record_id || record.id,
    row,
    line: Object.values(row || {})
  };
}

function bitableNeedsDetail(item) {
  if (!Object.values(item.row || {}).some(nonEmptyCell)) return false;
  if (!extractPgyUserId(item.row) && !detailUrlFromRow(item.row)) return false;
  return DETAIL_FIELDS.some((fieldName) => !nonEmptyCell(item.row[fieldName]));
}

function bitableDetailFields(valuesByField, captures) {
  const fields = {};
  for (const fieldName of DETAIL_FIELDS) {
    if (fieldName === "粉丝画像截图") {
      fields[fieldName] = captures.audience?.imageName || (captures.audience?.screenshot ? "已采集粉丝画像截图" : "");
      continue;
    }
    if (fieldName === "笔记数据截图") {
      fields[fieldName] = captures.overview?.imageName || (captures.overview?.screenshot ? "已采集笔记数据截图" : "");
      continue;
    }
    const value = valueForCanonicalField(valuesByField, fieldName);
    if (value !== undefined && value !== null && value !== "") fields[fieldName] = value;
  }
  return fields;
}

async function updateBitableRecord(token, appToken, tableId, recordId, fields) {
  if (!recordId || !Object.keys(fields || {}).length) return { ok: true };
  return feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
    token,
    method: "PUT",
    body: { fields }
  });
}

async function syncRowsToFeishu({ rows, options }) {
  const appId = options.feishuAppId;
  const appSecret = options.feishuAppSecret;
  const feishuUrl = options.feishuUrl;
  if (!appId || !appSecret || !feishuUrl) throw new Error("请先填写飞书 App ID、App Secret 和目标飞书表格。");
  if (!Array.isArray(rows) || !rows.length) throw new Error("没有可写入飞书的达人数据。");
  const token = await tenantToken(appId, appSecret);
  const parsed = await resolveWikiTarget(parseFeishuUrl(feishuUrl), token);
  if (parsed.resourceType === "bitable") return syncRowsToBitable({ token, parsed, rows, options });
  if (parsed.resourceType !== "sheet") throw new Error("同步达人当前仅支持飞书电子表格或多维表格。");
  const sheetId = await chooseSheet(token, parsed.token, options.feishuSheetId || parsed.sheetId || "");
  const beforeRowCount = nonEmptyDataRowCount(await readSheetValuesFlexible(token, parsed.token, sheetId));
  const fields = await ensureSheetFields(token, parsed.token, sheetId, rows, exportFieldsForRows(rows));
  const result = await appendSheetRows(token, parsed.token, sheetId, fields, rows);
  const actualWrittenCount = appendWrittenCount(result);
  if (actualWrittenCount && actualWrittenCount < rows.length) {
    throw new Error(`飞书返回的实际写入行数不足：应写入 ${rows.length} 条，实际 ${actualWrittenCount} 条。`);
  }
  const afterRowCount = nonEmptyDataRowCount(await readSheetValuesFlexible(token, parsed.token, sheetId));
  if (afterRowCount < beforeRowCount + rows.length) {
    throw new Error(`飞书写入后读回校验失败：写入前 ${beforeRowCount} 行，预期写入后至少 ${beforeRowCount + rows.length} 行，实际 ${afterRowCount} 行。请检查目标表是否为电子表格、是否选对了子表，以及权限是否为可编辑。`);
  }
  return {
    ok: true,
    resourceType: "sheet",
    sheetId,
    fieldCount: fields.length,
    writtenCount: rows.length,
    actualWrittenCount,
    beforeRowCount,
    afterRowCount,
    result
  };
}

async function resolveFeishuSheet(options, rows) {
  const appId = options.feishuAppId;
  const appSecret = options.feishuAppSecret;
  const feishuUrl = options.detailFeishuUrl;
  if (options.detailFeishuUrl && options.detailFeishuUrl === options.feishuUrl) {
    throw new Error("需补足详情的飞书表格不能和同步达人飞书表格相同。");
  }
  if (!appId || !appSecret || !feishuUrl) throw new Error("请先填写飞书 App ID、App Secret 和需补足详情的飞书表格。");
  const token = await tenantToken(appId, appSecret);
  const parsed = await resolveWikiTarget(parseFeishuUrl(feishuUrl), token);
  if (parsed.resourceType !== "sheet") throw new Error("补采详情当前支持写回飞书电子表格。");
  const sheetId = await chooseSheet(token, parsed.token, options.detailFeishuSheetId || parsed.sheetId || "");
  const fields = await ensureSheetFields(token, parsed.token, sheetId, rows, DETAIL_FIELDS);
  return { token, spreadsheetToken: parsed.token, sheetId, fields };
}

async function validateFeishuSyncTarget(options) {
  const appId = options.feishuAppId;
  const appSecret = options.feishuAppSecret;
  const feishuUrl = options.feishuUrl;
  if (!appId || !appSecret || !feishuUrl) throw new Error("请先填写飞书 App ID、App Secret 和同步达人飞书表格。");
  const token = await tenantToken(appId, appSecret);
  const parsed = await resolveWikiTarget(parseFeishuUrl(feishuUrl), token);
  if (parsed.resourceType === "bitable") {
    const tableId = await chooseBitableTable(token, parsed.token, options.feishuSheetId || parsed.tableId || "");
    await listBitableFields(token, parsed.token, tableId);
    return { ok: true, resourceType: "bitable", tableId };
  }
  if (parsed.resourceType !== "sheet") throw new Error("同步达人当前仅支持飞书电子表格或多维表格。");
  const sheetId = await chooseSheet(token, parsed.token, options.feishuSheetId || parsed.sheetId || "");
  await readSheetFields(token, parsed.token, sheetId);
  return { ok: true, resourceType: "sheet", sheetId };
}

async function validateFeishuCredentials(options) {
  const appId = options.feishuAppId;
  const appSecret = options.feishuAppSecret;
  if (!appId || !appSecret) throw new Error("请先填写飞书 App ID 和 App Secret。");
  const token = await tenantToken(appId, appSecret);
  const checks = await checkFeishuPermissions(token);
  const missing = checks.filter((check) => !check.ok);
  if (missing.length) {
    const links = Array.from(new Set(missing.flatMap((check) => check.links || [])));
    const parts = [
      `缺少飞书权限：${missing.map((check) => check.name).join("、")}。`,
      "请在飞书开放平台为应用开通对应权限后重新发布/启用应用。"
    ];
    if (links.length) parts.push(`开通链接：${links.join(" ")}`);
    const error = new Error(parts.join("\n"));
    error.permissionChecks = checks;
    error.links = links;
    throw error;
  }
  return { ok: true, checks };
}

function isMissingPermissionError(payload, message) {
  const text = `${message || ""} ${JSON.stringify(payload || {})}`.toLowerCase();
  if (
    text.includes("not found") ||
    text.includes("not exist") ||
    text.includes("invalid token") ||
    text.includes("不存在") ||
    text.includes("未找到")
  ) {
    return false;
  }
  return (
    text.includes("permission") ||
    text.includes("forbidden") ||
    text.includes("scope") ||
    text.includes("unauthorized") ||
    text.includes("access denied") ||
    text.includes("no privilege") ||
    text.includes("not have") ||
    text.includes("权限") ||
    text.includes("未开通") ||
    text.includes("无权")
  );
}

async function probeFeishuPermission(token, name, path, options = {}) {
  const { response, payload, url } = await feishuRequest(path, { token, ...options });
  const message = feishuPayloadMessage(payload, `HTTP ${response.status}`);
  const links = Array.from(collectFeishuLinks({ payload, url }));
  if (response.ok && payload.code === 0) return { name, ok: true, message, links };
  if (isMissingPermissionError(payload, message)) return { name, ok: false, message, links };
  return { name, ok: true, message, links };
}

async function checkFeishuPermissions(token) {
  const probeToken = "pgy_permission_probe";
  const image = base64ToBytes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=");
  const checks = [
    probeFeishuPermission(token, "云文档/Wiki 读取", "/wiki/v2/spaces/get_node", {
      params: { token: probeToken }
    }),
    probeFeishuPermission(token, "电子表格读取", `/sheets/v3/spreadsheets/${probeToken}/sheets/query`),
    probeFeishuPermission(token, "电子表格单元格读取", `/sheets/v2/spreadsheets/${probeToken}/values/Sheet1!A1:A1`),
    probeFeishuPermission(token, "电子表格写入", `/sheets/v2/spreadsheets/${probeToken}/values`, {
      method: "PUT",
      body: { valueRange: { range: "Sheet1!A1:A1", values: [["permission_probe"]] } }
    }),
    probeFeishuPermission(token, "电子表格追加写入", `/sheets/v2/spreadsheets/${probeToken}/values_append`, {
      method: "POST",
      body: { valueRange: { range: "Sheet1!A1:A1", values: [["permission_probe"]] } }
    }),
    probeFeishuPermission(token, "电子表格图片写入", `/sheets/v2/spreadsheets/${probeToken}/values_image`, {
      method: "POST",
      body: { range: "Sheet1!A1:A1", image, name: "permission-probe.png" }
    }),
    probeFeishuPermission(token, "多维表格读取", `/bitable/v1/apps/${probeToken}/tables`),
    probeFeishuPermission(token, "多维表格记录读取", `/bitable/v1/apps/${probeToken}/tables/${probeToken}/records/search`, {
      method: "POST",
      body: { page_size: 1 }
    }),
    probeFeishuPermission(token, "多维表格记录写入", `/bitable/v1/apps/${probeToken}/tables/${probeToken}/records`, {
      method: "POST",
      body: { fields: {} }
    })
  ];
  return Promise.all(checks);
}

async function resolveDetailSpreadsheet(options) {
  const appId = options.feishuAppId;
  const appSecret = options.feishuAppSecret;
  const feishuUrl = options.detailFeishuUrl;
  if (options.detailFeishuUrl && options.detailFeishuUrl === options.feishuUrl) {
    throw new Error("需补足详情的飞书表格不能和同步达人飞书表格相同。");
  }
  if (!appId || !appSecret || !feishuUrl) {
    throw new Error("请先填写飞书 App ID、App Secret 和需补足详情的飞书表格。");
  }
  const token = await tenantToken(appId, appSecret);
  const parsed = await resolveWikiTarget(parseFeishuUrl(feishuUrl), token);
  if (parsed.resourceType === "bitable") {
    const tables = await listBitableTables(token, parsed.token);
    return { token, resourceType: "bitable", appToken: parsed.token, parsedTableId: parsed.tableId || "", tables };
  }
  if (parsed.resourceType !== "sheet") throw new Error("补足详情当前仅支持飞书电子表格或多维表格。");
  const sheets = await listSheets(token, parsed.token);
  return { token, resourceType: "sheet", spreadsheetToken: parsed.token, parsedSheetId: parsed.sheetId || "", sheets };
}

async function validateFeishuDetailTarget(options) {
  const target = await resolveDetailSpreadsheet(options);
  if (target.resourceType === "bitable") {
    const preferredTableId = options.detailTraverseAllSheets && !options.detailFeishuSheetId ? "" : options.detailFeishuSheetId || target.parsedTableId || "";
    const tableId = await chooseBitableTable(target.token, target.appToken, preferredTableId);
    await listBitableFields(target.token, target.appToken, tableId);
    return {
      ok: true,
      resourceType: "bitable",
      tableId,
      tableCount: target.tables.length,
      tables: target.tables.map((table) => ({
        tableId: table.table_id || table.id,
        title: table.name || table.title || table.table_id || table.id
      }))
    };
  }
  const preferredSheetId = options.detailTraverseAllSheets && !options.detailFeishuSheetId ? "" : options.detailFeishuSheetId || target.parsedSheetId || "";
  const sheetCount = target.sheets.length;
  const sheets = target.sheets.map((sheet) => ({
    sheetId: sheet.sheet_id || sheet.id,
    title: sheet.title || sheet.name || sheet.sheet_id || sheet.id
  }));
  if (sheetCount > 1 && !preferredSheetId) {
    if (!options.detailTraverseAllSheets) {
      return { ok: true, requiresMultiSheetChoice: true, canTraverseAllSheets: true, sheetCount, sheets };
    }
    return { ok: true, traverseAllSheets: true, sheetCount, sheets };
  }
  const sheetId = await chooseSheet(target.token, target.spreadsheetToken, preferredSheetId);
  await readSheetValuesFlexible(target.token, target.spreadsheetToken, sheetId);
  return { ok: true, sheetId, sheetCount, sheets };
}

async function waitForTabComplete(tabId, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.status === "complete") return tab;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return chrome.tabs.get(tabId).catch(() => null);
}

function percentText(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const ratio = number > 1 ? number / 100 : number;
  return `${Math.round(ratio * 10000) / 100}%`;
}

function jsonText(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function valueOrRaw(detail, key) {
  if (detail?.[key] !== undefined && detail?.[key] !== null && detail?.[key] !== "") return detail[key];
  const raw = detail?.raw_payload && typeof detail.raw_payload === "object" ? detail.raw_payload : {};
  if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") return raw[key];
  const fan = raw.fan_analysis && typeof raw.fan_analysis === "object" ? raw.fan_analysis : {};
  if (fan[key] !== undefined && fan[key] !== null && fan[key] !== "") return fan[key];
  const note = raw.note_performance && typeof raw.note_performance === "object" ? raw.note_performance : {};
  if (note[key] !== undefined && note[key] !== null && note[key] !== "") return note[key];
  const service = raw.service_performance && typeof raw.service_performance === "object" ? raw.service_performance : {};
  return service[key] ?? "";
}

function ratioFromApiValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.includes("%")) {
    const match = value.match(/([0-9]+(?:\.[0-9]+)?)/);
    return match ? Number(match[1]) / 100 : null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number > 1 ? number / 100 : number;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function objectKeysCount(value) {
  return value && typeof value === "object" ? Object.keys(value).length : 0;
}

function profileDistributionItems(items, labelKeys = ["label", "name", "group", "key"], ratioKeys = ["ratio", "percent", "value"]) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = cleanJsonText(firstDefined(...labelKeys.map((key) => item[key])));
      const ratio = ratioFromApiValue(firstDefined(...ratioKeys.map((key) => item[key])));
      const desc = cleanJsonText(item.desc || item.description || item.insight || "");
      if (!label || ratio === null) return null;
      return { label, ratio, ...(desc ? { desc } : {}) };
    })
    .filter(Boolean);
}

function cleanJsonText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function noteCaseFromApiItem(item) {
  if (!item || typeof item !== "object") return null;
  const note = {
    note_id: cleanJsonText(item.noteId || item.note_id || item.id),
    title: cleanJsonText(item.title || item.noteTitle || item.name),
    brand: cleanJsonText(item.brandName || item.contentTag || item.brand),
    cover_url: cleanJsonText(item.imgUrl || item.imageUrl || item.coverUrl),
    published_at: cleanJsonText(item.date || item.publishTime || item.publish_time),
    read_count: firstDefined(item.readNum, item.read_count, item.readCount),
    like_count: firstDefined(item.likeNum, item.like_count, item.likeCount),
    save_count: firstDefined(item.collectNum, item.save_count, item.collectCount),
    comment_count: firstDefined(item.cmtNum, item.comment_count, item.commentCount),
    share_count: firstDefined(item.shareNum, item.share_count, item.shareCount),
    note_type: item.isVideo ? "视频笔记" : "图文笔记",
    source: "detail_api"
  };
  for (const key of Object.keys(note)) {
    if (note[key] === "" || note[key] === null || note[key] === undefined) delete note[key];
  }
  return note.note_id || note.title ? note : null;
}

function noteCasesFromApiCache(cache, maxCases = 24) {
  const notesDetail = cache?.notes_detail && typeof cache.notes_detail === "object" ? cache.notes_detail : {};
  const cases = [];
  const seen = new Set();
  for (const noteType of Object.keys(notesDetail)) {
    const pages = notesDetail[noteType];
    if (!pages || typeof pages !== "object") continue;
    for (const pageNo of Object.keys(pages).sort((a, b) => Number(a) - Number(b))) {
      const payload = pages[pageNo];
      const list = Array.isArray(payload?.list) ? payload.list : Array.isArray(payload?.items) ? payload.items : [];
      for (const item of list) {
        const note = noteCaseFromApiItem(item);
        if (!note) continue;
        const key = `${note.note_id || ""}|${note.title || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cases.push(note);
        if (cases.length >= maxCases) return cases;
      }
    }
  }
  return cases;
}

function mergeDetailApiCache(detail, apiCache) {
  const cache = apiCache?.cache && typeof apiCache.cache === "object" ? apiCache.cache : apiCache || {};
  const result = { ...(detail || {}) };
  const raw = result.raw_payload && typeof result.raw_payload === "object" ? { ...result.raw_payload } : {};
  const fan = raw.fan_analysis && typeof raw.fan_analysis === "object" ? { ...raw.fan_analysis } : {};
  const note = raw.note_performance && typeof raw.note_performance === "object" ? { ...raw.note_performance } : {};
  const service = raw.service_performance && typeof raw.service_performance === "object" ? { ...raw.service_performance } : {};
  const profile = cache.blogger_profile && typeof cache.blogger_profile === "object" ? cache.blogger_profile : {};
  const fansSummary = cache.fans_summary && typeof cache.fans_summary === "object" ? cache.fans_summary : {};
  const fansProfile = cache.fans_profile && typeof cache.fans_profile === "object" ? cache.fans_profile : {};
  const dailySummary = cache.data_summary?.daily && typeof cache.data_summary.daily === "object" ? cache.data_summary.daily : {};
  const coopSummary = cache.data_summary?.cooperation && typeof cache.data_summary.cooperation === "object" ? cache.data_summary.cooperation : {};
  const dailyRate = cache.notes_rate?.daily && typeof cache.notes_rate.daily === "object" ? cache.notes_rate.daily : {};
  const coopRate = cache.notes_rate?.cooperation && typeof cache.notes_rate.cooperation === "object" ? cache.notes_rate.cooperation : {};

  if (profile.name && !result.nickname) result.nickname = cleanJsonText(profile.name);
  if (profile.redId && !result.xiaohongshu_id) result.xiaohongshu_id = cleanJsonText(profile.redId);
  if (profile.location && !result.ip_city) result.ip_city = cleanJsonText(profile.location);
  if (profile.fansCount !== undefined && !result.followers_count) result.followers_count = numericValue(profile.fansCount);
  if (profile.likeCollectCountInfo !== undefined && !result.liked_collected_count) result.liked_collected_count = numericValue(profile.likeCollectCountInfo);
  if (profile.picturePrice !== undefined && !result.quote_price) result.quote_price = numericValue(profile.picturePrice);
  if (profile.videoPrice !== undefined && !result.video_quote_price) result.video_quote_price = numericValue(profile.videoPrice);

  if (dailySummary.readMedian !== undefined && !result.daily_read_median) result.daily_read_median = numericValue(dailySummary.readMedian);
  if (dailySummary.mAccumImpNum !== undefined && !result.daily_exposure_median) result.daily_exposure_median = numericValue(dailySummary.mAccumImpNum);
  if ((dailySummary.mEngagementNum || dailySummary.interactionMedian) !== undefined && !result.daily_interaction_median) {
    result.daily_interaction_median = numericValue(dailySummary.mEngagementNum || dailySummary.interactionMedian);
  }
  if (coopSummary.readMedian !== undefined && !result.cooperation_read_median) result.cooperation_read_median = numericValue(coopSummary.readMedian);
  if (coopSummary.mAccumImpNum !== undefined && !result.cooperation_exposure_median) result.cooperation_exposure_median = numericValue(coopSummary.mAccumImpNum);
  if ((coopSummary.mEngagementNum || coopSummary.interactionMedian) !== undefined && !result.cooperation_interaction_median) {
    result.cooperation_interaction_median = numericValue(coopSummary.mEngagementNum || coopSummary.interactionMedian);
  }
  if (dailySummary.responseRate !== undefined && !result.reply_rate_48h) result.reply_rate_48h = ratioFromApiValue(dailySummary.responseRate);
  if (dailySummary.activeDayInLast7 !== undefined && !result.active_days_7d) result.active_days_7d = numericValue(dailySummary.activeDayInLast7);

  const fanMappings = {
    fansIncreaseNum: "fan_growth",
    fansGrowthRate: "fan_growth_ratio",
    activeFansRate: "active_fans_ratio",
    readFansRate: "read_fans_ratio",
    engageFansRate: "interaction_fans_ratio",
    payFansUserRate30d: "order_fans_ratio"
  };
  for (const [source, target] of Object.entries(fanMappings)) {
    if (fansSummary[source] === undefined || fan[target] !== undefined) continue;
    fan[target] = source.toLowerCase().includes("rate") ? ratioFromApiValue(fansSummary[source]) : numericValue(fansSummary[source]);
  }
  if (fan.active_fans_ratio !== undefined && !result.active_fans_ratio) result.active_fans_ratio = fan.active_fans_ratio;
  if (fan.read_fans_ratio !== undefined && !result.read_fans_ratio) result.read_fans_ratio = fan.read_fans_ratio;
  if (fan.interaction_fans_ratio !== undefined && !result.interaction_fans_ratio) result.interaction_fans_ratio = fan.interaction_fans_ratio;
  if (fan.order_fans_ratio !== undefined && !result.order_fans_ratio) result.order_fans_ratio = fan.order_fans_ratio;
  if (fan.fan_growth_ratio !== undefined && !result.fans_growth_ratio) result.fans_growth_ratio = fan.fan_growth_ratio;

  const gender = fansProfile.gender && typeof fansProfile.gender === "object" ? fansProfile.gender : {};
  const female = ratioFromApiValue(firstDefined(gender.female, gender.woman, gender.F, fansProfile.female));
  const male = ratioFromApiValue(firstDefined(gender.male, gender.man, gender.M, fansProfile.male));
  if (female !== null && !result.female_fans_ratio) result.female_fans_ratio = female;
  if (male !== null && !result.male_fans_ratio) result.male_fans_ratio = male;
  if (female !== null || male !== null) {
    const segments = [];
    if (female !== null) segments.push({ label: "女性", key: "female_fans_ratio", ratio: female });
    if (male !== null) segments.push({ label: "男性", key: "male_fans_ratio", ratio: male });
    result.audience_gender_distribution = { segments, dominant: segments.slice().sort((a, b) => b.ratio - a.ratio)[0], source: "detail_api" };
  }

  const ageSegments = profileDistributionItems(firstDefined(fansProfile.ages, fansProfile.age, fansProfile.ageDistributions), ["group", "name", "label"], ["percent", "ratio", "value"]);
  if (ageSegments.length) {
    for (const item of ageSegments) {
      if (item.label.includes("18") && !result.fans_18_24_ratio) result.fans_18_24_ratio = item.ratio;
      if (item.label.includes("25") && !result.fans_25_34_ratio) result.fans_25_34_ratio = item.ratio;
      if (item.label.includes("35") && !result.fans_35_44_ratio) result.fans_35_44_ratio = item.ratio;
      if ((item.label.includes(">44") || item.label.includes("44岁以上") || item.label.includes("45")) && !result.fans_44_plus_ratio) result.fans_44_plus_ratio = item.ratio;
    }
    result.audience_age_distribution = { segments: ageSegments, dominant: ageSegments.slice().sort((a, b) => b.ratio - a.ratio)[0], source: "detail_api" };
  }
  if (result.fans_35_44_ratio !== undefined || result.fans_44_plus_ratio !== undefined) {
    result.fans_35_plus_ratio = Math.min((Number(result.fans_35_44_ratio) || 0) + (Number(result.fans_44_plus_ratio) || 0), 1);
  }

  const regionSegments = profileDistributionItems(firstDefined(fansProfile.provinces, fansProfile.regions, fansProfile.citys, fansProfile.cities), ["name", "label", "province"], ["percent", "ratio", "value"]).slice(0, 10);
  if (regionSegments.length) {
    result.audience_region_distribution = {
      raw_text: regionSegments.slice(0, 5).map((item) => `${item.label}(${percentText(item.ratio)})`).join("、"),
      source: "detail_api",
      top_regions: regionSegments,
      dominant: regionSegments[0],
      scope: "province"
    };
  }

  const deviceSegments = profileDistributionItems(firstDefined(fansProfile.devices, fansProfile.device), ["name", "label"], ["percent", "ratio", "value"]);
  if (deviceSegments.length) {
    const top = deviceSegments[0];
    result.audience_device_distribution = {
      raw_text: `${top.label}用户占比${percentText(top.ratio)}${top.desc ? `，${top.desc}` : ""}`,
      source: "detail_api",
      dominant: { label: top.label, ratio: top.ratio },
      top_devices: deviceSegments,
      ...(top.desc ? { insight: top.desc } : {})
    };
  }

  const interests = firstDefined(fansProfile.interests, fansProfile.interestTags, fansProfile.contentInterests);
  if (Array.isArray(interests) && !result.topic_point) {
    const labels = interests.map((item) => cleanJsonText(typeof item === "object" ? firstDefined(item.name, item.label, item.tag) : item)).filter(Boolean);
    if (labels.length) result.topic_point = labels.slice(0, 5).join("、");
  }

  const notes = noteCasesFromApiCache(cache);
  if (notes.length) raw.note_cases = notes;

  note.exposure_median = firstDefined(note.exposure_median, dailyRate.impMedian, dailySummary.mAccumImpNum);
  note.read_median = firstDefined(note.read_median, dailyRate.readMedian, dailySummary.readMedian);
  note.interaction_median = firstDefined(note.interaction_median, dailyRate.interactionMedian, dailySummary.mEngagementNum);
  note.interaction_rate = firstDefined(note.interaction_rate, ratioFromApiValue(dailyRate.interactionRate));
  note.video_completion_rate = firstDefined(note.video_completion_rate, ratioFromApiValue(dailyRate.videoFullViewRate));
  note.thousand_like_note_ratio = firstDefined(note.thousand_like_note_ratio, ratioFromApiValue(dailyRate.thousandLikePercent));
  note.hundred_like_note_ratio = firstDefined(note.hundred_like_note_ratio, ratioFromApiValue(dailyRate.hundredLikePercent));

  raw.fan_analysis = fan;
  raw.note_performance = note;
  raw.service_performance = service;
  raw.detail_api_cache = cache;
  raw.detail_api_capture_summary = {
    response_count: Array.isArray(apiCache?.responses) ? apiCache.responses.length : 0,
    request_count: Array.isArray(apiCache?.requests) ? apiCache.requests.length : 0,
    cache_keys: Object.keys(cache).filter((key) => key !== "requests"),
    has_blogger_profile: objectKeysCount(profile) > 0,
    has_fans_summary: objectKeysCount(fansSummary) > 0,
    has_fans_profile: objectKeysCount(fansProfile) > 0,
    has_notes_detail: notes.length > 0
  };
  result.raw_payload = raw;
  return result;
}

function buildDetailSummary(detail, captures = {}) {
  const raw = detail?.raw_payload && typeof detail.raw_payload === "object" ? detail.raw_payload : {};
  const modules = [];
  if (detail?.nickname || detail?.followers_count) modules.push("basic_profile");
  if (raw.note_performance && Object.keys(raw.note_performance).length) modules.push("note_performance");
  if (raw.fan_analysis && Object.keys(raw.fan_analysis).length) modules.push("fan_analysis");
  if (detail?.audience_region_distribution) modules.push("region_distribution");
  if (detail?.audience_device_distribution) modules.push("device_distribution");
  if (raw.service_performance && Object.keys(raw.service_performance).length) modules.push("service_performance");
  if (Array.isArray(raw.note_cases) && raw.note_cases.length) modules.push("note_cases");
  if (raw.detail_api_capture_summary?.response_count) modules.push("detail_api_capture");
  if (captures.audience?.screenshot) modules.push("audience_profile_screenshot");
  if (captures.overview?.screenshot) modules.push("read_count_screenshot");
  return {
    modules,
    module_count: modules.length,
    note_case_count: Array.isArray(raw.note_cases) ? raw.note_cases.length : 0,
    has_basic_profile: modules.includes("basic_profile"),
    has_note_performance: modules.includes("note_performance"),
    has_fan_analysis: modules.includes("fan_analysis"),
    has_region_distribution: modules.includes("region_distribution"),
    has_device_distribution: modules.includes("device_distribution"),
    has_service_performance: modules.includes("service_performance"),
    has_note_cases: modules.includes("note_cases"),
    has_audience_profile_screenshot: modules.includes("audience_profile_screenshot"),
    has_read_count_screenshot: modules.includes("read_count_screenshot")
  };
}

function detailValuesForSheet(detail, captures, status, note = "") {
  const raw = detail?.raw_payload && typeof detail.raw_payload === "object" ? detail.raw_payload : {};
  const summary = buildDetailSummary(detail, captures);
  return {
    "详情补采状态": status,
    "详情补采时间": nowLocalText(),
    "详情完整度": `${summary.module_count}个模块 / 笔记${summary.note_case_count}条`,
    "详情API捕获摘要": jsonText(raw.detail_api_capture_summary || {}),
    "个人简介": valueOrRaw(detail, "personal_intro"),
    "博主优势": valueOrRaw(detail, "blogger_advantage"),
    "粉丝画像文本": captures.audience?.text || "",
    "笔记数据文本": captures.overview?.text || "",
    "女性粉丝占比": percentText(valueOrRaw(detail, "female_fans_ratio")),
    "男性粉丝占比": percentText(valueOrRaw(detail, "male_fans_ratio")),
    "18-24粉丝占比": percentText(valueOrRaw(detail, "fans_18_24_ratio")),
    "25-34粉丝占比": percentText(valueOrRaw(detail, "fans_25_34_ratio")),
    "35-44粉丝占比": percentText(valueOrRaw(detail, "fans_35_44_ratio")),
    "44岁以上粉丝占比": percentText(valueOrRaw(detail, "fans_44_plus_ratio")),
    "35岁以上粉丝占比": percentText(valueOrRaw(detail, "fans_35_plus_ratio")),
    "活跃粉丝占比": percentText(valueOrRaw(detail, "active_fans_ratio")),
    "阅读粉丝占比": percentText(valueOrRaw(detail, "read_fans_ratio")),
    "互动粉丝占比": percentText(valueOrRaw(detail, "interaction_fans_ratio")),
    "下单粉丝占比": percentText(valueOrRaw(detail, "order_fans_ratio")),
    "粉丝增长率": percentText(valueOrRaw(detail, "fans_growth_ratio")),
    "粉丝性别分布": jsonText(valueOrRaw(detail, "audience_gender_distribution")),
    "粉丝年龄分布": jsonText(valueOrRaw(detail, "audience_age_distribution")),
    "粉丝地域分布": jsonText(valueOrRaw(detail, "audience_region_distribution")),
    "用户设备分布": jsonText(valueOrRaw(detail, "audience_device_distribution")),
    "用户兴趣": valueOrRaw(detail, "topic_point"),
    "近7天活跃天数": valueOrRaw(detail, "active_days_7d"),
    "近期笔记JSON": jsonText(raw.note_cases || raw.recent_notes || raw.recent_note_briefs || []),
    "详情原始JSON": jsonText({ ...raw, detail_collection_summary: summary }),
    "详情补采备注": note || detail?.pgy_url || ""
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

async function sleepUntilStoppedOrTimeout(ms) {
  const endAt = Date.now() + ms;
  while (!detailStopRequested && Date.now() < endAt) {
    await sleep(Math.min(1000, endAt - Date.now()));
  }
}

async function waitAfterDetailRequest() {
  await sleep(randomInt(DETAIL_REQUEST_DELAY_MIN_MS, DETAIL_REQUEST_DELAY_MAX_MS));
}

function isDetailRateLimitError(error) {
  if (error?.paused) return true;
  const message = String(error?.message || error || "");
  return /频繁|限频|稍后再试|人机验证|rate.?limit|too many|429/i.test(message);
}

async function collectDetailPayloadWithCooldown(row, index) {
  let retries = 0;
  while (!detailStopRequested) {
    try {
      return await collectDetailPayload(row, index);
    } catch (error) {
      const rateLimited = isDetailRateLimitError(error);
      if (!rateLimited || retries >= DETAIL_RATE_LIMIT_MAX_RETRIES) {
        if (rateLimited && error && typeof error === "object") error.paused = true;
        if (rateLimited) {
          notifyDetailBackfill(
            "详情补采已暂停",
            `疑似触发限频，已重试 ${DETAIL_RATE_LIMIT_MAX_RETRIES} 次。请稍后重新开始补采。`,
            { requireInteraction: true }
          );
        }
        throw error;
      }
      retries += 1;
      notifyDetailBackfill(
        "详情补采遇到限频",
        `将冷却 3 分钟后自动重试，第 ${retries}/${DETAIL_RATE_LIMIT_MAX_RETRIES} 次。`
      );
      await sleepUntilStoppedOrTimeout(DETAIL_RATE_LIMIT_COOLDOWN_MS);
    } finally {
      await waitAfterDetailRequest();
    }
  }
  throw new Error("详情补足已停止。");
}

async function runDetailBackfillPool(items, handler, concurrency = DETAIL_BACKFILL_CONCURRENCY) {
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  async function worker() {
    while (!detailStopRequested) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await handler(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function withDetailCaptureLock(task) {
  const previous = detailCaptureLock;
  let release;
  detailCaptureLock = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

function screenshotClipFromPrepared(prepared) {
  const rect = prepared?.pageRect;
  if (!rect) return null;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width < 80 || height < 40) return null;
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(80, Math.round(width)),
    height: Math.max(40, Math.round(height)),
    scale: 1
  };
}

async function captureTabScreenshotByDebugger(tabId, clip = null) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(target, "Page.enable").catch(() => null);
    const params = {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: Boolean(clip)
    };
    if (clip) params.clip = clip;
    const result = await chrome.debugger.sendCommand(target, "Page.captureScreenshot", params);
    if (!result?.data) throw new Error("调试协议没有返回截图数据");
    return `data:image/png;base64,${result.data}`;
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => null);
  }
}

function isUsableScreenshot(dataUrl) {
  return typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,") && dataUrl.length > 5000;
}

async function captureVisibleTabWithFocus(tab) {
  return withDetailCaptureLock(async () => {
    const [previousTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    const previousWindowId = previousTab?.windowId;
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => null);
    await chrome.tabs.update(tab.id, { active: true }).catch(() => null);
    await sleep(700);
    try {
      const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      if (!isUsableScreenshot(screenshot)) throw new Error("可见页截图为空或过小");
      return screenshot;
    } finally {
      if (previousTab?.id) await chrome.tabs.update(previousTab.id, { active: true }).catch(() => null);
      if (previousWindowId) await chrome.windows.update(previousWindowId, { focused: true }).catch(() => null);
    }
  });
}

async function captureTabScreenshotWithFallback(tab, prepared = null) {
  const errors = [];
  const clip = screenshotClipFromPrepared(prepared);
  if (!clip) throw new Error("未定位到可裁剪的详情截图区域");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const screenshot = await captureTabScreenshotByDebugger(tab.id, clip);
      if (!isUsableScreenshot(screenshot)) throw new Error("后台截图为空或过小");
      return screenshot;
    } catch (error) {
      errors.push(`后台截图第${attempt}次失败：${shortErrorMessage(error)}`);
      await sleep(500 * attempt);
    }
  }
  throw new Error(errors.join("；"));
}

async function capturePreparedTab(tab, kind, row, index) {
  const shouldCaptureScreenshot = !DETAIL_HEADLESS_MODE || DETAIL_HEADLESS_CAPTURE_SCREENSHOTS;
  const useDebuggerScreenshot = DETAIL_HEADLESS_MODE && DETAIL_HEADLESS_CAPTURE_SCREENSHOTS;
  const task = async () => {
    const prepared = await chrome.tabs.sendMessage(tab.id, { type: "PGY_PREPARE_DETAIL_CAPTURE", kind });
    if (!prepared?.ok) {
      return { ...(prepared || {}), ok: false, found: false, screenshot: "", error: prepared?.message || "截图区域准备失败" };
    }
    if (!shouldCaptureScreenshot) {
      return {
        ...prepared,
        screenshot: "",
        imageName: "",
        screenshotSkipped: true
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      const screenshot = useDebuggerScreenshot
        ? await captureTabScreenshotWithFallback(tab, prepared)
        : await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      return {
        ...prepared,
        screenshot,
        imageName: `pgy-${kind}-${extractPgyUserId(row) || index + 1}.png`
      };
    } catch (error) {
      return {
        ...prepared,
        screenshot: "",
        imageName: "",
        error: `截图失败：${error?.message || String(error)}`
      };
    }
  };
  if (DETAIL_HEADLESS_MODE) {
    try {
      return await task();
    } catch (error) {
      return { ok: false, found: false, text: "", screenshot: "", error: `后台截图失败：${error?.message || String(error)}` };
    }
  }
  return withDetailCaptureLock(async () => {
    await chrome.tabs.update(tab.id, { active: true }).catch(() => null);
    try {
      return await task();
    } catch (error) {
    return { ok: false, found: false, text: "", screenshot: "", error: `截图准备失败：${error?.message || String(error)}` };
    }
  });
}

function isDetailAuthError(error) {
  if (error?.authRequired || error?.requiresUserAction) return true;
  const message = String(error?.message || error || "");
  return /登录|授权|权限|未开通|访问受限|unauthorized|forbidden|permission|auth/i.test(message);
}

function detailFailureStatus(error, action = "补足") {
  if (error?.requiresUserAction || error?.authRequired) return `${action}暂停-需登录或授权`;
  if (error?.paused) return `${action}暂停-疑似限频`;
  return `${action}失败`;
}

async function readDetailApiCache(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async () => {
      function clone(value) {
        try {
          return JSON.parse(JSON.stringify(value || {}));
        } catch {
          return {};
        }
      }
      async function sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
      for (let index = 0; index < 8; index += 1) {
        const state = window.__PGY_DETAIL_API_CACHE__;
        if (state?.responses?.length) return clone(state);
        await sleep(500);
      }
      return clone(window.__PGY_DETAIL_API_CACHE__ || {});
    }
  });
  return result?.result || {};
}

async function collectDetailPayload(row, index) {
  const url = detailUrlFromRow(row);
  if (!url) throw new Error("该行缺少蒲公英达人链接或达人ID。");
  const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const previousTabId = currentTabs[0]?.id;
  const tab = await chrome.tabs.create({ url, active: !DETAIL_HEADLESS_MODE });
  let keepTabOpen = false;
  try {
    await waitForTabComplete(tab.id);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["detail-capture.js"] });
    const result = await chrome.tabs.sendMessage(tab.id, { type: "PGY_COLLECT_DETAIL" });
    if (!result?.ok) {
      const error = new Error(result?.message || "详情页采集失败");
      error.paused = Boolean(result?.paused);
      error.authRequired = Boolean(result?.authRequired);
      throw error;
    }
    const apiCache = await readDetailApiCache(tab.id);
    const audience = await capturePreparedTab(tab, "audience", row, index);
    const overview = await capturePreparedTab(tab, "overview", row, index);
    const textDetail = {
      ...(result.detail || {}),
      pgy_url: result.url || url,
      raw_payload: {
        ...((result.detail || {}).raw_payload || {}),
        detail_collection_source: "browser_extension",
        collected_at: result.collectedAt || nowLocalText()
      }
    };
    const detail = mergeDetailApiCache(textDetail, apiCache);
    return {
      ...result,
      apiCacheSummary: detail.raw_payload?.detail_api_capture_summary || {},
      detail,
      captures: { audience, overview },
      detailUrl: url,
      imageName: `pgy-detail-${extractPgyUserId(row) || index + 1}.png`
    };
  } catch (error) {
    if (isDetailAuthError(error)) {
      keepTabOpen = true;
      detailStopRequested = true;
      error.requiresUserAction = true;
      error.paused = true;
      await chrome.tabs.update(tab.id, { active: true }).catch(() => null);
      notifyDetailBackfill(
        "详情补采需要处理登录/授权",
        "已暂停补采并打开当前详情页，请完成登录或授权后重新开始补采。",
        { requireInteraction: true }
      );
    }
    throw error;
  } finally {
    if (!keepTabOpen) {
      await chrome.tabs.remove(tab.id).catch(() => null);
      if (!DETAIL_HEADLESS_MODE && previousTabId) {
        await withDetailCaptureLock(() => chrome.tabs.update(previousTabId, { active: true }).catch(() => null));
      }
    }
  }
}

async function backfillDetailsToFeishu({ rows, options, limit = 0 }) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("请先导入达人表格。");
  detailStopRequested = false;
  const targetRows = rows.slice(0, Math.max(1, Math.min(Number(limit || rows.length), rows.length)));
  const sheet = await resolveFeishuSheet(options, targetRows);
  let values = await readSheetValues(sheet.token, sheet.spreadsheetToken, sheet.sheetId, "A1:ZZ20000");
  let sheetRows = sheetRowsToObjects(values);
  let completed = 0;
  let failed = 0;
  let appended = 0;

  await runDetailBackfillPool(targetRows, async (sourceRow, index) => {
    let rowNumber = findSheetRowNumber(sheetRows, sourceRow);
    if (!rowNumber) {
      await appendSheetRows(sheet.token, sheet.spreadsheetToken, sheet.sheetId, sheet.fields, [sourceRow]);
      appended += 1;
      values = await readSheetValues(sheet.token, sheet.spreadsheetToken, sheet.sheetId, "A1:ZZ20000");
      sheetRows = sheetRowsToObjects(values);
      rowNumber = findSheetRowNumber(sheetRows, sourceRow);
    }
    try {
      const payload = await collectDetailPayloadWithCooldown(sourceRow, index);
      const captures = payload.captures || {};
      const status = captures.audience?.found ? "已补采" : "已补采-未确认粉丝画像";
      await writeSheetCells(
        sheet.token,
        sheet.spreadsheetToken,
        sheet.sheetId,
        sheet.fields,
        rowNumber,
        detailValuesForSheet(payload.detail, captures, status, payload.detailUrl || "")
      );
      await writeSheetImage(
        sheet.token,
        sheet.spreadsheetToken,
        sheet.sheetId,
        sheet.fields,
        rowNumber,
        "粉丝画像截图",
        captures.audience?.screenshot,
        captures.audience?.imageName
      );
      await writeSheetImage(
        sheet.token,
        sheet.spreadsheetToken,
        sheet.sheetId,
        sheet.fields,
        rowNumber,
        "笔记数据截图",
        captures.overview?.screenshot,
        captures.overview?.imageName
      );
      completed += 1;
    } catch (error) {
      failed += 1;
      if (error?.paused || error?.requiresUserAction) detailStopRequested = true;
      if (rowNumber) {
        await writeSheetCells(sheet.token, sheet.spreadsheetToken, sheet.sheetId, sheet.fields, rowNumber, {
          "详情补采状态": detailFailureStatus(error, "补采"),
          "详情补采时间": nowLocalText(),
          "详情补采备注": error?.message || String(error)
        }).catch(() => null);
      }
    }
  });

  const stopped = Boolean(detailStopRequested);
  detailStopRequested = false;
  return { ok: true, completed, failed, appended, stopped, total: targetRows.length };
}

async function resolveExistingFeishuSheet(options) {
  const target = await resolveDetailSpreadsheet(options);
  const sheetId = await chooseSheet(target.token, target.spreadsheetToken, options.detailFeishuSheetId || target.parsedSheetId || "");
  return { token: target.token, spreadsheetToken: target.spreadsheetToken, sheetId };
}

async function backfillOneDetailSheet({ sheet, limit = 0, offset = 0 }) {
  const values = await readSheetValuesFlexible(sheet.token, sheet.spreadsheetToken, sheet.sheetId);
  const shape = detectSheetShape(values);
  const allItems = sheetRowsToShapeObjects(values, shape);
  const templateItem = firstValidCreatorItem(allItems);
  const rows = allItems.filter((item) => {
    if (!Object.values(item.row).some(nonEmptyCell)) return false;
    if (!extractPgyUserId(item.row) && !detailUrlFromRow(item.row)) return false;
    return hasBlankMappedDetailCell(item, shape.columns);
  });
  const maxRows = Number(limit || rows.length);
  const targetRows = rows.slice(0, Math.max(0, Math.min(maxRows, rows.length)));
  let completed = 0;
  let failed = 0;
  let skipped = rows.length - targetRows.length;
  let writtenCells = 0;
  const errorSamples = [];
  const warningSamples = [];
  const writeFailures = [];
  const noopSamples = [];

  const addWriteFailure = (item, column, message, value) => {
    if (writeFailures.length >= 20) return;
    writeFailures.push({
      rowNumber: item?.rowNumber || 0,
      columnIndex: column?.columnIndex ?? -1,
      columnName: column?.columnIndex >= 0 ? columnName(column.columnIndex + 1) : "",
      fieldName: column?.fieldName || "",
      canonicalField: column?.canonicalField || "",
      valueType: value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
      message: shortErrorMessage(message)
    });
  };

  await runDetailBackfillPool(targetRows, async (item, index) => {
    try {
      const payload = await collectDetailPayloadWithCooldown(item.row, offset + index);
      const valuesByField = canonicalBackfillValues(item.row, payload);
      const captures = payload.captures || {};
      const rowWarnings = [captures.audience?.error, captures.overview?.error].filter(Boolean);
      const blankMappedColumns = shape.columns
        .filter((column) => column.canonicalField && !nonEmptyCell(item.line[column.columnIndex]))
        .map((column) => ({
          columnName: columnName(column.columnIndex + 1),
          fieldName: column.fieldName,
          canonicalField: column.canonicalField
        }));
      let rowWrites = 0;
      for (const column of shape.columns) {
        const current = item.line[column.columnIndex];
        if (nonEmptyCell(current)) continue;
        if (!column.canonicalField) continue;
        if (column.canonicalField === DETAIL_FIELDS[6]) {
          if (captures.audience?.screenshot) {
            const imageResult = await writeSheetImageByColumnBestEffort(
              sheet.token,
              sheet.spreadsheetToken,
              sheet.sheetId,
              column.columnIndex,
              item.rowNumber,
              captures.audience.screenshot,
              captures.audience.imageName
            );
            if (imageResult.ok) rowWrites += 1;
            else {
              const message = imageResult.message || "图片写入失败";
              rowWarnings.push(`粉丝画像截图未写入：${message}`);
              addWriteFailure(item, column, message, "image");
            }
          } else {
            const message = captures.audience?.error || "截图缺失";
            rowWarnings.push(`粉丝画像截图未写入：${message}`);
            addWriteFailure(item, column, message, "");
          }
          continue;
        }
        if (column.canonicalField === DETAIL_FIELDS[7]) {
          if (!columnUsesImageTemplate(column, templateItem)) {
            const value = readMetricValue(valuesByField);
            if (value === undefined || value === null || value === "") continue;
            const cellResult = await writeSheetCellByColumnBestEffort(
              sheet.token,
              sheet.spreadsheetToken,
              sheet.sheetId,
              column.columnIndex,
              item.rowNumber,
              value,
              column.fieldName || column.canonicalField
            );
            if (cellResult.ok) rowWrites += 1;
            else {
              rowWarnings.push(cellResult.message);
              addWriteFailure(item, column, cellResult.message, value);
            }
          } else if (captures.overview?.screenshot) {
            const imageResult = await writeSheetImageByColumnBestEffort(
              sheet.token,
              sheet.spreadsheetToken,
              sheet.sheetId,
              column.columnIndex,
              item.rowNumber,
              captures.overview.screenshot,
              captures.overview.imageName
            );
            if (imageResult.ok) rowWrites += 1;
            else {
              const message = imageResult.message || "图片写入失败";
              rowWarnings.push(`笔记数据截图未写入：${message}`);
              addWriteFailure(item, column, message, "image");
            }
          } else {
            const message = captures.overview?.error || "截图缺失";
            rowWarnings.push(`笔记数据截图未写入：${message}`);
            addWriteFailure(item, column, message, "");
          }
          continue;
        }
        const value = valueForCanonicalField(valuesByField, column.canonicalField);
        if (value === undefined || value === null || value === "") continue;
        const cellResult = await writeSheetCellByColumnBestEffort(
          sheet.token,
          sheet.spreadsheetToken,
          sheet.sheetId,
          column.columnIndex,
          item.rowNumber,
          value,
          column.fieldName || column.canonicalField
        );
        if (cellResult.ok) rowWrites += 1;
        else {
          rowWarnings.push(cellResult.message);
          addWriteFailure(item, column, cellResult.message, value);
        }
      }
      if (!rowWrites && !rowWarnings.length && noopSamples.length < 10) {
        noopSamples.push({
          rowNumber: item.rowNumber,
          blankMappedColumns
        });
      }
      if (rowWarnings.length) {
        if (warningSamples.length < 5) warningSamples.push({ rowNumber: item.rowNumber, message: rowWarnings.join("；") });
        const noteColumn = shape.columns.find((column) => column.canonicalField === DETAIL_FIELDS[DETAIL_FIELDS.length - 1]);
        if (noteColumn && !nonEmptyCell(item.line[noteColumn.columnIndex])) {
          await writeSheetCellByColumn(sheet.token, sheet.spreadsheetToken, sheet.sheetId, noteColumn.columnIndex, item.rowNumber, rowWarnings.join("；")).catch((error) => {
            addWriteFailure(item, noteColumn, `备注列未写入：${shortErrorMessage(error)}`, rowWarnings.join("；"));
          });
        }
      }
      writtenCells += rowWrites;
      completed += 1;
    } catch (error) {
      failed += 1;
      if (errorSamples.length < 5) errorSamples.push({ rowNumber: item.rowNumber, message: shortErrorMessage(error) });
      if (error?.paused || error?.requiresUserAction) detailStopRequested = true;
      const statusColumn = shape.columns.find((column) => column.canonicalField === DETAIL_FIELDS[0]);
      const noteColumn = shape.columns.find((column) => column.canonicalField === DETAIL_FIELDS[DETAIL_FIELDS.length - 1]);
      if (statusColumn) {
        await writeSheetCellByColumn(
          sheet.token,
          sheet.spreadsheetToken,
          sheet.sheetId,
          statusColumn.columnIndex,
          item.rowNumber,
          detailFailureStatus(error, "补足")
        ).catch((writeError) => {
          addWriteFailure(item, statusColumn, `状态列未写入：${shortErrorMessage(writeError)}`, detailFailureStatus(error, "补足"));
        });
      }
      if (noteColumn) {
        await writeSheetCellByColumn(sheet.token, sheet.spreadsheetToken, sheet.sheetId, noteColumn.columnIndex, item.rowNumber, error?.message || String(error)).catch((writeError) => {
          addWriteFailure(item, noteColumn, `备注列未写入：${shortErrorMessage(writeError)}`, error?.message || String(error));
        });
      }
    }
  });

  return {
    sheetId: sheet.sheetId,
    sheetTitle: sheet.sheetTitle || sheet.sheetId,
    completed,
    failed,
    skipped,
    writtenCells,
    total: targetRows.length,
    scannedRows: rows.length,
    headerRows: shape.headerRows,
    mappedColumns: shape.columns.filter((column) => column.canonicalField).length,
    errorSamples,
    warningSamples,
    writeFailures,
    noopSamples
  };
}

async function backfillOneDetailBitable({ table, limit = 0, offset = 0 }) {
  await ensureBitableFieldNames(table.token, table.appToken, table.tableId, DETAIL_FIELDS);
  const records = await readBitableRecords(table.token, table.appToken, table.tableId);
  const rows = records.map(bitableRecordToDetailItem).filter(bitableNeedsDetail);
  const maxRows = Number(limit || rows.length);
  const targetRows = rows.slice(0, Math.max(0, Math.min(maxRows, rows.length)));
  let completed = 0;
  let failed = 0;
  let skipped = rows.length - targetRows.length;
  let writtenCells = 0;
  const errorSamples = [];

  await runDetailBackfillPool(targetRows, async (item, index) => {
    try {
      const payload = await collectDetailPayloadWithCooldown(item.row, offset + index);
      const valuesByField = canonicalBackfillValues(item.row, payload);
      const captures = payload.captures || {};
      const missingScreenshots = [];
      if (!captures.audience?.screenshot) missingScreenshots.push(`粉丝画像截图未写入：${captures.audience?.error || "截图缺失"}`);
      if (!captures.overview?.screenshot) missingScreenshots.push(`笔记数据截图未写入：${captures.overview?.error || "截图缺失"}`);
      const fields = bitableDetailFields(valuesByField, captures);
      if (missingScreenshots.length) {
        fields["详情补采备注"] = [fields["详情补采备注"], ...missingScreenshots].filter(Boolean).join("；");
      }
      await updateBitableRecord(table.token, table.appToken, table.tableId, item.recordId, fields);
      writtenCells += Object.keys(fields).length;
      completed += 1;
    } catch (error) {
      failed += 1;
      if (errorSamples.length < 5) errorSamples.push({ recordId: item.recordId, message: shortErrorMessage(error) });
      if (error?.paused || error?.requiresUserAction) detailStopRequested = true;
      await updateBitableRecord(table.token, table.appToken, table.tableId, item.recordId, {
        "详情补采状态": detailFailureStatus(error, "补足"),
        "详情补采备注": error?.message || String(error)
      }).catch(() => null);
    }
  });

  return {
    tableId: table.tableId,
    tableTitle: table.tableTitle || table.tableId,
    completed,
    failed,
    skipped,
    writtenCells,
    total: targetRows.length,
    scannedRows: rows.length,
    mappedColumns: DETAIL_FIELDS.length,
    errorSamples
  };
}

async function backfillDetailsFromFeishuSheet({ options, limit = 0 }) {
  detailStopRequested = false;
  const target = await resolveDetailSpreadsheet(options);
  if (target.resourceType === "bitable") {
    const preferredTableId = options.detailTraverseAllSheets && !options.detailFeishuSheetId ? "" : options.detailFeishuSheetId || target.parsedTableId || "";
    const requestedLimit = Number(limit || 0);
    let tables = [];
    if (options.detailTraverseAllSheets && !preferredTableId && target.tables.length > 1) {
      tables = target.tables.map((item) => ({
        token: target.token,
        appToken: target.appToken,
        tableId: item.table_id || item.id,
        tableTitle: item.name || item.title || item.table_id || item.id
      })).filter((item) => item.tableId);
    } else {
      const tableId = await chooseBitableTable(target.token, target.appToken, preferredTableId);
      const found = target.tables.find((item) => [item.table_id, item.id].includes(tableId));
      tables = [{
        token: target.token,
        appToken: target.appToken,
        tableId,
        tableTitle: found?.name || found?.title || tableId
      }];
    }

    const tableResults = [];
    let completed = 0;
    let failed = 0;
    let skipped = 0;
    let writtenCells = 0;
    let total = 0;
    let scannedRows = 0;
    let mappedColumns = 0;
    const errorSamples = [];
    const warningSamples = [];
    const writeFailures = [];
    const noopSamples = [];

    for (const table of tables) {
      if (detailStopRequested) break;
      const perTableLimit = requestedLimit && tables.length > 1 ? requestedLimit : 0;
      const remaining = requestedLimit && tables.length === 1 ? Math.max(0, requestedLimit - completed - failed) : perTableLimit;
      if (requestedLimit && remaining <= 0) break;
      const result = await backfillOneDetailBitable({ table, limit: requestedLimit ? remaining : 0, offset: completed + failed });
      tableResults.push(result);
      completed += result.completed;
      failed += result.failed;
      skipped += result.skipped;
      writtenCells += result.writtenCells;
      total += result.total;
      scannedRows += result.scannedRows;
      mappedColumns += result.mappedColumns;
      errorSamples.push(...(result.errorSamples || []).slice(0, Math.max(0, 5 - errorSamples.length)));
      warningSamples.push(...(result.warningSamples || []).slice(0, Math.max(0, 5 - warningSamples.length)).map((item) => ({ ...item, tableTitle: result.tableTitle })));
      writeFailures.push(...(result.writeFailures || []).slice(0, Math.max(0, 20 - writeFailures.length)).map((item) => ({ ...item, tableTitle: result.tableTitle })));
      noopSamples.push(...(result.noopSamples || []).slice(0, Math.max(0, 20 - noopSamples.length)).map((item) => ({ ...item, tableTitle: result.tableTitle })));
    }

    const stopped = Boolean(detailStopRequested);
    detailStopRequested = false;
    return {
      ok: true,
      resourceType: "bitable",
      completed,
      failed,
      skipped,
      writtenCells,
      stopped,
      total,
      scannedRows,
      mappedColumns,
      tableCount: tables.length,
      tableResults,
      errorSamples,
      warningSamples,
      writeFailures,
      noopSamples
    };
  }
  const preferredSheetId = options.detailTraverseAllSheets && !options.detailFeishuSheetId ? "" : options.detailFeishuSheetId || target.parsedSheetId || "";
  const requestedLimit = Number(limit || 0);
  let sheets = [];

  if (options.detailTraverseAllSheets && !preferredSheetId && target.sheets.length > 1) {
    sheets = target.sheets.map((item) => ({
      token: target.token,
      spreadsheetToken: target.spreadsheetToken,
      sheetId: item.sheet_id || item.id,
      sheetTitle: item.title || item.name || item.sheet_id || item.id
    })).filter((item) => item.sheetId);
  } else {
    const sheetId = await chooseSheet(target.token, target.spreadsheetToken, preferredSheetId);
    const found = target.sheets.find((item) => [item.sheet_id, item.id].includes(sheetId));
    sheets = [{
      token: target.token,
      spreadsheetToken: target.spreadsheetToken,
      sheetId,
      sheetTitle: found?.title || found?.name || sheetId
    }];
  }

  const sheetResults = [];
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let writtenCells = 0;
  let total = 0;
  let scannedRows = 0;
  let mappedColumns = 0;
  const errorSamples = [];
  const warningSamples = [];
  const writeFailures = [];
  const noopSamples = [];

  for (const sheet of sheets) {
    if (detailStopRequested) break;
    const perSheetLimit = requestedLimit && sheets.length > 1 ? requestedLimit : 0;
    const remaining = requestedLimit && sheets.length === 1 ? Math.max(0, requestedLimit - completed - failed) : perSheetLimit;
    if (requestedLimit && remaining <= 0) break;
    const result = await backfillOneDetailSheet({ sheet, limit: requestedLimit ? remaining : 0, offset: completed + failed });
    sheetResults.push(result);
    completed += result.completed;
    failed += result.failed;
    skipped += result.skipped;
    writtenCells += result.writtenCells;
    total += result.total;
    scannedRows += result.scannedRows;
    mappedColumns += result.mappedColumns;
    errorSamples.push(...(result.errorSamples || []).slice(0, Math.max(0, 5 - errorSamples.length)));
    warningSamples.push(...(result.warningSamples || []).slice(0, Math.max(0, 5 - warningSamples.length)).map((item) => ({ ...item, sheetTitle: result.sheetTitle })));
    writeFailures.push(...(result.writeFailures || []).slice(0, Math.max(0, 20 - writeFailures.length)).map((item) => ({ ...item, sheetTitle: result.sheetTitle })));
    noopSamples.push(...(result.noopSamples || []).slice(0, Math.max(0, 20 - noopSamples.length)).map((item) => ({ ...item, sheetTitle: result.sheetTitle })));
  }

  const stopped = Boolean(detailStopRequested);
  detailStopRequested = false;
  return {
    ok: true,
    completed,
    failed,
    skipped,
    writtenCells,
    stopped,
    total,
    scannedRows,
    mappedColumns,
    sheetCount: sheets.length,
    sheetResults,
    errorSamples,
    warningSamples,
    writeFailures,
    noopSamples
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "DOWNLOAD_PGY_CSV") {
      const rows = Array.isArray(message.rows) ? message.rows : [];
      const csv = rowsToCsv(rows);
      const filename = message.filename || `pgy-creators-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
      const url = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
      const downloadId = await chrome.downloads.download({ url, filename, saveAs: true });
      sendResponse({ ok: true, downloadId });
      return;
    }
    if (message?.type === "SYNC_FEISHU_DIRECT") {
      const result = await syncRowsToFeishu({ rows: message.rows || [], options: message.options || {} });
      sendResponse(result);
      return;
    }
    if (message?.type === "VALIDATE_FEISHU_SYNC_TARGET") {
      const result = await validateFeishuSyncTarget(message.options || {});
      sendResponse(result);
      return;
    }
    if (message?.type === "VALIDATE_FEISHU_CREDENTIALS") {
      const result = await validateFeishuCredentials(message.options || {});
      sendResponse(result);
      return;
    }
    if (message?.type === "VALIDATE_FEISHU_DETAIL_TARGET") {
      const result = await validateFeishuDetailTarget(message.options || {});
      sendResponse(result);
      return;
    }
    if (message?.type === "BACKFILL_DETAILS_FEISHU") {
      const result = await backfillDetailsToFeishu({ rows: message.rows || [], options: message.options || {}, limit: message.limit || 0 });
      sendResponse(result);
      return;
    }
    if (message?.type === "BACKFILL_DETAILS_FROM_FEISHU") {
      const result = await backfillDetailsFromFeishuSheet({ options: message.options || {}, limit: message.limit || 0 });
      sendResponse(result);
      return;
    }
    if (message?.type === "STOP_DETAIL_BACKFILL") {
      detailStopRequested = true;
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "OPEN_OPTIONS_PAGE") {
      await chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "OPEN_SIDE_PANEL") {
      if (!chrome.sidePanel?.open) {
        throw new Error("当前浏览器不支持打开侧边栏，请点击扩展图标打开。");
      }
      let windowId = sender?.tab?.windowId;
      if (typeof windowId !== "number") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        windowId = tab?.windowId;
      }
      if (typeof windowId === "number") {
        try {
          await chrome.sidePanel.open({ windowId });
        } catch (error) {
          if (String(error?.message || error).includes("user gesture")) {
            await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
            sendResponse({ ok: true, fallback: "tab" });
            return;
          }
          throw error;
        }
        await chrome.sidePanel.setOptions({ path: "popup.html", enabled: true }).catch(() => null);
        sendResponse({ ok: true });
        return;
      }
      throw new Error("无法定位当前页面，请点击扩展图标打开侧边栏。");
    }
  })().catch((error) => sendResponse({ ok: false, message: messageWithFeishuLinks(error) }));
  return true;
});
