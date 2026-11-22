/**
 * 审计日志自身的健壮性测试
 *
 * 审计是「旁路」：它挂了不能把管理员正在做的审核操作一起搞挂。
 * 这里把 MySQL 模拟成连得上但写不进去，验证 logAction 依然不抛异常，
 * 并且自动降级到 JSON 存储，日志不会丢。
 */

import { describe, it, expect, jest } from "@jest/globals";

const mockQuery = jest.fn(async () => {
  throw new Error("MySQL 写入失败：表 admin_logs 不存在");
});

jest.unstable_mockModule("../../server/db.js", () => ({
  pool: { query: mockQuery },
  isDatabaseAvailable: async () => true,
  invalidateDbCache: () => {},
  closePool: async () => {},
}));

const { logAction } = await import("../../server/services/admin-log-service.js");
const { loadJson } = await import("../../server/services/json-store.js");

function readLogs() {
  return loadJson("admin_logs.json", []);
}

describe("写日志失败不影响主流程", () => {
  it("MySQL 写入失败时 logAction 不抛异常", async () => {
    await expect(
      logAction({
        adminId: null,
        adminName: "test-admin",
        action: "user_event.approve",
        targetType: "user_event",
        targetId: 7,
        detail: "{}"
      })
    ).resolves.toBeDefined();
  });

  it("MySQL 写入失败时降级到 JSON 存储，日志没有丢", async () => {
    await logAction({
      adminId: null,
      adminName: "test-admin",
      action: "content.update",
      targetType: "content_item",
      targetId: 42,
      detail: JSON.stringify({ sectionKey: "events" })
    });

    const log = readLogs().find(item => item.action === "content.update");
    expect(log).toBeTruthy();
    expect(log.target_type).toBe("content_item");
    expect(Number(log.target_id)).toBe(42);
    expect(log.admin_name).toBe("test-admin");
  });

  it("没有显式传 IP 时会从请求头里取", async () => {
    await logAction({
      adminId: null,
      adminName: "test-admin",
      action: "admin.login",
      targetType: "admin_session",
      targetId: null,
      req: { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }, socket: {} }
    });

    const log = readLogs().find(item => item.action === "admin.login");
    expect(log).toBeTruthy();
    expect(log.ip).toBe("203.0.113.9");
  });

  it("传进来的非数字 id 会被规整成 null，不会把数字列写崩", async () => {
    await logAction({
      adminId: "not-a-number",
      adminName: "test-admin",
      action: "content.delete",
      targetType: "content_item",
      targetId: "也不是数字"
    });

    const log = readLogs().find(item => item.action === "content.delete");
    expect(log).toBeTruthy();
    expect(log.target_id).toBeNull();
    expect(log.admin_id).toBeNull();
  });
});
