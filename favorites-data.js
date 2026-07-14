const FavoriteDataTools = (() => {
  const FIELD_ALIASES = {
    userId: ["达人ID", "博主ID", "达人id", "用户ID", "userId", "creator_id", "蒲公英ID"],
    name: ["达人昵称", "达人名称", "昵称", "博主昵称", "博主名称", "name"],
    redId: ["小红书号", "红书号", "小红书ID", "redId"],
    location: ["IP城市", "IP属地", "地理位置", "地区", "location"],
    followersText: ["粉丝数", "粉丝数（万）", "粉丝数(万)", "粉丝数w", "粉丝量", "followersText"],
    likesText: ["获赞与收藏", "赞藏数", "赞藏数（万）", "赞藏数(万)", "likesText"],
    picturePriceText: ["图文报价", "图文笔记一口价", "图文一口价", "picturePriceText"],
    videoPriceText: ["视频报价", "视频笔记一口价", "视频一口价", "videoPriceText"],
    bio: ["个人简介", "简介", "博主人设", "bio"],
    categoryTags: ["内容类目", "内容类型", "类目", "分类", "标签", "categoryTags"],
    xhsUrl: ["主页链接", "小红书主页", "小红书链接", "xhsUrl", "profile_url"],
    pgyUrl: ["蒲公英链接", "蒲公英主页", "pgyUrl", "pgy_url"],
    status: ["达人库状态", "状态", "详情补采状态", "status"],
    createdAt: ["创建时间", "createdAt"],
    updatedAt: ["更新时间", "采集时间", "updatedAt"]
  };
  const KNOWN_HEADERS = new Set(Object.values(FIELD_ALIASES).flat().map(normalizeHeader));

  function normalizeHeader(value) {
    return String(value ?? "").trim().toLowerCase().replace(/[\s_\-—:：()（）/\\]+/g, "");
  }

  function cellText(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join("、");
    if (typeof value === "object") {
      return cellText(value.text ?? value.name ?? value.value ?? value.link ?? value.url ?? "");
    }
    return String(value).trim();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const input = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      if (quoted) {
        if (char === '"' && input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    row.push(cell.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) rows.push(row);
    return rows;
  }

  function findEndOfCentralDirectory(view) {
    for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65557); offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) return offset;
    }
    throw new Error("无法识别 XLSX 压缩结构。");
  }

  async function unzipEntries(buffer) {
    const view = new DataView(buffer);
    const endOffset = findEndOfCentralDirectory(view);
    const entryCount = view.getUint16(endOffset + 10, true);
    let offset = view.getUint32(endOffset + 16, true);
    const entries = new Map();
    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("XLSX 文件目录损坏。");
      const compression = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const nameBytes = new Uint8Array(buffer, offset + 46, nameLength);
      const name = new TextDecoder("utf-8").decode(nameBytes);
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer.slice(dataOffset, dataOffset + compressedSize));
      let content;
      if (compression === 0) {
        content = compressed;
      } else if (compression === 8 && typeof DecompressionStream === "function") {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        content = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error("当前浏览器无法解压此 XLSX 文件。");
      }
      entries.set(name, content);
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  function xmlText(bytes) {
    return new TextDecoder("utf-8").decode(bytes || new Uint8Array());
  }

  function columnIndex(reference) {
    const letters = String(reference || "").match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
    let value = 0;
    for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
    return Math.max(0, value - 1);
  }

  async function parseXlsx(file) {
    const entries = await unzipEntries(await file.arrayBuffer());
    const sharedXml = entries.get("xl/sharedStrings.xml");
    const sharedStrings = sharedXml
      ? Array.from(new DOMParser().parseFromString(xmlText(sharedXml), "application/xml").querySelectorAll("si"))
        .map((node) => node.textContent || "")
      : [];
    const sheetName = Array.from(entries.keys()).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
    if (!sheetName) throw new Error("XLSX 中没有找到工作表。");
    const documentNode = new DOMParser().parseFromString(xmlText(entries.get(sheetName)), "application/xml");
    return Array.from(documentNode.querySelectorAll("sheetData > row")).map((rowNode) => {
      const row = [];
      for (const cellNode of rowNode.querySelectorAll("c")) {
        const type = cellNode.getAttribute("t") || "";
        const value = type === "inlineStr"
          ? cellNode.querySelector("is")?.textContent || ""
          : cellNode.querySelector("v")?.textContent || "";
        row[columnIndex(cellNode.getAttribute("r"))] = type === "s" ? sharedStrings[Number(value)] || "" : value;
      }
      return row;
    });
  }

  function headerScore(row) {
    return (Array.isArray(row) ? row : []).reduce((score, value) => score + (KNOWN_HEADERS.has(normalizeHeader(value)) ? 1 : 0), 0);
  }

  function matrixToObjects(matrix) {
    const rows = (Array.isArray(matrix) ? matrix : []).filter((row) => Array.isArray(row) && row.some((value) => cellText(value)));
    if (!rows.length) return [];
    let headerIndex = 0;
    let bestScore = -1;
    rows.slice(0, 12).forEach((row, index) => {
      const score = headerScore(row);
      if (score > bestScore) {
        bestScore = score;
        headerIndex = index;
      }
    });
    const headers = rows[headerIndex].map(cellText);
    return rows.slice(headerIndex + 1).map((line) => {
      const item = {};
      headers.forEach((header, index) => {
        if (header) item[header] = cellText(line[index]);
      });
      return item;
    }).filter((item) => Object.values(item).some(Boolean));
  }

  function normalizedRow(row) {
    const values = new Map();
    Object.entries(row || {}).forEach(([key, value]) => values.set(normalizeHeader(key), cellText(value)));
    return values;
  }

  function pick(values, field) {
    for (const alias of FIELD_ALIASES[field]) {
      const value = values.get(normalizeHeader(alias));
      if (value !== undefined && value !== "") return value;
    }
    return "";
  }

  function cleanUserId(value, pgyUrl, xhsUrl) {
    const direct = String(value || "").trim().replace(/^pgy-api:/i, "");
    if (direct) return direct;
    return (String(pgyUrl || "").match(/\/blogger-detail\/([^?/#]+)/) || [])[1]
      || (String(xhsUrl || "").match(/\/user\/profile\/([^?/#]+)/) || [])[1]
      || "";
  }

  function objectToFavorite(row) {
    const values = normalizedRow(row);
    const pgyUrl = pick(values, "pgyUrl");
    const xhsUrl = pick(values, "xhsUrl");
    const userId = cleanUserId(pick(values, "userId"), pgyUrl, xhsUrl);
    if (!userId) return null;
    const record = { userId, source: "spreadsheet_import", updatedAt: new Date().toISOString() };
    for (const field of ["name", "redId", "location", "followersText", "likesText", "picturePriceText", "videoPriceText", "bio", "xhsUrl", "pgyUrl", "status", "createdAt", "updatedAt"]) {
      const value = pick(values, field);
      if (value) record[field] = value;
    }
    const categoryText = pick(values, "categoryTags");
    if (categoryText) record.categoryTags = categoryText.split(/[、,，/|｜;；]+/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
    if (!record.status) record.status = "表格导入";
    if (!record.createdAt) record.createdAt = new Date().toISOString();
    return record;
  }

  function objectsToFavorites(rows) {
    return (Array.isArray(rows) ? rows : []).map(objectToFavorite).filter(Boolean);
  }

  function mergeFavorites(existing, incoming) {
    const byId = new Map((Array.isArray(existing) ? existing : []).map((item) => [item.userId, item]));
    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const record of incoming) {
      const current = byId.get(record.userId);
      if (!current) {
        byId.set(record.userId, record);
        added += 1;
        continue;
      }
      const patch = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== "" && value !== null && value !== undefined));
      byId.set(record.userId, {
        ...current,
        ...patch,
        createdAt: current.createdAt || record.createdAt,
        status: current.feishuWriteHistory?.length ? "已写入飞书" : patch.status || current.status,
        feishuWriteHistory: current.feishuWriteHistory || []
      });
      updated += 1;
    }
    skipped = Math.max(0, incoming.length - added - updated);
    return { items: Array.from(byId.values()), added, updated, skipped };
  }

  function toExportRow(item) {
    return {
      "达人ID": item.userId || "",
      "达人昵称": item.name || "",
      "小红书号": item.redId || "",
      "IP属地": item.location || "",
      "粉丝数": item.followersText || "",
      "获赞与收藏": item.likesText || "",
      "图文报价": item.picturePriceText || "",
      "视频报价": item.videoPriceText || "",
      "内容类目": (item.categoryTags || []).join("、"),
      "个人简介": item.bio || "",
      "小红书主页": item.xhsUrl || "",
      "蒲公英主页": item.pgyUrl || "",
      "达人库状态": item.status || "",
      "创建时间": item.createdAt || "",
      "更新时间": item.updatedAt || ""
    };
  }

  return { parseCsv, parseXlsx, matrixToObjects, objectsToFavorites, mergeFavorites, toExportRow };
})();
