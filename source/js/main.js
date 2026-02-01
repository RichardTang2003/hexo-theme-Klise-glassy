(() => {

  // --- DOM 元素选择 ---
  const html = document.documentElement;
  const lamp = document.getElementById("mode");
  const cbox = document.getElementById("menu-trigger");
  const toggleButton = document.getElementById('toggleButton');
  const overlay = document.getElementById('overlay');
  const closeButton = document.getElementById('closeButton');
  const toTopBtn = document.getElementById("toTopBtn");

  // --- 主题管理 ---
  const THEME_STORAGE_KEY = "theme";

  const normalizeMode = (value) => {
    if (value === "light" || value === "dark" || value === "auto") return value;
    return "auto";
  };

  const getSystemTheme = () => {
    if (!window.matchMedia) return "light";
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light";
  };

  const setEffectiveTheme = (theme) => {
    if (theme === "dark") html.setAttribute("data-theme", "dark");
    else html.removeAttribute("data-theme");
  };

  const updateThemeButton = (mode) => {
    if (!lamp) return;
    const map = { light: "亮色", dark: "暗色", auto: "自动" };
    const label = map[mode] || mode;
    lamp.setAttribute("aria-label", `主题：${label}（点击切换）`);
    lamp.setAttribute("title", `主题：${label}`);
  };

  /**
   * 将指定的主题模式应用到文档上。
   * @param {string} mode - "light" | "dark" | "auto"
   */
  const applyThemeMode = (mode) => {
    const normalized = normalizeMode(mode);
    html.setAttribute("data-theme-mode", normalized);

    const effectiveTheme = (normalized === "auto") ? getSystemTheme() : normalized;
    setEffectiveTheme(effectiveTheme);
    updateThemeButton(normalized);
  };

  /**
   * 在 "auto" -> "light" -> "dark" 之间切换，并保存用户的选择。
   */
  const toggleTheme = () => {
    const currentMode = normalizeMode(html.getAttribute("data-theme-mode") || localStorage.getItem(THEME_STORAGE_KEY));
    const nextMode = (currentMode === "auto") ? "light" : (currentMode === "light") ? "dark" : "auto";

    localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    applyThemeMode(nextMode);
  };

  /**
   * 在页面加载时初始化主题。
   * 优先使用 localStorage 中的模式设置，其次为 auto。
   */
  const initTheme = () => {
    const savedMode = normalizeMode(localStorage.getItem(THEME_STORAGE_KEY));
    applyThemeMode(savedMode);
  };

  // --- 其他功能 ---

  /**
   * 查找代码块并为其添加 data-lang 属性以便于样式化。
   */
  const setCodeBlockLanguages = () => {
    document.querySelectorAll('figure.highlight').forEach((item) => {
      let langName = item.getAttribute('class').split(' ')[1];
      if (langName === 'plain' || !langName) {
        langName = 'Code';
      }
      item.setAttribute('data-lang', langName);
    });
  };

  /**
   * 为页面设置所有的事件监听器。
   */
  const setupEventListeners = () => {
    // 主题切换按钮
    if (lamp) {
      lamp.addEventListener("click", toggleTheme);
    }

    // 监听操作系统主题偏好的变化
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const mode = normalizeMode(localStorage.getItem(THEME_STORAGE_KEY));
        if (mode === "auto") applyThemeMode("auto");
      });
    }

    // 当移动端菜单打开时，模糊内容区域
    if (cbox) {
      cbox.addEventListener("change", function () {
        const area = document.querySelector(".wrapper");
        if (area) {
          this.checked ? area.classList.add("blurry") : area.classList.remove("blurry");
        }
      });
    }
    
    // 遮罩层菜单的切换逻辑
    if (toggleButton && overlay && closeButton) {
        toggleButton.addEventListener('click', () => {
            overlay.style.display = 'flex';
            toggleButton.style.display = 'none';
        });

        closeButton.addEventListener('click', () => {
            overlay.style.display = 'none';
            toggleButton.style.display = 'flex';
        });
    }

    // "返回顶部" 按钮的逻辑
    if (toTopBtn) {
        window.onscroll = () => {
            const isScrolled = document.body.scrollTop > 20 || document.documentElement.scrollTop > 20;
            toTopBtn.style.display = isScrolled ? "flex" : "none";
        };
        toTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
  };



  initTheme();
  setCodeBlockLanguages();
  setupEventListeners();

})();
