// 过期警报 · 数据服务抽象层
// 未登录 → localStorage
// 已登录 → 通过 /api/foods 接口操作 Supabase（后端完成鉴权）

const LS_KEY = "expiry-alert-foods-v2";

// Promise 锁：防止 save 和 load 并发导致数据覆盖
let pendingSave = null;

// ── 对外暴露的 DataService API ──

const DataService = {
  /** 加载食材列表 */
  async load() {
    // 如果有正在进行的保存，等它完成后再加载，避免读到旧数据
    if (pendingSave) {
      await pendingSave;
    }

    if (!AuthAPI.isLoggedIn) return loadFromLocal();
    try {
      return await loadFromApi();
    } catch (err) {
      console.warn("API 加载异常，使用本地数据:", err.message);
      return loadFromLocal();
    }
  },

  /** 保存食材列表（替换整表） */
  async save(foods) {
    if (!AuthAPI.isLoggedIn) return saveToLocal(foods);

    // 设置锁，让并发的 load 等待
    pendingSave = saveToApi(foods);
    try {
      return await pendingSave;
    } catch (err) {
      console.warn("API 保存异常:", err.message);
      // 同时保存到本地作为备份
      saveToLocal(foods);
      throw err;
    } finally {
      pendingSave = null;
    }
  },

  /** 将本地数据迁移到云端（登录时调用） */
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
  localStorage.removeItem(LS_KEY);
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