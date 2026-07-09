const elements = {
  form: document.querySelector("#food-form"),
  name: document.querySelector("#food-name"),
  category: document.querySelector("#food-category"),
  buyDate: document.querySelector("#buy-date"),
  shelfLife: document.querySelector("#shelf-life"),
  note: document.querySelector("#food-note"),
  foodList: document.querySelector("#food-list"),
  sampleBtn: document.querySelector("#sample-btn"),
  heroSampleBtn: document.querySelector("#hero-sample-btn"),
  clearBtn: document.querySelector("#clear-btn"),
  generateRecipeBtn: document.querySelector("#generate-recipe-btn"),
  recipeResult: document.querySelector("#recipe-result"),
  recipeSource: document.querySelector("#recipe-source"),
  aiAlert: document.querySelector("#ai-alert"),
  statTotal: document.querySelector("#stat-total"),
  statUrgent: document.querySelector("#stat-urgent"),
  statExpired: document.querySelector("#stat-expired"),
  heroTotal: document.querySelector("#hero-total"),
  heroAlertTitle: document.querySelector("#hero-alert-title"),
  heroAlertText: document.querySelector("#hero-alert-text"),
  heroMiniList: document.querySelector("#hero-mini-list")
};

const categoryIcons = {
  "乳制品": "🥛",
  "蔬菜": "🥬",
  "水果": "🍎",
  "蛋类": "🥚",
  "主食": "🍞",
  "肉类": "🥩",
  "其他": "🍽️"
};

const today = startOfDay(new Date());
let foods = [];
let isGeneratingRecipe = false;

// ── 登录按钮 ──
document.getElementById("login-btn").addEventListener("click", showAuthModal);

// ── 认证状态变化 → 重新加载数据 ──
AuthAPI.onAuthChange(async (user) => {
  // 加载数据（登录后从云端加载，退出后从本地加载）
  foods = await DataService.load();

  // 只有未登录且本地为空时才显示示例
  if (foods.length === 0 && !user) {
    foods = createSampleFoods();
    await DataService.save(foods);
  }

  renderApp();
});

// ── 异步初始化 ──
// 只有未登录时才在这里加载数据（已登录时 onAuthChange 会处理）
(async function initApp() {
  elements.buyDate.value = formatDate(today);

  if (AuthAPI.isLoggedIn) {
    return; // 已登录：等 onAuthChange 触发加载
  }

  foods = await DataService.load();

  if (foods.length === 0) {
    foods = createSampleFoods();
    await DataService.save(foods);
  }

  renderApp();
})();

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = elements.name.value.trim();
  const shelfLife = Number(elements.shelfLife.value);

  if (!name || !elements.buyDate.value || !Number.isFinite(shelfLife) || shelfLife < 1) {
    return;
  }

  foods.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name,
    category: elements.category.value,
    buyDate: elements.buyDate.value,
    shelfLife,
    note: elements.note.value.trim()
  });

  elements.form.reset();
  elements.buyDate.value = formatDate(today);
  elements.shelfLife.value = "7";

  try {
    await DataService.save(foods);
    console.log("[save] 食材保存成功，当前 foods 数量:", foods.length);
  } catch (err) {
    console.error("[save] 食材保存失败:", err.message);
    // 保存失败也渲染，至少显示本地数据
  }
  renderApp();
});

elements.sampleBtn.addEventListener("click", resetToSampleFoods);
elements.heroSampleBtn.addEventListener("click", async () => {
  await resetToSampleFoods();
  document.querySelector("#demo").scrollIntoView({ behavior: "smooth" });
});

elements.clearBtn.addEventListener("click", async () => {
  foods = [];
  await DataService.save(foods);
  renderApp();
});

elements.foodList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-id]");
  if (!button) {
    return;
  }

  foods = foods.filter((food) => food.id !== button.dataset.deleteId);
  await DataService.save(foods);
  renderApp();
});

elements.generateRecipeBtn.addEventListener("click", () => {
  generateRecipe();
});

// ── 异步菜谱生成（DeepSeek API → 本地兜底） ──

async function generateRecipe() {
  if (isGeneratingRecipe) {
    return;
  }

  const candidates = getSortedFoods()
    .filter((food) => food.daysLeft >= -1)
    .slice(0, 5);

  if (candidates.length === 0) {
    elements.recipeResult.hidden = false;
    elements.recipeResult.innerHTML = `
      <h3>今天没有可抢救食材</h3>
      <p>先添加一些还没有过期的食材，AI 才能帮你凑出一顿饭。</p>
    `;
    elements.recipeSource.textContent = "";
    return;
  }

  isGeneratingRecipe = true;
  elements.generateRecipeBtn.disabled = true;
  elements.generateRecipeBtn.textContent = "AI 正在翻冰箱...";
  elements.recipeResult.hidden = false;
  elements.recipeResult.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div>`;
  elements.recipeSource.textContent = "";

  try {
    // 尝试调用 API
    const response = await fetch("/api/generate-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredients: candidates.map((f) => ({
          name: f.name,
          category: f.category,
          daysLeft: f.daysLeft
        }))
      })
    });

    const data = await response.json();

    if (data.recipe) {
      renderRecipeResult(data.recipe, "deepseek");
      return;
    }

    // API 不可用或出错 → 本地兜底
    console.warn("API 回退到本地:", data.error);
    fallbackToLocal(candidates);
  } catch (error) {
    console.warn("网络错误，使用本地菜谱:", error);
    fallbackToLocal(candidates);
  }
}

function fallbackToLocal(candidates) {
  // 延迟一小段，让 loading 动画能被看到
  setTimeout(() => {
    const recipe = buildRecipe(candidates);
    renderRecipeResult(recipe, "local");
  }, 400);
}

function renderRecipeResult(recipe, source) {
  const candidates = getSortedFoods()
    .filter((food) => food.daysLeft >= -1)
    .slice(0, 5);

  const names = candidates.map((food) => food.name).join("、");
  const mostUrgent = candidates[0];
  const sourceLabel = source === "deepseek" ? "AI 生成" : "本地兜底";

  elements.recipeResult.innerHTML = `
    <div class="recipe-header">
      <h3>${escapeHtml(recipe.name)}</h3>
      <span class="recipe-source-badge ${source}">${escapeHtml(sourceLabel)}</span>
    </div>
    <p class="recipe-ingredients">优先抢救：${escapeHtml(names)}。${mostUrgent ? `其中 ${escapeHtml(mostUrgent.name)} ${escapeHtml(mostUrgent.dayText)}，建议先处理。` : ""}</p>
    <ol>
      ${recipe.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
    </ol>
  `;
  elements.recipeSource.textContent = source === "deepseek" ? "由 DeepSeek AI 生成" : "";

  // 重置按钮
  isGeneratingRecipe = false;
  elements.generateRecipeBtn.disabled = false;
  elements.generateRecipeBtn.textContent = "生成抢救菜谱";
}

// ── 本地兜底菜谱 ──

function buildRecipe(candidates) {
  const categories = candidates.map((food) => food.category);
  const names = candidates.map((food) => food.name);
  const hasStaple = categories.includes("主食");
  const hasEgg = categories.includes("蛋类");
  const hasMilk = categories.includes("乳制品");
  const hasVeg = categories.includes("蔬菜");
  const hasFruit = categories.includes("水果");
  const hasMeat = categories.includes("肉类");

  if (hasStaple && hasEgg) {
    return {
      name: "冰箱边缘求生煎蛋主食盘",
      steps: [
        `把${names.join("、")}中适合加热的食材先切好或打散。`,
        "主食用平底锅小火煎热，蛋类煎熟或炒熟。",
        "蔬菜类简单凉拌或下锅快炒，最后拼成一盘。",
        "吃完后把这些食材标记为已处理，完成一次临期抢救。"
      ]
    };
  }

  if (hasMilk && (hasFruit || hasStaple)) {
    return {
      name: "牛奶最后的倔强甜口救援",
      steps: [
        "把水果切块，或把吐司、面包等主食切成小块。",
        "加入牛奶，做成奶昔、牛奶燕麦或简易甜品底。",
        "如果有鸡蛋，可以做成布丁或法式吐司。",
        "优先消耗快到期的牛奶，别让它在冰箱里继续流浪。"
      ]
    };
  }

  if (hasVeg && hasEgg) {
    return {
      name: "蔬菜和鸡蛋的临期和解炒",
      steps: [
        "蔬菜洗净切块，鸡蛋打散备用。",
        "先炒鸡蛋，再放入蔬菜快炒。",
        "用盐、生抽或黑胡椒简单调味，不需要复杂操作。",
        "适合 15 分钟内解决一顿饭，也顺手救下临期食材。"
      ]
    };
  }

  if (hasMeat && hasVeg) {
    return {
      name: "冰箱抢救小队家常快炒",
      steps: [
        "肉类切片或切丁，蔬菜切成容易熟的小块。",
        "先把肉类炒熟，再加入蔬菜翻炒。",
        "用家里现有调料调味，避免为了抢救食材又买一堆新东西。",
        "出锅前确认肉类完全熟透，安全第一。"
      ]
    };
  }

  return {
    name: `${names[0]}带队的临期大杂烩`,
    steps: [
      "把快过期的食材按生熟分开处理，不能生吃的先加热。",
      "能凉拌的做凉拌，适合加热的做快炒或煎烤。",
      "用最少的额外调料完成一餐，重点是先把临期食材吃掉。",
      "如果发现食材已经变质，就不要硬吃，直接丢弃并记录原因。"
    ]
  };
}

// ── 数据管理 ──

async function resetToSampleFoods() {
  foods = createSampleFoods();
  await DataService.save(foods);
  renderApp();
}

function renderApp() {
  const sortedFoods = getSortedFoods();
  renderStats(sortedFoods);
  renderFoodList(sortedFoods);
  renderAiAlert(sortedFoods);
  renderHero(sortedFoods);
}

function renderStats(sortedFoods) {
  const urgentCount = sortedFoods.filter((food) => food.daysLeft >= 0 && food.daysLeft <= 2).length;
  const expiredCount = sortedFoods.filter((food) => food.daysLeft < 0).length;

  elements.statTotal.textContent = String(sortedFoods.length);
  elements.statUrgent.textContent = String(urgentCount);
  elements.statExpired.textContent = String(expiredCount);
  elements.heroTotal.textContent = `${sortedFoods.length} 件`;
}

function renderFoodList(sortedFoods) {
  if (sortedFoods.length === 0) {
    elements.foodList.innerHTML = `
      <div class="empty-state">
        冰箱空空如也。添加一个食材，让过期警报开始工作。
      </div>
    `;
    return;
  }

  elements.foodList.innerHTML = sortedFoods
    .map((food) => {
      return `
        <article class="food-card">
          <div class="food-icon">${escapeHtml(categoryIcons[food.category] || categoryIcons["其他"])}</div>
          <div class="food-main">
            <b>${escapeHtml(food.name)}</b>
            <small>${escapeHtml(food.category)} · 购买于 ${escapeHtml(food.buyDate)} · 到期日 ${escapeHtml(food.expireDateText)}</small>
            ${food.note ? `<small> · ${escapeHtml(food.note)}</small>` : ""}
          </div>
          <div class="food-side">
            <span class="days ${food.statusClass}">${escapeHtml(food.dayText)}</span>
            <span class="tag ${food.tagClass}">${escapeHtml(food.statusText)}</span>
            <button class="delete-button" type="button" data-delete-id="${escapeHtml(food.id)}">删除</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAiAlert(sortedFoods) {
  if (sortedFoods.length === 0) {
    elements.aiAlert.innerHTML = `
      <strong>冰箱暂时安静</strong>
      <p>先录入一些食材，我再开始催你吃饭。</p>
    `;
    return;
  }

  const food = sortedFoods[0];
  const line = getReminderLine(food);

  elements.aiAlert.innerHTML = `
    <strong>${escapeHtml(food.name)}提醒你</strong>
    <p>${escapeHtml(line)}</p>
    <span class="reminder-mode">毒舌模式 · ${escapeHtml(food.dayText)}</span>
  `;
}

function renderHero(sortedFoods) {
  if (sortedFoods.length === 0) {
    elements.heroAlertTitle.textContent = "冰箱暂时安静";
    elements.heroAlertText.textContent = "先录入一些食材，我再开始催你吃饭。";
    elements.heroMiniList.innerHTML = "";
    return;
  }

  const first = sortedFoods[0];
  elements.heroAlertTitle.textContent = `${first.name} ${first.dayText}`;
  elements.heroAlertText.textContent = getReminderLine(first);

  elements.heroMiniList.innerHTML = sortedFoods
    .slice(0, 3)
    .map((food) => {
      return `
        <div class="mini-item">
          <span class="mini-icon">${escapeHtml(categoryIcons[food.category] || categoryIcons["其他"])}</span>
          <span>
            <b>${escapeHtml(food.name)}</b>
            <small>${escapeHtml(food.dayText)}</small>
          </span>
          <span class="tag ${food.tagClass}">${escapeHtml(food.statusText)}</span>
        </div>
      `;
    })
    .join("");
}

// ── 工具函数 ──

function getSortedFoods() {
  return foods
    .map(enrichFood)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function enrichFood(food) {
  const buyDate = parseDate(food.buyDate);
  const expireDate = new Date(buyDate);
  expireDate.setDate(expireDate.getDate() + Number(food.shelfLife));

  const daysLeft = diffDays(expireDate, today);
  const status = getStatus(daysLeft);

  return {
    ...food,
    expireDate,
    expireDateText: formatDate(expireDate),
    daysLeft,
    dayText: getDayText(daysLeft),
    statusText: status.text,
    statusClass: status.className,
    tagClass: status.tagClass
  };
}

function getStatus(daysLeft) {
  if (daysLeft < 0) {
    return { text: "已过期", className: "status-expired", tagClass: "danger" };
  }

  if (daysLeft <= 1) {
    return { text: "马上抢救", className: "status-danger", tagClass: "danger" };
  }

  if (daysLeft <= 3) {
    return { text: "临期", className: "status-warn", tagClass: "warn" };
  }

  return { text: "安全", className: "status-safe", tagClass: "safe" };
}

function getDayText(daysLeft) {
  if (daysLeft < 0) {
    return `过期 ${Math.abs(daysLeft)} 天`;
  }

  if (daysLeft === 0) {
    return "今天到期";
  }

  return `还剩 ${daysLeft} 天`;
}

function getReminderLine(food) {
  const lines = [
    `${food.name}正在冰箱里倒计时，${food.dayText}。再不安排，它就要开始写自传了。`,
    `${food.name}已经等你很久了。它不说，但它的保质期替它说了。`,
    `冰箱发来紧急电报：${food.name}${food.dayText}，建议今晚给它一个体面的归宿。`,
    `${food.name}申请加入今晚菜单。拒绝的话，它可能会在冰箱里继续摆烂。`
  ];

  return lines[Math.abs(hashCode(food.id + food.name)) % lines.length];
}

function createSampleFoods() {
  const daysAgo = (days) => {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return formatDate(date);
  };

  return [
    {
      id: "sample-milk",
      name: "鲜牛奶",
      category: "乳制品",
      buyDate: daysAgo(5),
      shelfLife: 7,
      note: "开封后尽快喝完"
    },
    {
      id: "sample-cucumber",
      name: "黄瓜",
      category: "蔬菜",
      buyDate: daysAgo(4),
      shelfLife: 6,
      note: "适合凉拌"
    },
    {
      id: "sample-egg",
      name: "鸡蛋",
      category: "蛋类",
      buyDate: daysAgo(8),
      shelfLife: 15,
      note: "可以做早餐"
    },
    {
      id: "sample-toast",
      name: "吐司",
      category: "主食",
      buyDate: daysAgo(3),
      shelfLife: 5,
      note: "剩几片了"
    }
  ];
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function diffDays(target, base) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(target) - startOfDay(base)) / dayMs);
}

function hashCode(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}