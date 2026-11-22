import { Router } from "express";
import { getSiteContent } from "../services/content-service.js";
import { createDirectoryApplication, queryDirectoryApplicationProgress } from "../services/directory-application-service.js";
import { getApprovedEvents, getApprovedRecruits } from "../services/user-submission-service.js";
import { optionalAuth } from "../services/auth-service.js";

const router = Router();

router.get("/site-content", async (req, res, next) => {
  try {
    const data = await getSiteContent();
    // 合并用户发布的已审核内容
    const [userEvents, userRecruits] = await Promise.all([
      getApprovedEvents().catch(() => []),
      getApprovedRecruits().catch(() => [])
    ]);
    data.userEvents = userEvents;
    data.userRecruits = userRecruits;
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// 提交生态对接申请。
// 这是一条公开路由：游客不用登录也能提交。
// optionalAuth 会在有合法登录态时把 req.user 填上，提交时顺手把申请绑到账号上；
// 拿不到登录态（没带令牌 / 令牌无效）就按游客处理，绝不因此拒绝提交。
router.post("/directory-applications", optionalAuth, async (req, res, next) => {
  try {
    const item = await createDirectoryApplication(req.body || {}, req.user?.userId ?? null);
    res.status(201).json({
      message: "对接申请已提交，我们会尽快与你联系。",
      item
    });
  } catch (error) {
    // 数据库不可用时返回明确的 503，避免前端收到难以理解的 500
    if (error.code === "ECONNREFUSED" || error.code === "ER_ACCESS_DENIED_ERROR") {
      return res.status(503).json({
        message: "服务器暂时无法接收申请，请稍后再试，或通过页面底部企业微信联系我们。"
      });
    }
    next(error);
  }
});

router.post("/directory-applications/query", async (req, res, next) => {
  try {
    const item = await queryDirectoryApplicationProgress(req.body || {});
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

export default router;
