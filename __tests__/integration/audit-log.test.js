/**
 * 后台操作审计日志集成测试
 *
 * README 承诺后台有操作日志，但 admin-log-service.logAction 之前全仓库零调用点，
 * 后台任何写操作都不留痕。这里验证写操作真的落痕，并且取值稳定可枚举：
 *   action      "内容.更新" 这种命名空间动作名，如 user_event.approve
 *   targetType  对象类型，如 user_event / directory_application
 *   targetId    记录 id
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import request from "supertest";
import app from "../../server/index.js";
import { client, ADMIN, validUser } from "./helpers.js";
import { loadJson } from "../../server/services/json-store.js";

const LOGS_FILE = "admin_logs.json";

/** 读 JSON 降级存储里的审计日志（测试环境没有 MySQL，写路径走 JSON） */
function readLogs() {
  return loadJson(LOGS_FILE, []);
}

/** 按动作和对象 id 找一条日志 */
function findLog(action, targetId) {
  return readLogs().find(
    log => log.action === action &&
      (targetId === undefined || Number(log.target_id) === Number(targetId))
  );
}

let api;
let adminToken;
let userToken;

beforeAll(async () => {
  api = await client();

  const adminLogin = await api.post("/api/admin/auth/login").send(ADMIN);
  adminToken = adminLogin.body.token;

  await api.post("/api/auth/register").send(validUser());
  const userLogin = await api.post("/api/auth/login")
    .send({ email: validUser().email, password: validUser().password });
  userToken = userLogin.body.token;
});

/** 发一条用户投稿活动，返回这条记录 */
async function createEvent(title) {
  const res = await request(app).post("/api/submit/event")
    .set("Authorization", `Bearer ${userToken}`)
    .send({ title, desc: "由审计日志测试创建" });
  expect(res.status).toBe(201);
  return res.body.item;
}

/** 发一条用户投稿实习实践，返回这条记录 */
async function createRecruit(title) {
  const res = await request(app).post("/api/submit/recruit")
    .set("Authorization", `Bearer ${userToken}`)
    .send({ title, desc: "由审计日志测试创建" });
  expect(res.status).toBe(201);
  return res.body.item;
}

/** 访客提交一条对接申请 */
async function createApplication() {
  const res = await request(app).post("/api/public/directory-applications").send({
    directoryType: "campus",
    targetTitle: "某高校就业指导中心",
    targetMeta: "高校",
    applicantName: "访客申请人",
    cooperationIntent: "共建就业实习基地",
    message: "希望对接",
    phone: "13800001111"
  });
  expect(res.status).toBe(201);
  return res.body.item;
}

describe("后台登录留痕", () => {
  it("管理员登录会写一条 admin.login 日志", () => {
    const log = findLog("admin.login");
    expect(log).toBeTruthy();
    expect(log.admin_name).toBe(ADMIN.username);
    expect(log.target_type).toBe("admin_session");
  });
});

describe("用户投稿审核留痕", () => {
  it("审核通过活动会写一条 user_event.approve 日志", async () => {
    const item = await createEvent("待审核活动-通过");

    const res = await api.post(`/api/admin/user-events/${item.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const log = findLog("user_event.approve", item.id);
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("user_event");
    expect(log.admin_name).toBe(ADMIN.username);
    expect(log.ip).toBeTruthy();
    expect(JSON.parse(log.detail).title).toBe("待审核活动-通过");
  });

  it("拒绝活动会写一条 user_event.reject 日志，并带上拒绝理由", async () => {
    const item = await createEvent("待审核活动-拒绝");

    const res = await api.post(`/api/admin/user-events/${item.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ note: "信息不完整" });
    expect(res.status).toBe(200);

    const log = findLog("user_event.reject", item.id);
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("user_event");
    expect(JSON.parse(log.detail).note).toBe("信息不完整");
  });

  it("删除活动会写一条 user_event.delete 日志", async () => {
    const item = await createEvent("待删除活动");

    const res = await api.del(`/api/admin/user-events/${item.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const log = findLog("user_event.delete", item.id);
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("user_event");
  });

  it("审核通过实习实践会写一条 user_recruit.approve 日志", async () => {
    const item = await createRecruit("待审核实习-通过");

    const res = await api.post(`/api/admin/user-recruits/${item.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const log = findLog("user_recruit.approve", item.id);
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("user_recruit");
  });

  it("拒绝实习实践会写一条 user_recruit.reject 日志", async () => {
    const item = await createRecruit("待审核实习-拒绝");

    const res = await api.post(`/api/admin/user-recruits/${item.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ note: "岗位已关闭" });
    expect(res.status).toBe(200);

    const log = findLog("user_recruit.reject", item.id);
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("user_recruit");
  });

  it("删除实习实践会写一条 user_recruit.delete 日志", async () => {
    const item = await createRecruit("待删除实习");

    const res = await api.del(`/api/admin/user-recruits/${item.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const log = findLog("user_recruit.delete", item.id);
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("user_recruit");
  });
});

describe("对接申请状态推进留痕", () => {
  it("推进对接申请状态会写一条 directory_application.update 日志", async () => {
    const item = await createApplication();

    const res = await api.patch(`/api/admin/directory-applications/${item.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "reviewing", statusNote: "已转运营评估" });
    expect(res.status).toBe(200);

    const log = findLog("directory_application.update", item.id);
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("directory_application");
    expect(log.admin_name).toBe(ADMIN.username);

    const detail = JSON.parse(log.detail);
    expect(detail.status).toBe("reviewing");
    expect(detail.statusNote).toBe("已转运营评估");
    expect(detail.trackingCode).toBe(item.trackingCode);
  });
});

describe("审计日志可查询", () => {
  it("管理员可以通过接口分页读取操作日志", async () => {
    const res = await api.get("/api/admin/logs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.items[0].action_label).toBeTruthy();
  });

  it("不带令牌读取操作日志返回 401", async () => {
    const res = await request(app).get("/api/admin/logs");
    expect(res.status).toBe(401);
  });

  it("可以按动作类型筛选操作日志", async () => {
    const res = await api.get("/api/admin/logs?action=user_event.approve")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    res.body.items.forEach(item => {
      expect(item.action).toBe("user_event.approve");
    });
  });
});
