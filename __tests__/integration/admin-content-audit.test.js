/**
 * 内容增删改的审计留痕测试
 *
 * 内容写路径（create/update/delete）只走 MySQL、没有 JSON 降级，
 * 没有测试库时这些接口会直接 503，测不到「写完之后有没有留痕」。
 *
 * 所以这里把 content-service 整个替换成假实现，让写操作能跑通，
 * 再验证 admin 路由确实为每一次内容写操作落了审计日志。
 */

import { describe, it, expect, beforeAll, jest } from "@jest/globals";
import request from "supertest";

const mockContentCalls = [];

jest.unstable_mockModule("../../server/services/content-service.js", () => ({
  assertValidSection: (sectionKey, groupKey) => groupKey ?? null,
  listContent: async () => [],
  getSiteContent: async () => ({}),
  createContent: async (sectionKey, groupKey, payload) => {
    mockContentCalls.push({ op: "create", sectionKey, groupKey, payload });
    return { id: 9001, sectionKey, groupKey, title: payload?.title || "" };
  },
  updateContent: async (id, payload) => {
    mockContentCalls.push({ op: "update", id, payload });
    return {
      id,
      sectionKey: payload?.sectionKey || "",
      groupKey: payload?.groupKey || null,
      title: payload?.title || ""
    };
  },
  deleteContent: async (id) => {
    mockContentCalls.push({ op: "delete", id });
    return true;
  },
  reorderContent: async (sectionKey, groupKey, ids) => {
    mockContentCalls.push({ op: "reorder", sectionKey, groupKey, ids });
    return true;
  },
  exportAllContent: async () => ({}),
  importAllContent: async (payload) => {
    mockContentCalls.push({ op: "import", payload });
    return true;
  },
  replaceSection: async () => true,
}));

// 必须在 mock 注册之后再动态导入 app
const { default: app } = await import("../../server/index.js");
const { loadJson } = await import("../../server/services/json-store.js");

const ADMIN = {
  username: process.env.ADMIN_USERNAME,
  password: process.env.ADMIN_PASSWORD,
};

function readLogs() {
  return loadJson("admin_logs.json", []);
}

function findLog(action, targetId) {
  return readLogs().find(
    log => log.action === action &&
      (targetId === undefined || Number(log.target_id) === Number(targetId))
  );
}

let api;
let adminToken;

beforeAll(async () => {
  const agent = request.agent(app);
  const csrf = await agent.get("/api/csrf-token");
  const csrfToken = csrf.body.csrfToken;
  api = {
    post: (url) => agent.post(url).set("x-csrf-token", csrfToken),
    put: (url) => agent.put(url).set("x-csrf-token", csrfToken),
    del: (url) => agent.delete(url).set("x-csrf-token", csrfToken),
    get: (url) => agent.get(url),
  };

  const login = await api.post("/api/admin/auth/login").send(ADMIN);
  adminToken = login.body.token;
});

const asAdmin = (req) => req.set("Authorization", `Bearer ${adminToken}`);

describe("内容增删改留痕", () => {
  it("新增内容会写一条 content.create 日志，并带上栏目", async () => {
    const res = await asAdmin(api.post("/api/admin/content"))
      .send({
        sectionKey: "partners",
        groupKey: "university",
        item: { title: "某大学", partnerName: "某大学" }
      });
    expect(res.status).toBe(201);

    const log = findLog("content.create", 9001);
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("content_item");
    expect(log.admin_name).toBe(ADMIN.username);

    const detail = JSON.parse(log.detail);
    expect(detail.sectionKey).toBe("partners");
    expect(detail.groupKey).toBe("university");
  });

  it("修改内容会写一条 content.update 日志", async () => {
    const res = await asAdmin(api.put("/api/admin/content/9002"))
      .send({ item: { title: "改名后的大学", sectionKey: "directory" } });
    expect(res.status).toBe(200);

    const log = findLog("content.update", 9002);
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("content_item");
  });

  it("删除内容会写一条 content.delete 日志", async () => {
    const res = await asAdmin(api.del("/api/admin/content/9003"));
    expect(res.status).toBe(204);

    const log = findLog("content.delete", 9003);
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("content_item");
  });

  it("调整排序会写一条 content.reorder 日志", async () => {
    const res = await asAdmin(api.post("/api/admin/content/reorder"))
      .send({ sectionKey: "events", groupKey: null, ids: [3, 1, 2] });
    expect(res.status).toBe(200);

    const log = findLog("content.reorder");
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("content_item");
    expect(JSON.parse(log.detail).count).toBe(3);
  });

  it("导入内容会写一条 content.import 日志", async () => {
    const res = await asAdmin(api.post("/api/admin/import"))
      .send({ events: { items: [] } });
    expect(res.status).toBe(200);

    const log = findLog("content.import");
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("content_item");
  });

  it("导出内容会写一条 content.export 日志", async () => {
    const res = await asAdmin(api.get("/api/admin/export"));
    expect(res.status).toBe(200);

    const log = findLog("content.export");
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("content_item");
  });
});
