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

  /**
   * 将指定的主题应用到文档上。
   * @param {string} theme - 要应用的主题 ("dark" 或 "light").
   */
  const applyTheme = (theme) => {
    if (theme === "dark") {
      // 设置 data-theme 属性，以便 CSS 可以根据它来应用样式
      html.setAttribute("data-theme", "dark");
    } else {
      // 移除该属性以应用默认的浅色主题
      html.removeAttribute("data-theme");
    }
  };

  /**
   * 在 "dark" 和 "light" 主题之间切换，并保存用户的选择。
   */
  const toggleTheme = () => {
    // 通过 body 的 data-theme 属性判断当前主题
    const currentTheme = html.getAttribute("data-theme") ? "dark" : "light";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    
    // 将用户的明确选择保存到 localStorage
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  };

  /**
   * 在页面加载时初始化主题。
   * 优先使用 localStorage 中的设置，其次检查系统偏好。
   */
  const initTheme = () => {
    // 首先检查用户是否已有保存的偏好
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      applyTheme(savedTheme);
    } else {
      // 如果没有保存的偏好，则检查操作系统的设置
      const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(systemPrefersDark ? "dark" : "light");
    }
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
    // 只有当用户没有手动设置过主题时，此监听器才会生效
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // 如果 localStorage 中有保存的主题，说明用户已做出选择，我们不应覆盖它
        if (!localStorage.getItem("theme")) {
          applyTheme(e.matches ? "dark" : "light");
        }
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


