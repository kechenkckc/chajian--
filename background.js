const FEISHU_BASE = "https://open.feishu.cn/open-apis";
const DEFAULT_SHEET_RANGE = "A1:ZZ1";
const BITABLE_TEXT_FIELD_TYPE = 1;
const BITABLE_ATTACHMENT_FIELD_TYPE = 17;
const DETAIL_FIELDS = [
  "详情补采状态",
  "详情补采时间",
  "详情完整度",
  "详情API捕获摘要",
  "个人简介",
  "博主优势",
  "粉丝画像截图",
  "笔记数据截图",
  "博主类型",
  "粉丝画像文本",
  "笔记数据文本",
  "女性粉丝占比",
  "男性粉丝占比",
  "所属机构",
  "<18粉丝占比",
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
  "粉丝城市分布",
  "用户设备分布",
  "用户兴趣",
  "用户兴趣分布",
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
let detailOpenTabGate = Promise.resolve();
let detailFastTabId = 0;
const DETAIL_BACKFILL_CONCURRENCY = 2;
const DETAIL_OPEN_TAB_STAGGER_MS = 1500;
const DETAIL_REQUEST_DELAY_MIN_MS = 1000;
const DETAIL_REQUEST_DELAY_MAX_MS = 3000;
const DETAIL_FAST_REQUEST_DELAY_MIN_MS = 100;
const DETAIL_FAST_REQUEST_DELAY_MAX_MS = 300;
const DETAIL_RATE_LIMIT_COOLDOWN_MS = 3 * 60 * 1000;
const DETAIL_RATE_LIMIT_MAX_RETRIES = 3;
const DETAIL_HEADLESS_MODE = true;
const DETAIL_HEADLESS_CAPTURE_SCREENSHOTS = true;
const DETAIL_FAST_API_MODE = true;
const SHEET_WRITE_RETRY_DELAY_MS = 800;
const SHEET_WRITE_VERIFY_DELAY_MS = 1000;
const SHEET_WRITE_VERIFY_RETRIES = 2;
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
  "完播率",
  "CPM",
  "CPE",
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
  "自定义标签",
  "IP城市",
  "数据来源",
  "采集时间",
  ...DETAIL_FIELDS,
  "蒲公英原始JSON"
];

const REFERENCE_EXPORT_HEADER_ROWS = [
  ["基础信息", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "数据概览", "", "", "", "", "", "", "数据表现", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "粉丝分析", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["基础数据", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "其它", "", "", "", "笔记数据-按规模-日常笔记", "", "", "笔记数据-按规模-合作笔记", "", "", "", "近90天、合作笔记、图文+视频、全部流量", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "核心指标", "", "", "", "", "", "粉丝画像", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["博主ID", "小红书号", "昵称", "性别", "所属机构", "粉丝数（万）", "赞藏数（万）", "博主人设", "内容类型", "地理位置", "小红书主页", "蒲公英主页", "健康等级", "下月健康等级", "图文笔记一口价", "视频笔记一口价", "图文笔记一口价(含平台服务费)", "视频笔记一口价(含平台服务费)", "图文笔记接单状态", "视频笔记接单状态", "添加人", "添加时间", "备注", "审核状态", "曝光中位数", "阅读中位数", "互动中位数", "曝光中位数", "阅读中位数", "互动中位数", "外溢进店中位数", "发布笔记", "曝光中位数", "阅读中位数", "互动中位数", "预估CPM", "预估阅读单价", "预估互动单价", "中位点赞量", "中位收藏量", "中位评论量", "中位分享量", "中位关注量", "互动率", "千赞笔记比例", "百赞笔记比例", "视频完播率", "图文3秒阅读率", "粉丝增量", "粉丝量变化幅度", "活跃粉丝占比", "阅读粉丝占比", "互动粉丝占比", "下单粉丝占比", "性别分布-男粉占比", "性别分布-女粉占比", "年龄分布-占比最高年龄段", "年龄分布-<18", "年龄分布-18-24", "年龄分布-25-34", "年龄分布-35-44", "年龄分布->44", "地域分布(省)-TOP1", "地域分布(省)-TOP2", "地域分布(省)-TOP3", "地域分布(省)-TOP4", "地域分布(省)-TOP5", "地域分布(省)-TOP6", "地域分布(省)-TOP7", "地域分布(市)-TOP1", "地域分布(市)-TOP2", "地域分布(市)-TOP3", "地域分布(市)-TOP4", "地域分布(市)-TOP5", "地域分布(市)-TOP6", "地域分布(市)-TOP7", "用户设备分布-TOP1", "用户设备分布-TOP2", "用户设备分布-TOP3", "用户设备分布-TOP4", "用户设备分布-TOP5", "用户设备分布-TOP6", "用户设备分布-TOP7", "兴趣分布-TOP1", "兴趣分布-TOP2", "兴趣分布-TOP3", "兴趣分布-TOP4", "兴趣分布-TOP5", "兴趣分布-TOP6", "兴趣分布-TOP7"]
];

const FIELD_ALIASES = {
  "达人ID": ["达人ID", "博主ID", "账号ID", "creator_id", "userId", "bloggerId", "kolId"],
  "达人昵称": ["达人昵称", "达人名称", "达人名", "博主昵称", "博主名称", "博主名", "昵称", "账号昵称", "账号名称", "红书达人", "kol", "nickname", "nickName", "name"],
  "达人名称": ["达人名称", "达人昵称", "达人名", "博主名称", "博主昵称", "博主名", "昵称", "账号昵称", "账号名称", "红书达人", "nickname", "nickName", "name"],
  "蒲公英链接": ["蒲公英链接", "蒲公英主页", "蒲公英达人主页", "蒲公英达人链接", "达人链接", "博主链接", "蒲公英/LINK", "蒲公英link", "ID/Link", "蒲公英链接/星图链接", "pgy_url"],
  "主页链接": ["主页链接", "小红书主页", "小红书链接", "profile_url"],
  "小红书号": ["小红书号", "红书号", "小红书ID", "小红书账号", "小红书号ID", "redId", "red_id", "redID", "redBookId", "redbookId", "red_book_id", "xiaohongshuId", "xiaohongshu_id", "xhsId", "xhs_id"],
  "粉丝数": ["粉丝数", "粉丝量", "followers_count", "fansNum", "fansCount", "fans_count", "followerCount", "followersCount"],
  "粉丝数w": ["粉丝数w", "粉丝量（w）", "粉丝数(w）", "粉丝数（w）", "粉丝量(w)", "粉丝量（万）", "粉丝数（万）", "粉丝数万", "粉丝量级", "账号量级", "followers_w"],
  "获赞与收藏": ["获赞与收藏", "赞藏数", "赞藏量", "赞藏数（万）", "liked_collected_count", "likeCollectCountInfo", "likedCollectedCount", "likeCollectCount"],
  "平台报价": ["平台报价", "报价", "合作报价", "图文报价", "quote_price", "picturePrice", "quotePrice", "imageQuotePrice", "picPrice", "price"],
  "图文报价": ["图文报价", "图文笔记一口价", "图文笔记一口价(含平台服务费)", "图文笔记报价", "图文价格", "图文裸价", "报备图文", "报备图文裸价", "报备图文价格", "报备图文（不含平台服务费）", "报备图文 不含平台服务费", "图文价格（不含平台服务费）", "图文价格 不含平台服务费", "quote_price", "picturePrice", "quotePrice", "imageQuotePrice", "picPrice"],
  "视频报价": ["视频报价", "视频笔记一口价", "视频笔记一口价(含平台服务费)", "视频笔记报价", "视频价格", "视频裸价", "报备视频裸价", "报备视频价格", "报备视频价格（不含平台服务费）", "报备视频价格 不含平台服务费", "视频价格（不含平台服务费）", "视频价格 不含平台服务费", "video_quote_price", "videoPrice"],
  "笔记类型": ["笔记类型", "内容形式", "note_type", "noteType", "contentType"],
  "博主类型": ["博主类型", "达人类型", "内容类型", "达人主类型", "账号主类型", "内容主类型", "主要内容形式", "主要笔记形式", "主发形式", "主发类型", "作品形式", "发布形式", "图文/视频", "图文或视频", "creator_type", "blogger_type", "primary_note_type", "primary_content_type"],
  "合作订单数": ["合作订单数", "已合作订单数", "商单数", "商业笔记数", "cooperation_order_count", "progressOrderCnt", "cooperationOrderCnt", "coopOrderCnt", "orderCnt", "orderCount", "completedOrderCnt", "finishOrderCnt"],
  "已合作笔记数": ["已合作笔记数", "已合作笔记", "合作笔记数", "商业笔记数", "cooperation_note_count", "businessNoteCount", "cooperatedNoteCnt", "cooperationNoteCnt", "businessNoteCnt", "bizNoteCnt", "noteCooperateCnt", "progressNoteCnt", "finishedNoteCnt", "coopNoteNum30d", "progressOrderCnt"],
  "曝光中位数（日常）": ["曝光中位数（日常）", "日常曝光中位数", "曝光量", "预估曝光量", "达人历史平均曝光量", "达人历史 平均曝光量", "达人历史平均曝光量/阅读量/互动总量", "daily_exposure_median", "accumCommonImpMedinNum30d", "impMedian", "mAccumImpNum", "exposureMedian"],
  "阅读中位数（日常）": ["阅读中位数（日常）", "阅读中位数", "日常阅读中位数", "阅读量", "平均阅读量", "达人历史平均阅读量", "达人历史/平均阅读量", "达人历史 平均阅读量", "平均播放量/阅读量", "达人历史平均曝光量/阅读量/互动总量", "daily_read_median", "clickMidNum", "readMedian", "readMedianNum"],
  "互动中位数（日常）": ["互动中位数（日常）", "日常互动中位数", "互动", "预估互动", "平均互动量", "达人历史平均互动总量", "达人历史 平均互动总量", "达人历史平均曝光量/阅读量/互动总量", "daily_interaction_median", "mEngagementNum", "mengagementNum", "interactionMedian"],
  "曝光中位数（合作）": ["曝光中位数（合作）", "合作曝光中位数", "曝光中位数（合作30天）", "曝光中位数 合作30天", "合作30天曝光中位数", "合作曝光30天", "cooperation_exposure_median", "accumCoopImpMedinNum30d"],
  "阅读中位数（合作）": ["阅读中位数（合作）", "合作阅读中位数", "阅读中位数（合作30天）", "阅读中位数 合作30天", "合作30天阅读中位数", "图文3s阅读（合作30天）", "图文3s阅读 合作30天", "cooperation_read_median", "readMidCoop30"],
  "互动中位数（合作）": ["互动中位数（合作）", "合作互动中位数", "互动中位数（合作30天）", "互动中位数 合作30天", "合作30天互动中位数", "cooperation_interaction_median", "interMidCoop30"],
  "图文预估阅读单价": ["图文预估阅读单价", "图文笔记阅读单价", "图文阅读单价", "CPR（图文）", "图文CPR", "image_read_unit_price", "pictureReadCost", "pictureReadUnitPrice", "imageReadUnitPrice"],
  "图文预估互动单价": ["图文预估互动单价", "图文笔记互动单价", "图文互动单价", "CPE（图文）", "图文CPE", "image_interaction_unit_price", "estimatePictureEngageCost", "pictureInteractionUnitPrice", "imageInteractionUnitPrice"],
  "视频预估阅读单价": ["视频预估阅读单价", "视频笔记阅读单价", "视频阅读单价", "CPR（视频）", "视频CPR", "video_read_unit_price", "videoReadCost", "videoReadCostV2", "videoReadUnitPrice"],
  "视频预估互动单价": ["视频预估互动单价", "视频笔记互动单价", "视频互动单价", "CPE（视频）", "视频CPE", "video_interaction_unit_price", "estimateVideoEngageCost", "videoInteractionUnitPrice"],
  "完播率": ["完播率", "视频完播率", "视频播放完成率", "视频完播率（合作30天）", "视频完播率 合作30天", "video_completion_rate", "videoFullViewRate", "videoFullViewRate30", "videoFinishRate", "video_finish_rate", "video_complete_rate"],
  "图文3秒阅读率": ["图文3秒阅读率", "图文3s阅读率", "图文3秒读完率", "图文3s读完率", "图文3秒阅读", "图文3s阅读", "3秒阅读率", "3s阅读率", "picture_3s_read_rate", "picture3sViewRate", "picture3sViewRate30", "picture3sReadRate", "pictureThreeSecondReadRate", "pic3sReadRate"],
  "CPM": ["CPM", "cpm", "CPM（视频）", "CPM（图文）", "视频CPM", "图文CPM", "estimatePictureCpm", "estimateVideoCpm"],
  "CPE": ["CPE", "cpe", "互动成本", "互动单价", "CPE（视频）", "CPE（图文）", "视频CPE", "图文CPE"],
  "邀约48h回复率": ["邀约48h回复率", "邀约48小时回复率", "回复率", "reply_rate_48h", "inviteReply48hNumRatio", "responseRate", "replyRate48h"],
  "账号类型": ["账号类型", "博主类目", "博主标签", "账号标签", "内容标签", "creator_category", "categoryName", "category", "contentTags", "tradeType", "industryTag", "type"],
  "自定义标签": ["自定义标签", "标签", "达人标签", "用户标签", "customTags", "custom_tags"],
  "IP城市": ["IP城市", "城市", "地域", "地理位置", "ip_city", "location", "city"],
  "所属机构": ["所属机构", "机构", "MCN", "mcnName", "mcn_name", "agencyName", "organizationName", "orgName", "companyName", "bloggerCompany", "organization_name"],
  "数据来源": ["数据来源", "source"],
  "采集时间": ["采集时间", "添加时间", "collected_at"],
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
  "<18粉丝占比": ["<18粉丝占比", "年龄分布-<18", "18岁以下粉丝占比", "fans_under_18_ratio", "fans_0_17_ratio", "fans_lt_18_ratio"],
  "18-24粉丝占比": ["18-24粉丝占比", "18~24粉丝占比", "18～24粉丝占比", "年龄分布-18-24", "18-24岁粉丝占比", "18~24岁粉丝占比", "18至24岁粉丝占比", "fans_18_24_ratio"],
  "25-34粉丝占比": ["25-34粉丝占比", "25~34粉丝占比", "25～34粉丝占比", "年龄分布-25-34", "25-34岁粉丝占比", "25~34岁粉丝占比", "25至34岁粉丝占比", "fans_25_34_ratio"],
  "35-44粉丝占比": ["35-44粉丝占比", "35~44粉丝占比", "35～44粉丝占比", "年龄分布-35-44", "35-44岁粉丝占比", "35~44岁粉丝占比", "35至44岁粉丝占比", "fans_35_44_ratio"],
  "44岁以上粉丝占比": ["44岁以上粉丝占比", "fans_44_plus_ratio"],
  "35岁以上粉丝占比": ["35岁以上粉丝占比", "fans_35_plus_ratio"],
  "活跃粉丝占比": ["活跃粉丝占比", "active_fans_ratio", "fansActiveIn28dLv"],
  "阅读粉丝占比": ["阅读粉丝占比", "read_fans_ratio"],
  "互动粉丝占比": ["互动粉丝占比", "interaction_fans_ratio", "fansEngageNum30dLv"],
  "下单粉丝占比": ["下单粉丝占比", "order_fans_ratio"],
  "粉丝增长率": ["粉丝增长率", "粉丝量变化幅度", "粉丝变化幅度", "涨粉率", "粉丝增长率30天", "fans_growth_ratio", "fansGrowthRate", "fans30GrowthRate", "fans_growth_rate"],
  "粉丝性别分布": ["粉丝性别分布", "audience_gender_distribution"],
  "粉丝年龄分布": ["粉丝年龄分布", "audience_age_distribution"],
  "粉丝地域分布": ["粉丝地域分布", "audience_region_distribution"],
  "粉丝城市分布": ["粉丝城市分布", "audience_city_distribution", "cityDistribution", "city_distribution"],
  "用户设备分布": ["用户设备分布", "audience_device_distribution"],
  "用户兴趣": ["用户兴趣", "topic_point"],
  "用户兴趣分布": ["用户兴趣分布", "audience_interest_distribution", "interestDistribution", "interest_distribution"],
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
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[()\[\]{}<>《》【】「」『』_\-\s/\\.:：，,。、;；|｜"'“”‘’]/g, "");
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

function fallbackRedIdValue(row) {
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row;
  const direct = nestedValue(raw, ["redId", "red_id", "redID", "redBookId", "redbookId", "red_book_id", "xiaohongshuId", "xiaohongshu_id", "xhsId", "xhs_id"]);
  if (direct) return direct;
  const byKey = deepFindByKeyPattern(raw, (key) => /^(red_?id|redbook_?id|xiaohongshu_?id|xhs_?id)$/i.test(key));
  if (byKey) return byKey;
  const text = cellText(raw?.detail_text || raw?.raw_text || raw?.text || "");
  const match = text.match(/(?:小红书号|红书号|小红书ID|小红书账号)\s*[:：]?\s*([A-Za-z0-9._-]{3,})/i);
  return match ? match[1] : "";
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

function normalizedCreatorNoteType(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "视频" : "图文";
  if (typeof value === "number") {
    if (value === 1) return "图文";
    if (value === 2) return "视频";
  }
  const text = cellText(value).trim().toLowerCase();
  if (!text) return "";
  if (/视频|video|动态/.test(text)) return "视频";
  if (/图文|图片|image|picture|photo/.test(text)) return "图文";
  if (/^1(?:\.0+)?$/.test(text)) return "图文";
  if (/^2(?:\.0+)?$/.test(text)) return "视频";
  return "";
}

function noteCaseCreatorType(note) {
  if (!note || typeof note !== "object") return "";
  const explicit = firstDefined(note.note_type, note.noteType, note.content_type, note.contentType, note.media_type, note.mediaType, note.type);
  const normalized = normalizedCreatorNoteType(explicit);
  if (normalized) return normalized;
  if (typeof note.isVideo === "boolean") return note.isVideo ? "视频" : "图文";
  if (typeof note.is_video === "boolean") return note.is_video ? "视频" : "图文";
  return "";
}

function creatorTypeFromDetail(detail) {
  const raw = detail?.raw_payload && typeof detail.raw_payload === "object" ? detail.raw_payload : {};
  const notes = [raw.note_cases, raw.recent_notes, raw.recent_note_briefs, raw.noteList]
    .find((items) => Array.isArray(items) && items.length) || [];
  let pictureCount = 0;
  let videoCount = 0;
  let latestType = "";
  for (const note of notes) {
    const type = noteCaseCreatorType(note);
    if (!type) continue;
    if (!latestType) latestType = type;
    if (type === "视频") videoCount += 1;
    if (type === "图文") pictureCount += 1;
  }
  if (pictureCount > videoCount) return "图文";
  if (videoCount > pictureCount) return "视频";
  if (pictureCount && videoCount) return latestType;
  return pictureCount ? "图文" : videoCount ? "视频" : "";
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
  const cleanId = cleanPgyUserId(userId);
  return cleanId ? `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${cleanId}` : "";
}

function profileUrl(userId) {
  const cleanId = cleanPgyUserId(userId);
  return cleanId ? `https://www.xiaohongshu.com/user/profile/${cleanId}` : "";
}

function normalizeExportRow(row) {
  const raw = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row;
  const userId = cleanPgyUserId(valueByAliases(row, "达人ID") || nestedValue(raw, ["userId", "user_id", "bloggerId", "blogger_id", "kolId", "kol_id"]));
  const nickname = valueByAliases(row, "达人昵称") || nestedValue(raw, ["name", "nickName", "nickname"]);
  const followers = valueByAliases(row, "粉丝数") || fallbackFollowersValue(row);
  const followersNumber = numericValue(followers);
  const output = {
    "达人ID": String(row?.creator_id || (userId ? `pgy-api:${userId}` : "")),
    "达人昵称": nickname || "",
    "达人名称": valueByAliases(row, "达人名称") || nickname || "",
    "蒲公英链接": valueByAliases(row, "蒲公英链接") || row?.pgy_url || detailUrl(userId),
    "主页链接": valueByAliases(row, "主页链接") || row?.profile_url || profileUrl(userId),
    "小红书号": valueByAliases(row, "小红书号") || fallbackRedIdValue(row),
    "粉丝数": followersNumber,
    "粉丝数w": valueByAliases(row, "粉丝数w") || (Number(followersNumber) ? Math.round((Number(followersNumber) / 10000) * 10000) / 10000 : ""),
    "获赞与收藏": numericValue(valueByAliases(row, "获赞与收藏") || fallbackLikedCollectedValue(row)),
    "平台报价": numericValue(valueByAliases(row, "平台报价")),
    "图文报价": numericValue(valueByAliases(row, "图文报价")),
    "视频报价": numericValue(valueByAliases(row, "视频报价")),
    "完播率": valueByAliases(row, "完播率"),
    "CPM": numericValue(valueByAliases(row, "CPM")),
    "CPE": numericValue(valueByAliases(row, "CPE")),
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
    "图文3秒阅读率": valueByAliases(row, "图文3秒阅读率"),
    "粉丝增长率": valueByAliases(row, "粉丝增长率"),
    "账号类型": compactTagText(valueByAliases(row, "账号类型") || rawValueByKeys(row, ["contentTags", "tradeType", "industryTag", "type"])),
    "IP城市": valueByAliases(row, "IP城市"),
    "数据来源": valueByAliases(row, "数据来源") || "pgy_browser_extension",
    "采集时间": valueByAliases(row, "采集时间") || new Date().toISOString().slice(0, 19).replace("T", " "),
    "蒲公英原始JSON": typeof raw === "object" ? JSON.stringify(raw) : String(raw || "")
  };
  return { ...row, ...output };
}

function rowsToCsv(rows) {
  const normalized = rows.map(normalizeExportRow);
  const lines = referenceExportHeaderRows().map((line) => line.map(escapeCsvCell).join(","));
  for (const row of normalized) {
    lines.push(REFERENCE_EXPORT_COLUMNS.map((column) => escapeCsvCell(valueForReferenceColumn(row, column))).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function exportCsvFilename(count) {
  const now = new Date();
  const part = (value) => String(value).padStart(2, "0");
  const time = `${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}-${part(now.getMinutes())}-${part(now.getSeconds())}`;
  return `蒲公英达人导出-${Number(count || 0)}人-${time}.csv`;
}

function exportXlsxFilename(count) {
  return exportCsvFilename(count).replace(/\.csv$/i, ".xlsx");
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFiles(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const entries = [];
  let offset = 0;
  const append = (value) => {
    parts.push(value);
    offset += value.length;
  };
  const writeUint16 = (view, position, value) => view.setUint16(position, value, true);
  const writeUint32 = (view, position, value) => view.setUint32(position, value >>> 0, true);

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.content === "string" ? utf8Bytes(file.content) : file.content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, data.length);
    writeUint32(localView, 22, data.length);
    writeUint16(localView, 26, name.length);
    local.set(name, 30);
    append(local);
    append(data);
    entries.push({ name, data, crc, offset: offset - local.length - data.length });
  }

  const centralStart = offset;
  for (const entry of entries) {
    const central = new Uint8Array(46 + entry.name.length);
    const centralView = new DataView(central.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint32(centralView, 16, entry.crc);
    writeUint32(centralView, 20, entry.data.length);
    writeUint32(centralView, 24, entry.data.length);
    writeUint16(centralView, 28, entry.name.length);
    writeUint32(centralView, 42, entry.offset);
    central.set(entry.name, 46);
    append(central);
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, offset - centralStart);
  writeUint32(endView, 16, centralStart);
  append(end);
  const size = parts.reduce((total, part) => total + part.length, 0);
  const archive = new Uint8Array(size);
  let position = 0;
  for (const part of parts) {
    archive.set(part, position);
    position += part.length;
  }
  return archive;
}

function referenceHeaderMergeRanges() {
  const rows = referenceExportHeaderRows();
  const ranges = [];
  for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let columnIndex = 0; columnIndex < row.length;) {
      if (!row[columnIndex]) {
        columnIndex += 1;
        continue;
      }
      let end = columnIndex + 1;
      while (end < row.length && !row[end]) end += 1;
      if (end - columnIndex > 1) {
        ranges.push(`${columnName(columnIndex + 1)}${rowIndex + 1}:${columnName(end)}${rowIndex + 1}`);
      }
      columnIndex = end;
    }
  }
  return ranges;
}

function xlsxCell(columnIndex, rowIndex, value, styleIndex = 0) {
  if (value === null || value === undefined || value === "") return "";
  const ref = `${columnName(columnIndex)}${rowIndex}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${styleIndex}"><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" s="${styleIndex}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" s="${styleIndex}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cellText(value))}</t></is></c>`;
}

function columnWidth(column) {
  const name = cellText(column);
  if (/(JSON|链接|主页|备注|IP城市|数据来源)/.test(name)) return 24;
  if (/(添加时间|采集时间)/.test(name)) return 20;
  if (/(达人|博主|昵称|名称|人设|内容|机构)/.test(name)) return 16;
  return 14;
}

function rowsToXlsx(rows) {
  const headers = referenceExportHeaderRows();
  const columns = REFERENCE_EXPORT_COLUMNS;
  const rowXml = headers.map((row, rowIndex) => `<row r="${rowIndex + 1}" ht="24" customHeight="1">${row.map((value, columnIndex) => xlsxCell(columnIndex + 1, rowIndex + 1, value, 1)).join("")}</row>`);
  rows.forEach((row, rowIndex) => {
    const cells = columns.map((column, columnIndex) => xlsxCell(columnIndex + 1, rowIndex + 4, valueForReferenceColumn(row, column), 0)).join("");
    rowXml.push(`<row r="${rowIndex + 4}">${cells}</row>`);
  });
  const merges = referenceHeaderMergeRanges().map((range) => `<mergeCell ref="${range}"/>`).join("");
  const columnsXml = columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${columnWidth(column)}" customWidth="1"/>`).join("");
  const lastColumn = columnName(columns.length);
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${columnsXml}</cols><sheetData>${rowXml.join("")}</sheetData><mergeCells count="${referenceHeaderMergeRanges().length}">${merges}</mergeCells><autoFilter ref="A3:${lastColumn}${Math.max(3, rows.length + 3)}"/></worksheet>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf></cellXfs></styleSheet>`;
  return zipFiles([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="达人数据" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: stylesXml },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml }
  ]);
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

function bytesToBase64(bytes) {
  const parts = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(parts.join(""));
}

function binaryDownloadUrl(bytes, contentType) {
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}

function dataUrlBytes(dataUrl) {
  return base64ToBytes(dataUrlBase64(dataUrl));
}

function dataUrlBlob(dataUrl, fallbackType = "image/png") {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?;base64,(.*)$/);
  const contentType = match?.[1] || fallbackType;
  const bytes = new Uint8Array(base64ToBytes(match?.[2] || dataUrlBase64(dataUrl)));
  return new Blob([bytes], { type: contentType });
}

function nowLocalText() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function extractPgyUserId(row) {
  const direct = valueByAliases(row, "达人ID");
  const url = valueByAliases(row, "蒲公英链接") || row?.pgy_url || "";
  const urlText = cellText(url);
  const urlMatch = urlText.match(/(?:blogger-detail\/|pgy-api:)([A-Za-z0-9_-]{6,})/);
  if (urlMatch) return urlMatch[1];

  const idCandidates = [direct, row?.creator_id, row?.userId, row?.bloggerId, row?.kolId];
  for (const candidate of idCandidates) {
    const text = cellText(candidate).trim();
    if (!text || /^https?:\/\//i.test(text) || text.includes(".")) continue;
    const directMatch = text.match(/^(?:pgy-api:)?([A-Za-z0-9_-]{6,})$/);
    if (directMatch) return directMatch[1];
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

async function feishuFormFetch(path, { token, form, params = null } = {}) {
  const url = new URL(`${FEISHU_BASE}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== 0) {
    throw new FeishuApiError(feishuPayloadMessage(payload, `飞书接口失败：HTTP ${response.status}`), {
      status: response.status,
      payload,
      url: url.toString()
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

async function getFeishuDocumentTitle(token, docToken, docType) {
  try {
    const data = docType === "bitable"
      ? await feishuFetch(`/bitable/v1/apps/${docToken}`, { token })
      : await feishuFetch(`/sheets/v3/spreadsheets/${docToken}`, { token });
    const meta = data.app || data.spreadsheet || data;
    const title = meta.name || meta.title || "";
    if (title) return title;
  } catch {}
  try {
    const data = await feishuFetch("/drive/v1/metas/batch_query", {
      token,
      method: "POST",
      body: { request_docs: [{ doc_token: docToken, doc_type: docType }] }
    });
    const meta = (data.metas || data.items || [])[0] || {};
    return meta.title || meta.name || "";
  } catch {
    return "";
  }
}

async function inspectFeishuTableConfig(options) {
  const appId = String(options.feishuAppId || "").trim();
  const appSecret = String(options.feishuAppSecret || "").trim();
  const feishuUrl = String(options.feishuUrl || "").trim();
  if (!appId || !appSecret || !feishuUrl) throw new Error("请先填写飞书 App ID、App Secret 和表格链接。");
  const token = await tenantToken(appId, appSecret);
  const initial = parseFeishuUrl(feishuUrl);
  let wikiTitle = "";
  if (initial.resourceType === "wiki") {
    const data = await feishuFetch("/wiki/v2/spaces/get_node", { token, params: { token: initial.token } });
    wikiTitle = data.node?.title || data.title || "";
  }
  const parsed = await resolveWikiTarget(initial, token);
  if (parsed.resourceType === "bitable") {
    const tables = await listBitableTables(token, parsed.token);
    if (!tables.length) throw new Error("目标飞书多维表格没有可用子表。");
    const tableName = wikiTitle || await getFeishuDocumentTitle(token, parsed.token, "bitable");
    if (!tableName) throw new Error("已读取子表，但未获取到飞书表格原始名称，请确认应用具备云文档读取权限。");
    return {
      ok: true,
      resourceType: "bitable",
      tableName,
      sheets: tables.map((table) => ({ sheetId: table.table_id || table.id, title: table.name || table.title || table.table_id || table.id }))
    };
  }
  if (parsed.resourceType !== "sheet") throw new Error("当前仅支持飞书电子表格或多维表格。");
  const sheets = await listSheets(token, parsed.token);
  if (!sheets.length) throw new Error("目标飞书电子表格没有可用子表。");
  const tableName = wikiTitle || await getFeishuDocumentTitle(token, parsed.token, "sheet");
  if (!tableName) throw new Error("已读取子表，但未获取到飞书表格原始名称，请确认应用具备云文档读取权限。");
  return {
    ok: true,
    resourceType: "sheet",
    tableName,
    sheets: sheets.map((sheet) => ({ sheetId: sheet.sheet_id || sheet.id, title: sheet.title || sheet.name || sheet.sheet_id || sheet.id }))
  };
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

async function readSheetRowValues(token, spreadsheetToken, sheetId, rowNumber, startColumnIndex, endColumnIndex) {
  const startColumn = columnName(startColumnIndex + 1);
  const endColumn = columnName(endColumnIndex + 1);
  const values = await readSheetValues(token, spreadsheetToken, sheetId, `${startColumn}${rowNumber}:${endColumn}${rowNumber}`);
  return values[0] || [];
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

function exportFieldsForRows(rows, options = {}) {
  const detailFieldSet = new Set(DETAIL_FIELDS);
  const fields = REFERENCE_EXPORT_COLUMNS
    .filter((column) => {
      if (!detailFieldSet.has(column.canonicalField)) return true;
      if (options.collectionMode === "fast") return false;
      return (rows || []).some((row) => nonEmptyCell(rowValueForMappedColumn(row, column)));
    })
    .map((column) => column.fieldName);
  if ((rows || []).some((row) => nonEmptyCell(valueForCanonicalField(row, "自定义标签")))) {
    fields.push("自定义标签");
  }
  return fields;
}

async function writeSheetHeader(token, spreadsheetToken, sheetId, rows) {
  const fields = REFERENCE_EXPORT_COLUMNS;
  const endColumn = columnName(fields.length);
  await feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values`, {
    token,
    method: "PUT",
    body: {
      valueRange: {
        range: `${sheetId}!A1:${endColumn}${REFERENCE_EXPORT_HEADER_ROWS.length}`,
        values: referenceExportHeaderRows()
      }
    }
  });
  return fields.map((field) => ({
    fieldName: field.fieldName,
    canonicalField: field.canonicalField,
    columnIndex: field.columnIndex
  }));
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

async function ensureMappedSheetShape(token, spreadsheetToken, sheetId, values, rows, options = {}) {
  const requiredFields = exportFieldsForRows(rows, options);
  if (!effectiveSheetWidth(values)) {
    await writeSheetHeader(token, spreadsheetToken, sheetId, rows);
    return referenceExportShape();
  }

  let shape = detectSheetShape(values);
  const existing = new Set();
  for (const column of shape.columns) {
    if (column.fieldName) existing.add(normalizeKey(column.fieldName));
    if (column.canonicalField) existing.add(`canonical:${column.canonicalField}`);
    column.writable = Boolean(column.canonicalField) || rows.some((row) => {
      const value = rowValueForField(row, column.fieldName);
      return value !== undefined && value !== null && value !== "";
    });
  }

  const missingFields = requiredFields.filter((fieldName) => {
    const canonicalField = canonicalFieldForHeader(fieldName) || fieldName;
    if (existing.has(normalizeKey(fieldName))) return false;
    if (existing.has(`canonical:${canonicalField}`)) return false;
    return true;
  });

  if (missingFields.length) {
    const startColumn = shape.columns.length + 1;
    const endColumn = startColumn + missingFields.length - 1;
    const headerWriteRow = shapeHeaderWriteRow(shape);
    await feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values`, {
      token,
      method: "PUT",
      body: {
        valueRange: {
          range: `${sheetId}!${columnName(startColumn)}${headerWriteRow}:${columnName(endColumn)}${headerWriteRow}`,
          values: [missingFields]
        }
      }
    });
    const nextValues = values.map((line) => [...(line || [])]);
    while (nextValues.length < headerWriteRow) nextValues.push([]);
    const headerLine = nextValues[headerWriteRow - 1];
    for (let index = 0; index < missingFields.length; index += 1) {
      headerLine[startColumn - 1 + index] = missingFields[index];
    }
    shape = detectSheetShape(nextValues);
  }

  for (const column of shape.columns) {
    if (column.writable !== undefined) continue;
    column.writable = Boolean(column.canonicalField) || rows.some((row) => {
      const value = rowValueForField(row, column.fieldName);
      return value !== undefined && value !== null && value !== "";
    });
  }

  return shape;
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

function rowValueForMappedColumn(row, column) {
  const normalized = normalizeExportRow(row);
  const referenceColumn = referenceColumnForFieldName(column?.fieldName || "");
  if (referenceColumn) return valueForReferenceColumn(normalized, referenceColumn);
  if (column?.canonicalField) {
    const value = valueForCanonicalField(normalized, column.canonicalField);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return rowValueForField(normalized, column?.fieldName || "");
}

async function appendMappedSheetRows(token, spreadsheetToken, sheetId, shape, rows) {
  const ordered = shape.columns.filter((column) => column.columnIndex >= 0 && column.writable !== false).sort((a, b) => a.columnIndex - b.columnIndex);
  if (!ordered.length) throw new Error("目标飞书表格没有可写入的表头列。");
  const start = Math.min(...ordered.map((field) => field.columnIndex)) + 1;
  const end = Math.max(...ordered.map((field) => field.columnIndex)) + 1;
  const values = rows.map((row) => {
    const line = Array(end - start + 1).fill("");
    for (const column of ordered) {
      line[column.columnIndex + 1 - start] = normalizeSheetWriteValue(rowValueForMappedColumn(row, column), column.fieldName || column.canonicalField || "");
    }
    return line;
  });
  return feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values_append`, {
    token,
    method: "POST",
    body: {
      valueRange: {
        range: `${sheetId}!${columnName(start)}${shape.dataStartRow}:${columnName(end)}${shape.dataStartRow + Math.max(0, rows.length - 1)}`,
        values
      }
    }
  });
}

async function writeSheetCells(token, spreadsheetToken, sheetId, fields, rowNumber, valuesByField) {
  const writes = Object.entries(valuesByField || {}).filter(([fieldName]) => fields.some((field) => field.fieldName === fieldName));
  for (const [fieldName, value] of writes) {
    const field = fields.find((item) => item.fieldName === fieldName);
    const column = columnName(field.columnIndex + 1);
    const normalizedValue = normalizeSheetWriteValue(value, fieldName);
    await feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values`, {
      token,
      method: "PUT",
      body: { valueRange: { range: `${sheetId}!${column}${rowNumber}:${column}${rowNumber}`, values: [[normalizedValue]] } }
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
  const normalizedValue = normalizeSheetWriteValue(value);
  return feishuFetch(`/sheets/v2/spreadsheets/${spreadsheetToken}/values`, {
    token,
    method: "PUT",
    body: { valueRange: { range: `${sheetId}!${column}${rowNumber}:${column}${rowNumber}`, values: [[normalizedValue]] } }
  });
}

function normalizeSheetWriteValue(value, fieldName = "") {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (isTagListField(fieldName)) {
    const tagText = compactTagText(value);
    if (tagText) return tagText;
  }
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

function isTagListField(fieldName = "") {
  return /账号类型|达人类型|达人标签|博主类目|博主标签|账号标签|内容类型|内容标签|博主人设/.test(String(fieldName || ""));
}

async function writeSheetCellByColumnBestEffort(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, value, fieldName = "") {
  const normalizedValue = normalizeSheetWriteValue(value, fieldName);
  try {
    await writeSheetCellByColumn(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, normalizedValue);
    return { ok: true };
  } catch (error) {
    const originalMessage = shortErrorMessage(error);
    await sleep(SHEET_WRITE_RETRY_DELAY_MS);
    try {
      await writeSheetCellByColumn(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, normalizedValue);
      return { ok: true, retried: true };
    } catch (retrySameError) {
      const retrySameMessage = shortErrorMessage(retrySameError);
    const fallbackValue = cellText(value) || jsonText(value);
    if (fallbackValue && fallbackValue !== normalizedValue) {
      try {
        await writeSheetCellByColumn(token, spreadsheetToken, sheetId, columnIndexValue, rowNumber, fallbackValue);
        return { ok: true, retried: true };
      } catch (retryError) {
          return { ok: false, message: `${fieldName || `第${columnIndexValue + 1}列`}未写入：${originalMessage}；重试失败：${retrySameMessage}；降级重试失败：${shortErrorMessage(retryError)}` };
      }
    }
      return { ok: false, message: `${fieldName || `第${columnIndexValue + 1}列`}未写入：${originalMessage}；重试失败：${retrySameMessage}` };
    }
  }
}

async function verifySheetTextWrites(token, spreadsheetToken, sheetId, rowNumber, writes) {
  if (!writes.length) return { confirmedCount: 0, failures: [] };
  const minColumn = Math.min(...writes.map((write) => write.column.columnIndex));
  const maxColumn = Math.max(...writes.map((write) => write.column.columnIndex));
  const failuresByColumn = new Map();
  let pending = writes.slice();
  let confirmedKeys = new Set();

  for (let attempt = 0; attempt <= SHEET_WRITE_VERIFY_RETRIES; attempt += 1) {
    await sleep(SHEET_WRITE_VERIFY_DELAY_MS);
    let rowValues = [];
    try {
      rowValues = await readSheetRowValues(token, spreadsheetToken, sheetId, rowNumber, minColumn, maxColumn);
    } catch (error) {
      if (attempt >= SHEET_WRITE_VERIFY_RETRIES) {
        for (const write of pending) {
          failuresByColumn.set(write.column.columnIndex, {
            column: write.column,
            value: write.value,
            message: `写后读回失败：${shortErrorMessage(error)}`
          });
        }
      }
      continue;
    }

    pending = pending.filter((write) => {
      const actual = rowValues[write.column.columnIndex - minColumn];
      const present = nonEmptyCell(actual);
      if (present) {
        confirmedKeys.add(String(write.column.columnIndex));
        failuresByColumn.delete(write.column.columnIndex);
      }
      return !present;
    });
    if (!pending.length) break;

    if (attempt < SHEET_WRITE_VERIFY_RETRIES) {
      for (const write of pending) {
        const retryResult = await writeSheetCellByColumnBestEffort(
          token,
          spreadsheetToken,
          sheetId,
          write.column.columnIndex,
          rowNumber,
          write.value,
          write.column.fieldName || write.column.canonicalField
        );
        if (!retryResult.ok) {
          failuresByColumn.set(write.column.columnIndex, {
            column: write.column,
            value: write.value,
            message: `读回为空，补写失败：${retryResult.message}`
          });
        }
      }
    }
  }

  for (const write of pending) {
    if (!confirmedKeys.has(String(write.column.columnIndex)) && !failuresByColumn.has(write.column.columnIndex)) {
      failuresByColumn.set(write.column.columnIndex, {
        column: write.column,
        value: write.value,
        message: "飞书写入接口返回成功，但读回仍为空，已尝试补写"
      });
    }
  }

  return {
    confirmedCount: writes.length - failuresByColumn.size,
    failures: Array.from(failuresByColumn.values())
  };
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
  if (!Array.isArray(values) || !values.length) return 0;
  const shape = detectSheetShape(values);
  const startIndex = Math.max(0, (shape.dataStartRow || 2) - 1);
  return values.slice(startIndex).filter((row) => (row || []).some(nonEmptyCell)).length;
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

function headerCellText(values, rowIndex, columnIndex) {
  const value = values[rowIndex]?.[columnIndex];
  if (nonEmptyCell(value)) return cellText(value).trim();
  for (let left = columnIndex - 1; left >= 0; left -= 1) {
    const leftValue = values[rowIndex]?.[left];
    if (nonEmptyCell(leftValue)) {
      const text = cellText(leftValue).trim();
      if (/(日常|合作|商单|商业|图文|视频|粉丝|报价|价格|达人|账号|小红书|蒲公英|笔记|画像|效果|基础信息|账号信息|达人信息|数据)/i.test(text)) return text;
      return "";
    }
  }
  return "";
}

function uniqueHeaderParts(parts) {
  const seen = new Set();
  const output = [];
  for (const part of parts) {
    const text = cellText(part).trim();
    if (!text) continue;
    const key = normalizeKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
}

function referenceExportHeaderRows() {
  return REFERENCE_EXPORT_HEADER_ROWS.map((row) => row.slice());
}

function buildReferenceExportColumns() {
  return REFERENCE_EXPORT_HEADER_ROWS[2].map((leafHeader, index) => {
    const parts = [];
    for (let rowIndex = 0; rowIndex < REFERENCE_EXPORT_HEADER_ROWS.length; rowIndex += 1) {
      const text = headerCellText(REFERENCE_EXPORT_HEADER_ROWS, rowIndex, index);
      if (text) parts.push(text);
    }
    const uniqueParts = uniqueHeaderParts(parts);
    const fieldName = uniqueParts.join(" / ") || `Col${index + 1}`;
    const contextHeader = uniqueParts.slice(0, -1).join(" / ");
    return {
      fieldName,
      leafHeader: leafHeader || uniqueParts[uniqueParts.length - 1] || fieldName,
      contextHeader,
      canonicalField: canonicalFieldForHeader(leafHeader, contextHeader) || canonicalFieldForHeader(fieldName),
      columnIndex: index
    };
  });
}

const REFERENCE_EXPORT_COLUMNS = buildReferenceExportColumns();
const REFERENCE_EXPORT_FIELD_MAP = new Map();
for (const column of REFERENCE_EXPORT_COLUMNS) {
  REFERENCE_EXPORT_FIELD_MAP.set(normalizeKey(column.fieldName), column);
  if (!REFERENCE_EXPORT_FIELD_MAP.has(normalizeKey(column.leafHeader))) {
    REFERENCE_EXPORT_FIELD_MAP.set(normalizeKey(column.leafHeader), column);
  }
}

function referenceExportFieldNames() {
  return REFERENCE_EXPORT_COLUMNS.map((column) => column.fieldName);
}

function referenceColumnForFieldName(fieldName) {
  return REFERENCE_EXPORT_FIELD_MAP.get(normalizeKey(fieldName)) || null;
}

function referenceExportShape() {
  return {
    headerRows: REFERENCE_EXPORT_HEADER_ROWS.length,
    headerStartRow: 1,
    dataStartRow: REFERENCE_EXPORT_HEADER_ROWS.length + 1,
    columns: REFERENCE_EXPORT_COLUMNS.map((column) => ({
      fieldName: column.fieldName,
      canonicalField: column.canonicalField,
      columnIndex: column.columnIndex,
      writable: true
    })),
    mappedCount: REFERENCE_EXPORT_COLUMNS.filter((column) => column.canonicalField).length
  };
}

function headerShapeScore(shape, values) {
  const mapped = shape.columns.filter((column) => column.canonicalField).length;
  const width = Math.max(1, shape.columns.length);
  const identityFields = new Set(["达人ID", "达人昵称", "达人名称", "蒲公英链接", "主页链接", "小红书号"]);
  const identityMapped = shape.columns.filter((column) => identityFields.has(column.canonicalField)).length;
  const mappedFields = shape.columns.map((column) => column.canonicalField).filter(Boolean);
  const duplicatePenalty = mappedFields.length - new Set(mappedFields).size;
  const dataRows = (values || []).slice(shape.dataStartRow - 1, shape.dataStartRow + 9);
  const dataDensity = dataRows.reduce((count, row) => count + (row || []).filter(nonEmptyCell).length, 0);
  return mapped * 12 + identityMapped * 8 + Math.min(width, 80) + Math.min(dataDensity, 120) / 10 - duplicatePenalty * 2 - (shape.headerRows - 1) * 1.5;
}

function shapeHeaderWriteRow(shape) {
  return (shape?.headerStartRow || 1) + (shape?.headerRows || 1) - 1;
}

function canonicalAgeRatioFieldForHeader(header, context = "") {
  const raw = `${cellText(context)}${cellText(header)}`
    .normalize("NFKC")
    .replace(/[‐‑‒–—－]/g, "-")
    .replace(/[～]/g, "~")
    .replace(/\s+/g, "");
  const key = normalizeKey(raw);
  if (!raw && !key) return "";
  const hasRatioContext = /(粉丝|fans|follower|年龄|age|人群|画像|分布)/i.test(raw)
    && /(占比|比例|百分比|ratio|percent|%|分布|段)/i.test(raw);
  if (!hasRatioContext) return "";
  if (/(<18|小于18|未满18|18岁以下|0[-~至到]?17)/i.test(raw)) return "<18粉丝占比";
  if (/(18[-~至到]?24|18_?24|18岁?至24|18到24)/i.test(raw)) return "18-24粉丝占比";
  if (/(25[-~至到]?34|25_?34|25岁?至34|25到34)/i.test(raw)) return "25-34粉丝占比";
  if (/(35[-~至到]?44|35_?44|35岁?至44|35到44)/i.test(raw)) return "35-44粉丝占比";
  if (/(>44|44\+|44岁?(以上|及以上)|大于44|45岁?(以上|及以上))/i.test(raw)) return "44岁以上粉丝占比";
  if (/(>35|35\+|35岁?(以上|及以上)|大于35)/i.test(raw)) return "35岁以上粉丝占比";
  return "";
}

function semanticCanonicalFieldForHeader(header, context = "") {
  const headerText = cellText(header);
  const contextText = cellText(context);
  const raw = `${contextText}${headerText}`.normalize("NFKC").replace(/\s+/g, "");
  const leaf = headerText.normalize("NFKC").replace(/\s+/g, "");
  const key = normalizeKey(`${contextText}${headerText}`);
  const has = (pattern) => pattern.test(raw) || pattern.test(key);
  const leafHas = (pattern) => pattern.test(leaf) || pattern.test(normalizeKey(leaf));
  const isCoop = has(/合作|商单|商业|报备|蒲公英|近30天|30天|30d|case/i);
  const isDaily = has(/日常|自然|非合作|普通|常规|历史|平均/i) && !isCoop;
  const isVideo = has(/视频|video/i);
  const isImage = has(/图文|图片|笔记|image|picture/i) && !isVideo;
  const unsafeName = has(/清单|客户|反馈|进度|状态|阶段|备注|排期|沟通|需求|档期/);

  if (has(/蒲公英|pgy|pugongying/) && has(/主页|链接|link|url|详情/)) return "蒲公英链接";
  if (has(/小红书|红书|xhs|red/) && has(/主页|链接|link|url|profile/)) return "主页链接";
  if (has(/小红书号|红书号|小红书id|red_?id|xhs_?id|redbook_?id|red_book_id|xiaohongshu_?id/i)) return "小红书号";
  if (!unsafeName && has(/达人|博主|kol|账号|creator|blogger/i) && has(/昵称|名称|名字|name|nick/i)) return "达人昵称";
  if (has(/达人|博主|kol|账号|creator|blogger/i) && has(/\bid\b|编号|userid|bloggerid|creatorid|kolid/i)) return "达人ID";

  if (has(/粉丝|fans|follower/i) && has(/变化|幅度|增长|涨粉|增幅|growth/i)) return "粉丝增长率";
  if (has(/粉丝|fans|follower/i) && has(/画像|portrait/) && has(/截图|图片|image|screenshot/i)) return "粉丝画像截图";
  if (has(/笔记|数据|概览|overview/) && has(/截图|图片|image|screenshot/i)) return "笔记数据截图";
  if (has(/粉丝|fans|follower/i) && has(/画像|portrait|文本|文案|摘要|text/i)) return "粉丝画像文本";
  if (has(/笔记|数据|概览|overview/) && has(/文本|文案|摘要|text/i)) return "笔记数据文本";
  const ageRatioField = canonicalAgeRatioFieldForHeader(header, context);
  if (ageRatioField) return ageRatioField;
  if (has(/女性|女粉|女/) && has(/粉丝|fans|占比|比例|ratio/i)) return "女性粉丝占比";
  if (has(/男性|男粉|男/) && has(/粉丝|fans|占比|比例|ratio/i)) return "男性粉丝占比";
  if (has(/18[-~至到]?24岁?|18_?24/i) && has(/粉丝|fans|占比|比例|ratio/i)) return "18-24粉丝占比";
  if (has(/25[-~至到]?34岁?|25_?34/i) && has(/粉丝|fans|占比|比例|ratio/i)) return "25-34粉丝占比";
  if (has(/35[-~至到]?44岁?|35_?44/i) && has(/粉丝|fans|占比|比例|ratio/i)) return "35-44粉丝占比";
  if (has(/44岁?(以上|\+)|44plus|44_plus/i) && has(/粉丝|fans|占比|比例|ratio/i)) return "44岁以上粉丝占比";
  if (has(/35岁?(以上|\+)|35plus|35_plus/i) && has(/粉丝|fans|占比|比例|ratio/i)) return "35岁以上粉丝占比";
  if (has(/活跃|active/) && has(/粉丝|fans|占比|比例|ratio/i)) return "活跃粉丝占比";
  if (has(/阅读|read/) && has(/粉丝|fans|占比|比例|ratio/i)) return "阅读粉丝占比";
  if (has(/互动|engage|interaction/) && has(/粉丝|fans|占比|比例|ratio/i)) return "互动粉丝占比";
  if (has(/下单|订单|order/) && has(/粉丝|fans|占比|比例|ratio/i)) return "下单粉丝占比";
  if (has(/性别|gender/) && has(/分布|distribution/i)) return "粉丝性别分布";
  if (has(/年龄|age/) && has(/分布|distribution/i)) return "粉丝年龄分布";
  if (has(/地域|地区|城市|region|area/) && has(/分布|distribution/i)) return "粉丝地域分布";
  if (has(/设备|device/) && has(/分布|distribution/i)) return "用户设备分布";
  if (has(/兴趣|话题|内容偏好|topic|interest/i)) return "用户兴趣";
  if (has(/近?7天|7d/i) && has(/活跃|active/)) return "近7天活跃天数";
  if (has(/粉丝|fans|follower/i) && !has(/画像|占比|比例|增长|变化|幅度|维度|趋势|分布|活跃|阅读|互动|下单|性别|年龄|地域|设备|兴趣|growth|ratio|distribution/i)) {
    if (has(/w|万|量级/)) return "粉丝数w";
    return "粉丝数";
  }

  if (has(/赞藏|获赞|收藏|点赞|like|collect/i)) return "获赞与收藏";
  if (has(/报价|价格|刊例|裸价|一口价|quote|price/i)) {
    if (isVideo) return "视频报价";
    if (isImage) return "图文报价";
    return "平台报价";
  }
  if (has(/完播|播放完成|completion|fullview/i)) return "完播率";
  if (has(/图文|图片|picture|image/i) && has(/3秒|3s|three.?second/i) && has(/阅读|read|view/i)) return "图文3秒阅读率";
  if (leafHas(/cpm/i)) return "CPM";
  if (leafHas(/cpr|阅读单价|阅读成本|readcost/i)) {
    if (isVideo) return "视频预估阅读单价";
    if (isImage) return "图文预估阅读单价";
  }
  if (leafHas(/cpe|互动单价|互动成本|engagecost|interactioncost/i)) {
    if (isVideo) return "视频预估互动单价";
    if (isImage) return "图文预估互动单价";
    return "CPE";
  }

  if (has(/曝光|展现|imp|impression|exposure/i)) return isCoop ? "曝光中位数（合作）" : "曝光中位数（日常）";
  if (has(/阅读|播放|read|view/i)) return isCoop ? "阅读中位数（合作）" : "阅读中位数（日常）";
  if (has(/互动|engage|interaction/i)) return isCoop ? "互动中位数（合作）" : "互动中位数（日常）";
  if (has(/合作|商单|订单|order/i) && has(/数|量|count|cnt/i)) return "合作订单数";
  if (has(/合作|商单|商业/) && has(/笔记|note/) && has(/数|量|count|cnt/i)) return "已合作笔记数";
  if (has(/回复率|48h|48小时|response|reply/i)) return "邀约48h回复率";
  if (leafHas(/^(标签|达人标签|自定义标签|用户标签|custom_?tags?)$/i)) return "自定义标签";
  const creatorTypeSubject = has(/博主|达人|账号|作者|创作者|creator|blogger|kol/i);
  const creatorTypeMeaning = has(/主类型|主要类型|主发|主做|主攻|内容形式|笔记形式|作品形式|发布形式|媒介形式|图文.?视频|图文或视频|图文还是视频|primarycontenttype|primarynotetype/i);
  const creatorTypeChoice = has(/图文/) && has(/视频/);
  const creatorTypeExcluded = has(/报价|价格|刊例|裸价|一口价|完播|阅读|播放|曝光|互动|单价|成本|比例|占比|数据|截图|json/i);
  if (!creatorTypeExcluded && (creatorTypeMeaning || (creatorTypeSubject && creatorTypeChoice))) return "博主类型";
  if (leafHas(/^(博主类型|达人类型|内容类型)$/i)) return "博主类型";
  if (has(/账号|达人|博主|内容/) && has(/类型|类目|分类|category|type/i)) return "账号类型";
  if (has(/ip|城市|地区|地域|city|location/i) && !has(/分布|distribution/i)) return "IP城市";

  if (has(/补采|详情/) && has(/状态|进度|status/i)) return "详情补采状态";
  if (has(/补采|详情|采集/) && has(/时间|日期|time|date/i)) return "详情补采时间";
  if (has(/完整度|完整性|completeness/i)) return "详情完整度";
  if (has(/api|接口/) && has(/摘要|捕获|capture|summary/i)) return "详情API捕获摘要";
  if (has(/简介|介绍|签名|bio|intro/i)) return "个人简介";
  if (has(/优势|亮点|卖点|advantage/i)) return "博主优势";
  if (has(/近期|最近|recent/) && has(/笔记|note/) && has(/json|原始|raw/i)) return "近期笔记JSON";
  if (has(/详情|detail/) && has(/json|原始|raw/i)) return "详情原始JSON";
  if (has(/蒲公英|pgy/) && has(/json|原始|raw/i)) return "蒲公英原始JSON";
  if (has(/备注|note|remark/i) && has(/补采|详情/)) return "详情补采备注";

  if (has(/笔记|note/) && has(/类型|形式|type/i)) return "笔记类型";
  if (has(/来源|source/i)) return "数据来源";
  if (has(/采集|抓取|导出|同步/) && has(/时间|日期|time|date/i)) return "采集时间";
  return "";
}

function canonicalFieldForHeader(header, context = "") {
  const normalized = normalizeKey(header);
  if (!normalized) return "";
  const headerText = cellText(header);
  const contextText = cellText(context);
  for (const fieldName of [...STANDARD_FIELDS, ...DETAIL_FIELDS]) {
    if (normalizeKey(fieldName) === normalized) return fieldName;
  }
  const semanticField = semanticCanonicalFieldForHeader(header, context);
  if (semanticField) return semanticField;
  const raw = `${contextText}${headerText}`.replace(/\s+/g, "");
  const key = normalized;
  const unsafeNicknameHeader = /(清单|客户|反馈|进度|状态|阶段|备注|排期|沟通|需求|档期)/i.test(raw);
  const unsafeFansHeader = /(画像|占比|比例|增长|变化|维度|趋势|分布|活跃|阅读|互动|下单|性别|年龄|地域|设备|兴趣)/i.test(raw);
  const ageRatioField = canonicalAgeRatioFieldForHeader(header, context);
  if (ageRatioField) return ageRatioField;
  if (contextText && /(合作|商单|商业|报备|近30天|30天|30d)/i.test(raw) && /曝光/i.test(raw)) return "曝光中位数（合作）";
  if (contextText && /(合作|商单|商业|图文3s|图文3秒|报备|近30天|30天|30d)/i.test(raw) && /(阅读|播放|read|cpr)/i.test(raw)) return "阅读中位数（合作）";
  if (contextText && /(合作|商单|商业|报备|近30天|30天|30d)/i.test(raw) && /(互动|engage|interaction)/i.test(raw)) return "互动中位数（合作）";
  if (contextText && /(日常|自然|非合作|普通|常规)/i.test(raw) && /曝光/i.test(raw)) return "曝光中位数（日常）";
  if (contextText && /(日常|自然|非合作|普通|常规)/i.test(raw) && /(阅读|播放|read)/i.test(raw)) return "阅读中位数（日常）";
  if (contextText && /(日常|自然|非合作|普通|常规)/i.test(raw) && /(互动|engage|interaction)/i.test(raw)) return "互动中位数（日常）";
  const exactOnlyAliases = new Set([
    "达人",
    "kol",
    "昵称",
    "name",
    "报价",
    "价格",
    "粉丝数",
    "粉丝量",
    "阅读量",
    "互动",
    "城市",
    "地域",
    "source"
  ].map(normalizeKey));
  for (const [fieldName, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases || []) {
      const aliasKey = normalizeKey(alias);
      if (!aliasKey) continue;
      if (aliasKey === normalized) return fieldName;
    }
  }
  if (/(蒲公英|pgy|pugongying)/i.test(raw) && /(主页|链接|link|url)/i.test(raw)) return "蒲公英链接";
  if (/(小红书|红书|xhs)/i.test(raw) && /(主页|链接|link|url)/i.test(raw)) return "主页链接";
  if (/(小红书号|红书号|小红书id|red_?id|xhs_?id|redbook_?id|red_book_id|xiaohongshu_?id)/i.test(raw)) return "小红书号";
  if (!unsafeNicknameHeader && /(达人名|达人名称|达人昵称|博主名|博主名称|博主昵称|账号名|账号名称|昵称)/i.test(raw)) return "达人昵称";
  if (/^(博主类型|达人类型|内容类型)$/i.test(headerText.replace(/\s+/g, ""))) return "博主类型";
  if (/^(标签|达人标签|自定义标签|用户标签)$/i.test(headerText.replace(/\s+/g, ""))) return "自定义标签";
  if (/(账号类型|博主类目|博主标签|账号标签|账号类目|内容标签|内容类目|类目分类|账号分类)/i.test(raw)) return "账号类型";
  if (!unsafeFansHeader && /(粉丝|fans|follower)/i.test(raw) && /(w|万|量级)/i.test(raw)) return "粉丝数w";
  if (!unsafeFansHeader && /(粉丝|fans|follower)/i.test(raw)) return "粉丝数";
  if (/(图文|图片|笔记)/i.test(raw) && /(报价|价格|裸价|报备|刊例|一口价)/i.test(raw)) return "图文报价";
  if (/视频/i.test(raw) && /(报价|价格|裸价|报备|刊例|一口价)/i.test(raw)) return "视频报价";
  if (/(图文|图片|picture|image)/i.test(raw) && /(3秒|3s|three.?second)/i.test(raw) && /(阅读|read|view)/i.test(raw)) return "图文3秒阅读率";
  if (/(视频|video)/i.test(raw) && /(完播|播放完成|fullview|completion|finish)/i.test(raw)) return "完播率";
  if (/(合作|商单|商业|报备|近30天|30天|30d)/i.test(raw) && /曝光/i.test(raw) && /(中位|median|30天|30d|近30天|合作|商单|商业|报备)/i.test(raw)) return "曝光中位数（合作）";
  if (/(合作|商单|商业|报备|近30天|30天|30d)/i.test(raw) && /(阅读|播放|read|cpr)/i.test(raw) && /(中位|median|30天|30d|近30天|合作|商单|商业|报备)/i.test(raw)) return "阅读中位数（合作）";
  if (/(合作|商单|商业|报备|近30天|30天|30d)/i.test(raw) && /(互动|engage|interaction)/i.test(raw) && /(中位|median|30天|30d|近30天|合作|商单|商业|报备)/i.test(raw)) return "互动中位数（合作）";
  if (/(日常|自然|非合作|普通|常规)/i.test(raw) && /曝光/i.test(raw)) return "曝光中位数（日常）";
  if (/(日常|自然|非合作|普通|常规)/i.test(raw) && /(阅读|播放|read)/i.test(raw)) return "阅读中位数（日常）";
  if (/(日常|自然|非合作|普通|常规)/i.test(raw) && /(互动|engage|interaction)/i.test(raw)) return "互动中位数（日常）";
  if (/(女|女性)/i.test(raw) && /粉丝占比/i.test(raw)) return "女性粉丝占比";
  if (/(男|男性)/i.test(raw) && /粉丝占比/i.test(raw)) return "男性粉丝占比";
  if (/完播/i.test(raw)) return "完播率";
  if (/cpr/i.test(key) && /(图文|图片|笔记)/i.test(raw)) return "图文预估阅读单价";
  if (/cpe/i.test(key) && /(图文|图片|笔记)/i.test(raw)) return "图文预估互动单价";
  if (/cpr/i.test(key) && /视频/i.test(raw)) return "视频预估阅读单价";
  if (/cpe/i.test(key) && /视频/i.test(raw)) return "视频预估互动单价";
  if (/cpm/i.test(key)) return "CPM";
  if (/cpe/i.test(key)) return "CPE";
  for (const [fieldName, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases || []) {
      const aliasKey = normalizeKey(alias);
      if (!aliasKey) continue;
      if (unsafeNicknameHeader && (fieldName === "达人昵称" || fieldName === "达人名称")) continue;
      if (unsafeFansHeader && (fieldName === "粉丝数" || fieldName === "粉丝数w")) continue;
      if (exactOnlyAliases.has(aliasKey)) continue;
      if (aliasKey.length >= 4 && normalized.includes(aliasKey)) return fieldName;
    }
  }
  return "";
}

function rowsToSimpleXlsx(rows, sheetName = "达人库") {
  const safeRows = Array.isArray(rows) ? rows : [];
  const columns = [];
  for (const row of safeRows) {
    for (const key of Object.keys(row || {})) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  if (!columns.length) columns.push("达人ID");
  const rowXml = [
    `<row r="1" ht="25" customHeight="1">${columns.map((column, index) => xlsxCell(index + 1, 1, column, 1)).join("")}</row>`
  ];
  safeRows.forEach((row, rowIndex) => {
    rowXml.push(`<row r="${rowIndex + 2}">${columns.map((column, columnIndex) => xlsxCell(columnIndex + 1, rowIndex + 2, row?.[column], 0)).join("")}</row>`);
  });
  const columnsXml = columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${columnWidth(column)}" customWidth="1"/>`).join("");
  const lastColumn = columnName(columns.length);
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${columnsXml}</cols><sheetData>${rowXml.join("")}</sheetData><autoFilter ref="A1:${lastColumn}${Math.max(1, safeRows.length + 1)}"/></worksheet>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Microsoft YaHei"/></font><font><b/><sz val="10"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD7F55F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf></cellXfs></styleSheet>`;
  return zipFiles([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: stylesXml },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml }
  ]);
}

function isAmbiguousCreatorTypeHeader(header) {
  return /^(博主类型|达人类型|内容类型)$/i.test(cellText(header).replace(/\s+/g, ""));
}

function creatorTypeFromExampleValue(value) {
  const text = cellText(value).normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return "";
  if (/^(图文|图文为主|图文博主|图片|图片为主|image|picture|photo)$/.test(text)) return "图文";
  if (/^(视频|视频为主|视频博主|video)$/.test(text)) return "视频";
  return "";
}

function firstNonEmptyColumnValue(values, columnIndex, dataStartIndex) {
  for (let rowIndex = Math.max(0, dataStartIndex); rowIndex < (values || []).length; rowIndex += 1) {
    const value = values[rowIndex]?.[columnIndex];
    if (nonEmptyCell(value)) return value;
  }
  return "";
}

function canonicalFieldForSheetColumn(header, context, values, columnIndex, dataStartIndex) {
  const canonicalField = canonicalFieldForHeader(header, context) || canonicalFieldForHeader(`${context} / ${header}`);
  if (!isAmbiguousCreatorTypeHeader(header)) return canonicalField;
  const exampleValue = firstNonEmptyColumnValue(values, columnIndex, dataStartIndex);
  if (!nonEmptyCell(exampleValue)) return canonicalField;
  return creatorTypeFromExampleValue(exampleValue) ? "博主类型" : "账号类型";
}

function buildSheetShape(values, headerRows = 1, startRow = 0) {
  const width = effectiveSheetWidth(values);
  const columns = [];
  let mappedCount = 0;
  for (let index = 0; index < width; index += 1) {
    const parts = [];
    for (let rowIndex = startRow; rowIndex < startRow + headerRows; rowIndex += 1) {
      const text = headerCellText(values, rowIndex, index);
      if (text) parts.push(text);
    }
    const uniqueParts = uniqueHeaderParts(parts);
    const header = uniqueParts.join(" / ") || `Col${index + 1}`;
    const leafHeader = uniqueParts[uniqueParts.length - 1] || header;
    const contextHeader = uniqueParts.slice(0, -1).join(" / ");
    const dataStartIndex = startRow + headerRows;
    const canonicalField = canonicalFieldForSheetColumn(leafHeader, contextHeader, values, index, dataStartIndex);
    if (canonicalField) mappedCount += 1;
    columns.push({
      fieldName: header,
      canonicalField,
      columnIndex: index
    });
  }
  return { headerRows, headerStartRow: startRow + 1, dataStartRow: startRow + headerRows + 1, columns, mappedCount };
}

function detectSheetShape(values) {
  const maxStartRow = Math.min(5, Math.max(0, (values || []).length - 1));
  const maxHeaderRows = Math.min(4, Math.max(1, (values || []).length));
  let best = buildSheetShape(values, 1, 0);
  let bestScore = headerShapeScore(best, values);
  for (let startRow = 0; startRow <= maxStartRow; startRow += 1) {
    for (let headerRows = 1; headerRows <= maxHeaderRows; headerRows += 1) {
      if (startRow + headerRows > (values || []).length) continue;
      const shape = buildSheetShape(values, headerRows, startRow);
      const score = headerShapeScore(shape, values);
      if (score > bestScore) {
        best = shape;
        bestScore = score;
      }
    }
  }
  return best;
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
  const startIndex = Math.max(0, (shape.dataStartRow || shape.headerRows + 1) - 1);
  return values.slice(startIndex).map((line, index) => ({
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

function columnUsesImageTemplate(column, templateItems) {
  if (!column || !templateItems) return false;
  const items = Array.isArray(templateItems) ? templateItems : [templateItems];
  return items.some((item) => cellLooksLikeImage(item?.line?.[column.columnIndex]));
}

function rawHeaderCellForColumn(values, shape, column) {
  const headerRowIndex = Math.max(0, shapeHeaderWriteRow(shape) - 1);
  return cellText(values?.[headerRowIndex]?.[column?.columnIndex]).trim();
}

function columnLooksAutoAppendedReferenceHeader(values, shape, column) {
  const rawHeader = rawHeaderCellForColumn(values, shape, column);
  return rawHeader.includes(" / ") && Boolean(referenceColumnForFieldName(rawHeader));
}

function existingOnlySheetShape(values) {
  const shape = detectSheetShape(values);
  return {
    ...shape,
    columns: shape.columns
      .filter((column) => !columnLooksAutoAppendedReferenceHeader(values, shape, column))
      .map((column) => ({ ...column, writable: Boolean(column.canonicalField) }))
  };
}

function columnHeaderText(column) {
  return `${column?.fieldName || ""} ${column?.leafHeader || ""} ${column?.contextHeader || ""}`;
}

function isFansImageColumn(column) {
  if (column?.canonicalField === "粉丝画像截图") return true;
  if (column?.canonicalField) return false;
  const text = columnHeaderText(column);
  if (!/(粉丝画像|粉丝分析|粉丝人群|人群画像)/.test(text)) return false;
  return !/(文本|文字|摘要|JSON|原始|状态|时间|备注|占比|比例|分布|兴趣|地域|城市|设备|年龄|性别)/i.test(text);
}

function isNoteImageColumn(column) {
  if (column?.canonicalField === "笔记数据截图") return true;
  if (column?.canonicalField) return false;
  const text = columnHeaderText(column);
  if (!/(商单案例|笔记数据|数据概览)/.test(text)) return false;
  return !/(文本|文字|摘要|JSON|原始|状态|时间|备注|阅读量|曝光|互动|点赞|收藏|评论|分享|中位|CPM|CPE|CPR)/i.test(text);
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

function firstNumericField(valuesByField, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = numericValue(valueForCanonicalField(valuesByField, fieldName));
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function computedValueForCanonicalField(valuesByField, canonicalField) {
  if (canonicalField === "CPM") {
    const price = firstNumericField(valuesByField, ["图文报价", "视频报价", "平台报价"]);
    const exposure = firstNumericField(valuesByField, ["曝光中位数（日常）", "曝光中位数（合作）"]);
    return price && exposure ? Math.round((price / exposure) * 1000 * 100) / 100 : "";
  }
  if (canonicalField === "CPE") {
    const price = firstNumericField(valuesByField, ["图文报价", "视频报价", "平台报价"]);
    const interaction = firstNumericField(valuesByField, ["互动中位数（日常）", "互动中位数（合作）"]);
    return price && interaction ? Math.round((price / interaction) * 100) / 100 : "";
  }
  return "";
}

function canonicalBackfillValues(sourceRow, payload) {
  const captures = payload.captures || {};
  const userId = extractPgyUserId(sourceRow);
  const sourceRaw = sourceRow?.raw_payload && typeof sourceRow.raw_payload === "object" ? sourceRow.raw_payload : {};
  const detailRaw = payload.detail?.raw_payload && typeof payload.detail.raw_payload === "object" ? payload.detail.raw_payload : {};
  const detailRow = {
    ...(payload.detail || {}),
    raw_payload: { ...sourceRaw, ...detailRaw },
    pgy_url: payload.detailUrl || detailUrlFromRow(sourceRow),
    profile_url: profileUrl(userId)
  };
  const normalizedDetail = normalizeExportRow({ ...sourceRow, ...detailRow });
  const detailValues = detailValuesForSheet(payload.detail, captures, detailStatusByCapture(captures), payload.detailUrl || "");
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
  return computedValueForCanonicalField(valuesByField, canonicalField);
}

function exactReferenceValue(row, column) {
  const candidates = [column.fieldName, column.leafHeader].filter(Boolean);
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return "";
}

function rawPayload(row) {
  return row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : row;
}

function rawValueByKeys(row, keys) {
  return nestedValue(rawPayload(row), keys);
}

function cleanPgyUserId(value) {
  return String(value || "").replace(/^pgy-api:/i, "").trim();
}

function roundedNumber(value, digits = 2) {
  const number = numericValue(value);
  if (typeof number !== "number" || !Number.isFinite(number)) return value === undefined || value === null ? "" : value;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function valueInWan(value, digits = 2) {
  const number = numericValue(value);
  if (typeof number !== "number" || !Number.isFinite(number)) return value === undefined || value === null ? "" : value;
  const wan = Math.abs(number) >= 1000 ? number / 10000 : number;
  return roundedNumber(wan, digits);
}

function priceWithServiceFee(value) {
  const price = numericValue(value);
  if (typeof price !== "number" || !Number.isFinite(price)) return "";
  return roundedNumber(price * 1.1, 2);
}

function stateText(value, fallbackPrice = "") {
  if (value !== undefined && value !== null && value !== "") {
    const text = String(value).trim();
    if (/可接|可投|上架|开启|正常|true/i.test(text)) return "可接单";
    if (/不可|不接|关闭|下架|false/i.test(text)) return "不可接单";
    const number = Number(text);
    if (Number.isFinite(number)) return number === 1 ? "可接单" : "不可接单";
    return text;
  }
  return numericValue(fallbackPrice) ? "可接单" : "";
}

function genderText(value) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value).trim();
  if (/^(女|female|f|2)$/i.test(text)) return "女";
  if (/^(男|male|m|1)$/i.test(text)) return "男";
  return text;
}

function jsonValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function ratioNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value);
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}

function sortedDistributionEntries(value) {
  const parsed = jsonValue(value) || value;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const nested = parsed.segments || parsed.top_regions || parsed.top_cities || parsed.top_devices || parsed.interests || parsed.top_interests;
    if (Array.isArray(nested)) return sortedDistributionEntries(nested);
  }
  if (Array.isArray(parsed)) {
    return parsed.map((item) => {
      if (Array.isArray(item)) return { name: item[0], value: item[1] };
      if (item && typeof item === "object") {
        return {
          name: item.name || item.label || item.key || item.region || item.city || item.device || item.topic || item.title,
          value: item.value ?? item.ratio ?? item.percent ?? item.rate ?? item.count
        };
      }
      return { name: item, value: "" };
    }).filter((item) => item.name !== undefined && item.name !== null && item.name !== "");
  }
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => (ratioNumber(b.value) || 0) - (ratioNumber(a.value) || 0));
  }
  if (typeof parsed === "string") {
    return parsed.split(/[;；,，、\n]/).map((part) => ({ name: part.trim(), value: "" })).filter((item) => item.name);
  }
  return [];
}

function distributionTopText(value, index) {
  const item = sortedDistributionEntries(value)[index - 1];
  if (!item) return "";
  const valueText = percentText(item.value);
  return valueText ? `${item.name}-${valueText}` : String(item.name || "");
}

function ageRatioValues(row) {
  return {
    "<18": valueForCanonicalField(row, "<18粉丝占比") || rawValueByKeys(row, ["fans_under_18_ratio", "fans_0_17_ratio", "fans_lt_18_ratio"]),
    "18-24": valueForCanonicalField(row, "18-24粉丝占比"),
    "25-34": valueForCanonicalField(row, "25-34粉丝占比"),
    "35-44": valueForCanonicalField(row, "35-44粉丝占比"),
    ">44": valueForCanonicalField(row, "44岁以上粉丝占比")
  };
}

function topAgeSegment(row) {
  const entries = Object.entries(ageRatioValues(row))
    .map(([name, value]) => ({ name, value: ratioNumber(value) }))
    .filter((item) => item.value !== null);
  entries.sort((a, b) => b.value - a.value);
  return entries[0]?.name || "";
}

function referenceContextHas(column, pattern) {
  return pattern.test(`${column.contextHeader || ""} ${column.fieldName || ""}`);
}

function firstReferenceValue(row, fields) {
  for (const field of fields) {
    const value = valueForCanonicalField(row, field);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function firstRawValue(row, keys) {
  for (const key of keys) {
    const value = rawValueByKeys(row, [key]);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function compactTagText(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") {
    const parsed = /^[\[{]/.test(value.trim()) ? jsonValue(value) : null;
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

function redBookProfileUrlFromRow(row) {
  const existing = valueForCanonicalField(row, "主页链接") || firstRawValue(row, ["profileUrl", "profile_url", "homePageUrl", "redBookUrl"]);
  if (existing) return existing;
  const userId = cleanPgyUserId(firstRawValue(row, ["userId", "user_id", "bloggerId", "blogger_id", "kolId", "kol_id"]));
  return userId ? `https://www.xiaohongshu.com/user/profile/${userId}` : "";
}

function pgyProfileUrlFromRow(row) {
  const existing = valueForCanonicalField(row, "蒲公英链接") || firstRawValue(row, ["pgyUrl", "pgy_url", "pgyProfileUrl"]);
  if (existing) return existing;
  const userId = cleanPgyUserId(firstRawValue(row, ["userId", "user_id", "bloggerId", "blogger_id", "kolId", "kol_id"]));
  return userId ? `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${userId}` : "";
}

function valueForReferenceColumn(row, column) {
  const exact = exactReferenceValue(row, column);
  if (exact !== "") return exact;

  const leaf = column.leafHeader;
  const isDaily = referenceContextHas(column, /日常/);
  const isCoopScale = referenceContextHas(column, /按规模-合作/);
  const isNinetyDays = referenceContextHas(column, /近90天|全部流量/);

  switch (leaf) {
    case "博主ID":
      return cleanPgyUserId(valueForCanonicalField(row, "达人ID") || rawValueByKeys(row, ["userId", "user_id", "bloggerId", "blogger_id", "kolId", "kol_id"]));
    case "小红书号":
      return valueForCanonicalField(row, "小红书号");
    case "昵称":
      return valueForCanonicalField(row, "达人昵称") || valueForCanonicalField(row, "达人名称");
    case "性别":
      return genderText(rawValueByKeys(row, ["gender", "sex", "genderName", "sexName"]));
    case "所属机构":
      return valueForCanonicalField(row, "所属机构") || rawValueByKeys(row, ["mcnName", "mcn_name", "agencyName", "organizationName", "orgName", "companyName", "bloggerCompany", "organization_name"]);
    case "粉丝数（万）":
      return valueForCanonicalField(row, "粉丝数w") || valueInWan(valueForCanonicalField(row, "粉丝数"), 2);
    case "赞藏数（万）":
      return valueInWan(valueForCanonicalField(row, "获赞与收藏") || fallbackLikedCollectedValue(row), 2);
    case "博主人设":
      return compactTagText(firstRawValue(row, ["persona", "bloggerPersona", "personalTags", "featureTags", "bloggerTags", "personality", "characterTags", "tagNames"]));
    case "内容类型":
      return compactTagText(firstRawValue(row, ["contentTags", "tradeType", "industryTag", "type"])) || valueForCanonicalField(row, "账号类型") || valueForCanonicalField(row, "笔记类型");
    case "地理位置":
      return valueForCanonicalField(row, "IP城市");
    case "小红书主页":
      return redBookProfileUrlFromRow(row);
    case "蒲公英主页":
      return pgyProfileUrlFromRow(row);
    case "健康等级":
      return firstRawValue(row, ["healthLevel", "health_level", "healthLevelName", "healthGrade", "currentLevel"]);
    case "下月健康等级":
      return firstRawValue(row, ["nextMonthHealthLevel", "next_health_level", "nextHealthLevelName", "nextLevel"]);
    case "图文笔记一口价":
      return valueForCanonicalField(row, "图文报价") || valueForCanonicalField(row, "平台报价");
    case "视频笔记一口价":
      return valueForCanonicalField(row, "视频报价");
    case "图文笔记一口价(含平台服务费)":
      return priceWithServiceFee(valueForCanonicalField(row, "图文报价") || valueForCanonicalField(row, "平台报价"));
    case "视频笔记一口价(含平台服务费)":
      return priceWithServiceFee(valueForCanonicalField(row, "视频报价"));
    case "图文笔记接单状态":
      return stateText(rawValueByKeys(row, ["pictureState", "picture_state", "imageState", "picState"]), valueForCanonicalField(row, "图文报价"));
    case "视频笔记接单状态":
      return stateText(rawValueByKeys(row, ["videoState", "video_state"]), valueForCanonicalField(row, "视频报价"));
    case "添加时间":
      return valueForCanonicalField(row, "采集时间") || valueForCanonicalField(row, "详情补采时间");
    case "曝光中位数":
      return isCoopScale || isNinetyDays ? valueForCanonicalField(row, "曝光中位数（合作）") : valueForCanonicalField(row, "曝光中位数（日常）");
    case "阅读中位数":
      return isCoopScale || isNinetyDays ? valueForCanonicalField(row, "阅读中位数（合作）") : valueForCanonicalField(row, "阅读中位数（日常）");
    case "互动中位数":
      return isCoopScale || isNinetyDays ? valueForCanonicalField(row, "互动中位数（合作）") : valueForCanonicalField(row, "互动中位数（日常）");
    case "外溢进店中位数":
      return firstRawValue(row, ["overflowNum", "overflowStoreMedian", "overflowShopMedian", "shopVisitMedian", "mCpuvNum", "mcpuvNum30d", "mCpuvNum30d"]);
    case "发布笔记":
      return valueForCanonicalField(row, "已合作笔记数") || rawValueByKeys(row, ["publishNoteCount", "publish_note_count", "noteCount", "noteCnt"]);
    case "预估CPM":
      return firstRawValue(row, ["estimatePictureCpm", "estimateVideoCpm"]) || valueForCanonicalField(row, "CPM");
    case "预估阅读单价":
      return firstReferenceValue(row, ["图文预估阅读单价", "视频预估阅读单价"]);
    case "预估互动单价":
      return firstReferenceValue(row, ["图文预估互动单价", "视频预估互动单价", "CPE"]);
    case "中位点赞量":
      return firstRawValue(row, ["medianLikeCount", "likeMedian", "likeMidNum", "likeMidNum30d"]);
    case "中位收藏量":
      return firstRawValue(row, ["medianCollectCount", "collectMedian", "collectMidNum", "collectMidNum30d"]);
    case "中位评论量":
      return firstRawValue(row, ["medianCommentCount", "commentMedian", "commentMidNum", "commentMidNum30d"]);
    case "中位分享量":
      return firstRawValue(row, ["medianShareCount", "shareMedian", "shareMidNum", "shareMidNum30d"]);
    case "中位关注量":
      return firstRawValue(row, ["medianFollowCount", "followMedian", "followMidNum", "followMidNum30d", "mFollowCnt", "mfollowCnt"]);
    case "互动率":
      return percentText(firstRawValue(row, ["interactionRate", "engagementRate", "engageRate"]));
    case "千赞笔记比例":
      return percentPointText(firstRawValue(row, ["thousandLikePercent30"]));
    case "百赞笔记比例":
      return percentPointText(firstRawValue(row, ["hundredLikePercent30"]));
    case "视频完播率":
      return percentPointText(valueForCanonicalField(row, "完播率"));
    case "图文3秒阅读率":
      return valueForCanonicalField(row, "图文3秒阅读率") || percentText(firstRawValue(row, ["picture3sViewRate", "picture3sViewRate30", "picture3sReadRate", "pictureThreeSecondReadRate", "pic3sReadRate", "picture_3s_read_rate"]));
    case "粉丝增量":
      return firstRawValue(row, ["fans30GrowthNum", "fansIncrease", "fans_increment", "fansGrowthNum", "fansGrowthCount", "fansRiseNum"]);
    case "粉丝量变化幅度":
      return valueForCanonicalField(row, "粉丝增长率") || percentPointText(firstRawValue(row, ["fans30GrowthRate", "fansGrowthRate", "fans_growth_ratio", "fans_growth_rate"]));
    case "活跃粉丝占比":
      return percentPointText(valueForCanonicalField(row, "活跃粉丝占比") || firstRawValue(row, ["fansActiveIn28dLv"]));
    case "阅读粉丝占比":
      return valueForCanonicalField(row, "阅读粉丝占比");
    case "互动粉丝占比":
      return percentPointText(valueForCanonicalField(row, "互动粉丝占比") || firstRawValue(row, ["fansEngageNum30dLv"]));
    case "下单粉丝占比":
      return valueForCanonicalField(row, "下单粉丝占比");
    case "性别分布-男粉占比":
      return valueForCanonicalField(row, "男性粉丝占比");
    case "性别分布-女粉占比":
      return valueForCanonicalField(row, "女性粉丝占比");
    case "年龄分布-占比最高年龄段":
      return topAgeSegment(row);
    case "年龄分布-<18":
      return percentText(ageRatioValues(row)["<18"]);
    case "年龄分布-18-24":
      return valueForCanonicalField(row, "18-24粉丝占比");
    case "年龄分布-25-34":
      return valueForCanonicalField(row, "25-34粉丝占比");
    case "年龄分布-35-44":
      return valueForCanonicalField(row, "35-44粉丝占比");
    case "年龄分布->44":
      return valueForCanonicalField(row, "44岁以上粉丝占比");
    default:
      break;
  }

  let match = leaf.match(/^地域分布\(省\)-TOP(\d+)$/);
  if (match) return distributionTopText(valueForCanonicalField(row, "粉丝地域分布") || rawValueByKeys(row, ["provinceDistribution", "province_distribution"]), Number(match[1]));
  match = leaf.match(/^地域分布\(市\)-TOP(\d+)$/);
  if (match) return distributionTopText(valueForCanonicalField(row, "粉丝城市分布") || rawValueByKeys(row, ["cityDistribution", "city_distribution"]), Number(match[1]));
  match = leaf.match(/^用户设备分布-TOP(\d+)$/);
  if (match) return distributionTopText(valueForCanonicalField(row, "用户设备分布"), Number(match[1]));
  match = leaf.match(/^兴趣分布-TOP(\d+)$/);
  if (match) return distributionTopText(valueForCanonicalField(row, "用户兴趣分布") || valueForCanonicalField(row, "用户兴趣"), Number(match[1]));

  if (column.canonicalField) return valueForCanonicalField(row, column.canonicalField);
  return "";
}

function hasBlankMappedDetailCell(item, columns) {
  const backfillableFields = new Set([
    ...DETAIL_FIELDS,
    "达人昵称",
    "达人名称",
    "主页链接",
    "蒲公英链接",
    "小红书号",
    "粉丝数",
    "粉丝数w",
    "图文报价",
    "视频报价",
    "曝光中位数（日常）",
    "阅读中位数（日常）",
    "互动中位数（日常）",
    "完播率",
    "CPM",
    "CPE"
  ]);
  return columns.some((column) => {
    if (!column.canonicalField) return false;
    if (!backfillableFields.has(column.canonicalField)) return false;
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
      line[field.columnIndex + 1 - start] = normalizeSheetWriteValue(rowValueForField(row, field.fieldName), field.fieldName);
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

function bitableFieldName(field) {
  return field?.field_name || field?.name || "";
}

function bitableFieldType(field) {
  const raw = field?.type ?? field?.field_type ?? field?.ui_type ?? field?.property?.type;
  const number = Number(raw);
  return Number.isFinite(number) ? number : raw;
}

function isBitableAttachmentField(field) {
  return bitableFieldType(field) === BITABLE_ATTACHMENT_FIELD_TYPE;
}

function bitableScreenshotKind(fieldName) {
  if (fieldName === DETAIL_FIELDS[6]) return "audience";
  if (fieldName === DETAIL_FIELDS[7]) return "overview";
  return "";
}

function bitableAttachmentScreenshotKind(fieldName) {
  if (fieldName === DETAIL_FIELDS[6] || fieldName === screenshotAttachmentFallbackFieldName(DETAIL_FIELDS[6])) return "audience";
  if (fieldName === DETAIL_FIELDS[7] || fieldName === screenshotAttachmentFallbackFieldName(DETAIL_FIELDS[7])) return "overview";
  return "";
}

function isBitableScreenshotField(fieldName) {
  return Boolean(bitableScreenshotKind(fieldName));
}

async function createBitableField(token, appToken, tableId, fieldName, type = BITABLE_TEXT_FIELD_TYPE) {
  const data = await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
    token,
    method: "POST",
    body: { field_name: fieldName, type }
  });
  return data.field || data;
}

async function ensureBitableFields(token, appToken, tableId, rows) {
  return ensureBitableFieldNames(token, appToken, tableId, exportFieldsForRows(rows));
}

async function ensureBitableFieldNames(token, appToken, tableId, requiredFields) {
  const fields = await listBitableFields(token, appToken, tableId);
  const existingNames = new Set(fields.map((field) => bitableFieldName(field)).filter(Boolean));
  for (const fieldName of requiredFields) {
    if (!existingNames.has(fieldName)) {
      const created = await createBitableField(token, appToken, tableId, fieldName);
      fields.push(created);
      existingNames.add(fieldName);
    }
  }
  return requiredFields;
}

function findBitableFieldByName(fields, fieldName) {
  return fields.find((field) => bitableFieldName(field) === fieldName) || null;
}

function screenshotAttachmentFallbackFieldName(fieldName) {
  return `${fieldName}附件`;
}

function bitableScreenshotAttachmentField(fields, fieldName) {
  const preferred = findBitableFieldByName(fields, fieldName);
  if (preferred && isBitableAttachmentField(preferred)) return preferred;
  const fallbackName = screenshotAttachmentFallbackFieldName(fieldName);
  return findBitableFieldByName(fields, fallbackName);
}

function bitableCreatorTypeFieldName(fields, records) {
  const ambiguousFields = (fields || []).filter((field) => isAmbiguousCreatorTypeHeader(bitableFieldName(field)));
  for (const field of ambiguousFields) {
    const fieldName = bitableFieldName(field);
    const exampleValue = (records || []).map((record) => record?.fields?.[fieldName]).find(nonEmptyCell);
    if (creatorTypeFromExampleValue(exampleValue)) return fieldName;
  }
  const emptyField = ambiguousFields.find((field) => {
    const fieldName = bitableFieldName(field);
    return !(records || []).some((record) => nonEmptyCell(record?.fields?.[fieldName]));
  });
  if (emptyField) return bitableFieldName(emptyField);
  return ambiguousFields.length ? "博主类型（图文/视频）" : "博主类型";
}

function bitableDetailFieldName(fieldsMeta, canonicalField) {
  return fieldsMeta?.detailFieldNames?.[canonicalField] || canonicalField;
}

async function ensureBitableDetailFields(token, appToken, tableId, records = []) {
  let fields = await listBitableFields(token, appToken, tableId);
  const existingNames = new Set(fields.map((field) => bitableFieldName(field)).filter(Boolean));
  const detailFieldNames = {
    "博主类型": bitableCreatorTypeFieldName(fields, records)
  };
  for (const fieldName of DETAIL_FIELDS) {
    const targetFieldName = detailFieldNames[fieldName] || fieldName;
    if (isBitableScreenshotField(fieldName)) {
      const existing = findBitableFieldByName(fields, fieldName);
      if (existing && isBitableAttachmentField(existing)) continue;
      const attachmentName = existing ? screenshotAttachmentFallbackFieldName(fieldName) : fieldName;
      if (!existingNames.has(attachmentName)) {
        const created = await createBitableField(token, appToken, tableId, attachmentName, BITABLE_ATTACHMENT_FIELD_TYPE);
        fields.push(created);
        existingNames.add(attachmentName);
      }
      continue;
    }
    if (!existingNames.has(targetFieldName)) {
      const created = await createBitableField(token, appToken, tableId, targetFieldName, BITABLE_TEXT_FIELD_TYPE);
      fields.push(created);
      existingNames.add(targetFieldName);
    }
  }
  fields.detailFieldNames = detailFieldNames;
  return fields;
}

async function ensureMappedBitableFields(token, appToken, tableId, rows, options = {}) {
  const fields = await listBitableFields(token, appToken, tableId);
  const requiredFields = exportFieldsForRows(rows, options);
  const mapped = [];
  const existingNames = new Set();
  const usedNames = new Set();

  for (const field of fields) {
    const fieldName = field.field_name || field.name;
    if (!fieldName) continue;
    existingNames.add(fieldName);
    const canonicalField = canonicalFieldForHeader(fieldName);
    const hasSourceValue = rows.some((row) => {
      const value = rowValueForField(row, fieldName);
      return value !== undefined && value !== null && value !== "";
    });
    if (!canonicalField && !hasSourceValue) continue;
    mapped.push({
      fieldName,
      canonicalField
    });
    usedNames.add(fieldName);
  }

  for (const fieldName of requiredFields) {
    const canonicalField = canonicalFieldForHeader(fieldName) || fieldName;
    const alreadyMapped = mapped.some((field) => {
      if (field.fieldName === fieldName) return true;
      return field.canonicalField && field.canonicalField === canonicalField;
    });
    if (alreadyMapped) continue;
    if (!existingNames.has(fieldName)) {
      await createBitableField(token, appToken, tableId, fieldName);
      existingNames.add(fieldName);
    }
    if (!usedNames.has(fieldName)) {
      mapped.push({ fieldName, canonicalField });
      usedNames.add(fieldName);
    }
  }

  return mapped;
}

function bitableFieldsForRow(row, fieldNames) {
  const values = {};
  for (const fieldName of fieldNames) {
    const directValue = row && Object.prototype.hasOwnProperty.call(row, fieldName) ? row[fieldName] : undefined;
    const value = directValue !== undefined ? directValue : rowValueForField(row, fieldName);
    if (value === undefined || value === null) values[fieldName] = "";
    else if (isBitableAttachmentValue(value)) values[fieldName] = value;
    else if (typeof value === "number" || typeof value === "boolean") values[fieldName] = value;
    else if (typeof value === "object") values[fieldName] = JSON.stringify(value);
    else values[fieldName] = String(value);
  }
  return values;
}

function bitableFieldsForMappedRow(row, mappedFields) {
  const values = {};
  for (const field of mappedFields) {
    const value = rowValueForMappedColumn(row, field);
    if (value === undefined || value === null) values[field.fieldName] = "";
    else if (typeof value === "number" || typeof value === "boolean") values[field.fieldName] = value;
    else if (typeof value === "object") values[field.fieldName] = JSON.stringify(value);
    else values[field.fieldName] = String(value);
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

async function appendMappedBitableRecords(token, appToken, tableId, mappedFields, rows) {
  let writtenCount = 0;
  const batches = chunkArray(rows, 500);
  for (const batch of batches) {
    const records = batch.map((row) => ({ fields: bitableFieldsForMappedRow(row, mappedFields) }));
    const data = await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`, {
      token,
      method: "POST",
      body: { records }
    });
    writtenCount += (data.records || data.items || []).length || records.length;
  }
  return { writtenCount };
}

function rowMatchesAny(sourceRow, targetRow) {
  const sourceKeys = new Set(rowMatchKeys(sourceRow));
  if (!sourceKeys.size) return false;
  return rowMatchKeys(targetRow).some((key) => sourceKeys.has(key));
}

function rowForMappedFields(row, mappedFields) {
  const fields = {};
  for (const field of mappedFields || []) {
    const value = rowValueForMappedColumn(row, field);
    if (value === undefined || value === null || value === "") continue;
    if (isBitableAttachmentValue(value)) fields[field.fieldName] = value;
    else fields[field.fieldName] = typeof value === "object" ? JSON.stringify(value) : value;
  }
  return fields;
}

async function syncRowsToBitable({ token, parsed, rows, options }) {
  const preferredTableId = options.feishuSheetId || parsed.tableId || "";
  let tableId = "";
  if (preferredTableId) {
    tableId = await chooseBitableTable(token, parsed.token, preferredTableId);
  } else {
    const tables = await listBitableTables(token, parsed.token);
    if (!tables.length) throw new Error("目标飞书多维表格没有可写入的数据表。");
    if (tables.length > 1 && !options.syncUseFirstSheet) {
      throw new Error(`检测到 ${tables.length} 个数据表，请填写同步子表 ID，或勾选“使用首个子表”。`);
    }
    tableId = tables[0]?.table_id || tables[0]?.id || "";
  }
  const mappedFields = await ensureMappedBitableFields(token, parsed.token, tableId, rows, options);
  const records = await readBitableRecords(token, parsed.token, tableId);
  const updateExisting = Boolean(options.syncUpdateExisting);
  const newRows = [];
  const handledRecordIds = new Set();
  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const existing = records.find((record) => rowMatchesAny(row, record.fields || {}));
    if (!existing) {
      if (newRows.some((newRow) => rowMatchesAny(row, newRow))) {
        skippedCount += 1;
        continue;
      }
      newRows.push(row);
      continue;
    }
    const recordId = existing.record_id || existing.id;
    if (handledRecordIds.has(recordId)) {
      skippedCount += 1;
      continue;
    }
    handledRecordIds.add(recordId);
    if (!updateExisting) {
      skippedCount += 1;
      continue;
    }
    const fields = rowForMappedFields(row, mappedFields);
    if (Object.keys(fields).length) {
      await updateBitableRecord(token, parsed.token, tableId, recordId, fields);
      updatedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  const result = newRows.length
    ? await appendMappedBitableRecords(token, parsed.token, tableId, mappedFields, newRows)
    : { writtenCount: 0 };
  if (result.writtenCount < newRows.length) {
    throw new Error(`飞书多维表格实际写入记录不足：应新增 ${newRows.length} 条，实际 ${result.writtenCount} 条。`);
  }
  return {
    ok: true,
    resourceType: "bitable",
    tableId,
    fieldCount: mappedFields.length,
    mappedColumns: mappedFields.filter((field) => field.canonicalField).length,
    writtenCount: result.writtenCount + updatedCount,
    appendedCount: result.writtenCount,
    updatedCount,
    skippedCount,
    inputCount: rows.length,
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

function googleSheetCsvUrl(value) {
  const parsed = new URL(String(value || "").trim());
  if (parsed.hostname !== "docs.google.com") return parsed.toString();
  const spreadsheetId = (parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/) || [])[1];
  if (!spreadsheetId) return parsed.toString();
  const gid = parsed.searchParams.get("gid") || (parsed.hash.match(/gid=(\d+)/) || [])[1] || "0";
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

async function readOnlineCreatorTable(url) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) throw new Error("请填写在线表格地址。");
  const parsedUrl = new URL(cleanUrl);
  if (parsedUrl.hostname.endsWith("feishu.cn") || parsedUrl.hostname.endsWith("larksuite.com")) {
    const options = await chrome.storage.local.get({ feishuAppId: "", feishuAppSecret: "" });
    if (!options.feishuAppId || !options.feishuAppSecret) throw new Error("读取飞书在线表格前，请先在飞书配置页填写 App ID 和 App Secret。");
    const token = await tenantToken(options.feishuAppId, options.feishuAppSecret);
    const target = await resolveWikiTarget(parseFeishuUrl(cleanUrl), token);
    if (target.resourceType === "bitable") {
      const tableId = await chooseBitableTable(token, target.token, target.tableId || "");
      const records = await readBitableRecords(token, target.token, tableId);
      return { ok: true, source: "飞书多维表格", rows: records.map((record) => record.fields || {}) };
    }
    if (target.resourceType !== "sheet") throw new Error("该飞书链接不是电子表格或多维表格。");
    const sheetId = await chooseSheet(token, target.token, target.sheetId || "");
    const matrix = await readSheetValuesFlexible(token, target.token, sheetId);
    return { ok: true, source: "飞书电子表格", matrix };
  }
  const response = await fetch(googleSheetCsvUrl(cleanUrl), { redirect: "follow" });
  if (!response.ok) throw new Error(`在线表格读取失败：HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (/spreadsheetml|application\/zip|octet-stream/i.test(contentType)) {
    throw new Error("在线地址返回的是 XLSX 文件，请先下载后使用“导入表格”。在线导入支持公开 CSV 和 Google Sheets。");
  }
  return { ok: true, source: parsedUrl.hostname === "docs.google.com" ? "Google Sheets" : "公开 CSV", csv: await response.text() };
}

function bitableRecordToDetailItem(record) {
  const row = record.fields || {};
  return {
    recordId: record.record_id || record.id,
    row,
    line: Object.values(row || {})
  };
}

function bitableNeedsDetail(item, fieldsMeta = [], options = {}) {
  if (!Object.values(item.row || {}).some(nonEmptyCell)) return false;
  if (!extractPgyUserId(item.row) && !detailUrlFromRow(item.row)) return false;
  const needsScreenshotAttachment = fieldsMeta.some((field) => {
    if (!isBitableAttachmentField(field)) return false;
    const fieldName = bitableFieldName(field);
    const kind = bitableAttachmentScreenshotKind(fieldName);
    if (kind === "audience" && !shouldCaptureFansScreenshot(options)) return false;
    if (kind === "overview" && !shouldCaptureNoteScreenshot(options)) return false;
    return Boolean(kind) && !nonEmptyCell(item.row[fieldName]);
  });
  if (needsScreenshotAttachment) return true;
  return DETAIL_FIELDS.some((fieldName) => !nonEmptyCell(item.row[bitableDetailFieldName(fieldsMeta, fieldName)]));
}

function bitableDetailFields(valuesByField, captures) {
  const fields = {};
  for (const fieldName of DETAIL_FIELDS) {
    if (fieldName === "粉丝画像截图") {
      if (!isFansScreenshotEnabledFromCaptures(captures)) continue;
      fields[fieldName] = captures.audience?.imageName || (captures.audience?.screenshot ? "已采集粉丝画像截图" : "");
      continue;
    }
    if (fieldName === "笔记数据截图") {
      if (!isNoteScreenshotEnabledFromCaptures(captures)) continue;
      fields[fieldName] = captures.overview?.imageName || (captures.overview?.screenshot ? "已采集笔记数据截图" : "");
      continue;
    }
    const value = valueForCanonicalField(valuesByField, fieldName);
    if (value !== undefined && value !== null && value !== "") fields[fieldName] = value;
  }
  return fields;
}

function isBitableAttachmentValue(value) {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && (item.file_token || item.fileToken));
}

function bitableBaseDetailFields(valuesByField, captures, fieldsMeta = []) {
  const fields = {};
  for (const fieldName of DETAIL_FIELDS) {
    if (fieldName === DETAIL_FIELDS[6]) {
      if (!isFansScreenshotEnabledFromCaptures(captures)) continue;
      fields[fieldName] = captures?.audience?.imageName || (captures?.audience?.screenshot ? "已采集粉丝画像截图" : "");
      continue;
    }
    if (fieldName === DETAIL_FIELDS[7]) {
      if (!isNoteScreenshotEnabledFromCaptures(captures)) continue;
      fields[fieldName] = captures?.overview?.imageName || (captures?.overview?.screenshot ? "已采集笔记数据截图" : "");
      continue;
    }
    const value = valueForCanonicalField(valuesByField, fieldName);
    if (value !== undefined && value !== null && value !== "") fields[bitableDetailFieldName(fieldsMeta, fieldName)] = value;
  }
  return fields;
}

async function uploadBitableScreenshot(token, appToken, dataUrl, name) {
  if (!dataUrl) return "";
  const blob = dataUrlBlob(dataUrl, "image/png");
  const form = new FormData();
  form.append("file_name", name || `pgy-detail-${Date.now()}.png`);
  form.append("parent_type", "bitable_image");
  form.append("parent_node", appToken);
  form.append("size", String(blob.size));
  form.append("file", blob, name || "pgy-detail.png");
  const data = await feishuFormFetch("/drive/v1/medias/upload_all", { token, form });
  return data.file_token || data.fileToken || "";
}

async function putBitableScreenshotAttachment(fields, { token, appToken, fieldsMeta, fieldName, kind, capture }) {
  if (kind === "overview" && !isNoteScreenshotEnabledFromCaptures({ overview: capture })) return;
  if (kind === "audience" && !isFansScreenshotEnabledFromCaptures({ audience: capture })) return;
  if (!capture?.screenshot) return;
  const attachmentField = bitableScreenshotAttachmentField(fieldsMeta, fieldName);
  if (!attachmentField) return;
  const targetName = bitableFieldName(attachmentField);
  const fileToken = await uploadBitableScreenshot(token, appToken, capture.screenshot, capture.imageName || `${fieldName}.png`);
  if (!fileToken) return;
  fields[targetName] = [{ file_token: fileToken }];
  const originalField = findBitableFieldByName(fieldsMeta, fieldName);
  if (originalField && !isBitableAttachmentField(originalField) && targetName !== fieldName) {
    fields[fieldName] = capture.imageName || "已采集截图，见附件字段";
  }
}

async function bitableDetailFieldsWithAttachments({ token, appToken, fieldsMeta, valuesByField, captures }) {
  const fields = bitableBaseDetailFields(valuesByField, captures, fieldsMeta);
  await putBitableScreenshotAttachment(fields, {
    token,
    appToken,
    fieldsMeta,
    fieldName: DETAIL_FIELDS[6],
    kind: "audience",
    capture: captures?.audience
  });
  await putBitableScreenshotAttachment(fields, {
    token,
    appToken,
    fieldsMeta,
    fieldName: DETAIL_FIELDS[7],
    kind: "overview",
    capture: captures?.overview
  });
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
  const preferredSheetId = options.feishuSheetId || parsed.sheetId || "";
  let sheetId = "";
  if (preferredSheetId) {
    sheetId = await chooseSheet(token, parsed.token, preferredSheetId);
  } else {
    const sheets = await listSheets(token, parsed.token);
    if (!sheets.length) throw new Error("目标飞书电子表格没有可写入的子表。");
    if (sheets.length > 1 && !options.syncUseFirstSheet) {
      throw new Error(`检测到 ${sheets.length} 个子表，请填写同步子表 ID，或勾选“使用首个子表”。`);
    }
    sheetId = sheets[0]?.sheet_id || sheets[0]?.id || "";
  }
  const beforeValues = await readSheetValuesFlexible(token, parsed.token, sheetId);
  const beforeRowCount = nonEmptyDataRowCount(beforeValues);
  const shape = await ensureMappedSheetShape(token, parsed.token, sheetId, beforeValues, rows, options);
  const latestValues = await readSheetValuesFlexible(token, parsed.token, sheetId);
  const latestShape = detectSheetShape(latestValues);
  const sheetItems = sheetRowsToShapeObjects(latestValues, latestShape).filter((item) => Object.values(item.row || {}).some(nonEmptyCell));
  const updateExisting = Boolean(options.syncUpdateExisting);
  const newRows = [];
  const handledRowNumbers = new Set();
  let updatedCount = 0;
  let skippedCount = 0;
  for (const row of rows) {
    const existing = sheetItems.find((item) => rowMatchesAny(row, item.row));
    if (!existing) {
      if (newRows.some((newRow) => rowMatchesAny(row, newRow))) {
        skippedCount += 1;
        continue;
      }
      newRows.push(row);
      continue;
    }
    if (handledRowNumbers.has(existing.rowNumber)) {
      skippedCount += 1;
      continue;
    }
    handledRowNumbers.add(existing.rowNumber);
    if (!updateExisting) {
      skippedCount += 1;
      continue;
    }
    let rowWrites = 0;
    for (const column of latestShape.columns) {
      if (!column.canonicalField && !column.fieldName) continue;
      const value = rowValueForMappedColumn(row, column);
      if (value === undefined || value === null || value === "") continue;
      const cellResult = await writeSheetCellByColumnBestEffort(
        token,
        parsed.token,
        sheetId,
        column.columnIndex,
        existing.rowNumber,
        value,
        column.fieldName || column.canonicalField
      );
      if (cellResult.ok) rowWrites += 1;
    }
    if (rowWrites) updatedCount += 1;
    else skippedCount += 1;
  }
  const result = newRows.length
    ? await appendMappedSheetRows(token, parsed.token, sheetId, shape, newRows)
    : { updates: { updatedRows: 0 } };
  const actualWrittenCount = appendWrittenCount(result);
  if (actualWrittenCount && actualWrittenCount < newRows.length) {
    throw new Error(`飞书返回的实际写入行数不足：应新增 ${newRows.length} 条，实际 ${actualWrittenCount} 条。`);
  }
  const afterRowCount = nonEmptyDataRowCount(await readSheetValuesFlexible(token, parsed.token, sheetId));
  if (afterRowCount < beforeRowCount + newRows.length) {
    throw new Error(`飞书写入后读回校验失败：写入前 ${beforeRowCount} 行，预期写入后至少 ${beforeRowCount + newRows.length} 行，实际 ${afterRowCount} 行。请检查目标表是否为电子表格、是否选对了子表，以及权限是否为可编辑。`);
  }
  return {
    ok: true,
    resourceType: "sheet",
    sheetId,
    fieldCount: shape.columns.length,
    mappedColumns: shape.columns.filter((column) => column.canonicalField).length,
    headerRows: shape.headerRows,
    writtenCount: newRows.length + updatedCount,
    appendedCount: newRows.length,
    updatedCount,
    skippedCount,
    inputCount: rows.length,
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

function collectionRequirementsForFields(fields = []) {
  const detailFieldSet = new Set(DETAIL_FIELDS);
  const detectedDetailFields = [];
  let captureFansScreenshot = false;
  let captureNoteScreenshot = false;

  for (const field of fields) {
    const fieldName = String(field?.fieldName || field?.name || "").trim();
    const canonicalField = String(field?.canonicalField || canonicalFieldForHeader(fieldName) || "").trim();
    const normalizedName = normalizeKey(fieldName);
    const isFansScreenshot = canonicalField === DETAIL_FIELDS[6] || (normalizedName.includes("粉丝画像") && normalizedName.includes("截图"));
    const isNoteScreenshot = canonicalField === DETAIL_FIELDS[7] || (normalizedName.includes("笔记数据") && normalizedName.includes("截图"));
    if (isFansScreenshot) captureFansScreenshot = true;
    if (isNoteScreenshot) captureNoteScreenshot = true;
    if (!detailFieldSet.has(canonicalField) && !isFansScreenshot && !isNoteScreenshot) continue;
    const detectedName = canonicalField || (isFansScreenshot ? DETAIL_FIELDS[6] : DETAIL_FIELDS[7]);
    if (!detectedDetailFields.includes(detectedName)) detectedDetailFields.push(detectedName);
  }

  return {
    collectionMode: detectedDetailFields.length ? "detail" : "fast",
    detectedDetailFields,
    detailCaptureFansScreenshot: captureFansScreenshot,
    detailCaptureNoteScreenshot: captureNoteScreenshot
  };
}

function collectionRequirementsForSheetValues(values) {
  if (!effectiveSheetWidth(values)) {
    return {
      collectionMode: "fast",
      detectedDetailFields: [],
      detailCaptureFansScreenshot: false,
      detailCaptureNoteScreenshot: false
    };
  }
  return collectionRequirementsForFields(detectSheetShape(values).columns);
}

function applyCollectionRequirements(options, requirements = {}) {
  return {
    ...(options || {}),
    collectionMode: requirements.collectionMode === "detail" ? "detail" : "fast",
    detailCaptureFansScreenshot: Boolean(requirements.detailCaptureFansScreenshot),
    detailCaptureNoteScreenshot: Boolean(requirements.detailCaptureNoteScreenshot)
  };
}

async function validateFeishuSyncTarget(options) {
  const appId = options.feishuAppId;
  const appSecret = options.feishuAppSecret;
  const feishuUrl = options.feishuUrl;
  if (!appId || !appSecret || !feishuUrl) throw new Error("请先填写飞书 App ID、App Secret 和同步达人飞书表格。");
  const token = await tenantToken(appId, appSecret);
  const parsed = await resolveWikiTarget(parseFeishuUrl(feishuUrl), token);
  if (parsed.resourceType === "bitable") {
    const tables = await listBitableTables(token, parsed.token);
    if (!tables.length) throw new Error("目标飞书多维表格没有可写入的数据表。");
    const preferredTableId = options.feishuSheetId || parsed.tableId || "";
    if (tables.length > 1 && !preferredTableId && !options.syncUseFirstSheet) {
      return {
        ok: true,
        resourceType: "bitable",
        requiresMultiSheetChoice: true,
        tableCount: tables.length,
        tables: tables.map((table) => ({
          tableId: table.table_id || table.id,
          title: table.name || table.title || table.table_id || table.id
        }))
      };
    }
    const tableId = preferredTableId
      ? await chooseBitableTable(token, parsed.token, preferredTableId)
      : (tables[0]?.table_id || tables[0]?.id);
    const fields = await listBitableFields(token, parsed.token, tableId);
    const collectionRequirements = collectionRequirementsForFields(fields.map((field) => ({
      fieldName: bitableFieldName(field)
    })));
    return { ok: true, resourceType: "bitable", tableId, tableCount: tables.length, ...collectionRequirements };
  }
  if (parsed.resourceType !== "sheet") throw new Error("同步达人当前仅支持飞书电子表格或多维表格。");
  const sheets = await listSheets(token, parsed.token);
  if (!sheets.length) throw new Error("目标飞书电子表格没有可写入的子表。");
  const preferredSheetId = options.feishuSheetId || parsed.sheetId || "";
  if (sheets.length > 1 && !preferredSheetId && !options.syncUseFirstSheet) {
    return {
      ok: true,
      resourceType: "sheet",
      requiresMultiSheetChoice: true,
      sheetCount: sheets.length,
      sheets: sheets.map((sheet) => ({
        sheetId: sheet.sheet_id || sheet.id,
        title: sheet.title || sheet.name || sheet.sheet_id || sheet.id
      }))
    };
  }
  const sheetId = preferredSheetId
    ? await chooseSheet(token, parsed.token, preferredSheetId)
    : (sheets[0]?.sheet_id || sheets[0]?.id);
  const values = await readSheetValues(token, parsed.token, sheetId, "A1:ZZ20");
  const collectionRequirements = collectionRequirementsForSheetValues(values);
  return { ok: true, resourceType: "sheet", sheetId, sheetCount: sheets.length, ...collectionRequirements };
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

function percentPointText(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = numericValue(value);
  if (typeof number !== "number" || !Number.isFinite(number)) return String(value);
  return `${Math.round(number * 100) / 100}%`;
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

function ratioFromTextValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  const percent = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (percent) return ratioFromApiValue(percent[1]);
  const number = numericValue(text);
  if (typeof number !== "number" || !Number.isFinite(number)) return null;
  return ratioFromApiValue(number);
}

function ageRatiosFromText(text) {
  const source = String(text || "")
    .normalize("NFKC")
    .replace(/[‐‑‒–—－]/g, "-")
    .replace(/[～]/g, "~")
    .replace(/\s+/g, " ");
  const specs = [
    ["fans_under_18_ratio", /(?:<\s*18|小于\s*18|未满\s*18|18\s*岁以下|0\s*[-~至到]\s*17)[^\d%]{0,24}(-?\d+(?:\.\d+)?)\s*%/i],
    ["fans_18_24_ratio", /(?:18\s*[-~至到]\s*24|18\s*岁?\s*至\s*24|18\s*到\s*24)[^\d%]{0,24}(-?\d+(?:\.\d+)?)\s*%/i],
    ["fans_25_34_ratio", /(?:25\s*[-~至到]\s*34|25\s*岁?\s*至\s*34|25\s*到\s*34)[^\d%]{0,24}(-?\d+(?:\.\d+)?)\s*%/i],
    ["fans_35_44_ratio", /(?:35\s*[-~至到]\s*44|35\s*岁?\s*至\s*44|35\s*到\s*44)[^\d%]{0,24}(-?\d+(?:\.\d+)?)\s*%/i],
    ["fans_44_plus_ratio", /(?:>\s*44|44\s*\+|44\s*岁?(?:以上|及以上)|大于\s*44|45\s*岁?(?:以上|及以上))[^\d%]{0,24}(-?\d+(?:\.\d+)?)\s*%/i]
  ];
  const output = {};
  for (const [key, pattern] of specs) {
    const match = source.match(pattern);
    const ratio = match ? ratioFromApiValue(match[1]) : null;
    if (ratio !== null) output[key] = ratio;
  }
  if (output.fans_35_44_ratio !== undefined || output.fans_44_plus_ratio !== undefined) {
    output.fans_35_plus_ratio = Math.min((Number(output.fans_35_44_ratio) || 0) + (Number(output.fans_44_plus_ratio) || 0), 1);
  }
  return output;
}

function ageRatiosFromDetailAndCaptures(detail, captures = {}) {
  const raw = detail?.raw_payload && typeof detail.raw_payload === "object" ? detail.raw_payload : {};
  const fan = raw.fan_analysis && typeof raw.fan_analysis === "object" ? raw.fan_analysis : {};
  const textRatios = ageRatiosFromText([
    captures.audience?.text,
    detail?.audience_age_distribution,
    fan.age_distribution,
    raw.age_distribution
  ].filter(Boolean).map((value) => (typeof value === "string" ? value : jsonText(value))).join(" "));
  const output = { ...textRatios };
  const keys = ["fans_under_18_ratio", "fans_18_24_ratio", "fans_25_34_ratio", "fans_35_44_ratio", "fans_44_plus_ratio", "fans_35_plus_ratio"];
  for (const key of keys) {
    const ratio = ratioFromTextValue(valueOrRaw(detail, key));
    if (ratio !== null) output[key] = ratio;
  }
  if (output.fans_35_plus_ratio === undefined && (output.fans_35_44_ratio !== undefined || output.fans_44_plus_ratio !== undefined)) {
    output.fans_35_plus_ratio = Math.min((Number(output.fans_35_44_ratio) || 0) + (Number(output.fans_44_plus_ratio) || 0), 1);
  }
  return output;
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
    exposure_count: firstDefined(item.impNum, item.exposure_count, item.exposureCount),
    read_count: firstDefined(item.readNum, item.read_count, item.readCount),
    interaction_count: firstDefined(item.interactionNum, item.interaction_count, item.interactionCount),
    like_count: firstDefined(item.likeNum, item.like_count, item.likeCount),
    save_count: firstDefined(item.collectNum, item.save_count, item.collectCount),
    comment_count: firstDefined(item.cmtNum, item.comment_count, item.commentCount),
    share_count: firstDefined(item.shareNum, item.share_count, item.shareCount),
    third_read_user_count: firstDefined(item.thirdReadUserNum, item.third_read_user_count),
    is_advertise: typeof item.isAdvertise === "boolean" ? item.isAdvertise : undefined,
    note_type: item.isVideo ? "视频笔记" : "图文笔记",
    source: "detail_api"
  };
  for (const key of Object.keys(note)) {
    if (note[key] === "" || note[key] === null || note[key] === undefined) delete note[key];
  }
  return note.note_id || note.title ? note : null;
}

function noteCasesFromApiCache(cache, maxCases = 80) {
  const notesDetail = cache?.notes_detail && typeof cache.notes_detail === "object" ? cache.notes_detail : {};
  const cases = [];
  const seen = new Set();
  const businessBuckets = notesDetail.daily || notesDetail.cooperation
    ? notesDetail
    : { unknown: notesDetail };
  for (const business of Object.keys(businessBuckets)) {
    const byNoteType = businessBuckets[business];
    if (!byNoteType || typeof byNoteType !== "object") continue;
    for (const noteType of Object.keys(byNoteType)) {
      const pages = byNoteType[noteType];
      if (!pages || typeof pages !== "object") continue;
      for (const pageNo of Object.keys(pages).sort((a, b) => Number(a) - Number(b))) {
        const payload = pages[pageNo];
        const list = Array.isArray(payload?.list) ? payload.list : Array.isArray(payload?.items) ? payload.items : [];
        for (const item of list) {
          const note = noteCaseFromApiItem(item);
          if (!note) continue;
          note.business = note.is_advertise ? "cooperation" : business;
          const key = note.note_id || `${note.business}|${note.title || ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          cases.push(note);
          if (cases.length >= maxCases) return cases;
        }
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
  const detailProfile = cache.blogger_profile && typeof cache.blogger_profile === "object" ? cache.blogger_profile : {};
  const listProfile = cache.blogger_list_profile && typeof cache.blogger_list_profile === "object" ? cache.blogger_list_profile : {};
  const profile = { ...detailProfile, ...listProfile };
  const fansSummary = cache.fans_summary && typeof cache.fans_summary === "object" ? cache.fans_summary : {};
  const fansProfile = cache.fans_profile && typeof cache.fans_profile === "object" ? cache.fans_profile : {};
  const dailySummary = cache.data_summary?.daily && typeof cache.data_summary.daily === "object" ? cache.data_summary.daily : {};
  const coopSummary = cache.data_summary?.cooperation && typeof cache.data_summary.cooperation === "object" ? cache.data_summary.cooperation : {};
  const dailyRate = cache.notes_rate?.daily && typeof cache.notes_rate.daily === "object" ? cache.notes_rate.daily : {};
  const coopRate = cache.notes_rate?.cooperation && typeof cache.notes_rate.cooperation === "object" ? cache.notes_rate.cooperation : {};

  if (profile.name && !result.nickname) result.nickname = cleanJsonText(profile.name);
  const redId = cleanJsonText(firstDefined(profile.redId, profile.red_id, profile.redID, profile.redBookId, profile.redbookId, profile.red_book_id, profile.xiaohongshuId, profile.xiaohongshu_id, profile.xhsId, profile.xhs_id));
  if (redId && !result.xiaohongshu_id) result.xiaohongshu_id = redId;
  if (profile.location && !result.ip_city) result.ip_city = cleanJsonText(profile.location);
  if (!result.organization_name) {
    const organizationName = cleanJsonText(firstDefined(profile.mcnName, profile.mcn_name, profile.agencyName, profile.organizationName, profile.orgName, profile.companyName, profile.bloggerCompany));
    if (organizationName) result.organization_name = organizationName;
  }
  if (profile.fansCount !== undefined && !result.followers_count) result.followers_count = numericValue(profile.fansCount);
  if (profile.likeCollectCountInfo !== undefined && !result.liked_collected_count) result.liked_collected_count = numericValue(profile.likeCollectCountInfo);
  if (profile.picturePrice !== undefined && !result.quote_price) result.quote_price = numericValue(profile.picturePrice);
  if (profile.videoPrice !== undefined && !result.video_quote_price) result.video_quote_price = numericValue(profile.videoPrice);
  if (dailyRate.noteType !== undefined && !result.note_type) result.note_type = dailyRate.noteType;
  if (profile.contentTags !== undefined && !result.contentTags) result.contentTags = profile.contentTags;

  if (dailySummary.readMedian !== undefined && !result.daily_read_median) result.daily_read_median = numericValue(dailySummary.readMedian);
  if (dailySummary.mAccumImpNum !== undefined && !result.daily_exposure_median) result.daily_exposure_median = numericValue(dailySummary.mAccumImpNum);
  if ((dailySummary.mEngagementNum || dailySummary.interactionMedian) !== undefined && !result.daily_interaction_median) {
    result.daily_interaction_median = numericValue(dailySummary.mEngagementNum || dailySummary.interactionMedian);
  }
  const cooperationReadMedian = firstDefined(coopRate.readMedian, coopSummary.readMedian, coopRate.readMidCoop30, listProfile.readMidCoop30, profile.readMidCoop30);
  if (cooperationReadMedian !== undefined && !result.cooperation_read_median) result.cooperation_read_median = numericValue(cooperationReadMedian);
  const cooperationExposureMedian = firstDefined(coopRate.impMedian, coopSummary.mAccumImpNum, coopRate.mAccumImpNum, coopRate.accumCoopImpMedinNum30d, listProfile.accumCoopImpMedinNum30d, profile.accumCoopImpMedinNum30d);
  if (cooperationExposureMedian !== undefined && !result.cooperation_exposure_median) result.cooperation_exposure_median = numericValue(cooperationExposureMedian);
  const cooperationInteractionMedian = firstDefined(coopRate.interactionMedian, coopSummary.interactionMedian, coopSummary.mEngagementNum, coopRate.interMidCoop30, listProfile.interMidCoop30, profile.interMidCoop30);
  if (cooperationInteractionMedian !== undefined && !result.cooperation_interaction_median) result.cooperation_interaction_median = numericValue(cooperationInteractionMedian);
  const cooperationNoteCount = firstDefined(profile.businessNoteCount, profile.cooperationNoteCount, profile.coopNoteNum30d, coopSummary.noteNumber, coopRate.noteNumber);
  if (cooperationNoteCount !== undefined && !result.cooperation_note_count) result.cooperation_note_count = numericValue(cooperationNoteCount);
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
      const label = String(item.label || "");
      if ((/^<\s*18$/.test(label) || /18岁以下|未满18/.test(label)) && result.fans_under_18_ratio === undefined) result.fans_under_18_ratio = item.ratio;
      if ((/^18\s*[-~至]\s*24$/.test(label) || /18\s*[-~至]\s*24岁?/.test(label)) && result.fans_18_24_ratio === undefined) result.fans_18_24_ratio = item.ratio;
      if ((/^25\s*[-~至]\s*34$/.test(label) || /25\s*[-~至]\s*34岁?/.test(label)) && result.fans_25_34_ratio === undefined) result.fans_25_34_ratio = item.ratio;
      if ((/^35\s*[-~至]\s*44$/.test(label) || /35\s*[-~至]\s*44岁?/.test(label)) && result.fans_35_44_ratio === undefined) result.fans_35_44_ratio = item.ratio;
      if ((/^>\s*44$/.test(label) || /44岁以上|45/.test(label)) && result.fans_44_plus_ratio === undefined) result.fans_44_plus_ratio = item.ratio;
    }
    result.audience_age_distribution = { segments: ageSegments, dominant: ageSegments.slice().sort((a, b) => b.ratio - a.ratio)[0], source: "detail_api" };
  }
  if (result.fans_35_44_ratio !== undefined || result.fans_44_plus_ratio !== undefined) {
    result.fans_35_plus_ratio = Math.min((Number(result.fans_35_44_ratio) || 0) + (Number(result.fans_44_plus_ratio) || 0), 1);
  }

  const regionSegments = profileDistributionItems(firstDefined(fansProfile.provinces, fansProfile.regions), ["name", "label", "province"], ["percent", "ratio", "value"]).slice(0, 10);
  if (regionSegments.length) {
    result.audience_region_distribution = {
      raw_text: regionSegments.slice(0, 5).map((item) => `${item.label}(${percentText(item.ratio)})`).join("、"),
      source: "detail_api",
      top_regions: regionSegments,
      dominant: regionSegments[0],
      scope: "province"
    };
  }
  const citySegments = profileDistributionItems(firstDefined(fansProfile.cities, fansProfile.citys), ["name", "label", "city"], ["percent", "ratio", "value"]).slice(0, 10);
  if (citySegments.length) {
    result.audience_city_distribution = {
      raw_text: citySegments.slice(0, 5).map((item) => `${item.label}(${percentText(item.ratio)})`).join("、"),
      source: "detail_api",
      top_cities: citySegments,
      dominant: citySegments[0],
      scope: "city"
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
  const interestSegments = profileDistributionItems(interests, ["name", "label", "tag", "contentTag"], ["percent", "ratio", "value"]).slice(0, 10);
  if (interestSegments.length) {
    result.audience_interest_distribution = {
      raw_text: interestSegments.slice(0, 5).map((item) => `${item.label}(${percentText(item.ratio)})`).join("、"),
      source: "detail_api",
      top_interests: interestSegments,
      dominant: interestSegments[0]
    };
  }
  if (Array.isArray(interests) && !result.topic_point) {
    const labels = interests.map((item) => cleanJsonText(typeof item === "object" ? firstDefined(item.name, item.label, item.tag, item.contentTag) : item)).filter(Boolean);
    if (labels.length) result.topic_point = labels.slice(0, 5).join("、");
  }

  const notes = noteCasesFromApiCache(cache);
  if (notes.length) raw.note_cases = notes;

  note.exposure_median = firstDefined(note.exposure_median, dailyRate.impMedian, dailySummary.mAccumImpNum);
  note.read_median = firstDefined(note.read_median, dailyRate.readMedian, dailySummary.readMedian);
  note.interaction_median = firstDefined(note.interaction_median, dailyRate.interactionMedian, dailySummary.mEngagementNum);
  note.interaction_rate = firstDefined(note.interaction_rate, ratioFromApiValue(firstDefined(dailyRate.interactionRate, dailyRate.engagementRate, dailyRate.engageRate)));
  note.video_completion_rate = firstDefined(
    note.video_completion_rate,
    ratioFromApiValue(firstDefined(dailyRate.videoFullViewRate, dailyRate.videoFullViewRate30, dailyRate.videoFinishRate, dailyRate.video_completion_rate, dailyRate.videoCompleteRate))
  );
  note.thousand_like_note_ratio = firstDefined(note.thousand_like_note_ratio, ratioFromApiValue(firstDefined(dailyRate.thousandLikePercent, dailyRate.thousandLikePercent30)));
  note.hundred_like_note_ratio = firstDefined(note.hundred_like_note_ratio, ratioFromApiValue(firstDefined(dailyRate.hundredLikePercent, dailyRate.hundredLikePercent30)));
  note.like_median = firstDefined(note.like_median, dailyRate.likeMedian, dailyRate.medianLikeCount, dailyRate.likeMidNum);
  note.collect_median = firstDefined(note.collect_median, dailyRate.collectMedian, dailyRate.medianCollectCount, dailyRate.collectMidNum);
  note.comment_median = firstDefined(note.comment_median, dailyRate.commentMedian, dailyRate.medianCommentCount, dailyRate.commentMidNum);
  note.share_median = firstDefined(note.share_median, dailyRate.shareMedian, dailyRate.medianShareCount, dailyRate.shareMidNum);
  note.follow_median = firstDefined(note.follow_median, dailyRate.mFollowCnt, dailyRate.mfollowCnt);
  note.picture_3s_read_rate = firstDefined(
    note.picture_3s_read_rate,
    ratioFromApiValue(firstDefined(dailyRate.picture3sViewRate, dailyRate.picture3sViewRate30, dailyRate.picture3sReadRate, dailyRate.pictureThreeSecondReadRate, dailyRate.pic3sReadRate, dailyRate.picture_3s_read_rate))
  );

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

function hasUsableFastDetailData(detail) {
  const summary = buildDetailSummary(detail);
  if (!summary.has_basic_profile) return false;
  return [
    summary.has_note_performance,
    summary.has_fan_analysis,
    summary.has_region_distribution,
    summary.has_device_distribution,
    summary.has_service_performance,
    summary.has_note_cases
  ].some(Boolean);
}

function detailValuesForSheet(detail, captures, status, note = "") {
  const raw = detail?.raw_payload && typeof detail.raw_payload === "object" ? detail.raw_payload : {};
  const summary = buildDetailSummary(detail, captures);
  const ageRatios = ageRatiosFromDetailAndCaptures(detail, captures);
  return {
    "详情补采状态": status,
    "详情补采时间": nowLocalText(),
    "详情完整度": `${summary.module_count}个模块 / 笔记${summary.note_case_count}条`,
    "详情API捕获摘要": jsonText(raw.detail_api_capture_summary || {}),
    "小红书号": valueOrRaw(detail, "xiaohongshu_id") || fallbackRedIdValue(detail),
    "个人简介": valueOrRaw(detail, "personal_intro"),
    "博主优势": valueOrRaw(detail, "blogger_advantage"),
    "博主类型": creatorTypeFromDetail(detail),
    "粉丝画像文本": captures.audience?.text || "",
    "笔记数据文本": captures.overview?.text || "",
    "中位点赞量": valueOrRaw(detail, "like_median"),
    "中位收藏量": valueOrRaw(detail, "collect_median"),
    "中位评论量": valueOrRaw(detail, "comment_median"),
    "中位分享量": valueOrRaw(detail, "share_median"),
    "中位关注量": valueOrRaw(detail, "follow_median"),
    "互动率": percentText(valueOrRaw(detail, "interaction_rate")),
    "完播率": percentText(valueOrRaw(detail, "video_completion_rate")),
    "视频完播率": percentText(valueOrRaw(detail, "video_completion_rate")),
    "图文3秒阅读率": percentText(valueOrRaw(detail, "picture_3s_read_rate")),
    "女性粉丝占比": percentText(valueOrRaw(detail, "female_fans_ratio")),
    "男性粉丝占比": percentText(valueOrRaw(detail, "male_fans_ratio")),
    "所属机构": valueOrRaw(detail, "organization_name"),
    "<18粉丝占比": percentText(ageRatios.fans_under_18_ratio),
    "18-24粉丝占比": percentText(ageRatios.fans_18_24_ratio),
    "25-34粉丝占比": percentText(ageRatios.fans_25_34_ratio),
    "35-44粉丝占比": percentText(ageRatios.fans_35_44_ratio),
    "44岁以上粉丝占比": percentText(ageRatios.fans_44_plus_ratio),
    "35岁以上粉丝占比": percentText(ageRatios.fans_35_plus_ratio),
    "活跃粉丝占比": percentText(valueOrRaw(detail, "active_fans_ratio")),
    "阅读粉丝占比": percentText(valueOrRaw(detail, "read_fans_ratio")),
    "互动粉丝占比": percentText(valueOrRaw(detail, "interaction_fans_ratio")),
    "下单粉丝占比": percentText(valueOrRaw(detail, "order_fans_ratio")),
    "粉丝增长率": percentText(valueOrRaw(detail, "fans_growth_ratio")),
    "粉丝量变化幅度": percentText(valueOrRaw(detail, "fans_growth_ratio")),
    "粉丝性别分布": jsonText(valueOrRaw(detail, "audience_gender_distribution")),
    "粉丝年龄分布": jsonText(valueOrRaw(detail, "audience_age_distribution")),
    "粉丝地域分布": jsonText(valueOrRaw(detail, "audience_region_distribution")),
    "粉丝城市分布": jsonText(valueOrRaw(detail, "audience_city_distribution")),
    "用户设备分布": jsonText(valueOrRaw(detail, "audience_device_distribution")),
    "用户兴趣": valueOrRaw(detail, "topic_point"),
    "用户兴趣分布": jsonText(valueOrRaw(detail, "audience_interest_distribution")),
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

async function waitAfterDetailRequest(options = {}) {
  const fastMode = Boolean(options.directExportFastMode);
  await sleep(randomInt(
    fastMode ? DETAIL_FAST_REQUEST_DELAY_MIN_MS : DETAIL_REQUEST_DELAY_MIN_MS,
    fastMode ? DETAIL_FAST_REQUEST_DELAY_MAX_MS : DETAIL_REQUEST_DELAY_MAX_MS
  ));
}

function isDetailRateLimitError(error) {
  if (error?.paused) return true;
  const message = String(error?.message || error || "");
  return /频繁|限频|稍后再试|人机验证|rate.?limit|too many|429/i.test(message);
}

async function collectDetailPayloadWithCooldown(row, index, options = {}) {
  let retries = 0;
  while (!detailStopRequested) {
    try {
      const fastPayload = await collectDetailPayloadFast(row, index, options).catch((error) => {
        if (options.directExportFastMode) throw error;
        return null;
      });
      if (fastPayload?.ok) return fastPayload;
      if (options.directExportFastMode) throw new Error("极速详情接口未返回有效数据");
      const reusablePayload = await collectDetailPayloadWithReusableTab(row, index, options).catch(() => null);
      if (reusablePayload?.ok) return reusablePayload;
      return await collectDetailPayload(row, index, options);
    } catch (error) {
      if (options.directExportFastMode) throw error;
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
      await waitAfterDetailRequest(options);
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

function detailBackfillConcurrencyForOptions(options = {}) {
  if (options.directExportFastMode) return DETAIL_BACKFILL_CONCURRENCY;
  if (DETAIL_FAST_API_MODE && !shouldCaptureFansScreenshot(options) && !shouldCaptureNoteScreenshot(options)) return 1;
  return DETAIL_BACKFILL_CONCURRENCY;
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

async function withDetailOpenTabStagger(task) {
  const previous = detailOpenTabGate;
  let release;
  detailOpenTabGate = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    setTimeout(release, DETAIL_OPEN_TAB_STAGGER_MS);
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

function shouldCaptureFansScreenshot(options = {}) {
  return Boolean(options.detailCaptureFansScreenshot);
}

function shouldCaptureNoteScreenshot(options = {}) {
  return Boolean(options.detailCaptureNoteScreenshot);
}

function skippedAudienceCapture() {
  return {
    ok: true,
    kind: "audience",
    found: false,
    text: "",
    screenshot: "",
    imageName: "",
    screenshotSkipped: true,
    skippedByOption: true
  };
}

function skippedOverviewCapture() {
  return {
    ok: true,
    kind: "overview",
    found: false,
    text: "",
    screenshot: "",
    imageName: "",
    screenshotSkipped: true,
    skippedByOption: true
  };
}

function isFansScreenshotEnabledFromCaptures(captures = {}) {
  return !captures.audience?.skippedByOption;
}

function isNoteScreenshotEnabledFromCaptures(captures = {}) {
  return !captures.overview?.skippedByOption;
}

function detailStatusByCapture(captures = {}, successStatus = "已补足", missingAudienceStatus = "已补足-未确认粉丝画像") {
  if (!isFansScreenshotEnabledFromCaptures(captures)) return successStatus;
  return captures.audience?.found ? successStatus : missingAudienceStatus;
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

async function readReusableDetailApiCache(tabId) {
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
      function ready(state) {
        const cache = state?.cache || {};
        return Boolean(
          cache.blogger_profile
          && cache.fans_summary
          && cache.fans_profile
          && cache.notes_rate?.daily
          && cache.data_summary?.daily
        );
      }
      async function sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
      for (let index = 0; index < 40; index += 1) {
        const state = window.__PGY_DETAIL_API_CACHE__;
        if (ready(state)) return { ok: true, ...clone(state) };
        await sleep(250);
      }
      const state = clone(window.__PGY_DETAIL_API_CACHE__ || {});
      return { ok: ready(state), ...state };
    }
  });
  return result?.result || { ok: false, cache: {}, responses: [] };
}

async function prefetchDetailBusinessData(tabId, business = "cooperation") {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (targetBusiness) => {
      if (typeof window.__PGY_DETAIL_API_PREFETCH__ !== "function") {
        return { ok: false, skipped: true, message: "详情页未捕获到可复用的合作笔记请求模板" };
      }
      return window.__PGY_DETAIL_API_PREFETCH__(targetBusiness);
    },
    args: [business]
  });
  return result?.result || { ok: false, skipped: true };
}

async function findPgyContextTab() {
  const tabs = await chrome.tabs.query({ url: "https://pgy.xiaohongshu.com/*" }).catch(() => []);
  return tabs.find((tab) => tab?.id && !String(tab.url || "").includes("/solar/pre-trade/blogger-detail/"))
    || tabs.find((tab) => tab?.id)
    || null;
}

function fastDetailApiUrls(userId) {
  const encoded = encodeURIComponent(userId);
  const requests = [
    { kind: "blogger_profile", url: `/api/solar/cooperator/user/blogger/${encoded}` },
    { kind: "fans_summary", url: `/api/solar/kol/data_v3/fans_summary?userId=${encoded}` },
    { kind: "fans_profile", url: `/api/solar/kol/data/${encoded}/fans_profile` },
    { kind: "notes_rate", business: "daily", url: `/api/solar/kol/data_v3/notes_rate?userId=${encoded}&business=0&noteType=3&dateType=1&advertiseSwitch=1` },
    { kind: "notes_rate", business: "cooperation", url: `/api/solar/kol/data_v3/notes_rate?userId=${encoded}&business=1&noteType=3&dateType=1&advertiseSwitch=1` },
    { kind: "data_summary", business: "daily", url: `/api/pgy/kol/data/data_summary?userId=${encoded}&business=0` },
    { kind: "data_summary", business: "cooperation", url: `/api/pgy/kol/data/data_summary?userId=${encoded}&business=1` }
  ];
  for (const business of ["daily", "cooperation"]) {
    for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
      const businessValue = business === "cooperation" ? 1 : 0;
      requests.push({
        kind: "notes_detail",
        business,
        noteType: 4,
        pageNumber,
        optional: pageNumber > 1,
        url: `/api/solar/kol/data_v2/notes_detail?advertiseSwitch=1&orderType=1&pageNumber=${pageNumber}&pageSize=8&userId=${encoded}&noteType=4&business=${businessValue}&isThirdPlatform=0`
      });
    }
  }
  return requests;
}

async function fetchFastDetailApiCacheFromTab(tabId, userId) {
  const requests = fastDetailApiUrls(userId);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (requestList) => {
      function safeData(payload) {
        if (payload && typeof payload === "object" && payload.data && typeof payload.data === "object") return payload.data;
        return payload && typeof payload === "object" ? payload : {};
      }
      const cache = {};
      const responses = await Promise.all(requestList.map(async (request) => {
        const absoluteUrl = new URL(request.url, location.origin).toString();
        const response = await fetch(absoluteUrl, { credentials: "include" });
        const text = await response.text();
        let payload = {};
        try {
          payload = JSON.parse(text);
        } catch {
          payload = {};
        }
        if (!response.ok || (payload && payload.success === false)) {
          if (request.optional) {
            return {
              kind: request.kind,
              url: absoluteUrl,
              status: response.status,
              skipped: true,
              message: payload?.msg || payload?.message || text.slice(0, 120),
              captured_at: new Date().toISOString(),
              fast_api: true
            };
          }
          return {
            kind: request.kind,
            url: absoluteUrl,
            status: response.status,
            failed: true,
            message: payload?.msg || payload?.message || text.slice(0, 120),
            captured_at: new Date().toISOString(),
            fast_api: true
          };
        }
        const data = safeData(payload);
        return { kind: request.kind, url: absoluteUrl, status: response.status, data, captured_at: new Date().toISOString(), fast_api: true, request };
      }));
      for (const response of responses) {
        if (response.skipped || response.failed) continue;
        const request = response.request || {};
        const data = response.data || {};
        if (request.kind === "notes_rate" || request.kind === "data_summary") {
          const business = request.business || "daily";
          cache[request.kind] = cache[request.kind] || {};
          cache[request.kind][business] = data;
        } else if (request.kind === "notes_detail") {
          const business = request.business || "daily";
          const noteType = request.noteType || 0;
          const pageNumber = request.pageNumber || 1;
          cache.notes_detail = cache.notes_detail || {};
          cache.notes_detail[business] = cache.notes_detail[business] || {};
          cache.notes_detail[business][noteType] = cache.notes_detail[business][noteType] || {};
          cache.notes_detail[business][noteType][pageNumber] = data;
        } else {
          cache[request.kind] = data;
        }
      }
      return {
        ok: true,
        cache,
        responses: responses.map(({ request, ...response }) => response),
        requests: requestList.map((request) => ({ ...request, fast_api: true, captured_at: new Date().toISOString() }))
      };
    },
    args: [requests]
  });
  const apiCache = result?.result || { ok: false, cache: {}, responses: [] };
  const profile = apiCache?.cache?.blogger_profile || {};
  const listProfile = await fetchBloggerListProfileFromTab(tabId, userId, profile.name || profile.nickName || profile.nickname || "").catch(() => null);
  if (listProfile) {
    apiCache.cache = apiCache.cache || {};
    apiCache.cache.blogger_list_profile = listProfile;
  }
  return apiCache;
}

async function fetchBloggerListProfileFromTab(tabId, userId, nickname = "") {
  if (!tabId || !userId) return null;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (targetUserId, targetNickname) => {
      const keyword = String(targetNickname || targetUserId || "").trim();
      if (!keyword) return null;
      const request = async (path, body) => {
        const response = await fetch(path, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null);
        return payload?.data || payload || null;
      };
      const track = await request("/api/solar/cooperator/blogger/track", { searchType: 0, keyword });
      const data = await request("/api/solar/cooperator/blogger/v2", {
        searchType: 0,
        keyword,
        column: "comprehensiverank",
        sort: "desc",
        pageNum: 1,
        pageSize: 20,
        trackId: track?.trackId || "",
        signed: -1,
        noteType: 0,
        tradeType: "不限",
        inStar: 0,
        flagList: [],
        filterList: []
      });
      const rows = Array.isArray(data?.kols) ? data.kols : [];
      return rows.find((item) => String(item?.userId || "") === String(targetUserId)) || null;
    },
    args: [userId, nickname]
  });
  return result?.result || null;
}

function priceTextFromPgyValue(value) {
  const number = numericValue(value);
  if (typeof number !== "number" || !Number.isFinite(number) || number <= 0) return "";
  const yuan = number >= 100000 ? number / 100 : number;
  return Math.round(yuan).toLocaleString("zh-CN");
}

function countTextFromPgyValue(value) {
  const number = numericValue(value);
  if (typeof number !== "number" || !Number.isFinite(number) || number <= 0) return "";
  if (number >= 10000) return `${Math.round((number / 10000) * 10) / 10}万`;
  return Math.round(number).toLocaleString("zh-CN");
}

function preFavoriteCategoryTags(profile = {}) {
  const tags = [];
  const addTag = (value) => {
    const text = cleanJsonText(value);
    if (!text) return;
    for (const tag of text.split(/[、,，/|｜;；]+/).map((item) => item.trim()).filter(Boolean)) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  };
  const addCategory = (value) => {
    if (Array.isArray(value)) {
      value.forEach(addCategory);
      return;
    }
    if (value && typeof value === "object") {
      const direct = firstDefined(value.taxonomy1Tag, value.categoryName, value.name, value.label, value.contentTag);
      if (direct) addTag(direct);
      else addCategory(firstDefined(value.children, value.tags));
      return;
    }
    addTag(value);
  };
  addCategory(profile.contentTags);
  addCategory(profile.top2CategoryList);
  if (!tags.length) addCategory(firstDefined(profile.categoryName, profile.category));
  return tags.slice(0, 5);
}

function preFavoritePatchFromApiCache(userId, apiCache) {
  const profile = apiCache?.cache?.blogger_profile || {};
  const detail = mergeDetailApiCache({ pgy_blogger_id: userId }, apiCache);
  const redId = cleanJsonText(firstDefined(profile.redId, profile.red_id, profile.redID, profile.redBookId, profile.redbookId, profile.red_book_id, profile.xiaohongshuId, profile.xiaohongshu_id));
  const categoryTags = preFavoriteCategoryTags(profile);
  const patch = {
    userId,
    categoryTags,
    categorySource: "pgy_profile",
    quoteStatus: "报价已获取",
    quoteFetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const name = cleanJsonText(firstDefined(profile.name, profile.nickName, profile.nickname));
  if (name) patch.name = name;
  const avatar = cleanJsonText(firstDefined(profile.headPhoto, profile.avatar, profile.avatarUrl, profile.headImage));
  if (avatar) patch.avatar = avatar;
  if (redId) patch.redId = redId;
  const location = cleanJsonText(firstDefined(profile.location, profile.ipLocation, profile.ip_city, profile.city));
  if (location) patch.location = location;
  const followersText = countTextFromPgyValue(firstDefined(profile.fansNum, profile.fansCount, profile.fans_count, profile.followerCount, profile.followersCount, profile.followers));
  if (followersText) patch.followersText = followersText;
  const likesText = countTextFromPgyValue(firstDefined(profile.likeCollectCountInfo, profile.likedCollectedCount, profile.likeCollectCount, profile.likeAndCollectCount, profile.likedCount));
  if (likesText) patch.likesText = likesText;
  const picturePriceText = priceTextFromPgyValue(firstDefined(profile.picturePrice, profile.price, profile.quotePrice, profile.imageQuotePrice, profile.picPrice));
  if (picturePriceText) patch.picturePriceText = picturePriceText;
  const videoPriceText = priceTextFromPgyValue(firstDefined(profile.videoPrice, profile.videoQuotePrice));
  if (videoPriceText) patch.videoPriceText = videoPriceText;
  const cooperationExposureMedian = numericValue(detail.cooperation_exposure_median);
  if (cooperationExposureMedian !== "") patch.cooperationExposureMedian = cooperationExposureMedian;
  const cooperationReadMedian = numericValue(detail.cooperation_read_median);
  if (cooperationReadMedian !== "") patch.cooperationReadMedian = cooperationReadMedian;
  const cooperationInteractionMedian = numericValue(detail.cooperation_interaction_median);
  if (cooperationInteractionMedian !== "") patch.cooperationInteractionMedian = cooperationInteractionMedian;
  const cooperationNoteCount = numericValue(detail.cooperation_note_count);
  if (cooperationNoteCount !== "") patch.cooperationNoteCount = cooperationNoteCount;
  if (!picturePriceText && !videoPriceText) patch.quoteStatus = "报价未返回";
  return patch;
}

async function enrichPreFavoriteQuote({ userId }) {
  const cleanUserId = cleanPgyUserId(userId);
  if (!cleanUserId) throw new Error("没有识别到达人 ID。");
  let tab = await findPgyContextTab();
  let createdTabId = 0;
  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: detailUrl(cleanUserId), active: false });
    createdTabId = tab.id || 0;
    if (createdTabId) await waitForTabComplete(createdTabId, 20000).catch(() => null);
  }
  if (!tab?.id) throw new Error("无法打开蒲公英上下文页面。");
  let apiCache = null;
  try {
    apiCache = await fetchFastDetailApiCacheFromTab(tab.id, cleanUserId);
  } finally {
    if (createdTabId) chrome.tabs.remove(createdTabId).catch(() => null);
  }
  if (!apiCache?.ok) throw new Error(apiCache?.message || "蒲公英报价接口读取失败，请确认已登录蒲公英。");
  const patch = preFavoritePatchFromApiCache(cleanUserId, apiCache);
  const stored = await chrome.storage.local.get({ pgyPreFavorites: [] });
  const favorites = Array.isArray(stored.pgyPreFavorites) ? stored.pgyPreFavorites : [];
  const next = favorites.map((item) => item?.userId === cleanUserId ? { ...item, ...patch } : item);
  await chrome.storage.local.set({ pgyPreFavorites: next });
  return { ok: true, patch };
}

async function refreshAllPreFavorites({ userIds = [] } = {}) {
  const stored = await chrome.storage.local.get({ pgyPreFavorites: [] });
  let favorites = Array.isArray(stored.pgyPreFavorites) ? stored.pgyPreFavorites : [];
  const requestedIds = new Set((Array.isArray(userIds) && userIds.length ? userIds : favorites.map((item) => item?.userId))
    .map(cleanPgyUserId)
    .filter(Boolean));
  const targets = favorites.filter((item) => requestedIds.has(cleanPgyUserId(item?.userId)));
  if (!targets.length) throw new Error("达人库暂无可更新的数据。");
  let tab = await findPgyContextTab();
  let createdTabId = 0;
  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: detailUrl(cleanPgyUserId(targets[0].userId)), active: false });
    createdTabId = tab.id || 0;
    if (createdTabId) await waitForTabComplete(createdTabId, 20000).catch(() => null);
  }
  if (!tab?.id) throw new Error("无法打开蒲公英上下文页面。");
  let completed = 0;
  let failed = 0;
  const errorSamples = [];
  const startedAt = new Date().toISOString();
  try {
    for (const target of targets) {
      const userId = cleanPgyUserId(target.userId);
      const currentName = target.name || userId;
      await chrome.storage.local.set({
        pgyPreFavoriteRefreshProgress: {
          running: true,
          total: targets.length,
          completed,
          failed,
          currentUserId: userId,
          currentName,
          startedAt
        }
      });
      try {
        const apiCache = await fetchFastDetailApiCacheFromTab(tab.id, userId);
        if (!apiCache?.ok) throw new Error(apiCache?.message || "蒲公英接口未返回达人数据");
        const patch = preFavoritePatchFromApiCache(userId, apiCache);
        favorites = favorites.map((item) => cleanPgyUserId(item?.userId) === userId ? { ...item, ...patch } : item);
        completed += 1;
      } catch (error) {
        const message = shortErrorMessage(error);
        favorites = favorites.map((item) => cleanPgyUserId(item?.userId) === userId
          ? { ...item, quoteStatus: `更新失败：${message}`, lastRefreshFailedAt: new Date().toISOString() }
          : item);
        failed += 1;
        if (errorSamples.length < 5) errorSamples.push({ userId, name: currentName, message });
      }
      await chrome.storage.local.set({ pgyPreFavorites: favorites });
      if (completed + failed < targets.length) await sleep(350);
    }
  } finally {
    if (createdTabId) chrome.tabs.remove(createdTabId).catch(() => null);
    await chrome.storage.local.set({
      pgyPreFavoriteRefreshProgress: {
        running: false,
        total: targets.length,
        completed,
        failed,
        finishedAt: new Date().toISOString(),
        startedAt
      }
    });
  }
  return { ok: true, total: targets.length, completed, failed, errorSamples };
}

async function detailDomCacheForUser(userId) {
  if (!userId) return {};
  const key = `pgy_detail_dom_${userId}`;
  const stored = await chrome.storage.local.get(key).catch(() => ({}));
  return stored?.[key] && typeof stored[key] === "object" ? stored[key] : {};
}

async function saveDetailDomCache(detail) {
  const userId = extractPgyUserId({
    creator_id: detail?.pgy_blogger_id ? `pgy-api:${detail.pgy_blogger_id}` : "",
    pgy_url: detail?.pgy_url || detail?.detail_url || ""
  });
  if (!userId) return;
  const patch = {};
  const organizationName = valueOrRaw(detail, "organization_name");
  if (organizationName) patch.organization_name = organizationName;
  if (!Object.keys(patch).length) return;
  await chrome.storage.local.set({ [`pgy_detail_dom_${userId}`]: { ...patch, cached_at: nowLocalText() } }).catch(() => null);
}

async function collectDetailPayloadFast(row, index, options = {}) {
  if (!DETAIL_FAST_API_MODE) return null;
  if (shouldCaptureFansScreenshot(options) || shouldCaptureNoteScreenshot(options)) return null;
  const userId = extractPgyUserId(row);
  if (!userId) return null;
  const tab = await findPgyContextTab();
  if (!tab?.id) return null;
  const apiCache = await fetchFastDetailApiCacheFromTab(tab.id, userId);
  if (!apiCache?.ok) return null;
  const url = detailUrlFromRow(row) || detailUrl(userId);
  const textDetail = {
    pgy_url: url,
    pgy_blogger_id: userId,
    profile_url: profileUrl(userId),
    ...(await detailDomCacheForUser(userId)),
    raw_payload: {
      detail_collection_source: "fast_detail_api",
      collected_at: nowLocalText()
    }
  };
  const detail = mergeDetailApiCache(textDetail, apiCache);
  if (!hasUsableFastDetailData(detail)) return null;
  await saveDetailDomCache(detail);
  return {
    ok: true,
    fastApi: true,
    url,
    title: "",
    detail,
    captures: { audience: skippedAudienceCapture(), overview: skippedOverviewCapture() },
    detailUrl: url,
    apiCacheSummary: detail.raw_payload?.detail_api_capture_summary || {},
    imageName: `pgy-detail-${userId || index + 1}.png`
  };
}

async function getReusableDetailTab(url) {
  if (detailFastTabId) {
    const existing = await chrome.tabs.get(detailFastTabId).catch(() => null);
    if (existing?.id) return existing;
    detailFastTabId = 0;
  }
  const tab = await withDetailOpenTabStagger(() => chrome.tabs.create({ url, active: !DETAIL_HEADLESS_MODE }));
  detailFastTabId = tab.id || 0;
  return tab;
}

async function closeReusableDetailTab() {
  if (!detailFastTabId) return;
  const tabId = detailFastTabId;
  detailFastTabId = 0;
  await chrome.tabs.remove(tabId).catch(() => null);
}

async function collectDetailPayloadWithReusableTab(row, index, options = {}) {
  if (!DETAIL_FAST_API_MODE) return null;
  if (shouldCaptureFansScreenshot(options) || shouldCaptureNoteScreenshot(options)) return null;
  const url = detailUrlFromRow(row);
  if (!url) return null;
  const userId = extractPgyUserId(row);
  if (!userId) return null;
  const tab = await getReusableDetailTab(url);
  if (!tab?.id) return null;
  const currentUrl = String(tab.url || "");
  if (!currentUrl.includes(url)) {
    await chrome.tabs.update(tab.id, { url, active: !DETAIL_HEADLESS_MODE });
  }
  await waitForTabComplete(tab.id);
  const apiCache = await readReusableDetailApiCache(tab.id);
  if (!apiCache?.ok && !apiCache?.responses?.length) return null;
  const existingOrganization = valueForCanonicalField(row, "所属机构");
  const textDetail = {
    pgy_url: url,
    pgy_blogger_id: userId,
    profile_url: profileUrl(userId),
    ...(existingOrganization ? { organization_name: existingOrganization } : {}),
    raw_payload: {
      detail_collection_source: "fast_detail_page_api",
      collected_at: nowLocalText()
    }
  };
  const detail = mergeDetailApiCache(textDetail, apiCache);
  if (!hasUsableFastDetailData(detail)) return null;
  return {
    ok: true,
    fastApi: true,
    url,
    title: "",
    detail,
    captures: { audience: skippedAudienceCapture(), overview: skippedOverviewCapture() },
    detailUrl: url,
    apiCacheSummary: detail.raw_payload?.detail_api_capture_summary || {},
    imageName: `pgy-detail-${userId || index + 1}.png`
  };
}

async function collectDetailPayloadFromTab(tab, row, index, url, options = {}) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["detail-capture.js"] });
  const result = await chrome.tabs.sendMessage(tab.id, { type: "PGY_COLLECT_DETAIL" });
  if (!result?.ok) {
    const error = new Error(result?.message || "详情页采集失败");
    error.paused = Boolean(result?.paused);
    error.authRequired = Boolean(result?.authRequired);
    throw error;
  }
  const prefetch = await prefetchDetailBusinessData(tab.id, "cooperation").catch((error) => ({
    ok: false,
    message: error?.message || String(error)
  }));
  const apiCache = await readDetailApiCache(tab.id);
  const currentUserId = extractPgyUserId(row);
  const currentProfile = apiCache?.cache?.blogger_profile || {};
  const listProfile = await fetchBloggerListProfileFromTab(
    tab.id,
    currentUserId,
    currentProfile.name || result.detail?.nickname || ""
  ).catch(() => null);
  if (listProfile) {
    apiCache.cache = apiCache.cache || {};
    apiCache.cache.blogger_list_profile = listProfile;
  }
  const audience = shouldCaptureFansScreenshot(options)
    ? await capturePreparedTab(tab, "audience", row, index)
    : skippedAudienceCapture();
  const overview = shouldCaptureNoteScreenshot(options)
    ? await capturePreparedTab(tab, "overview", row, index)
    : skippedOverviewCapture();
  const textDetail = {
    ...(result.detail || {}),
    pgy_url: result.url || url,
    raw_payload: {
      ...((result.detail || {}).raw_payload || {}),
      detail_collection_source: "browser_extension",
      cooperation_prefetch: prefetch,
      collected_at: result.collectedAt || nowLocalText()
    }
  };
  const detail = mergeDetailApiCache(textDetail, apiCache);
  return {
    ...result,
    apiCacheSummary: detail.raw_payload?.detail_api_capture_summary || {},
    cooperationPrefetch: prefetch,
    detail,
    captures: { audience, overview },
    detailUrl: url || result.url || "",
    imageName: `pgy-detail-${extractPgyUserId(row) || index + 1}.png`
  };
}

async function collectDetailPayload(row, index, options = {}) {
  const url = detailUrlFromRow(row);
  if (!url) throw new Error("该行缺少蒲公英达人链接或达人ID。");
  const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const previousTabId = currentTabs[0]?.id;
  const tab = await withDetailOpenTabStagger(() => chrome.tabs.create({ url, active: !DETAIL_HEADLESS_MODE }));
  let keepTabOpen = false;
  try {
    await waitForTabComplete(tab.id);
    return await collectDetailPayloadFromTab(tab, row, index, url, options);
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

function rowFromDetailUrl(url) {
  const cleanUrl = String(url || "");
  if (!cleanUrl.includes("/solar/pre-trade/blogger-detail/")) {
    throw new Error("请先打开蒲公英达人详情页再点击收藏。");
  }
  const userId = (cleanUrl.match(/\/blogger-detail\/([^?/#]+)/) || [])[1] || "";
  return {
    "达人ID": userId ? `pgy-api:${userId}` : "",
    "蒲公英链接": cleanUrl,
    pgy_url: cleanUrl
  };
}

async function collectDetailPayloadFromBackgroundTab(url, index = 0, options = {}) {
  const row = rowFromDetailUrl(url);
  const tab = await withDetailOpenTabStagger(() => chrome.tabs.create({ url, active: false }));
  try {
    await waitForTabComplete(tab.id);
    return await collectDetailPayloadFromTab(tab, row, index, url, options);
  } catch (error) {
    if (isDetailAuthError(error)) {
      error.requiresUserAction = true;
      error.paused = true;
      notifyDetailBackfill(
        "收藏详情采集需要登录/授权",
        "后台详情页采集失败，请在蒲公英完成登录或授权后再重新收藏。",
        { requireInteraction: true }
      );
    }
    throw error;
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => null);
  }
}

async function collectCurrentDetailPayload(tab, index = 0, options = {}) {
  if (!tab?.id) throw new Error("无法定位当前达人详情页。");
  const url = tab.url || "";
  const row = rowFromDetailUrl(url);
  return collectDetailPayloadWithCooldown(row, index, options);
}

function detailFavoriteOptions(options) {
  return { ...(options || {}) };
}

function rowForDetailPayload(payload) {
  const detail = payload.detail || {};
  const userId = extractPgyUserId({
    creator_id: detail.pgy_blogger_id ? `pgy-api:${detail.pgy_blogger_id}` : "",
    pgy_url: payload.detailUrl || detail.pgy_url || ""
  });
  return normalizeExportRow({
    ...(detail || {}),
    creator_id: userId ? `pgy-api:${userId}` : detail.creator_id || "",
    pgy_url: payload.detailUrl || detail.pgy_url || "",
    profile_url: detail.profile_url || profileUrl(userId),
    raw_payload: detail.raw_payload || {}
  });
}

async function writeDetailPayloadToSheet(sheet, payload, actionStatus = "已收藏") {
  const sourceRow = rowForDetailPayload(payload);
  const seedValues = {
    ...sourceRow,
    ...detailValuesForSheet(payload.detail, payload.captures || {}, actionStatus, payload.detailUrl || "")
  };
  const values = await readSheetValuesFlexible(sheet.token, sheet.spreadsheetToken, sheet.sheetId);
  const shape = effectiveSheetWidth(values)
    ? existingOnlySheetShape(values)
    : await (async () => {
      await writeSheetHeader(sheet.token, sheet.spreadsheetToken, sheet.sheetId, [seedValues]);
      return referenceExportShape();
    })();
  const latestValues = await readSheetValuesFlexible(sheet.token, sheet.spreadsheetToken, sheet.sheetId);
  const latestShape = detectSheetShape(latestValues);
  const items = sheetRowsToShapeObjects(latestValues, latestShape);
  const existing = items.find((item) => rowMatchKeys(item.row).some((key) => rowMatchKeys(sourceRow).includes(key)));
  let rowNumber = existing?.rowNumber || 0;
  let action = "updated";
  if (!rowNumber) {
    await appendMappedSheetRows(sheet.token, sheet.spreadsheetToken, sheet.sheetId, shape, [seedValues]);
    const afterValues = await readSheetValuesFlexible(sheet.token, sheet.spreadsheetToken, sheet.sheetId);
    const afterShape = detectSheetShape(afterValues);
    const afterItems = sheetRowsToShapeObjects(afterValues, afterShape);
    rowNumber = afterItems.find((item) => rowMatchKeys(item.row).some((key) => rowMatchKeys(sourceRow).includes(key)))?.rowNumber || afterValues.length;
    action = "appended";
  }

  const captures = payload.captures || {};
  const valuesByField = {
    ...canonicalBackfillValues(sourceRow, payload),
    ...detailValuesForSheet(payload.detail, captures, detailStatusByCapture(captures, actionStatus, `${actionStatus}-未确认粉丝画像`), payload.detailUrl || "")
  };
  const targetValues = await readSheetValuesFlexible(sheet.token, sheet.spreadsheetToken, sheet.sheetId);
  const targetShape = existingOnlySheetShape(targetValues);
  const rowLine = targetValues[rowNumber - 1] || [];
  let writtenCells = 0;
  const warnings = [];

  for (const column of targetShape.columns) {
    if (isFansImageColumn(column)) {
      if (!isFansScreenshotEnabledFromCaptures(captures)) continue;
      if (captures.audience?.screenshot) {
        const imageResult = await writeSheetImageByColumnBestEffort(
          sheet.token,
          sheet.spreadsheetToken,
          sheet.sheetId,
          column.columnIndex,
          rowNumber,
          captures.audience.screenshot,
          captures.audience.imageName
        );
        if (imageResult.ok) writtenCells += 1;
        else warnings.push(`粉丝画像截图未写入：${imageResult.message}`);
      }
      continue;
    }
    if (isNoteImageColumn(column)) {
      const usesImage = columnUsesImageTemplate(column, { line: rowLine });
      if (usesImage && !isNoteScreenshotEnabledFromCaptures(captures)) continue;
      if (usesImage && captures.overview?.screenshot) {
        const imageResult = await writeSheetImageByColumnBestEffort(
          sheet.token,
          sheet.spreadsheetToken,
          sheet.sheetId,
          column.columnIndex,
          rowNumber,
          captures.overview.screenshot,
          captures.overview.imageName
        );
        if (imageResult.ok) writtenCells += 1;
        else warnings.push(`笔记数据截图未写入：${imageResult.message}`);
      } else {
        const value = readMetricValue(valuesByField);
        if (value !== undefined && value !== null && value !== "") {
          const cellResult = await writeSheetCellByColumnBestEffort(
            sheet.token,
            sheet.spreadsheetToken,
            sheet.sheetId,
            column.columnIndex,
            rowNumber,
            value,
            column.fieldName || column.canonicalField
          );
          if (cellResult.ok) writtenCells += 1;
          else warnings.push(cellResult.message);
        }
      }
      continue;
    }
    if (!column.canonicalField) continue;
    const value = valueForCanonicalField(valuesByField, column.canonicalField);
    if (value === undefined || value === null || value === "") continue;
    const cellResult = await writeSheetCellByColumnBestEffort(
      sheet.token,
      sheet.spreadsheetToken,
      sheet.sheetId,
      column.columnIndex,
      rowNumber,
      value,
      column.fieldName || column.canonicalField
    );
    if (cellResult.ok) writtenCells += 1;
    else warnings.push(cellResult.message);
  }
  return { ok: true, resourceType: "sheet", action, rowNumber, writtenCells, warnings };
}

async function appendDetailPayloadToBitable(target, payload) {
  const tableId = await chooseBitableTable(target.token, target.parsed.token, target.options.detailFeishuSheetId || target.parsed.tableId || "");
  await ensureBitableFieldNames(target.token, target.parsed.token, tableId, STANDARD_FIELDS);
  const records = await readBitableRecords(target.token, target.parsed.token, tableId);
  const fieldsMeta = await ensureBitableDetailFields(target.token, target.parsed.token, tableId, records);
  const sourceRow = rowForDetailPayload(payload);
  const valuesByField = canonicalBackfillValues(sourceRow, payload);
  const detailFields = await bitableDetailFieldsWithAttachments({
    token: target.token,
    appToken: target.parsed.token,
    fieldsMeta,
    valuesByField,
    captures: payload.captures || {}
  });
  const fields = {
    ...normalizeExportRow(sourceRow),
    ...detailFields
  };
  const existing = records.find((record) => rowMatchKeys(record.fields || {}).some((key) => rowMatchKeys(sourceRow).includes(key)));
  if (existing) {
    await updateBitableRecord(target.token, target.parsed.token, tableId, existing.record_id || existing.id, fields);
    return { ok: true, resourceType: "bitable", action: "updated", tableId, recordId: existing.record_id || existing.id, writtenCells: Object.keys(fields).length };
  }
  const result = await appendBitableRecords(target.token, target.parsed.token, tableId, Object.keys(fields), [fields]);
  return { ok: true, resourceType: "bitable", action: "appended", tableId, writtenCount: result.writtenCount };
}

async function favoriteCurrentDetailToFeishu({ tab, options = {} }) {
  const saved = await chrome.storage.local.get({
    feishuAppId: "",
    feishuAppSecret: "",
    feishuUrl: "",
    feishuSheetId: "",
    detailFeishuUrl: "",
    detailFeishuSheetId: "",
    detailTraverseAllSheets: false,
    detailCaptureFansScreenshot: true,
    detailCaptureNoteScreenshot: true
  });
  const mergedOptions = detailFavoriteOptions({ ...saved, ...(options || {}) });
  const appId = mergedOptions.feishuAppId;
  const appSecret = mergedOptions.feishuAppSecret;
  const feishuUrl = mergedOptions.detailFeishuUrl;
  if (!appId || !appSecret || !feishuUrl) throw new Error("请先在侧边栏填写飞书 App ID、App Secret 和需补足详情的飞书表格。");
  const token = await tenantToken(appId, appSecret);
  const parsed = await resolveWikiTarget(parseFeishuUrl(feishuUrl), token);
  if (parsed.resourceType === "bitable") {
    const tableId = await chooseBitableTable(token, parsed.token, mergedOptions.detailFeishuSheetId || parsed.tableId || "");
    const requirements = collectionRequirementsForFields((await listBitableFields(token, parsed.token, tableId)).map((field) => ({
      fieldName: bitableFieldName(field)
    })));
    const targetOptions = applyCollectionRequirements({ ...mergedOptions, detailFeishuSheetId: tableId }, requirements);
    const payload = await collectCurrentDetailPayload(tab, 0, targetOptions);
    return appendDetailPayloadToBitable({ token, parsed, options: targetOptions }, payload);
  }
  if (parsed.resourceType !== "sheet") throw new Error("收藏写回当前支持飞书电子表格或多维表格。");
  const sheetId = await chooseSheet(token, parsed.token, mergedOptions.detailFeishuSheetId || parsed.sheetId || "");
  const requirements = collectionRequirementsForSheetValues(await readSheetValues(token, parsed.token, sheetId, "A1:ZZ20"));
  const payload = await collectCurrentDetailPayload(tab, 0, applyCollectionRequirements(mergedOptions, requirements));
  return writeDetailPayloadToSheet({ token, spreadsheetToken: parsed.token, sheetId }, payload, "已收藏");
}

async function startFavoriteDetailToFeishu({ url, options = {}, sourceTabId = 0 }) {
  rowFromDetailUrl(url);
  const saved = await chrome.storage.local.get({
    feishuAppId: "",
    feishuAppSecret: "",
    detailFeishuUrl: ""
  });
  const mergedOptions = { ...saved, ...(options || {}) };
  if (!mergedOptions.feishuAppId || !mergedOptions.feishuAppSecret || !mergedOptions.detailFeishuUrl) {
    throw new Error("请先在侧边栏填写飞书 App ID、App Secret 和需补足详情的飞书表格。");
  }
  const userId = (url.match(/\/blogger-detail\/([^?/#]+)/) || [])[1] || "";
  const task = favoriteCurrentDetailToFeishu({ tab: { id: -1, url }, options: mergedOptions })
    .then((result) => {
      notifyDetailBackfill(
        "收藏写回完成",
        `已${result.action === "updated" ? "更新" : "新增"}达人${userId ? ` ${userId}` : ""}到飞书。`
      );
      if (sourceTabId) {
        chrome.tabs.sendMessage(sourceTabId, {
          type: "PGY_FAVORITE_TASK_STATUS",
          status: "completed",
          userId,
          result
        }).catch(() => null);
      }
      return result;
    })
    .catch((error) => {
      notifyDetailBackfill(
        "收藏写回失败",
        shortErrorMessage(error),
        { requireInteraction: true }
      );
      if (sourceTabId) {
        chrome.tabs.sendMessage(sourceTabId, {
          type: "PGY_FAVORITE_TASK_STATUS",
          status: "failed",
          userId,
          message: shortErrorMessage(error)
        }).catch(() => null);
      }
      throw error;
    });
  task.catch(() => null);
  return { ok: true, accepted: true, userId, detailUrl: url };
}

async function startFavoriteCurrentDetailToFeishu({ tab, options = {} }) {
  if (!tab?.id) throw new Error("无法定位当前达人详情页。");
  return startFavoriteDetailToFeishu({ url: tab.url || "", options, sourceTabId: tab.id });
}

function shouldUseDetailCollection(options = {}) {
  return options.collectionMode === "detail";
}

async function enrichRowsWithDetails({ rows, options = {}, limit = 0 }) {
  if (!Array.isArray(rows) || !rows.length) return { ok: true, rows: [], completed: 0, failed: 0, total: 0 };
  detailStopRequested = false;
  const maxRows = Number(limit || rows.length);
  const targetRows = rows.slice(0, Math.max(0, Math.min(maxRows, rows.length)));
  const enrichedRows = rows.map((row) => normalizeExportRow(row));
  let completed = 0;
  let failed = 0;
  const errorSamples = [];

  try {
    await runDetailBackfillPool(targetRows, async (row, index) => {
      try {
        const payload = await collectDetailPayloadWithCooldown(row, index, options);
        enrichedRows[index] = {
          ...normalizeExportRow(row),
          ...canonicalBackfillValues(row, payload)
        };
        completed += 1;
      } catch (error) {
        failed += 1;
        if (errorSamples.length < 5) errorSamples.push({ rowNumber: index + 1, message: shortErrorMessage(error) });
        enrichedRows[index] = {
          ...normalizeExportRow(row),
          "详情补采状态": detailFailureStatus(error, "补采"),
          "详情补采时间": nowLocalText(),
          "详情补采备注": error?.message || String(error)
        };
        if (error?.paused || error?.requiresUserAction) detailStopRequested = true;
      }
    }, detailBackfillConcurrencyForOptions(options));
  } finally {
    await closeReusableDetailTab();
  }

  const stopped = Boolean(detailStopRequested);
  detailStopRequested = false;
  return { ok: true, rows: enrichedRows, completed, failed, stopped, total: targetRows.length, inputCount: rows.length, errorSamples };
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

  try {
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
      const payload = await collectDetailPayloadWithCooldown(sourceRow, index, options);
      const captures = payload.captures || {};
      const status = detailStatusByCapture(captures, "已补采", "已补采-未确认粉丝画像");
      await writeSheetCells(
        sheet.token,
        sheet.spreadsheetToken,
        sheet.sheetId,
        sheet.fields,
        rowNumber,
        detailValuesForSheet(payload.detail, captures, status, payload.detailUrl || "")
      );
      if (isFansScreenshotEnabledFromCaptures(captures)) {
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
      }
      if (isNoteScreenshotEnabledFromCaptures(captures)) {
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
      }
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
    }, detailBackfillConcurrencyForOptions(options));
  } finally {
    await closeReusableDetailTab();
  }

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
  const collectionOptions = applyCollectionRequirements(sheet.options, collectionRequirementsForFields(shape.columns));
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

  try {
    await runDetailBackfillPool(targetRows, async (item, index) => {
    try {
      const payload = await collectDetailPayloadWithCooldown(item.row, offset + index, collectionOptions);
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
      const textWrites = [];
      for (const column of shape.columns) {
        const current = item.line[column.columnIndex];
        if (nonEmptyCell(current)) continue;
        if (!column.canonicalField) continue;
        if (column.canonicalField === DETAIL_FIELDS[6]) {
          if (!isFansScreenshotEnabledFromCaptures(captures)) continue;
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
          const usesImage = columnUsesImageTemplate(column, allItems);
          if (usesImage && !isNoteScreenshotEnabledFromCaptures(captures)) continue;
          if (!usesImage) {
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
            if (cellResult.ok) textWrites.push({ column, value });
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
        if (cellResult.ok) textWrites.push({ column, value });
        else {
          rowWarnings.push(cellResult.message);
          addWriteFailure(item, column, cellResult.message, value);
        }
      }
      if (textWrites.length) {
        const verifyResult = await verifySheetTextWrites(sheet.token, sheet.spreadsheetToken, sheet.sheetId, item.rowNumber, textWrites);
        rowWrites += verifyResult.confirmedCount;
        for (const failure of verifyResult.failures) {
          rowWarnings.push(failure.message);
          addWriteFailure(item, failure.column, failure.message, failure.value);
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
    }, detailBackfillConcurrencyForOptions(collectionOptions));
  } finally {
    await closeReusableDetailTab();
  }

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
  const records = await readBitableRecords(table.token, table.appToken, table.tableId);
  const existingFields = await listBitableFields(table.token, table.appToken, table.tableId);
  const collectionOptions = applyCollectionRequirements(table.options, collectionRequirementsForFields(existingFields.map((field) => ({
    fieldName: bitableFieldName(field)
  }))));
  const fieldsMeta = await ensureBitableDetailFields(table.token, table.appToken, table.tableId, records);
  const rows = records
    .map(bitableRecordToDetailItem)
    .filter((item) => bitableNeedsDetail(item, fieldsMeta, collectionOptions));
  const maxRows = Number(limit || rows.length);
  const targetRows = rows.slice(0, Math.max(0, Math.min(maxRows, rows.length)));
  let completed = 0;
  let failed = 0;
  let skipped = rows.length - targetRows.length;
  let writtenCells = 0;
  const errorSamples = [];

  try {
    await runDetailBackfillPool(targetRows, async (item, index) => {
    try {
      const payload = await collectDetailPayloadWithCooldown(item.row, offset + index, collectionOptions);
      const valuesByField = canonicalBackfillValues(item.row, payload);
      const captures = payload.captures || {};
      const missingScreenshots = [];
      if (isFansScreenshotEnabledFromCaptures(captures) && !captures.audience?.screenshot) missingScreenshots.push(`粉丝画像截图未写入：${captures.audience?.error || "截图缺失"}`);
      if (isNoteScreenshotEnabledFromCaptures(captures) && !captures.overview?.screenshot) missingScreenshots.push(`笔记数据截图未写入：${captures.overview?.error || "截图缺失"}`);
      const fields = await bitableDetailFieldsWithAttachments({
        token: table.token,
        appToken: table.appToken,
        fieldsMeta,
        valuesByField,
        captures
      });
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
    }, detailBackfillConcurrencyForOptions(collectionOptions));
  } finally {
    await closeReusableDetailTab();
  }

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
        tableTitle: item.name || item.title || item.table_id || item.id,
        options
      })).filter((item) => item.tableId);
    } else {
      const tableId = await chooseBitableTable(target.token, target.appToken, preferredTableId);
      const found = target.tables.find((item) => [item.table_id, item.id].includes(tableId));
      tables = [{
        token: target.token,
        appToken: target.appToken,
        tableId,
        tableTitle: found?.name || found?.title || tableId,
        options
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
      sheetTitle: item.title || item.name || item.sheet_id || item.id,
      options
    })).filter((item) => item.sheetId);
  } else {
    const sheetId = await chooseSheet(target.token, target.spreadsheetToken, preferredSheetId);
    const found = target.sheets.find((item) => [item.sheet_id, item.id].includes(sheetId));
    sheets = [{
      token: target.token,
      spreadsheetToken: target.spreadsheetToken,
      sheetId,
      sheetTitle: found?.title || found?.name || sheetId,
      options
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
    if (message?.type === "DOWNLOAD_FAVORITES_XLSX") {
      const rows = Array.isArray(message.rows) ? message.rows : [];
      const workbook = rowsToSimpleXlsx(rows, "达人库");
      const url = binaryDownloadUrl(workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const downloadId = await chrome.downloads.download({
        url,
        filename: message.filename || `达人库-${rows.length}人.xlsx`,
        saveAs: true
      });
      sendResponse({ ok: true, downloadId });
      return;
    }
    if (message?.type === "DOWNLOAD_PGY_XLSX") {
      const rows = Array.isArray(message.rows) ? message.rows : [];
      const workbook = rowsToXlsx(rows);
      const url = binaryDownloadUrl(workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const downloadId = await chrome.downloads.download({
        url,
        filename: message.filename || exportXlsxFilename(rows.length),
        saveAs: true
      });
      sendResponse({ ok: true, downloadId });
      return;
    }
    if (message?.type === "DOWNLOAD_PGY_CSV" || message?.type === "DOWNLOAD_CSV") {
      const rows = Array.isArray(message.rows) ? message.rows : [];
      const csv = rowsToCsv(rows);
      const filename = message.filename || exportCsvFilename(rows.length);
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
    if (message?.type === "ENRICH_ROWS_WITH_DETAILS") {
      const result = await enrichRowsWithDetails({ rows: message.rows || [], options: message.options || {}, limit: message.limit || 0 });
      sendResponse(result);
      return;
    }
    if (message?.type === "VALIDATE_FEISHU_SYNC_TARGET") {
      const result = await validateFeishuSyncTarget(message.options || {});
      sendResponse(result);
      return;
    }
    if (message?.type === "INSPECT_FEISHU_TABLE_CONFIG") {
      const result = await inspectFeishuTableConfig(message.options || {});
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
    if (message?.type === "FAVORITE_CURRENT_DETAIL") {
      const result = await startFavoriteCurrentDetailToFeishu({ tab: sender?.tab, options: message.options || {} });
      sendResponse(result);
      return;
    }
    if (message?.type === "FAVORITE_DETAIL_URL") {
      const result = await startFavoriteDetailToFeishu({
        url: message.detailUrl || "",
        options: message.options || {},
        sourceTabId: sender?.tab?.id || 0
      });
      sendResponse(result);
      return;
    }
    if (message?.type === "ENRICH_PREFAVORITE_QUOTE") {
      const result = await enrichPreFavoriteQuote({ userId: message.userId || "" });
      sendResponse(result);
      return;
    }
    if (message?.type === "REFRESH_ALL_PREFAVORITES") {
      const result = await refreshAllPreFavorites({ userIds: message.userIds || [] });
      sendResponse(result);
      return;
    }
    if (message?.type === "READ_ONLINE_CREATOR_TABLE") {
      const result = await readOnlineCreatorTable(message.url || "");
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
    if (message?.type === "OPEN_FAVORITES_PAGE") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("favorites.html") });
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
