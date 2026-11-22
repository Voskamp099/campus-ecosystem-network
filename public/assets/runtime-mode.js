/**
 * runtime-mode.js — 运行形态判定
 *
 * 站点需要同时在三种形态下正常工作：
 *   1. file:// 本地直接打开（无后端）
 *   2. Node 服务根路径（/api 由本服务提供）
 *   3. GitHub Pages 子路径（纯静态托管，没有 /api 路由）
 *
 * 只有协议判断是不够的：形态 3 用的是 https:，会被误判成"有后端"，
 * 于是所有接口请求打到站点根目录下的 /api → 404。
 * 所以这里改成主动探测后端是否真的存在。
 *
 * 暴露：window.AllianceRuntime
 *   detectBackend()  Promise<boolean>  是否存在可用后端（结果缓存，只探测一次）
 *   whenReady()      Promise<void>    等待探测结束
 *   isOffline()      boolean          同步判断当前是否为离线/演示模式
 *   apiBase()        string           API 前缀；离线时返回空字符串
 *   mode()           string           "file" | "static" | "server"
 */
(function () {
  "use strict";

  var IS_FILE_PROTOCOL = window.location.protocol === "file:";

  // API 前缀候选：相对路径优先（子路径部署下正确），绝对路径兜底（后端独立部署在根路径）
  var API_PREFIX_CANDIDATES = ["api", "/api"];
  var PROBE_PATH = "/public/site-content";
  var PROBE_TIMEOUT_MS = 2500;

  var state = {
    ready: false,
    hasBackend: false,
    prefix: "",
    promise: null
  };

  /**
   * 探测一个候选地址，返回三态：
   *   "found"   拿到 2xx —— 后端确实在
   *   "absent"  明确 404 —— 这个地址下没有后端（静态托管的典型响应）
   *   "unknown" 超时 / 网络错误 / 5xx —— 不能下结论
   * 只有 "found" 和 "absent" 才用于判定，"unknown" 一律按"后端可能存在"处理，
   * 避免服务端冷启动或网络抖动时线上被误判成演示模式。
   */
  function probe(url) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, PROBE_TIMEOUT_MS);

    var options = { headers: { Accept: "application/json" }, cache: "no-store" };
    if (controller) options.signal = controller.signal;

    return fetch(url, options)
      .then(function (response) {
        if (response.ok) return "found";
        if (response.status === 404) return "absent";
        return "unknown";
      })
      .catch(function () { return "unknown"; })
      .then(function (verdict) {
        clearTimeout(timer);
        return verdict;
      });
  }

  /**
   * 探测后端是否存在。整个页面生命周期内只探测一次，结果缓存。
   * @returns {Promise<boolean>}
   */
  function detectBackend() {
    if (state.promise) return state.promise;

    if (IS_FILE_PROTOCOL) {
      state.promise = Promise.resolve(false);
      return state.promise;
    }

    state.promise = API_PREFIX_CANDIDATES.reduce(function (chain, prefix) {
      return chain.then(function (acc) {
        // 已经确认有后端，不必再试下一个前缀
        if (acc.verdict === "found") return acc;
        return probe(prefix + PROBE_PATH).then(function (verdict) {
          if (verdict === "found") state.prefix = prefix;
          return {
            verdict: verdict,
            // 只要有一个前缀的结果不确定，整体就不能下"没有后端"的结论
            unknown: acc.unknown || verdict === "unknown"
          };
        });
      });
    }, Promise.resolve({ verdict: "unknown", unknown: false })).then(function (acc) {
      state.ready = true;
      // 全部候选都明确 404 且没有任何不确定项 → 判定为没有后端；
      // 只要存在不确定项（超时/网络错误/5xx），一律按有后端处理，保持线上原有行为
      state.hasBackend = !(acc.verdict === "absent" && !acc.unknown);
      return state.hasBackend;
    });

    return state.promise;
  }

  /** 等待探测结束（页面初始化时调用一次即可） */
  function whenReady() {
    return detectBackend().then(function () { return undefined; });
  }

  /**
   * 同步判断是否处于离线/演示模式。
   * 探测尚未完成时按"离线"处理：宁可少发一次请求，也不要打到不存在的 API 上。
   */
  function isOffline() {
    if (IS_FILE_PROTOCOL) return true;
    if (!state.ready) return true;
    return !state.hasBackend;
  }

  /**
   * API 前缀；离线时返回空字符串（调用方应自行做降级）。
   * 不带尾斜杠，调用处统一写成 `${apiBase()}/xxx`，避免拼出双斜杠。
   */
  function apiBase() {
    if (isOffline()) return "";
    return state.prefix;
  }

  function mode() {
    if (IS_FILE_PROTOCOL) return "file";
    if (!state.ready) return "unknown";
    return state.hasBackend ? "server" : "static";
  }

  window.AllianceRuntime = {
    detectBackend: detectBackend,
    whenReady: whenReady,
    isOffline: isOffline,
    apiBase: apiBase,
    mode: mode,
    isFileProtocol: IS_FILE_PROTOCOL
  };
})();
