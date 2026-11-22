/**
 * 后台「操作日志」页签的前端接线测试
 *
 * 服务端接口（GET /api/admin/logs）已经在 audit-log.test.js 里测过了，
 * 这里测的是还没人测的那一半：后台界面能不能把日志显示出来、筛出来。
 *
 * admin.js 是浏览器端的经典脚本（没有模块导出，也不能在 node 里直接 import），
 * 所以这里读源码 + 解析出关键的对象字面量来做断言。这是有意的：
 * 一旦有人把日志页签的接线拆掉，这个文件会立刻变红。
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ADMIN_JS = path.join(ROOT, "public", "assets", "admin.js");
const ADMIN_ROUTES = path.join(ROOT, "server", "routes", "admin.js");
const ZH_INVENTORY = path.join(ROOT, "scripts", "zh_inventory.json");
const I18N_EN = path.join(ROOT, "public", "assets", "i18n-en.js");

function read(file) {
  return fs.readFileSync(file, "utf-8");
}

/**
 * 从源码里抠出一个对象字面量并求值。
 * 比正则抠字段稳：字段多了少了、嵌套了都不会看漏。
 */
function extractObjectLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex).toBeGreaterThan(-1);
  const open = source.indexOf("{", markerIndex);
  let depth = 0;
  let inString = false;
  let quote = "";
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`${marker} 的对象字面量没有闭合`);
}

function evalObjectLiteral(source, marker) {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${extractObjectLiteral(source, marker)});`)();
}

describe("后台操作日志页签", () => {
  let adminJs;
  let adminRoutes;
  let logActionLabels;
  let logTargetLabels;
  let config;

  beforeAll(() => {
    adminJs = read(ADMIN_JS);
    adminRoutes = read(ADMIN_ROUTES);
    logActionLabels = evalObjectLiteral(adminJs, "const LOG_ACTION_LABELS =");
    logTargetLabels = evalObjectLiteral(adminJs, "const LOG_TARGET_LABELS =");
    config = evalObjectLiteral(adminJs, "const CONFIG =");
  });

  describe("action 枚举值到中文文案的映射", () => {
    it("服务端 audit() 用到的每个 action 都有中文文案，一个都不漏", () => {
      const used = new Set();
      const pattern = /action:\s*["']([^"']+)["']/g;
      let match = pattern.exec(adminRoutes);
      while (match) {
        used.add(match[1]);
        match = pattern.exec(adminRoutes);
      }

      // 先确认这份枚举表不是空的，否则下面的断言会变成空转
      expect(used.size).toBeGreaterThan(10);
      expect([...used].sort()).toEqual([
        "admin.login",
        "content.create",
        "content.delete",
        "content.export",
        "content.import",
        "content.reorder",
        "content.update",
        "directory_application.update",
        "media.upload",
        "user_event.approve",
        "user_event.delete",
        "user_event.reject",
        "user_recruit.approve",
        "user_recruit.delete",
        "user_recruit.reject",
      ]);
    });

    it("映射表覆盖服务端用到的全部 action", () => {
      const used = [...adminRoutes.matchAll(/action:\s*["']([^"']+)["']/g)].map(m => m[1]);
      const missing = [...new Set(used)].filter(action => !(action in logActionLabels));
      expect(missing).toEqual([]);
    });

    it("每个 action 都有非空中文文案，且不重复", () => {
      const labels = Object.values(logActionLabels);
      labels.forEach(label => {
        expect(typeof label).toBe("string");
        expect(label.trim().length).toBeGreaterThan(0);
        expect(/[一-鿿]/.test(label)).toBe(true);
      });
      expect(new Set(labels).size).toBe(labels.length);
    });

    it("关键动作的文案是人话，不是把枚举值直接甩出来", () => {
      expect(logActionLabels["content.update"]).toBe("修改内容");
      expect(logActionLabels["user_event.reject"]).toBe("拒绝用户发布的活动");
      expect(logActionLabels["user_recruit.approve"]).toBe("通过用户发布的实习实践");
      expect(logActionLabels["admin.login"]).toBe("登录后台");
    });

    it("操作对象类型也都有中文文案", () => {
      const expected = [
        "content_item",
        "directory_application",
        "user_event",
        "user_recruit",
        "admin_session",
        "image"
      ];
      expected.forEach(type => {
        expect(logTargetLabels[type]).toBeTruthy();
        expect(/[一-鿿]/.test(logTargetLabels[type])).toBe(true);
      });
    });
  });

  describe("页签接线", () => {
    it("CONFIG 里有「操作日志」页签，且走独立列表分支", () => {
      expect(config.logs).toBeTruthy();
      expect(config.logs.label).toBe("操作日志");
      expect(config.logs.sectionKey).toBeNull();
      expect(config.logs.groupKey).toBeNull();
      expect(config.logs.fields).toEqual({
        meta: false,
        desc: false,
        link: false,
        items: false
      });
    });

    it("renderUI 把 logs 分发到 loadLogs", () => {
      expect(adminJs).toMatch(/if \(STATE\.mainTab === "logs"\) \{\s*await loadLogs\(\);/);
      // 「新增内容」按钮在日志页签上要隐藏
      expect(adminJs).toMatch(/STATE\.mainTab === "userRecruits" \|\| STATE\.mainTab === "logs"/);
    });

    it("loadItems 和 renderGrid 都认得 logs，不会掉进内容表的分支", () => {
      const loadItems = adminJs.slice(adminJs.indexOf("async function loadItems()"));
      expect(loadItems).toMatch(/if \(STATE\.mainTab === "logs"\) \{\s*await loadLogs\(\);\s*return;/);

      const renderGrid = adminJs.slice(adminJs.indexOf("function renderGrid()"));
      expect(renderGrid).toMatch(/if \(STATE\.mainTab === "logs"\) \{\s*renderLogs\(\);\s*return;/);
    });
  });

  describe("日志列表与筛选", () => {
    it("loadLogs 调的是 GET /api/admin/logs，并带上分页和 action 参数", () => {
      const loadLogs = adminJs.slice(
        adminJs.indexOf("async function loadLogs()"),
        adminJs.indexOf("function renderLogsFilterBar()")
      );
      expect(loadLogs).toMatch(/api\(`\/api\/admin\/logs\?\$\{query\.toString\(\)\}`, \{ method: "GET" \}\)/);
      expect(loadLogs).toMatch(/query\.set\("page"/);
      expect(loadLogs).toMatch(/query\.set\("pageSize"/);
      expect(loadLogs).toMatch(/query\.set\("action", STATE\.logAction\)/);
    });

    it("下拉筛选项覆盖全部 action", () => {
      const filterBar = adminJs.slice(
        adminJs.indexOf("function renderLogsFilterBar()"),
        adminJs.indexOf("function renderLogs()")
      );
      expect(filterBar).toMatch(/id="logActionFilter"/);
      expect(filterBar).toMatch(/全部操作/);
      expect(filterBar).toMatch(/LOG_ACTION_LABELS/);
      expect(filterBar).toMatch(/STATE\.logAction === action \? " selected" : ""/);
    });

    it("每一行都展示谁、什么时候、做了什么、对象、IP", () => {
      const renderLogs = adminJs.slice(
        adminJs.indexOf("function renderLogs()"),
        adminJs.indexOf("function bindLogsEvents(")
      );
      ["操作时间", "操作人", "操作", "操作对象", "对象编号", "IP 地址", "操作详情"].forEach(header => {
        expect(renderLogs).toContain(`>${header}<`);
      });
      ["log.admin_name", "log.action", "log.target_type", "log.target_id", "log.ip", "log.created_at"]
        .forEach(field => {
          expect(renderLogs).toContain(field);
        });
    });

    it("空状态和加载失败都有提示，不会白屏", () => {
      expect(adminJs).toContain("暂无操作日志");
      expect(adminJs).toContain("管理员在后台的每次改动都会记录在这里。");
      expect(adminJs).toContain("加载操作日志失败");
      expect(adminJs).toContain("再试一次");
    });
  });

  describe("中英文对照表", () => {
    const NEW_STRINGS = [
      "操作日志",
      "查看后台管理员的操作记录，确认每次改动由谁在什么时候完成。",
      "按操作类型筛选",
      "全部操作",
      "操作时间",
      "操作人",
      "操作",
      "操作对象",
      "对象编号",
      "IP 地址",
      "操作详情",
      "暂无操作日志",
      "管理员在后台的每次改动都会记录在这里。",
      "加载操作日志失败",
      "再试一次",
      "条操作记录",
      "上一页",
      "下一页",
      "页码",
      "登录后台",
      "退出后台登录",
      "新增内容",
      "修改内容",
      "删除内容",
      "调整内容排序",
      "导出内容",
      "导入内容",
      "上传图片文件",
      "更新生态对接申请",
      "通过用户发布的活动",
      "拒绝用户发布的活动",
      "删除用户发布的活动",
      "通过用户发布的实习实践",
      "拒绝用户发布的实习实践",
      "删除用户发布的实习实践",
      "内容项",
      "对接申请项",
      "用户活动",
      "用户实习实践",
      "后台会话",
      "图片文件"
    ];

    let inventory;
    let pairs;

    beforeAll(() => {
      inventory = JSON.parse(read(ZH_INVENTORY));
      const match = read(I18N_EN).match(/var PAIRS = (\[[\s\S]*?\]);/);
      expect(match).toBeTruthy();
      pairs = JSON.parse(match[1]);
    });

    it("新增的中文文案都进了对照表", () => {
      const missing = NEW_STRINGS.filter(text => !inventory.includes(text));
      expect(missing).toEqual([]);
    });

    it("映射表里的每条中文都能翻成英文", () => {
      const translated = new Map(pairs.map(pair => [pair.zh, pair.en]));
      const missing = [...Object.values(logActionLabels), ...Object.values(logTargetLabels)]
        .filter(text => !translated.get(text));
      expect(missing).toEqual([]);
    });

    it("对照表里的英文不是空的，也不是把中文原样留着", () => {
      const translated = new Map(pairs.map(pair => [pair.zh, pair.en]));
      NEW_STRINGS.forEach(text => {
        const en = translated.get(text);
        expect(en).toBeTruthy();
        expect(en).not.toBe(text);
        expect(/[一-鿿]/.test(en)).toBe(false);
      });
    });

    it("i18n-en.js 是最新的（对照表改完重新生成了）", () => {
      expect(pairs.length).toBe(inventory.length);
    });
  });
});
