// 过期警报 · 数据服务抽象层
// 未登录 → 仅使用 localStorage（页面刷新后保留）
// 已登录 → 仅使用数据库（API），成功操作后清除 localStorage，避免旧数据覆盖云端

const LS_KEY = "expiry-alert-foods-v2";

// Promise 锁：防止 save 和 load 并发导致数据覆盖
let pendingSave = null;

// ── 对外暴露的 DataService API ──

const DataService = {
  /** 加载食材列表 */
  async load() {
    if (!AuthAPI.isLoggedIn) {
      return loadFromLocal();
    }

    // 登录后从云端加载
    try {
      const foods = await loadFromApi();
      // 加载成功后清除本地缓存，避免旧数据在重新登录时覆盖云端
      clearFromLocal();
      return foods;
    } catch (err) {
      console.warn("API 加载异常:", err.message);
      return [];
    }
  },

  /** 保存食材列表（替换整表） */
  async save(foods) {
    if (!AuthAPI.isLoggedIn) {
      return saveToLocal(foods);
    }

    // 设置锁，让并发的 load 等待
    pendingSave = saveToApi(foods);
    try {
      const result = await pendingSave;
      // 保存成功后清除本地缓存
      clearFromLocal();
      return result;
    } catch (err) {
      console.warn("API 保存异常:", err.message);
      throw err;
    } finally {
      pendingSave = null;
    }
  },

  /** 将本地数据迁移到云端（登录时调用，只执行一次） */
  async migrateLocalToSupabase() {
    const localFoods = loadFromLocal();
    if (!localFoods || localFoods.length === 0) {
      return;
    }

    try {
      await saveToApi(localFoods);
      clearFromLocal();
    } catch (err) {
      console.warn("迁移数据失败:", err.message);
    }
  }
};

// ── localStorage 操作 ──

function loadFromLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToLocal(foods) {
  localStorage.setItem(LS_KEY, JSON.stringify(foods));
}

function clearFromLocal() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // 忽略
  }
}

// ── 后端 API 操作（通过 /api/foods 接口） ──

async function getApiHeaders() {
  const authHeader = AuthAPI.getAuthHeader();
  return {
    "Content-Type": "application/json",
    ...(authHeader ? { Authorization: authHeader } : {})
  };
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `服务器返回非 JSON 响应 (HTTP ${res.status})`);
  }
}

async function saveToApi(foods) {
  const res = await fetch("/api/foods", {
    method: "POST",
    headers: await getApiHeaders(),
    body: JSON.stringify({ foods })
  });
  const data = await safeJson(res);
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

async function loadFromApi() {
  const res = await fetch("/api/foods", {
    method: "GET",
    headers: await getApiHeaders()
  });
  const data = await safeJson(res);
  if (data.error) {
    throw new Error(data.error);
  }
  return data.foods || [];
}