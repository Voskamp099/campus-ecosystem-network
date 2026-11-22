/**
 * 对接申请的 MySQL 写入路径测试
 *
 * 集成测试跑在没有 MySQL 的环境里，只能覆盖 JSON 降级分支；
 * 而「user_id 有没有真的进 INSERT」这件事恰恰发生在 MySQL 分支上。
 *
 * 所以这里把 db.js 换成假连接，把 SQL 和参数录下来核对，
 * 确保 user_id 真的被写进去了，而不是只在 JSON 文件里有。
 */

import { describe, it, expect, jest } from "@jest/globals";

const mockCalls = [];

const mockQuery = jest.fn(async (sql, params) => {
  mockCalls.push({ sql, params });
  if (sql.trim().toUpperCase().startsWith("INSERT")) {
    return [{ insertId: 77 }, []];
  }
  return [
    [
      {
        id: 77,
        user_id: params[0],
        directory_type: "campus",
        tracking_code: "DXTEST0001",
        target_title: "某高校就业指导中心",
        target_meta: "高校",
        applicant_name: "李老师",
        applicant_org: "某高校",
        applicant_role: "老师",
        phone: "13800002222",
        wechat: "",
        email: "",
        cooperation_intent: "共建实习基地",
        message: "希望对接",
        status: "pending",
        status_note: "",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      }
    ],
    []
  ];
});

jest.unstable_mockModule("../../server/db.js", () => ({
  pool: { query: mockQuery },
  isDatabaseAvailable: async () => true,
  invalidateDbCache: () => {},
  closePool: async () => {},
}));

const { createDirectoryApplication } = await import("../../server/services/directory-application-service.js");

const payload = {
  directoryType: "campus",
  targetTitle: "某高校就业指导中心",
  targetMeta: "高校",
  applicantName: "李老师",
  applicantOrg: "某高校",
  applicantRole: "老师",
  phone: "13800002222",
  cooperationIntent: "共建实习基地",
  message: "希望对接"
};

function lastInsert() {
  const inserts = mockCalls.filter(call => call.sql.trim().toUpperCase().startsWith("INSERT"));
  return inserts[inserts.length - 1];
}

describe("MySQL 写入路径会带上 user_id", () => {
  it("INSERT 语句里包含 user_id 字段", async () => {
    await createDirectoryApplication(payload, 42);

    const insert = lastInsert();
    expect(insert).toBeTruthy();
    expect(insert.sql).toContain("user_id");
    expect(insert.sql).toMatch(/INSERT INTO directory_applications\s*\(\s*user_id,/);
  });

  it("登录用户提交时 user_id 作为第一个参数写进 INSERT", async () => {
    await createDirectoryApplication(payload, 42);

    const insert = lastInsert();
    expect(insert.params[0]).toBe(42);
    // 13 个占位符对应 13 个参数
    expect(insert.sql.match(/\?/g)).toHaveLength(insert.params.length);
  });

  it("游客提交时 user_id 写成 NULL，提交照样成功", async () => {
    const item = await createDirectoryApplication(payload, null);

    const insert = lastInsert();
    expect(insert.params[0]).toBeNull();
    expect(item.trackingCode).toBe("DXTEST0001");
  });

  it("完全不传 userId 时按游客处理", async () => {
    await createDirectoryApplication(payload);

    const insert = lastInsert();
    expect(insert.params[0]).toBeNull();
  });

  it("非法 userId 会被当成游客，不会写坏数字列", async () => {
    await createDirectoryApplication(payload, "not-a-number");

    const insert = lastInsert();
    expect(insert.params[0]).toBeNull();
  });
});
