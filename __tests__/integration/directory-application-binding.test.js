/**
 * 对接申请与账号绑定的集成测试
 *
 * 之前 createDirectoryApplication 的 INSERT 里根本没有 user_id 字段，
 * 每一条申请的 user_id 都是 NULL；而个人中心是 `WHERE user_id = ?` 查的，
 * NULL = 任何值 恒不成立 —— 「我的对接申请」永远查不出任何东西。
 *
 * 这里验证：
 *   1. 登录用户提交的申请，user_id 落到用户身上，个人中心能查到
 *   2. 游客提交的申请，user_id 仍然是 NULL，但提交照样成功
 *   3. 令牌无效 / 缺失都当游客处理，绝不因为 token 的问题让提交失败
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import request from "supertest";
import app from "../../server/index.js";
import { client, validUser } from "./helpers.js";
import { loadJson } from "../../server/services/json-store.js";

let api;
let userToken;
let userId;

const applicationPayload = (overrides = {}) => ({
  directoryType: "campus",
  targetTitle: "某高校就业指导中心",
  targetMeta: "高校",
  applicantName: "李老师",
  cooperationIntent: "共建实习基地",
  message: "希望对接",
  phone: "13800002222",
  ...overrides
});

/** 读 JSON 降级存储里的申请 */
function readApplications() {
  return loadJson("directory_applications.json", []);
}

function findApplication(trackingCode) {
  return readApplications().find(item => item.tracking_code === trackingCode);
}

beforeAll(async () => {
  api = await client();
  await api.post("/api/auth/register").send(validUser());
  const login = await api.post("/api/auth/login")
    .send({ email: validUser().email, password: validUser().password });
  userToken = login.body.token;

  const users = loadJson("users.json", []);
  userId = users.find(u => u.email === validUser().email)?.id;
});

describe("登录用户提交的申请会绑到账号上", () => {
  it("带令牌提交时 user_id 不为 NULL", async () => {
    const res = await request(app).post("/api/public/directory-applications")
      .set("Authorization", `Bearer ${userToken}`)
      .send(applicationPayload());

    expect(res.status).toBe(201);
    const trackingCode = res.body.item.trackingCode;

    const stored = findApplication(trackingCode);
    expect(stored).toBeTruthy();
    expect(stored.user_id).not.toBeNull();
    expect(Number(stored.user_id)).toBe(Number(userId));
  });

  it("个人中心能查到这条申请", async () => {
    const submitted = await request(app).post("/api/public/directory-applications")
      .set("Authorization", `Bearer ${userToken}`)
      .send(applicationPayload({ targetTitle: "某职业院校" }));
    expect(submitted.status).toBe(201);
    const trackingCode = submitted.body.item.trackingCode;

    const res = await request(app).get("/api/user/directory-applications")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    const codes = res.body.records.map(item => item.trackingCode);
    expect(codes).toContain(trackingCode);
  });

  it("user-center 的新接口同样能查到", async () => {
    const submitted = await request(app).post("/api/public/directory-applications")
      .set("Authorization", `Bearer ${userToken}`)
      .send(applicationPayload({ targetTitle: "某行业协会" }));
    const trackingCode = submitted.body.item.trackingCode;

    const res = await request(app).get("/api/user-center/applications")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    const codes = res.body.applications.map(item => item.trackingCode);
    expect(codes).toContain(trackingCode);
  });
});

describe("游客提交不受影响", () => {
  it("不带令牌提交成功，user_id 为 NULL", async () => {
    const res = await request(app).post("/api/public/directory-applications")
      .send(applicationPayload({ applicantName: "访客王先生" }));

    expect(res.status).toBe(201);
    const trackingCode = res.body.item.trackingCode;

    const stored = findApplication(trackingCode);
    expect(stored).toBeTruthy();
    expect(stored.user_id).toBeNull();
  });

  it("令牌无效时当游客处理，提交照样成功而不是 401", async () => {
    const res = await request(app).post("/api/public/directory-applications")
      .set("Authorization", "Bearer not.a.real.token")
      .send(applicationPayload({ applicantName: "过期令牌访客" }));

    expect(res.status).toBe(201);
    const stored = findApplication(res.body.item.trackingCode);
    expect(stored).toBeTruthy();
    expect(stored.user_id).toBeNull();
  });

  it("游客提交的申请不会出现在登录用户的个人中心里", async () => {
    const guest = await request(app).post("/api/public/directory-applications")
      .send(applicationPayload({ applicantName: "纯游客", phone: "13800003333" }));
    const guestCode = guest.body.item.trackingCode;

    const res = await request(app).get("/api/user/directory-applications")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    const codes = res.body.records.map(item => item.trackingCode);
    expect(codes).not.toContain(guestCode);
  });

  it("提交回执里不泄露 user_id", async () => {
    const res = await request(app).post("/api/public/directory-applications")
      .send(applicationPayload({ applicantName: "回执访客" }));

    expect(res.status).toBe(201);
    expect(res.body.item.userId).toBeUndefined();
  });
});

describe("公开进度查询不泄露账号信息", () => {
  it("按编号和手机号查进度时，响应里没有 user_id", async () => {
    const submitted = await request(app).post("/api/public/directory-applications")
      .set("Authorization", `Bearer ${userToken}`)
      .send(applicationPayload({ applicantName: "进度查询用户", phone: "13800004444" }));
    const trackingCode = submitted.body.item.trackingCode;

    const res = await request(app).post("/api/public/directory-applications/query")
      .send({ trackingCode, phone: "13800004444" });

    expect(res.status).toBe(200);
    expect(res.body.item.userId).toBeUndefined();
    expect(res.body.item.trackingCode).toBe(trackingCode);
  });
});
