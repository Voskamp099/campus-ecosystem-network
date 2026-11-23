# 技术栈与工作流程

> 北京校园生态合作联盟 / Campus Ecosystem Network
> 对应代码版本：`742cc74`（`main` 分支）
> 最后更新：2026-11-22

---

## 一、一句话定位

一个面向学生 / 企业伙伴的**生态对接目录与撮合平台**：注册登录后可以看生态对接
名录、投递实习实践、报名活动、发布自己的内容；后台管理内容、审核用户发布、查看报名与
投递记录。**同一套前端代码要同时在"有后端"、"纯静态"、"本地双击打开"三种环境下跑通。**

---

## 二、技术栈全景

### 2.1 运行时与服务端

| 层 | 选型 | 版本 | 说明 |
|---|---|---|---|
| 运行时 | Node.js | ≥ 18 | ESM（`"type": "module"`） |
| Web 框架 | Express | ^4.22 | 单一 app，`server/index.js` 导出供测试驱动 |
| 数据库驱动 | mysql2 | ^3.22 | 连接池；**不可用时自动降级到 JSON 文件** |
| 认证 | jsonwebtoken | ^9.0 | JWT，7 天有效期 |
| 密码哈希 | bcryptjs | ^3.0 | cost 12 |
| CSRF | csrf-csrf | ^4.0 | double-submit cookie，`__Host-` 前缀（HTTPS） |
| 参数校验 | express-validator | ^7.3 | ⚠️ 目前只有 register / login 两组真正接入 |
| XSS 过滤 | xss | ^1.0 | 白名单模式 |
| 限流 | express-rate-limit | ^8.5 | 全局 + 登录/注册专项限流 |
| 安全头 | helmet | ^8.2 | |
| 跨域 | cors | ^2.8 | 可配置 origin / credentials |
| 文件上传 | multer + express-fileupload | ^1.5 | 头像与图片 |
| 图片处理 | sharp | ^0.34 | 生成缩略图 |
| 对象存储 | @volcengine/tos-sdk | ^2.7 | 火山引擎 TOS，可选 |
| 邮件 | nodemailer | ^8.0 | 邮箱验证 / 密码重置 |
| 日志 | pino + pino-pretty | ^10.3 / ^13.1 | 生产 JSON，开发彩色 |
| 错误追踪 | @sentry/node | ^10.56 | 可选，`SENTRY_DSN` |
| API 文档 | swagger-jsdoc + swagger-ui-express | ^6.3 / ^5.0 | `/api-docs` |
| 压缩 | compression | ^1.8 | |

### 2.2 前端

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | **无** | 原生 JS，无 React/Vue，无构建步骤 |
| 样式 | 原生 CSS | `styles.css` + `polish.css` + `skeleton.css` + `lazy-load.css` |
| 工具链 | **无** | 没有 npm run build 参与打包（见 §5.3 的说明） |
| 国际化 | 自研 | `i18n-en.js`（中英对照表 + MutationObserver 文本替换），源文件 `scripts/build_i18n.py` |
| 运行时判定 | 自研 | `assets/runtime-mode.js`：探测后端是否存在，决定走 API 还是本地模式 |
| 登录态 | 自研 | `assets/nav-auth.js` 暴露全局 `window.AuthState` |
| 请求封装 | 自研 | `assets/utils.js` 的 `apiFetch` |

**核心约束：所有资源引用必须是相对路径。** 因为同一份 `public/` 要在
`file://`、`https://host/`、`https://host/repo/` 三种 URL 空间下工作，
绝对路径 `/xxx.html` 在第三种情况下会跳出站点根目录。

### 2.3 部署与工具链

| 项 | 选型 | 说明 |
|---|---|---|
| 托管（主） | **Render** | Node Web Service，`render.yaml` 是 Blueprint |
| 托管（备选） | GitHub Pages | 仅静态演示，`pages.yml` 手动触发 |
| 自建 | Ubuntu + Nginx + PM2 + MySQL | `docs/DEPLOYMENT.md` |
| CI | GitHub Actions | `ci.yml`：Node 18/20 矩阵 + MySQL 8 service + codecov + snyk |
| 测试 | jest + supertest | 8 个 suite / 64 个用例 |
| Node 版本 | 18.x / 20.x | CI 双版本矩阵 |

---

## 三、系统架构

### 3.1 目录职责

```
server/
  index.js              应用入口：中间件顺序、路由挂载、启动校验
  config.js             环境变量读取 + 启动期配置校验
  db.js                 MySQL 连接池 + 可用性探测
  defaults.js           服务端默认内容（categories / recruit / events …）
  auth.js               JWT 签发与校验中间件
  routes/
    auth.js             注册 / 登录 / 刷新 / 改密 / 邮箱验证 / 密码重置
    public.js           站点内容、目录对接申请
    user-center.js      我的：申请 / 报名 / 投递记录
    user-submissions.js 用户发布活动与实习实践（带审核流）
    admin.js            后台：内容 CRUD、审核、日志、统计
  services/             业务逻辑，每个服务负责一种存储通道
    *.js                MySQL 优先，JSON 降级（json-store.js）
  utils/
    csrf.js             CSRF 签发与校验（双提交 cookie）
    validator.js        express-validator 规则集
    rate-limiter.js  logger.js  errors.js  response.js  cors.js
    monitoring.js  sentry.js
public/                 静态资源根目录，三种形态共用这一份
  *.html                页面（平铺同级，靠相对路径互链）
  assets/               JS / CSS / 图片
scripts/
  build_i18n.py         从中文源生成 i18n-en.js
  optimize-frontend.js  压缩产物（当前无页面引用，见 §5.3）
database/
  schema.sql            全量表结构（幂等 CREATE TABLE）
  migrations/           增量迁移
__tests__/              集成测试
data/                   JSON 降级存储（MySQL 不可用时的落盘位置）
docs/                   架构 / 部署 / 技术栈文档
```

### 3.2 分层约定

```
HTTP 请求
  ↓
中间件链（helmet → cors → cookieParser → compression → 限流 → CSRF → 路由）
  ↓
routes/        解析与编排，不写业务逻辑
  ↓
services/      业务逻辑 + 存储选择（MySQL / JSON）
  ↓
db.js  或  json-store.js
```

**约定：路由不直接写 SQL。** 存储细节在 service 层决定，MySQL 不可用时同一条业务
路径自动走 JSON 文件，调用方无感知。

---

## 四、关键工作流程

### 4.1 运行形态判定（本次新增，最关键的一条链路）

同���份前端要判断"现在能不能用后端"。判断依据**不是协议**，而是**后端是否真的存在**。

```
页面加载
  ↓
runtime-mode.js: detectBackend()（只探测一次，结果缓存）
  ↓ 依次探测两个候选前缀
  ├─ "api/public/site-content"   ← 相对路径，子路径部署时正确
  └─ "/api/public/site-content"   ← 绝对路径，后端独立部署时正确
  ↓
每个候选返回三态之一
  ├─ "found"   (2xx)        → 有后端，用 API
  ├─ "absent"  (404)        → 这个前缀下没有
  └─ "unknown" (超时/5xx/断网) → 不能下结论
  ↓
判定规则
  ├─ 任一 "found"                       → 有后端
  ├─ 全部 "absent" 且无 "unknown"       → 无后端（静态托管）
  └─ 存在 "unknown"                     → 按"有后端"处理（保守）
```

**为什么 unknown 要保守**：Render 冷启动时后端可能几秒才响应，探测超时如果被当成
"没有后端"，线上会集体降级成演示模式，用户数据落进 localStorage。所以只有**明确的
404** 才允许降级。

三个调用方：
- `login.html` / `register.html` —— 无后端时走本地演示账号
- `user-center.js` —— 无后端时用 localStorage 渲染，接口失败不抛错
- `nav-auth.js` —— 无后端时**不发** `/api/auth/me`（否则 404 会触发 `clearAuth()`，
  把刚建立的登录态清掉）

### 4.2 登录与认证

```
用户提交
  ↓
login.html: await ensureMode()          ← 先确定形态
  ↓
无后端？
  ├─ 是 → 校验演示账号（gly / test@alliance.local，密码 demo2026 或本机自设）
  │        → 写 alliance_token = 'local-admin-token' / 'local-user-token'
  │        → 写 alliance_user（含 isAdmin）
  │        → 管理员直接跳 admin.html，普通用户跳 my.html
  └─ 否 → POST {API_BASE}/auth/login
           ├─ 先 GET /api/csrf-token 拿 CSRF token
           ├─ 403 → 刷新 CSRF token 重试一次
           └─ 成功 → 存 alliance_token / alliance_user
  ↓
后续请求 Authorization: Bearer <token>
  ↓
server/auth.js verifyToken → 解析 JWT → 挂 req.user
```

### 4.3 CSRF 双提交

```
GET /api/csrf-token  → 下发 psifi.x-csrf-token cookie + 返回 csrfToken
  ↓
前端所有写请求带 X-CSRF-Token 头
  ↓
doubleCsrfProtection（挂在 /api/admin、/api/auth、/api/user）
  ├─ 校验 cookie 与请求头是否匹配
  └─ 不匹配 → 403 → csrfErrorHandler → 「安全验证失败，请刷新页面重试」
```

**会话标识用 user-agent，不用 JWT 也不用 IP**：token 是在未登录时签发的（此时没有
Authorization 头），签发与校验必须用同一个稳定标识，否则登录后的所有写操作全部 403。

### 4.4 内容发布与审核

```
用户在 publish.html 提交
  ↓
无后端 → 存本地 localStorage（演示模式）
有后端 → POST /api/submit/{event|recruit}  status = 'pending'
  ↓
admin.html 的「用户活动」「用户实习」tab
  ↓
admin.js 调 /api/admin/... 审核
  ↓
通过 → status = 'approved'，出现在前台内容里
拒绝 → status = 'rejected' + reject_reason
  ↓
每次后台操作写入 admin_logs（操作人 / 动作 / 对象 / IP）
```

### 4.5 部署

```
代码改动 → push main
  ↓
CI: Node 18/20 矩阵 + MySQL 8 service + npm test + codecov + snyk
  ↓
Render: autoDeploy 触发 → npm ci --omit=dev → node server/index.js
  ↓
启动期校验（server/config.js）
  ├─ production 缺 JWT_SECRET / CSRF_SECRET / ADMIN_PASSWORD → 拒绝启动
  └─ 全部齐备 → listen(PORT)
  ↓
/health 健康检查 → Render 标记服务就绪
```

---

## 五、开发工作顺序

### 5.1 改一个功能，该按什么顺序动手

| 步骤 | 动作 | 落点 |
|---|---|---|
| 1 | 确认这个改动属于哪一层 | 见 §3.2 分层约定 |
| 2 | 写/改业务逻辑 | `server/services/*.js`（含 MySQL + JSON 两条通道） |
| 3 | 暴露接口 | `server/routes/*.js`（只做解析与编排） |
| 4 | 前端对接 | `public/assets/*.js`，注意**用 `runtime-mode.js` 判定形态** |
| 5 | 补测试 | `__tests__/integration/*.test.js` |
| 6 | 跑测试 | `npm test`（必须全绿） |
| 7 | 提交推送 | CI 自动验证 → Render 自动部署 |

### 5.2 改页面文案（特别注意）

```
改中文源 → 跑 scripts/build_i18n.py 重新生成 public/assets/i18n-en.js → 提交三个文件
         （scripts/zh_inventory.json + scripts/build_i18n.py 的 en 列表 + 生成的 i18n-en.js）
```

**不要手改 `i18n-en.js`**：它是生成产物，手改会被下一次生成覆盖。

**语言规则**：中文是默认，英文是可选视图。判定优先级为
`?lang=en/zh` 参数 → `localStorage.alliance_lang` 里记住的选择 → 默认中文。
选择会写进 localStorage，所以站内跳转（注册、登录、名录）时语言不会因为
链接不带 `?lang` 参数而丢失。

**`scripts/build_i18n.py` 自带漏译检查**：生成后会扫描 `public/` 下实际可见的
中文（跳过脚本块、样式块和代码注释），跟对照表比对，把没进表的中文报出来。
新加的文案如果不在表里，英文界面下会原样显示中文——跑一次脚本就能看到清单。
中文清单放在 `scripts/zh_inventory.json`（已纳入版本库），脚本不再依赖 /tmp 临时文件。

### 5.3 关于 `npm run build`

`scripts/optimize-frontend.js` 会压缩 CSS/JS 到 `public/assets/dist/`，但**当前没有任何
页面引用 `assets/dist`**——它是个半成品。所以：

- Render 的 build 阶段只跑 `npm ci --omit=dev`，不跑 build
- 要么让页面改引用 dist 让它生效，要么删掉这个脚本 ——【待确认】

### 5.4 三种形态的验证方式

| 形态 | 怎么验 |
|---|---|
| Node 服务 | `npm start` → 看 `/health` 和 `/api-docs` |
| 静态托管 | 任意静态服务器指向 `public/`，页面应显示"演示模式"提示 |
| `file://` | 直接双击 `public/index.html` |

前端逻辑建议用 **node + `vm` 模块写 mock 脚本**验证（可复现、零权限、不依赖浏览器）；
Chrome 无头模式在 http 场景下 `--dump-dom` 经常返回空，且会触发提权确认。

---

## 六、环境变量清单

### 必填（production 缺任一项，服务拒绝启动）

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | JWT 签名密钥 |
| `CSRF_SECRET` | CSRF 签名密钥，`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成 |
| `ADMIN_PASSWORD` 或 `ADMIN_PASSWORD_HASH` | 后台密码，不能是 `123456` |
| `NODE_ENV` | 设为 `production` |

### 强烈建议

| 变量 | 说明 |
|---|---|
| `SITE_URL` | 站点真实域名。填错会让密码重置邮件里的链接指向 localhost |
| `CORS_ORIGIN` | 生产环境应限制为站点自身域名，不要用 `*` |
| `MYSQL_*` | 不配则降级到 `data/` 下的 JSON 文件 |

### 可选

`ADMIN_USERNAME`（默认 `gly`）、`ADMIN_EMAIL`、`SMTP_*`（不配则发不出验证/重置邮件）、
`TOS_*`（火山引擎对象存储）、`SENTRY_DSN`、`FORCE_HTTPS`、`LOG_LEVEL`、
`RATE_LIMIT_*`、`JWT_EXPIRES_IN`、`UPLOAD_PREFIX`、`MAX_UPLOAD_SIZE_MB`。

---

## 七、已知遗留问题

| # | 问题 | 影响 |
|---|---|---|
| 1 | `validator.js` 里 6 组验证规则没有被任何路由引用 | 校验实际由 service 层手写承担，规则与实现可能漂移 |
| 2 | 默认内容副本分散在 4 个文件 | `server/defaults.js`、`site.js`、`category-hub.js`、`admin.js` 各存一份，改一处要改四处 |
| 3 | `my.html` 的 `.profile-avatar-lg` 有重复 CSS 定义 | 样式维护混乱 |
| 4 | `assets/lazy-load.js` 没有任何页面引用 | 死文件 |
| 5 | `npm run build` 的产物无人引用 | 见 §5.3 |
| 6 | `.env.example` 里 CSRF_SECRET 仍是占位符 | 部署前必须替换，否则 production 启动失败 |
| 7 | 活动报名 / 投递记录接口未挂 CSRF | 它们用 Authorization 头而非 cookie 鉴权，CSRF 风险低，但策略上不统一 |
| 8 | `admin_logs` 表在 `schema.sql` 有定义，但 `init-db.js` 里另有一份结构副本 | 两处需同步维护 |

---

## 八、测试与验收

```bash
npm test                # 8 suite / 64 用例，必须全绿
npm run test:coverage   # 覆盖率报告
```

测试策略：集成测试用 supertest 直接驱动 Express app，**不依赖真实 MySQL**——
`jest.setup.js` 把 `DATA_DIR` 指向进程级临时目录，MySQL 不可用时自动降级到 JSON，
所以本地没有数据库也能跑。CI 里用 MySQL 8 service 跑真实链路。

**新增测试时的注意事项**：
- `server/index.js` 在 `NODE_ENV=test` 下 export app 而不 listen
- 启动期配置校验必须挂在真正 listen 的路径上，否则测试起不来
- 新的环境变量记得同时加进 `jest.setup.js` 和 `.github/workflows/ci.yml`
