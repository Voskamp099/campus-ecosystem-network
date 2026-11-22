/**
 * nav-auth.js — 导航栏登录状态感知
 * 所有页面引用此脚本后，自动检查 JWT 并更新导航栏
 */
(function () {
  'use strict';

  const AUTH_KEY = 'alliance_token';
  const USER_KEY = 'alliance_user';
  const ADMIN_TOKEN_KEY = 'alliance_admin_token';
  const API_BASE = '';
  // 运行形态不止协议能判断：GitHub Pages 静态托管用的是 https，但并没有 /api 路由。
  // 若按"非 file:// 即有后端"处理，verifyToken() 会打到不存在的 /api/auth/me，
  // 拿到 404 后 clearAuth() 把演示登录态清掉。所以这里改成主动探测。
  let IS_FILE_MODE = window.location.protocol === 'file:';
  const LOCAL_LOGIN_PAGE = 'login.html';
  const LOCAL_MY_PAGE = 'my.html';

  // 一律相对路径：file:// 本地预览与静态托管子路径（GitHub Pages）下都不会跳错。
  function getLoginPage() {
    return LOCAL_LOGIN_PAGE;
  }

  function getMyPage() {
    return LOCAL_MY_PAGE;
  }

  function getToken() {
    try { return localStorage.getItem(AUTH_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveAuth(token, user) {
    try {
      localStorage.setItem(AUTH_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
  }

  function clearAuth() {
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {}
  }

  /* ====== 运行形态探测 ====== */
  function probeBackend() {
    var candidates = ['api/public/site-content', '/api/public/site-content'];
    var timeoutMs = 2500;

    return candidates.reduce(function (chain, candidate) {
      return chain.then(function (found) {
        if (found) return true;
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = setTimeout(function () { if (controller) controller.abort(); }, timeoutMs);
        return fetch(candidate, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        })
          .then(function (res) { return !!res.ok; })
          .catch(function () { return false; })
          .then(function (ok) { clearTimeout(timer); return ok; });
      });
    }, Promise.resolve(false));
  }

  async function resolveMode() {
    if (window.location.protocol === 'file:') {
      IS_FILE_MODE = true;
      return true;
    }
    if (window.AllianceRuntime && typeof window.AllianceRuntime.whenReady === 'function') {
      await window.AllianceRuntime.whenReady();
      IS_FILE_MODE = window.AllianceRuntime.isOffline();
      return IS_FILE_MODE;
    }
    var found = await probeBackend();
    IS_FILE_MODE = !found;
    return IS_FILE_MODE;
  }

  /* ====== 导航栏更新 ====== */
  function updateNav() {
    const user = getUser();
    const token = getToken();
    const navCta = document.querySelector('.nav-cta');
    if (!navCta) return;

    if (token && user) {
      // 已登录
      const nickname = user.nickname || user.email || '用户';
      navCta.href = getMyPage();
      navCta.textContent = nickname;
      navCta.title = '进入我的中心';

      // 如果导航栏里有移动端登录链接也一并改
      document.querySelectorAll('a[href="login.html"]').forEach(a => {
        a.href = getMyPage();
        a.textContent = nickname;
      });
      
    } else {
      // 未登录
      navCta.href = getLoginPage();
      navCta.textContent = '登录 / 注册';
    }
  }


  /* ====== 服务端验证 token 有效性 ====== */
  async function verifyToken() {
    const token = getToken();
    if (!token) { clearAuth(); return null; }

    // 管理员专用 token（后台登录产生）：不通过用户接口校验，避免被当作无效用户清空
    let adminToken = null;
    try { adminToken = localStorage.getItem(ADMIN_TOKEN_KEY); } catch {}
    if (token === adminToken) {
      return getUser() || { isAdmin: true, nickname: '管理员', email: 'admin@alliance.local' };
    }

    if (IS_FILE_MODE) {
      const user = getUser();
      if ((token === 'local-user-token' || token === 'local-admin-token') && user) {
        return user;
      }
      clearAuth();
      return null;
    }

    try {
      const res = await fetch(API_BASE + '/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) {
        clearAuth();
        return null;
      }
      const data = await res.json();
      if (data.success && data.user) {
        saveAuth(token, data.user);
        return data.user;
      }
    } catch {}
    return null;
  }

  /* ====== 退出登录 ====== */
  window.logout = function () {
    clearAuth();
    window.location.href = getLoginPage();
  };

  /* ====== 获取登录状态（供其他脚本使用） ====== */
  window.AuthState = {
    getToken,
    getUser,
    saveAuth,
    clearAuth,
    isLoggedIn() { return !!getToken(); },
    isAdmin() {
      if (IS_FILE_MODE) return !!getUser()?.isAdmin;
      try {
        const t = getToken();
        if (!t) return false;
        const raw = t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
        const pad = raw.length + (4 - raw.length % 4) % 4;
        const p = JSON.parse(atob(raw + '='.repeat(pad)));
        return p.role === 'admin';
      } catch { return false; }
    },
    requireLogin() {
      if (!getToken()) {
        const dest = IS_FILE_MODE
          ? window.location.pathname.split('/').pop() + window.location.search
          : window.location.pathname + window.location.search;
        window.location.href = getLoginPage() + '?redirect=' + encodeURIComponent(dest);
        return false;
      }
      return true;
    }
  };

  /* ====== 初始化 ====== */
  // 兼容动态注入场景（DOMContentLoaded 可能已触发）
  async function bootNavAuth() {
    await resolveMode();
    await verifyToken();
    updateNav();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootNavAuth);
  } else {
    bootNavAuth();
  }
})();
