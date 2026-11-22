import { Router } from "express";
import multer from "multer";
import { createAdminToken, requireAdmin, verifyAdminCredentials } from "../auth.js";
import { config } from "../config.js";
import { csrfCookieNameValue } from "../utils/csrf.js";
import {
  createContent,
  deleteContent,
  exportAllContent,
  importAllContent,
  listContent,
  reorderContent,
  updateContent
} from "../services/content-service.js";
import { listDirectoryApplications, updateDirectoryApplication } from "../services/directory-application-service.js";
import { getAdminLogs, logAction } from "../services/admin-log-service.js";
import { listActivityRegistrations, listDeliveryRecords } from "../services/user-center-service.js";
import {
  listAllUserEvents,
  listAllUserRecruits,
  approveEvent,
  approveRecruit,
  rejectEvent,
  rejectRecruit,
  deleteUserEvent,
  deleteUserRecruit
} from "../services/user-submission-service.js";
import { uploadImage } from "../services/upload-service.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.tos.maxUploadSizeMb * 1024 * 1024
  }
});

/**
 * 取当前管理员身份。
 * 后台 JWT 里只有 username，没有数字 id，所以 admin_id 记 null，用 admin_name 认人。
 */
function adminActor(req) {
  return {
    adminId: null,
    adminName: req.admin?.username || ""
  };
}

/**
 * 统一的审计入口：把一次后台写操作记进 admin_logs。
 *
 * action / targetType / targetId 取值稳定可枚举：
 *   action      "内容.更新" 之类的命名空间动作名，如 content.update
 *   targetType  对象类型，如 content_item / directory_application
 *   targetId    记录 id（没有单条记录时为 null）
 *
 * 审计是旁路：整个函数自己兜底，写日志出问题也绝不影响主流程。
 */
async function audit(req, { action, targetType, targetId = null, detail = null, adminName = null }) {
  try {
    let serialized = null;
    if (detail !== null && detail !== undefined) {
      try {
        serialized = JSON.stringify(detail);
      } catch (err) {
        serialized = String(detail);
      }
    }
    await logAction({
      adminId: null,
      adminName: adminName ?? adminActor(req).adminName,
      action,
      targetType,
      targetId,
      detail: serialized,
      req
    });
  } catch (error) {
    // 审计写不进去就忽略，不能把管理员正在做的操作搞挂
  }
}

router.post("/auth/login", async (req, res, next) => {
  try {
    const { username = "", password = "" } = req.body || {};
    const valid = await verifyAdminCredentials(username, password);
    if (!valid) {
      return res.status(401).json({ message: "账号或密码错误" });
    }
    await audit(req, {
      action: "admin.login",
      targetType: "admin_session",
      targetId: null,
      detail: { username },
      adminName: username
    });
    res.json({
      token: createAdminToken(),
      admin: { username: config.adminUsername }
    });
  } catch (error) {
    next(error);
  }
});

// 退出登录：JWT 无状态，这里主要清除服务端 CSRF cookie，返回 200
router.post("/auth/logout", (req, res) => {
  try {
    res.clearCookie(csrfCookieNameValue, { path: "/" });
  } catch (error) {}
  res.json({ success: true, message: "已退出登录" });
});

router.get("/auth/me", requireAdmin, (req, res) => {
  res.json({ admin: { username: req.admin.username } });
});

router.use(requireAdmin);

// 生态对接申请
router.get("/directory-applications", async (req, res, next) => {
  try {
    const items = await listDirectoryApplications();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// 活动报名
router.get("/activity-registrations", async (req, res, next) => {
  try {
    const items = await listActivityRegistrations();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// 投递记录
router.get("/delivery-records", async (req, res, next) => {
  try {
    const items = await listDeliveryRecords();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// ── 用户发布审核 ─────────────────────────

// 用户发布的活动（全部，含审核状态）
router.get("/user-events", async (req, res, next) => {
  try {
    const items = await listAllUserEvents();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// 用户发布的实习实践（全部）
router.get("/user-recruits", async (req, res, next) => {
  try {
    const items = await listAllUserRecruits();
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// 审核通过活动
router.post("/user-events/:id/approve", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await approveEvent(id);
    await audit(req, {
      action: "user_event.approve",
      targetType: "user_event",
      targetId: id,
      detail: { title: item?.title || "", status: item?.status || "approved" }
    });
    res.json({ success: true, message: "活动已通过审核", item });
  } catch (error) {
    next(error);
  }
});

// 拒绝活动
router.post("/user-events/:id/reject", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { note = "" } = req.body || {};
    const item = await rejectEvent(id, note);
    await audit(req, {
      action: "user_event.reject",
      targetType: "user_event",
      targetId: id,
      detail: { title: item?.title || "", status: item?.status || "rejected", note }
    });
    res.json({ success: true, message: "活动已拒绝", item });
  } catch (error) {
    next(error);
  }
});

// 删除用户活动
router.delete("/user-events/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await deleteUserEvent(id);
    await audit(req, {
      action: "user_event.delete",
      targetType: "user_event",
      targetId: id
    });
    res.json({ success: true, message: "已删除" });
  } catch (error) {
    next(error);
  }
});

// 审核通过实习实践
router.post("/user-recruits/:id/approve", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await approveRecruit(id);
    await audit(req, {
      action: "user_recruit.approve",
      targetType: "user_recruit",
      targetId: id,
      detail: { title: item?.title || "", status: item?.status || "approved" }
    });
    res.json({ success: true, message: "实习实践已通过审核", item });
  } catch (error) {
    next(error);
  }
});

// 拒绝实习实践
router.post("/user-recruits/:id/reject", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { note = "" } = req.body || {};
    const item = await rejectRecruit(id, note);
    await audit(req, {
      action: "user_recruit.reject",
      targetType: "user_recruit",
      targetId: id,
      detail: { title: item?.title || "", status: item?.status || "rejected", note }
    });
    res.json({ success: true, message: "实习实践已拒绝", item });
  } catch (error) {
    next(error);
  }
});

// 删除用户实习实践
router.delete("/user-recruits/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await deleteUserRecruit(id);
    await audit(req, {
      action: "user_recruit.delete",
      targetType: "user_recruit",
      targetId: id
    });
    res.json({ success: true, message: "已删除" });
  } catch (error) {
    next(error);
  }
});

router.patch("/directory-applications/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await updateDirectoryApplication(id, req.body || {});
    await audit(req, {
      action: "directory_application.update",
      targetType: "directory_application",
      targetId: id,
      detail: {
        status: item?.status || "",
        statusNote: item?.statusNote || "",
        trackingCode: item?.trackingCode || ""
      }
    });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.get("/content", async (req, res, next) => {
  try {
    const { sectionKey, groupKey = null } = req.query;
    const items = await listContent(sectionKey, groupKey || null);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post("/content", async (req, res, next) => {
  try {
    const { sectionKey, groupKey = null, item } = req.body || {};
    const created = await createContent(sectionKey, groupKey || null, item || {});
    await audit(req, {
      action: "content.create",
      targetType: "content_item",
      targetId: created?.id ?? null,
      detail: {
        sectionKey: sectionKey || "",
        groupKey: groupKey || null,
        title: created?.title || item?.title || ""
      }
    });
    res.status(201).json({ item: created });
  } catch (error) {
    next(error);
  }
});

router.put("/content/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await updateContent(id, req.body?.item || {});
    await audit(req, {
      action: "content.update",
      targetType: "content_item",
      targetId: id,
      detail: {
        sectionKey: item?.sectionKey || "",
        groupKey: item?.groupKey || null,
        title: item?.title || ""
      }
    });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.delete("/content/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await deleteContent(id);
    await audit(req, {
      action: "content.delete",
      targetType: "content_item",
      targetId: id
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/content/reorder", async (req, res, next) => {
  try {
    const { sectionKey, groupKey = null, ids = [] } = req.body || {};
    await reorderContent(sectionKey, groupKey || null, ids);
    await audit(req, {
      action: "content.reorder",
      targetType: "content_item",
      targetId: null,
      detail: { sectionKey: sectionKey || "", groupKey: groupKey || null, count: ids.length }
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/export", async (req, res, next) => {
  try {
    const payload = await exportAllContent();
    await audit(req, {
      action: "content.export",
      targetType: "content_item",
      targetId: null,
      detail: { scope: "all" }
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post("/import", async (req, res, next) => {
  try {
    const payload = req.body || {};
    await importAllContent(payload);
    await audit(req, {
      action: "content.import",
      targetType: "content_item",
      targetId: null,
      detail: {
        sections: Object.keys(payload || {}).filter(key =>
          payload?.[key] && typeof payload[key] === "object"
        )
      }
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "请先选择图片" });
    }
    const result = await uploadImage(req.file);
    await audit(req, {
      action: "media.upload",
      targetType: "image",
      targetId: null,
      detail: { key: result?.key || "", url: result?.url || "", filename: req.file.originalname || "" }
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// 操作日志（审计）
router.get("/logs", async (req, res, next) => {
  try {
    const { page, pageSize, action, adminName, startDate, endDate } = req.query;
    const result = await getAdminLogs({
      page,
      pageSize,
      action,
      adminName,
      startDate,
      endDate
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});


// 用户统计
router.get("/users/stats", async (req, res, next) => {
  try {
    const { getUserStats } = await import("../services/auth-service.js");
    const stats = await getUserStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

// 用户列表
router.get("/users", async (req, res, next) => {
  try {
    const { getAllUsers } = await import("../services/auth-service.js");
    const users = await getAllUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

export default router;
