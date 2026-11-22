(function () {
  "use strict";

  var IS_FILE_MODE = window.location.protocol === "file:";

  function getAssetPath(path) {
    // 一律返回相对路径。public/ 下的页面全部平铺在同一层，因此相对路径在三种部署下都成立：
    // file:// 本地打开、Node 服务根路径、以及 GitHub Pages 的 /<repo>/ 子路径。
    // 绝对路径 "/" 会在 Pages 子路径下 404。
    return String(path || "").replace(/^\/+/, "");
  }

  // 探测后端是否存在：先试相对路径（Pages / 根路径部署），再试绝对路径（带挂载前缀的部署）。
  // 结果缓存，避免多个脚本重复探测。
  var backendProbe = null;
  function detectBackend() {
    if (backendProbe) return backendProbe;
    var candidates = ["api/public/site-content", "/api/public/site-content"];
    backendProbe = candidates.reduce(function (chain, candidate) {
      return chain.then(function (found) {
        if (found) return true;
        return fetch(candidate, { headers: { Accept: "application/json" } })
          .then(function (response) { return !!response.ok; })
          .catch(function () { return false; });
      });
    }, Promise.resolve(false));
    return backendProbe;
  }

  function appendHeadLink(options) {
    var link = document.createElement("link");
    link.rel = options.rel;
    if (options.type) link.type = options.type;
    if (options.sizes) link.sizes = options.sizes;
    link.href = getAssetPath(options.href);
    document.head.appendChild(link);
    return link;
  }

  function initHead() {
    // Google Fonts 通过 <link> 加载（而非 CSS @import），避免被 CSP 拦截
    if (!document.querySelector('link[data-alliance-fonts="true"]')) {
      var preconnect1 = document.createElement("link");
      preconnect1.rel = "preconnect";
      preconnect1.href = "https://fonts.googleapis.com";
      preconnect1.setAttribute("data-alliance-fonts", "true");
      document.head.appendChild(preconnect1);

      var preconnect2 = document.createElement("link");
      preconnect2.rel = "preconnect";
      preconnect2.href = "https://fonts.gstatic.com";
      preconnect2.crossOrigin = "";
      document.head.appendChild(preconnect2);

      var fontLink = document.createElement("link");
      fontLink.rel = "stylesheet";
      fontLink.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700;800&family=Noto+Serif+SC:wght@600;700;900&display=swap";
      document.head.appendChild(fontLink);
    }

    if (!document.querySelector('link[data-alliance-style="true"]')) {
      var stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = getAssetPath("assets/styles.css");
      stylesheet.setAttribute("data-alliance-style", "true");
      document.head.appendChild(stylesheet);
    }

    // 视觉打磨层：只有页面用 <meta name="alliance-polish" content="1"> 声明时才加载。
    // 必须排在 styles.css 之后——styles.css 是运行时注入的，
    // 如果打磨层先于它出现在文档顺序里，同优先级时 styles.css 会反过来覆盖打磨层。
    var polishMeta = document.querySelector('meta[name="alliance-polish"]');
    if (polishMeta && polishMeta.getAttribute("content") === "1"
        && !document.querySelector('link[data-alliance-polish="true"]')) {
      var polishLink = document.createElement("link");
      polishLink.rel = "stylesheet";
      polishLink.href = getAssetPath("assets/polish.css") + "?v=202610221545";
      polishLink.setAttribute("data-alliance-polish", "true");
      document.head.appendChild(polishLink);
    }

    if (!document.querySelector('link[data-alliance-favicon="true"]')) {
      [
        { rel: "icon", type: "image/svg+xml", href: "favicon.svg" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "favicon-32.png" },
        { rel: "icon", type: "image/png", sizes: "16x16", href: "favicon-16.png" },
        { rel: "apple-touch-icon", href: "apple-touch-icon.png" }
      ].forEach(function (item) {
        var link = appendHeadLink(item);
        link.setAttribute("data-alliance-favicon", "true");
      });
    }

    // English presentation layer is active by default. Simplified Chinese is
    // opt-in via ?lang=zh. The layer only rewrites text nodes/attributes.
    var isChinese = new URLSearchParams(window.location.search).get("lang") === "zh";
    if (!isChinese && !document.querySelector('script[data-alliance-i18n="true"]')) {
      var i18n = document.createElement("script");
      i18n.src = getAssetPath("assets/i18n-en.js");
      i18n.setAttribute("data-alliance-i18n", "true");
      document.head.appendChild(i18n);
    }

    // Language switch: English default shows a 中文 entry; the opt-in Chinese
    // view shows an EN entry that returns to the default English build.
    document.addEventListener("DOMContentLoaded", function () {
      var btnId = isChinese ? "alliance-lang-en" : "alliance-lang-zh";
      if (document.getElementById(btnId)) return;
      var a = document.createElement("a");
      a.id = btnId;
      a.href = isChinese ? addLangParam(window.location.href, "en")
                         : addLangParam(window.location.href, "zh");
      a.textContent = isChinese ? "EN" : "中文";
      a.setAttribute("aria-label", isChinese ? "View in English" : "查看中文版");
      a.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:3000;font:700 12px/1 system-ui,sans-serif;color:#fff;background:#0a6e4f;padding:7px 12px;border-radius:20px;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.3)";
      document.body.appendChild(a);
    });
  }

  function addLangParam(url, value) {
    var u = new URL(url, window.location.href);
    u.searchParams.set("lang", value);
    return u.pathname + u.search + u.hash;
  }

  function loadScript(path) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = getAssetPath(path);
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  function loadScripts(paths) {
    var queue = Array.isArray(paths) ? paths.slice() : [];
    return queue.reduce(function (promise, path) {
      return promise.then(function () {
        return loadScript(path);
      });
    }, Promise.resolve());
  }

  window.AllianceBootstrap = {
    isFileMode: IS_FILE_MODE,
    detectBackend: detectBackend,
    getAssetPath: getAssetPath,
    initHead: initHead,
    loadScript: loadScript,
    loadScripts: loadScripts
  };
})();
