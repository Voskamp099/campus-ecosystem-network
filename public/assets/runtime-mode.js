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

  function fetchOk(url) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, PROBE_TIMEOUT_MS);

    var options = { headers: { Accept: "application/json" }, cache: "no-store" };
    if (controller) options.signal = controller.signal;

    return fetch(url, options)
      .then(function (response) { return !!response.ok; })
      .catch(function () { return false; })
      .then(function (ok) {
        clearTimeout(timer);
        return ok;
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
      return chain.then(function (found) {
        if (found) return found;
        return fetchOk(prefix + PROBE_PATH).then(function (ok) {
          if (ok) {
            state.prefix = prefix;
            return true;
          }
          return false;
        });
      });
    }, Promise.resolve(false)).then(function (found) {
      state.ready = true;
      state.hasBackend = found;
      return found;
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
