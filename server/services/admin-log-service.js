/**
 * 管理员操作日志服务
 * 支持 MySQL 和 JSON 文件双模式存储
 */
import { isDatabaseAvailable, pool } from "../db.js";
import { loadJson, saveJson } from "./json-store.js";
import { logger } from "../utils/logger.js";

const LOGS_FILE = "admin_logs.json";

// 动作动词 → 中文。配合 targetType 组成 "内容.更新" 这类可枚举的动作名。
const ACTION_LABELS = {
  create: "创建",
  update: "更新",
  delete: "删除",
  approve: "审核通过",
  reject: "审核拒绝",
  login: "登录",
  logout: "退出登录",
  export: "导出",
  import: "导入",
  reorder: "调整排序",
  upload: "上传"
};

// 操作对象类型 → 中文
const TARGET_LABELS = {
  content_item: "内容",
  directory_application: "对接申请",
  user_event: "用户活动",
  user_recruit: "用户实习实践",
  admin_session: "后台会话",
  image: "图片"
};

/**
 * 返回操作的中文名称
 * 支持 "content.update" 这种带命名空间的动作名，也兼容旧的纯动词写法。
 */
export function formatAction(action) {
  const raw = String(action || "");
  if (!raw) return "";
  if (!raw.includes(".")) return ACTION_LABELS[raw] || raw;
  const [targetType, verb] = raw.split(".");
  const verbLabel = ACTION_LABELS[verb] || verb;
  // 登录/退出登录本身已经说明了对象，不用再拼对象类型
  if (verb === "login" || verb === "logout") return verbLabel;
  const targetLabel = TARGET_LABELS[targetType] || targetType;
  return `${verbLabel}${targetLabel}`;
}

/**
 * 返回操作对象类型的中文名称
 */
export function formatTargetType(targetType) {
  const raw = String(targetType || "");
  return TARGET_LABELS[raw] || raw;
}

/**
 * 把 id 规整成可写入 BIGINT UNSIGNED 的整数；拿不到就返回 null。
 * 避免把字符串 id 写进数字列时直接把整条审计日志写崩。
 */
function normalizeId(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) return null;
  return num;
}

/**
 * 从 req 中提取 IP 地址
 */
function extractIp(req) {
  if (!req) return "";
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    ""
  );
}

/**
 * 追加一条日志到 JSON 降级存储
 */
function appendToJsonStore(record) {
  const logs = loadJson(LOGS_FILE, []);
  const newId = logs.length > 0
    ? Math.max(...logs.map(l => Number(l.id) || 0)) + 1
    : 1;
  logs.push({
    id: newId,
    admin_id: record.adminId,
    admin_name: record.adminName,
    action: record.action,
    target_type: record.targetType,
    target_id: record.targetId,
    detail: record.detail,
    ip: record.ip,
    created_at: record.createdAt
  });
  return saveJson(LOGS_FILE, logs);
}

/**
 * 记录一条操作日志
 *
 * 这是一笔审计写入，**绝不能把异常抛给调用方**：
 * 日志写失败不能把管理员正在做的审核操作搞挂。
 * 所以整段逻辑自己兜底：MySQL 优先，写不进去就降级到 JSON，都不行就只记一条错误日志。
 */
export async function logAction({ adminId, adminName, action, targetType, targetId, detail, ip, req }) {
  const record = {
    adminId: normalizeId(adminId),
    adminName: String(adminName || "").slice(0, 128),
    action: String(action || "").slice(0, 64),
    targetType: String(targetType || "").slice(0, 64),
    targetId: normalizeId(targetId),
    detail: detail === null || detail === undefined ? null : String(detail).slice(0, 5000),
    ip: String(ip || extractIp(req) || "").slice(0, 64),
    createdAt: new Date().toISOString()
  };

  try {
    if (await isDatabaseAvailable()) {
      try {
        await pool.query(
          `INSERT INTO admin_logs (admin_id, admin_name, action, target_type, target_id, detail, ip)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            record.adminId,
            record.adminName,
            record.action,
            record.targetType,
            record.targetId,
            record.detail,
            record.ip
          ]
        );
        return true;
      } catch (dbErr) {
        // MySQL 连得上但写不进去（表不存在 / 连接被掐断等）：降级写 JSON，不影响主流程
        logger.warn({ err: dbErr, action: record.action }, "写入 admin_logs 失败，降级到 JSON");
      }
    }
    return appendToJsonStore(record);
  } catch (error) {
    // 审计写入彻底失败：只记一条错误日志，不向上抛
    logger.error({ err: error, action: record.action }, "记录管理员操作日志失败，已忽略");
    return false;
  }
}

/**
 * 统一的日志行映射（MySQL 行和 JSON 行字段名一致）
 */
function mapLogRow(row) {
  return {
    id: row.id,
    admin_id: row.admin_id ?? null,
    admin_name: row.admin_name || "",
    action: row.action || "",
    action_label: formatAction(row.action),
    target_type: row.target_type || "",
    target_label: formatTargetType(row.target_type),
    target_id: row.target_id ?? null,
    detail: row.detail ?? null,
    ip: row.ip || "",
    created_at: row.created_at
  };
}

/**
 * 分页查询操作日志
 */
export async function getAdminLogs({ page = 1, pageSize = 20, action, adminName, startDate, endDate } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(100, Number(pageSize) || 20));
  const offset = (p - 1) * ps;

  if (await isDatabaseAvailable()) {
    try {
      // MySQL 模式 - 构建动态查询
      const conditions = [];
      const params = [];

      if (action) {
        conditions.push("action = ?");
        params.push(action);
      }
      if (adminName) {
        conditions.push("admin_name LIKE ?");
        params.push(`%${adminName}%`);
      }
      if (startDate) {
        conditions.push("created_at >= ?");
        params.push(startDate);
      }
      if (endDate) {
        conditions.push("created_at <= ?");
        params.push(endDate);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM admin_logs ${whereClause}`,
        params
      );

      const [items] = await pool.query(
        `SELECT * FROM admin_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, ps, offset]
      );

      return {
        items: items.map(mapLogRow),
        total,
        page: p,
        pageSize: ps
      };
    } catch (dbErr) {
      // MySQL 读不出来时降级到 JSON，保证审计日志永远查得到
      logger.warn({ err: dbErr }, "查询 admin_logs 失败，降级到 JSON");
    }
  }

  // JSON 降级模式
  let logs = loadJson(LOGS_FILE, []);

  if (action) {
    logs = logs.filter(l => l.action === action);
  }
  if (adminName) {
    const lowerName = adminName.toLowerCase();
    logs = logs.filter(l => (l.admin_name || "").toLowerCase().includes(lowerName));
  }
  if (startDate) {
    logs = logs.filter(l => l.created_at >= startDate);
  }
  if (endDate) {
    logs = logs.filter(l => l.created_at <= endDate);
  }

  logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const total = logs.length;
  const items = logs.slice(offset, offset + ps).map(mapLogRow);

  return { items, total, page: p, pageSize: ps };
}
