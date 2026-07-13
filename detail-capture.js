(() => {
  if (window.__PGY_DETAIL_CAPTURE_INSTALLED__) return;
  window.__PGY_DETAIL_CAPTURE_INSTALLED__ = true;

  const WAIT_STEP_MS = 300;
  const RATE_LIMIT_TEXTS = ["访问过于频繁", "操作过于频繁", "请求过于频繁", "稍后再试", "人机验证"];
  const AUTH_REQUIRED_TEXTS = ["请先登录", "登录后", "未登录", "重新登录", "暂无权限", "无权限", "没有权限", "无访问权限", "访问受限", "未开通"];
  const AUDIENCE_TEXTS = ["粉丝画像", "粉丝分析", "粉丝人群", "性别分布", "年龄分布", "地域分布", "用户设备"];
  const OVERVIEW_TEXTS = ["笔记数据", "数据概览", "阅读中位数", "曝光中位数", "互动中位数", "中位点赞量"];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nowText() {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function bodyText() {
    return String(document.body?.innerText || document.body?.textContent || "");
  }

  function selectorText(selector) {
    const element = document.querySelector(selector);
    return cleanText(element?.innerText || element?.textContent || "");
  }

  function smallVisibleRect(element) {
    if (!element || !(element instanceof Element)) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
    return rect;
  }

  function scoreFavoriteHost(element) {
    if (!element || element.id?.startsWith("pgy-")) return null;
    const rect = smallVisibleRect(element);
    if (!rect || rect.width < 220 || rect.width > 560 || rect.height < 90 || rect.height > 560) return null;
    const text = cleanText(element.innerText || element.textContent || "");
    if (!text || text.includes("数据概览") || text.includes("笔记数据")) return null;

    let score = 0;
    if (element.matches(".blogger-base-info, .blogger-info, .kol-base-info, .kol-info, .author-info, .creator-info, .profile-card")) score += 5;
    if (/小红书号|红书号/.test(text)) score += 5;
    if (/粉丝数|粉丝/.test(text)) score += 2;
    if (/获赞与收藏|赞藏/.test(text)) score += 2;
    if (element.querySelector("img")) score += 2;
    if (rect.left < window.innerWidth * 0.55) score += 2;
    if (rect.width >= 250 && rect.width <= 420) score += 1;
    if (rect.height >= 120 && rect.height <= 460) score += 1;
    if (/合作报价|相似的博主推荐/.test(text)) score -= 4;
    return score >= 7 ? { element, rect, score } : null;
  }

  function findFavoriteHost() {
    const knownSelectors = [
      ".blogger-base-info",
      ".blogger-info",
      ".kol-base-info",
      ".kol-info",
      ".author-info",
      ".creator-info",
      ".profile-card",
      "[class*='blogger'][class*='info']",
      "[class*='kol'][class*='info']",
      "[class*='profile'][class*='card']"
    ];
    const candidates = new Set();
    for (const selector of knownSelectors) {
      for (const element of document.querySelectorAll(selector)) candidates.add(element);
    }
    for (const element of document.querySelectorAll("aside, section, article, div")) {
      const text = element.innerText || element.textContent || "";
      if (/小红书号|红书号/.test(text)) candidates.add(element);
    }
    return Array.from(candidates)
      .map(scoreFavoriteHost)
      .filter(Boolean)
      .sort((a, b) => {
        const areaA = a.rect.width * a.rect.height;
        const areaB = b.rect.width * b.rect.height;
        return b.score - a.score || areaA - areaB;
      })[0]?.element || null;
  }

  function findFavoriteAvatar(host) {
    if (!host) return null;
    const hostRect = smallVisibleRect(host);
    if (!hostRect) return null;
    return Array.from(host.querySelectorAll("img"))
      .map((element) => ({ element, rect: smallVisibleRect(element) }))
      .filter((item) => {
        if (!item.rect) return false;
        const ratio = item.rect.width / item.rect.height;
        const insideHost = item.rect.left >= hostRect.left - 2 && item.rect.right <= hostRect.right + 2;
        return insideHost && ratio >= 0.7 && ratio <= 1.3 && item.rect.width >= 32 && item.rect.width <= 96 && item.rect.height >= 32 && item.rect.height <= 96;
      })
      .sort((a, b) => {
        const areaA = a.rect.width * a.rect.height;
        const areaB = b.rect.width * b.rect.height;
        return areaB - areaA || a.rect.left - b.rect.left;
      })[0] || null;
  }

  function placeFavoriteAboveAvatar(button, host) {
    const hostRect = smallVisibleRect(host);
    const avatarRect = findFavoriteAvatar(host)?.rect;
    if (!hostRect || !avatarRect) return false;

    const buttonWidth = 204;
    const buttonHeight = 30;
    const gap = 8;
    const minLeft = 8;
    const maxLeft = Math.max(minLeft, hostRect.width - buttonWidth - 8);
    const left = Math.min(maxLeft, Math.max(minLeft, avatarRect.left - hostRect.left + avatarRect.width / 2 - buttonWidth / 2));
    const top = avatarRect.top - hostRect.top - buttonHeight - gap;

    button.style.setProperty("--pgy-detail-favorite-left", `${Math.round(left)}px`);
    button.style.setProperty("--pgy-detail-favorite-top", `${Math.round(top)}px`);
    return true;
  }

  function ensureFavoriteStyle() {
    if (document.getElementById("pgy-detail-favorite-style")) return;
    const style = document.createElement("style");
    style.id = "pgy-detail-favorite-style";
    style.textContent = `
      .pgy-detail-favorite-host {
        position: relative !important;
        overflow: visible !important;
      }
      #pgy-detail-favorite-tools {
        z-index: 20;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      #pgy-detail-favorite-btn,
      #pgy-detail-prefavorite-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 96px;
        height: 30px;
        padding: 0 11px;
        border: 1px solid rgba(255, 36, 72, 0.24);
        border-radius: 16px;
        color: #ff2448;
        background: #fff;
        font: 600 13px/1 "Microsoft YaHei", "PingFang SC", sans-serif;
        cursor: pointer;
        white-space: nowrap;
      }
      #pgy-detail-prefavorite-btn {
        color: #245d3c;
        border-color: rgba(36, 93, 60, 0.3);
        background: #f7ffe9;
      }
      #pgy-detail-favorite-tools.is-profile-mounted {
        position: absolute;
        top: var(--pgy-detail-favorite-top, 16px);
        left: var(--pgy-detail-favorite-left, 18px);
        box-shadow: 0 4px 14px rgba(255, 36, 72, 0.08);
      }
      #pgy-detail-favorite-tools.is-floating-fallback {
        position: fixed;
        left: max(24px, calc((100vw - 1180px) / 2 + 18px));
        top: 150px;
        z-index: 2147483647;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      }
      #pgy-detail-favorite-btn:hover { background: #fff5f7; }
      #pgy-detail-prefavorite-btn:hover { background: #eaf5dd; }
      #pgy-detail-favorite-btn[disabled],
      #pgy-detail-prefavorite-btn[disabled] {
        cursor: default;
        opacity: 0.72;
      }
      #pgy-detail-favorite-toast {
        position: fixed;
        right: 24px;
        top: 140px;
        z-index: 2147483647;
        max-width: 320px;
        padding: 8px 10px;
        border-radius: 6px;
        color: #134e31;
        background: #ecfdf3;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
        font: 13px/1.45 "Microsoft YaHei", "PingFang SC", sans-serif;
        word-break: break-word;
      }
      #pgy-detail-favorite-toast:empty { display: none; }
      #pgy-detail-favorite-toast.is-error {
        color: #9f1239;
        background: #fff1f2;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function mountFavoriteButton(button) {
    const mountedHost = window.__PGY_DETAIL_FAVORITE_HOST__;
    if (mountedHost?.isConnected) {
      if (button.parentElement !== mountedHost) mountedHost.appendChild(button);
      return true;
    }

    const host = findFavoriteHost();
    button.classList.toggle("is-profile-mounted", Boolean(host));
    button.classList.toggle("is-floating-fallback", !host);
    if (!host) {
      if ((window.__PGY_DETAIL_FAVORITE_RETRY_COUNT__ || 0) < 20) return false;
      document.documentElement.appendChild(button);
      return true;
    }

    host.classList.add("pgy-detail-favorite-host");
    if (!placeFavoriteAboveAvatar(button, host)) {
      if ((window.__PGY_DETAIL_FAVORITE_RETRY_COUNT__ || 0) < 20) return false;
      button.style.setProperty("--pgy-detail-favorite-left", "18px");
      button.style.setProperty("--pgy-detail-favorite-top", "16px");
    }
    if (button.parentElement !== host) host.appendChild(button);
    window.__PGY_DETAIL_FAVORITE_HOST__ = host;
    return true;
  }

  function showFavoriteToast(message, isError = false) {
    let toast = document.getElementById("pgy-detail-favorite-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "pgy-detail-favorite-toast";
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = isError ? "is-error" : "";
    window.clearTimeout(showFavoriteToast.timer);
    showFavoriteToast.timer = window.setTimeout(() => {
      toast.textContent = "";
      toast.className = "";
    }, 4500);
  }

  function favoriteProfileName(host) {
    const selectors = [
      ".blogger-name",
      ".kol-name",
      ".nickname",
      "[class*='blogger'][class*='name']",
      "[class*='nickname']",
      "h1",
      "h2",
      "h3",
      "strong"
    ];
    for (const selector of selectors) {
      for (const element of host?.querySelectorAll(selector) || []) {
        const text = cleanText(element.textContent || "");
        if (text && text.length <= 40 && !/小红书号|粉丝|收藏|邀约|报价/.test(text)) return text;
      }
    }
    return cleanText(document.title).split(/[\-|｜]/)[0] || "蒲公英达人";
  }

  function favoriteAvatarUrl(host) {
    const avatar = findFavoriteAvatar(host)?.element;
    const candidates = [avatar?.currentSrc, avatar?.src, avatar?.getAttribute("data-src")];
    return candidates.map((value) => String(value || "").trim()).find((value) => /^https?:\/\//i.test(value) || /^data:image\//i.test(value)) || "";
  }

  function favoriteMetricText(value) {
    if (value === null || value === undefined || value === "") return "";
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    if (Math.abs(number) >= 10000) return `${Math.round((number / 10000) * 100) / 100}万`;
    return String(Math.round(number * 100) / 100);
  }

  async function saveCurrentDetailAsPreFavorite() {
    const detail = extractDetailFields(bodyText(), location.href);
    const userId = detail.pgy_blogger_id || (location.pathname.match(/\/blogger-detail\/([^?/#]+)/) || [])[1] || "";
    if (!userId) throw new Error("没有识别到当前达人 ID。");
    const host = findFavoriteHost();
    const now = new Date().toISOString();
    const record = {
      userId,
      name: favoriteProfileName(host),
      avatar: favoriteAvatarUrl(host),
      redId: detail.xiaohongshu_id || "",
      location: labelValue(textLines(bodyText()), "IP属地") || labelValue(textLines(bodyText()), "所在地") || "",
      followersText: favoriteMetricText(detail.followers_count),
      likesText: favoriteMetricText(detail.liked_collected_count),
      picturePriceText: favoriteMetricText(detail.quote_price),
      videoPriceText: favoriteMetricText(detail.video_quote_price),
      quoteStatus: detail.quote_price || detail.video_quote_price ? "报价已获取" : "报价获取中",
      bio: detail.personal_intro || detail.blogger_advantage || "",
      categoryTags: String(detail.topic_point || "").split(/[、,，;；/]+/).map((item) => item.trim()).filter(Boolean).slice(0, 6),
      categorySource: detail.topic_point ? "pgy_detail" : "pending",
      xhsUrl: detail.profile_url || `https://www.xiaohongshu.com/user/profile/${userId}`,
      pgyUrl: location.href,
      source: "pgy_detail_prefavorite",
      status: "预收藏",
      createdAt: now,
      updatedAt: now
    };
    const stored = await chrome.storage.local.get({ pgyPreFavorites: [] });
    const favorites = Array.isArray(stored.pgyPreFavorites) ? stored.pgyPreFavorites : [];
    const existingIndex = favorites.findIndex((item) => item?.userId === userId);
    const next = [...favorites];
    if (existingIndex >= 0) {
      next[existingIndex] = { ...next[existingIndex], ...record, createdAt: next[existingIndex].createdAt || now };
    } else {
      next.unshift(record);
    }
    await chrome.storage.local.set({ pgyPreFavorites: next });
    chrome.runtime.sendMessage({ type: "ENRICH_PREFAVORITE_QUOTE", userId }).catch(() => null);
    return { existing: existingIndex >= 0, count: next.length };
  }

  async function refreshPreFavoriteButtonState(button) {
    const userId = (location.pathname.match(/\/blogger-detail\/([^?/#]+)/) || [])[1] || "";
    if (!userId || !button) return;
    const stored = await chrome.storage.local.get({ pgyPreFavorites: [] });
    const exists = Array.isArray(stored.pgyPreFavorites) && stored.pgyPreFavorites.some((item) => item?.userId === userId);
    if (exists) button.textContent = "✓ 已预收藏";
  }

  function installFavoriteButton() {
    ensureFavoriteStyle();
    let tools = document.getElementById("pgy-detail-favorite-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.id = "pgy-detail-favorite-tools";
    }
    let button = document.getElementById("pgy-detail-favorite-btn");
    if (!button) {
      button = document.createElement("button");
      button.id = "pgy-detail-favorite-btn";
      button.type = "button";
      button.textContent = "☆ 收藏";
      button.addEventListener("click", async () => {
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = "已加入后台";
        showFavoriteToast("已在后台打开详情采集，不影响当前页面操作。");
        try {
          const result = await chrome.runtime.sendMessage({ type: "FAVORITE_CURRENT_DETAIL" });
          if (!result?.ok) throw new Error(result?.message || "收藏写回失败");
          button.textContent = "★ 后台收藏中";
          showFavoriteToast("收藏任务已开始，可关闭当前页或继续操作。完成后会系统通知。");
        } catch (error) {
          button.textContent = "☆ 收藏";
          showFavoriteToast(error?.message || String(error), true);
        } finally {
          button.disabled = false;
        }
      });
    }
    let preFavoriteButton = document.getElementById("pgy-detail-prefavorite-btn");
    if (!preFavoriteButton) {
      preFavoriteButton = document.createElement("button");
      preFavoriteButton.id = "pgy-detail-prefavorite-btn";
      preFavoriteButton.type = "button";
      preFavoriteButton.textContent = "☆ 预收藏";
      preFavoriteButton.addEventListener("click", async () => {
        if (preFavoriteButton.disabled) return;
        preFavoriteButton.disabled = true;
        preFavoriteButton.textContent = "保存中...";
        try {
          const result = await saveCurrentDetailAsPreFavorite();
          preFavoriteButton.textContent = "✓ 已预收藏";
          showFavoriteToast(result.existing ? "已更新这位达人的预收藏信息。" : `已加入预收藏，共 ${result.count} 位达人。`);
        } catch (error) {
          preFavoriteButton.textContent = "☆ 预收藏";
          showFavoriteToast(error?.message || String(error), true);
        } finally {
          preFavoriteButton.disabled = false;
        }
      });
    }
    if (button.parentElement !== tools) tools.appendChild(button);
    if (preFavoriteButton.parentElement !== tools) tools.appendChild(preFavoriteButton);
    const mounted = mountFavoriteButton(tools);
    refreshPreFavoriteButtonState(preFavoriteButton).catch(() => null);
    if (!mounted) scheduleFavoriteButtonMountRetry();
  }

  function scheduleFavoriteButtonMountRetry() {
    if (window.__PGY_DETAIL_FAVORITE_HOST__?.isConnected) return;
    if (window.__PGY_DETAIL_FAVORITE_RETRY_TIMER__) return;
    window.__PGY_DETAIL_FAVORITE_RETRY_COUNT__ = window.__PGY_DETAIL_FAVORITE_RETRY_COUNT__ || 0;
    if (window.__PGY_DETAIL_FAVORITE_RETRY_COUNT__ >= 20) return;
    window.__PGY_DETAIL_FAVORITE_RETRY_COUNT__ += 1;
    window.__PGY_DETAIL_FAVORITE_RETRY_TIMER__ = window.setTimeout(() => {
      window.__PGY_DETAIL_FAVORITE_RETRY_TIMER__ = 0;
      installFavoriteButton();
    }, 300);
  }

  function textLines(text) {
    return String(text || "")
      .split(/\n+/)
      .map((line) => cleanText(line))
      .filter(Boolean);
  }

  function numberFromText(value) {
    const text = String(value || "").replace(/[,，]/g, "");
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    let number = Number(match[0]);
    if (!Number.isFinite(number)) return null;
    if (/[万wW]/.test(text)) number *= 10000;
    return Number.isInteger(number) ? number : number;
  }

  function ratioFromText(value) {
    const text = String(value || "");
    const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (match) return Math.min(Number(match[1]) / 100, 1);
    const numeric = numberFromText(text);
    if (numeric === null) return null;
    return numeric > 1 ? Math.min(numeric / 100, 1) : Math.max(numeric, 0);
  }

  function labelValue(lines, label) {
    const normalizedLabel = cleanText(label).replace(/[:：]$/, "");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const normalizedLine = line.replace(/[:：]$/, "");
      if (normalizedLine === normalizedLabel) return lines[index + 1] || "";
      if (line.startsWith(`${normalizedLabel}：`) || line.startsWith(`${normalizedLabel}:`)) {
        return cleanText(line.slice(normalizedLabel.length + 1));
      }
      const inline = line.match(new RegExp(`${normalizedLabel}\\s*[:：]?\\s*([A-Za-z0-9._-]{3,})`, "i"));
      if (inline) return inline[1];
    }
    return "";
  }

  function redIdFromText(text, lines) {
    const labels = ["小红书号", "红书号", "小红书ID", "小红书账号"];
    for (const label of labels) {
      const value = labelValue(lines, label);
      if (value) return value;
    }
    const match = String(text || "").match(/(?:小红书号|红书号|小红书ID|小红书账号)\s*[:：]?\s*([A-Za-z0-9._-]{3,})/i);
    return match ? match[1] : "";
  }

  function metricAfter(lines, label) {
    return numberFromText(labelValue(lines, label));
  }

  function ratioAfter(lines, label) {
    return ratioFromText(labelValue(lines, label));
  }

  function ratioNear(lines, label) {
    const labels = Array.isArray(label) ? label : [label];
    const index = lines.findIndex((line) => labels.some((item) => line.includes(item)));
    if (index < 0) return null;
    for (let offset = 0; offset <= 3; offset += 1) {
      const value = ratioFromText(lines[index + offset]);
      if (value !== null) return value;
    }
    return null;
  }

  function lineBetween(lines, startLabel, endLabel) {
    const start = lines.findIndex((line) => line.includes(startLabel));
    if (start < 0) return "";
    const end = lines.findIndex((line, index) => index > start && line.includes(endLabel));
    return lines.slice(start + 1, end > start ? end : Math.min(lines.length, start + 8)).join("；");
  }

  function extractNoteCases(lines) {
    const cases = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/(阅读|点赞|收藏|评论|分享)/.test(line)) continue;
      const nearby = lines.slice(Math.max(0, index - 3), Math.min(lines.length, index + 5)).join(" ");
      const read = nearby.match(/阅读(?:数|量)?\s*([0-9.,，万wW]+)/);
      const like = nearby.match(/点赞(?:数|量)?\s*([0-9.,，万wW]+)/);
      const title = lines.slice(Math.max(0, index - 3), index).find((item) => item.length >= 4 && !/(阅读|点赞|收藏|评论|分享|数据)/.test(item)) || "";
      if (title || read || like) {
        cases.push({
          title,
          read_count: read ? numberFromText(read[1]) : null,
          like_count: like ? numberFromText(like[1]) : null,
          source: "visible_detail_text"
        });
      }
      if (cases.length >= 8) break;
    }
    return cases.filter((item) => item.title || item.read_count || item.like_count);
  }

  function extractDetailFields(text, url) {
    const lines = textLines(text);
    const bloggerId = (url.match(/\/blogger-detail\/([^?/#]+)/) || [])[1] || "";
    const personalIntro = ["个人简介：", "个人简介", "简介：", "简介"].map((label) => labelValue(lines, label)).find(Boolean) || "";
    const redId = redIdFromText(text, lines);
    const age35 = ratioNear(lines, ["35-44", "35~44", "35～44"]);
    const age44 = ratioNear(lines, [">44", "44+", "44岁以上", "45岁以上"]);
    const fanAnalysis = {
      fan_growth: metricAfter(lines, "粉丝增量"),
      fan_growth_ratio: ratioAfter(lines, "粉丝量变化幅度"),
      active_fans_ratio: ratioAfter(lines, "活跃粉丝占比"),
      read_fans_ratio: ratioAfter(lines, "阅读粉丝占比"),
      interaction_fans_ratio: ratioAfter(lines, "互动粉丝占比"),
      order_fans_ratio: ratioAfter(lines, "下单粉丝占比"),
      female_fans_ratio: ratioNear(lines, "女性"),
      male_fans_ratio: ratioNear(lines, "男性"),
      fans_under_18_ratio: ratioNear(lines, ["<18", "18岁以下"]),
      fans_18_24_ratio: ratioNear(lines, ["18-24", "18~24", "18～24"]),
      fans_25_34_ratio: ratioNear(lines, ["25-34", "25~34", "25～34"]),
      fans_35_44_ratio: age35,
      fans_44_plus_ratio: age44,
      gender_distribution: lineBetween(lines, "性别分布", "年龄分布"),
      age_distribution: lineBetween(lines, "年龄分布", "地域分布"),
      region_distribution: lineBetween(lines, "地域分布", "用户设备") || lineBetween(lines, "地域分布", "用户兴趣"),
      device_distribution: lineBetween(lines, "用户设备", "用户兴趣")
    };
    for (const key of Object.keys(fanAnalysis)) {
      if (fanAnalysis[key] === "" || fanAnalysis[key] === null || fanAnalysis[key] === undefined) delete fanAnalysis[key];
    }
    const notePerformance = {
      exposure_median: metricAfter(lines, "曝光中位数"),
      read_median: metricAfter(lines, "阅读中位数"),
      interaction_median: metricAfter(lines, "互动中位数"),
      median_like_count: metricAfter(lines, "中位点赞量"),
      median_save_count: metricAfter(lines, "中位收藏量"),
      median_comment_count: metricAfter(lines, "中位评论量"),
      median_share_count: metricAfter(lines, "中位分享量"),
      interaction_rate: ratioAfter(lines, "互动率"),
      picture_3s_read_rate: ratioAfter(lines, "图文3秒阅读率") || ratioAfter(lines, "图文3s阅读率") || ratioAfter(lines, "3秒阅读率") || ratioAfter(lines, "3s阅读率"),
      video_completion_rate: ratioAfter(lines, "视频完播率"),
      thousand_like_note_ratio: ratioAfter(lines, "千赞笔记比例"),
      hundred_like_note_ratio: ratioAfter(lines, "百赞笔记比例")
    };
    for (const key of Object.keys(notePerformance)) {
      if (notePerformance[key] === null || notePerformance[key] === undefined) delete notePerformance[key];
    }
    const servicePerformance = {
      active_days_7d: metricAfter(lines, "近7天活跃天数"),
      reply_rate_48h: ratioAfter(lines, "邀约48小时回复率") || ratioAfter(lines, "邀约48h回复率")
    };
    for (const key of Object.keys(servicePerformance)) {
      if (servicePerformance[key] === null || servicePerformance[key] === undefined) delete servicePerformance[key];
    }
    const topicLine = lines.find((line) => line.includes("用户最感兴趣的内容类型为")) || "";
    const advantageMatch = text.match(/博主优势([\s\S]*?)笔记数据/);
    const organizationName = selectorText(".blogger-base-info .blogger-company") || selectorText(".blogger-company");
    const rawDetail = {
      detail_url: url,
      detail_text: text.slice(0, 12000),
      lines,
      data_updated_to: labelValue(lines, "数据更新至："),
      organization_name: organizationName,
      personal_intro: personalIntro,
      blogger_advantage: advantageMatch ? cleanText(advantageMatch[1]).replace(/\s+/g, "") : "",
      note_performance: notePerformance,
      fan_analysis: fanAnalysis,
      service_performance: servicePerformance,
      note_cases: extractNoteCases(lines),
      collected_at: nowText(),
      source: "browser_extension_detail_text"
    };
    const result = {
      pgy_url: url,
      profile_url: bloggerId ? `https://www.xiaohongshu.com/user/profile/${bloggerId}` : "",
      pgy_blogger_id: bloggerId,
      xiaohongshu_id: redId,
      organization_name: organizationName,
      personal_intro: personalIntro,
      blogger_advantage: rawDetail.blogger_advantage,
      topic_point: topicLine.replace("用户最感兴趣的内容类型为", "").trim(),
      followers_count: metricAfter(lines, "粉丝数"),
      liked_collected_count: metricAfter(lines, "获赞与收藏"),
      quote_price: metricAfter(lines, "图文笔记一口价"),
      video_quote_price: metricAfter(lines, "视频笔记一口价"),
      daily_exposure_median: notePerformance.exposure_median,
      daily_read_median: notePerformance.read_median,
      daily_interaction_median: notePerformance.interaction_median,
      active_fans_ratio: fanAnalysis.active_fans_ratio,
      female_fans_ratio: fanAnalysis.female_fans_ratio,
      male_fans_ratio: fanAnalysis.male_fans_ratio,
      fans_18_24_ratio: fanAnalysis.fans_18_24_ratio,
      fans_25_34_ratio: fanAnalysis.fans_25_34_ratio,
      fans_35_44_ratio: fanAnalysis.fans_35_44_ratio,
      fans_44_plus_ratio: fanAnalysis.fans_44_plus_ratio,
      fans_35_plus_ratio: age35 !== null || age44 !== null ? Math.min((age35 || 0) + (age44 || 0), 1) : null,
      fans_growth_ratio: fanAnalysis.fan_growth_ratio,
      read_fans_ratio: fanAnalysis.read_fans_ratio,
      interaction_fans_ratio: fanAnalysis.interaction_fans_ratio,
      order_fans_ratio: fanAnalysis.order_fans_ratio,
      reply_rate_48h: servicePerformance.reply_rate_48h,
      active_days_7d: servicePerformance.active_days_7d,
      audience_gender_distribution: fanAnalysis.gender_distribution,
      audience_age_distribution: fanAnalysis.age_distribution,
      audience_region_distribution: fanAnalysis.region_distribution,
      audience_device_distribution: fanAnalysis.device_distribution,
      raw_payload: rawDetail
    };
    for (const key of Object.keys(result)) {
      if (result[key] === "" || result[key] === null || result[key] === undefined) delete result[key];
    }
    return result;
  }

  function visibleRect(element) {
    if (!element || !(element instanceof Element)) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 40) return null;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
    return rect;
  }

  function rectPayload(rect) {
    if (!rect) return null;
    return {
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height))
    };
  }

  function pageRectPayload(rect) {
    if (!rect) return null;
    return {
      x: Math.max(0, Math.round(rect.x + window.scrollX)),
      y: Math.max(0, Math.round(rect.y + window.scrollY)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height))
    };
  }

  function unionRects(rects) {
    const usable = rects.filter(Boolean);
    if (!usable.length) return null;
    const left = Math.min(...usable.map((rect) => rect.left));
    const top = Math.min(...usable.map((rect) => rect.top));
    const right = Math.max(...usable.map((rect) => rect.right));
    const bottom = Math.max(...usable.map((rect) => rect.bottom));
    return {
      x: left,
      y: top,
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  function elementText(element) {
    return cleanText(element?.innerText || element?.textContent || "");
  }

  function targetElement(target) {
    return target?.element || target;
  }

  function targetText(target) {
    return target?.text || elementText(targetElement(target));
  }

  function targetRect(target) {
    return target?.rect || visibleRect(targetElement(target));
  }

  function nearestPanel(element) {
    let node = element;
    let best = element;
    while (node && node !== document.body && node !== document.documentElement) {
      const rect = visibleRect(node);
      if (rect && rect.width >= 260 && rect.height >= 90 && rect.width <= 980 && rect.height <= 760) best = node;
      const text = elementText(node);
      if (rect && rect.width >= 360 && rect.height >= 130 && rect.width <= 980 && rect.height <= 760 && text.length > 30) return node;
      node = node.parentElement;
    }
    return best;
  }

  function findSectionElement(kind) {
    const specialized = kind === "overview" ? findOverviewBlock() : findAudienceTopRow();
    if (specialized) return specialized;
    const keys = kind === "overview" ? OVERVIEW_TEXTS : AUDIENCE_TEXTS;
    const elements = Array.from(document.querySelectorAll("section, article, div, main"));
    let fallback = null;
    let bestScore = -Infinity;
    for (const element of elements) {
      const rect = visibleRect(element);
      if (!rect) continue;
      const text = elementText(element);
      if (!text) continue;
      const score = keys.reduce((total, key) => total + (text.includes(key) ? 1 : 0), 0);
      if (score < 2) continue;
      const panel = nearestPanel(element);
      const panelRect = visibleRect(panel) || rect;
      const area = panelRect.width * panelRect.height;
      if (area > 980 * 760) continue;
      const weightedScore = score * 250000 - area;
      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        fallback = { element: panel };
      }
    }
    return fallback || { element: document.querySelector("main") || document.body };
  }

  function candidateBlocks() {
    return Array.from(document.querySelectorAll("section, article, div, main"))
      .map((element) => ({ element, rect: visibleRect(element), text: elementText(element) }))
      .filter((item) => item.rect && item.text);
  }

  function findOverviewBlock() {
    const candidates = candidateBlocks();
    const content = bestContainingBlock(candidates, ["博主优势", "笔记数据", "服务表现", "成长表现"], {
      minWidth: 520,
      minHeight: 260,
      maxHeight: 800
    });
    if (content) {
      const title = bestNearBlock(candidates, ["数据概览"], content.rect, { minWidth: 520, maxHeight: 120, maxDistanceY: 140, above: true });
      const rect = unionRects([title?.rect, content.rect]);
      return {
        element: title?.element || content.element,
        rect,
        text: [title?.text, content.text].filter(Boolean).join(" ")
      };
    }
    const note = bestContainingBlock(candidates, ["笔记数据", "阅读中位数", "曝光中位数", "互动中位数"], { minWidth: 520, minHeight: 140, maxHeight: 360 });
    if (!note) return null;
    const title = bestNearBlock(candidates, ["数据概览"], note.rect, { minWidth: 520, maxHeight: 120, maxDistanceY: 260, above: true });
    const advantage = bestNearBlock(candidates, ["博主优势"], note.rect, { minWidth: 520, maxHeight: 120, maxDistanceY: 180, above: true });
    const service = bestNearBlock(candidates, ["服务表现", "邀约48小时回复率"], note.rect, { minWidth: 260, minHeight: 120, maxHeight: 260, maxDistanceY: 360, below: true });
    const growth = bestNearBlock(candidates, ["成长表现", "粉丝量变化幅度"], note.rect, { minWidth: 260, minHeight: 120, maxHeight: 260, maxDistanceY: 360, below: true });
    const pieces = [title, advantage, note, service, growth].filter(Boolean);
    if (pieces.length < 3) return null;
    const rect = unionRects(pieces.map((item) => item.rect));
    if (!rect) return null;
    return {
      element: title?.element || note.element,
      rect,
      text: pieces.map((item) => item.text).join(" ")
    };
  }

  function findAudienceTopRow() {
    const candidates = candidateBlocks();
    const sex = bestContainingBlock(candidates, ["性别分布"], { minWidth: 220, minHeight: 120, maxHeight: 380 });
    const age = bestContainingBlock(candidates, ["年龄分布"], { minWidth: 220, minHeight: 120, maxHeight: 380 });
    if (!sex || !age) return null;
    const sameRow = Math.abs(sex.rect.top - age.rect.top) < Math.max(sex.rect.height, age.rect.height) * 0.7;
    if (!sameRow) return null;
    const rowRect = unionRects([sex.rect, age.rect]);
    const title = bestNearBlock(candidates, ["粉丝画像"], rowRect, { minWidth: 120, minHeight: 20, maxHeight: 100, maxDistanceY: 180, above: true });
    let rect = unionRects([title?.rect, sex.rect, age.rect]);
    if (rect) {
      const titleTop = title?.rect ? title.rect.top : Infinity;
      const top = Math.max(0, Math.min(titleTop, rect.top - 110));
      rect = {
        ...rect,
        y: top,
        top,
        height: rect.bottom - top
      };
    }
    return {
      element: sex.element,
      rect,
      text: `${title?.text || ""} ${sex.text} ${age.text}`
    };
  }

  function bestTextBlock(candidates, label, { maxHeight = 120 } = {}) {
    return candidates
      .filter((item) => item.text === label || item.text.startsWith(`${label} `))
      .filter((item) => item.rect.height <= maxHeight)
      .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height))[0] || null;
  }

  function bestContainingBlock(candidates, labels, { minWidth = 0, minHeight = 0, maxHeight = Infinity } = {}) {
    return candidates
      .filter((item) => labels.every((label) => item.text.includes(label)))
      .filter((item) => item.rect.width >= minWidth && item.rect.height >= minHeight && item.rect.height <= maxHeight)
      .sort((a, b) => {
        const areaA = a.rect.width * a.rect.height;
        const areaB = b.rect.width * b.rect.height;
        return areaA - areaB;
      })[0] || null;
  }

  function bestNearBlock(candidates, labels, anchorRect, options = {}) {
    const {
      minWidth = 0,
      minHeight = 0,
      maxHeight = Infinity,
      maxDistanceY = Infinity,
      above = false,
      below = false
    } = options;
    return candidates
      .filter((item) => labels.every((label) => item.text.includes(label)))
      .filter((item) => item.rect.width >= minWidth && item.rect.height >= minHeight && item.rect.height <= maxHeight)
      .filter((item) => {
        const overlapsX = item.rect.right > anchorRect.left && item.rect.left < anchorRect.right;
        if (!overlapsX) return false;
        if (above && item.rect.bottom > anchorRect.top + 8) return false;
        if (below && item.rect.top < anchorRect.bottom - 8) return false;
        const distance = above ? anchorRect.top - item.rect.bottom : below ? item.rect.top - anchorRect.bottom : Math.abs(item.rect.top - anchorRect.top);
        return distance >= -8 && distance <= maxDistanceY;
      })
      .sort((a, b) => {
        const distanceA = Math.abs(a.rect.top - anchorRect.top);
        const distanceB = Math.abs(b.rect.top - anchorRect.top);
        const areaA = a.rect.width * a.rect.height;
        const areaB = b.rect.width * b.rect.height;
        return distanceA - distanceB || areaA - areaB;
      })[0] || null;
  }

  function clickDetailTab(kind) {
    const labels = kind === "audience" ? ["粉丝分析", "粉丝画像"] : ["数据概览"];
    const candidates = Array.from(document.querySelectorAll("button, [role='tab'], .tab, div, span, a"));
    for (const label of labels) {
      const target = candidates.find((element) => {
        const rect = visibleRect(element);
        if (!rect || rect.width > 260 || rect.height > 80) return false;
        return cleanText(elementText(element)) === label;
      });
      if (target) {
        target.click();
        return true;
      }
    }
    return false;
  }

  async function prepareCapture(kind) {
    let hideStyle = document.getElementById("pgy-detail-hide-extension-ui");
    if (!hideStyle) {
      hideStyle = document.createElement("style");
      hideStyle.id = "pgy-detail-hide-extension-ui";
      hideStyle.textContent = `
        #pgy-exporter-panel,
        #pgy-detail-favorite-btn,
        #pgy-detail-favorite-toast,
        [id^="pgy-exporter-"],
        .pgy-exporter-head,
        .pgy-exporter-body,
        .pgy-exporter-status,
        .pgy-exporter-actions {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      (document.head || document.documentElement).appendChild(hideStyle);
    }
    for (const node of Array.from(document.querySelectorAll("#pgy-exporter-panel, [id^='pgy-exporter-']"))) {
      if (node.id === "pgy-detail-hide-extension-ui") continue;
      node.remove();
    }
    clickDetailTab(kind);
    await sleep(900);
    const started = Date.now();
    let target = findSectionElement(kind);
    while (Date.now() - started < 9000) {
      target = findSectionElement(kind);
      const keys = kind === "overview" ? OVERVIEW_TEXTS : AUDIENCE_TEXTS;
      const score = keys.reduce((total, key) => total + (targetText(target).includes(key) ? 1 : 0), 0);
      if (score >= 2) break;
      await sleep(WAIT_STEP_MS);
    }
    targetElement(target).scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
    window.scrollBy(0, -96);
    await sleep(800);
    target = findSectionElement(kind);
    let rect = targetRect(target);
    if (!rect || rect.y < 80) {
      targetElement(target).scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      await sleep(500);
      target = findSectionElement(kind);
      rect = targetRect(target);
    }
    return {
      ok: true,
      kind,
      found: (kind === "overview" ? OVERVIEW_TEXTS : AUDIENCE_TEXTS).some((key) => targetText(target).includes(key)),
      text: targetText(target).slice(0, 1600),
      targetRect: rectPayload(rect),
      pageRect: pageRectPayload(rect),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
        deviceScaleFactor: window.devicePixelRatio || 1
      }
    };
  }

  async function collectDetail() {
    await sleep(800);
    const text = bodyText();
    const rateLimitMessage = RATE_LIMIT_TEXTS.find((item) => text.includes(item)) || "";
    if (rateLimitMessage) {
      return { ok: false, paused: true, pauseReason: "rate_limited", message: `详情采集触发限频：${rateLimitMessage}` };
    }
    const authMessage = AUTH_REQUIRED_TEXTS.find((item) => text.includes(item)) || "";
    if (authMessage) {
      return { ok: false, authRequired: true, pauseReason: "auth_required", message: `详情页需要登录或授权：${authMessage}` };
    }
    const detail = extractDetailFields(text, location.href);
    return {
      ok: true,
      url: location.href,
      title: document.title,
      detail,
      text: text.slice(0, 12000),
      collectedAt: nowText()
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PGY_COLLECT_DETAIL") {
      collectDetail()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }
    if (message?.type === "PGY_PREPARE_DETAIL_CAPTURE") {
      prepareCapture(message.kind || "audience")
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
      return true;
    }
    return false;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installFavoriteButton, { once: true });
  } else {
    installFavoriteButton();
  }
})();
