(() => {
  const form = document.querySelector("[data-demo-access-form]");
  const error = document.querySelector("[data-demo-error]");
  const status = document.querySelector("[data-demo-status]");
  const cards = Array.from(document.querySelectorAll(".locked-demo"));
  const previews = Array.from(document.querySelectorAll("[data-demo-preview]"));
  const demoButtons = Array.from(document.querySelectorAll("[data-demo-agent]"));
  const selectedDemo = document.querySelector("[data-selected-demo]");
  const modal = document.querySelector("[data-demo-modal]");
  const closeButtons = Array.from(document.querySelectorAll("[data-demo-close]"));
  const storageKey = "naxa-demo-center-unlocked";
  const passwordStorageKey = "naxa-demo-password-unlocked";
  const expectedPasswordHash = "d352d1791a2184a0973dfee87a9d384544827e622b6a11b388e32696a66ad149";

  if (!form || !error || !status || !modal) return;

  let activeButton = null;
  const isChinese = document.documentElement.lang.toLowerCase().startsWith("zh");
  const text = {
    unlocked: isChinese ? "Demo 预览已解锁。" : "Demo previews are unlocked for this browser session.",
    chooseDemo: isChinese ? "请选择一个 Demo 继续。" : "Choose a demo to continue.",
    enterName: isChinese ? "请输入姓名。" : "Please enter your name.",
    enterContact: isChinese ? "请填写邮箱或电话号码其中一个。" : "Please enter either an email address or phone number.",
    enterPassword: isChinese ? "请输入 Demo 密码。" : "Please enter the demo password.",
    wrongPassword: isChinese ? "Demo 密码不正确。" : "The demo password is not correct.",
    acceptTerms: isChinese ? "请勾选“我同意”后继续。" : "Please check “I agree” to continue.",
    viewDemo: isChinese ? "查看预览" : "View preview",
    openDemo: isChinese ? "打开 Demo" : "Open demo",
    openingDemo: isChinese ? "正在打开 Demo..." : "Opening demo..."
  };

  const unlock = () => {
    cards.forEach((card) => card.classList.remove("locked-demo"));
    previews.forEach((preview) => preview.classList.add("is-unlocked"));
    demoButtons.forEach((button) => {
      button.textContent = button.dataset.demoUrl ? text.openDemo : text.viewDemo;
    });
    status.textContent = text.unlocked;
  };

  const openDemoUrl = (button) => {
    const demoUrl = button?.dataset.demoUrl;
    if (!demoUrl) return false;
    status.textContent = text.openingDemo;
    window.location.href = demoUrl;
    return true;
  };

  const lock = () => {
    cards.forEach((card) => card.classList.add("locked-demo"));
    previews.forEach((preview) => preview.classList.remove("is-unlocked"));
    demoButtons.forEach((button) => {
      button.textContent = "Demo";
    });
  };

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    const nameInput = form.querySelector('input[name="name"]');
    if (nameInput) nameInput.focus();
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    if (activeButton) activeButton.focus();
  };

  const isUnlocked = () => {
    try {
      return window.sessionStorage.getItem(storageKey) === "true";
    } catch {
      return previews.some((preview) => preview.classList.contains("is-unlocked"));
    }
  };

  const toHex = (buffer) => Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const isPasswordValid = async (password) => {
    const data = new TextEncoder().encode(password);
    const hash = toHex(await window.crypto.subtle.digest("SHA-256", data));
    return hash === expectedPasswordHash;
  };

  const chooseDemo = (agentName, button) => {
    activeButton = button;
    if (selectedDemo) selectedDemo.value = agentName;

    if (isUnlocked()) {
      if (openDemoUrl(button)) return;
      status.textContent = isChinese ? `${agentName} Demo 预览已解锁。` : `${agentName} demo preview is unlocked.`;
      return;
    }

    status.textContent = isChinese ? `已选择 ${agentName}。请完成表单解锁 Demo 预览。` : `${agentName} selected. Complete the form to unlock this demo preview.`;
    openModal();
  };

  try {
    if (window.sessionStorage.getItem(storageKey) === "true") {
      unlock();
    } else {
      lock();
    }
  } catch {
    lock();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.classList.remove("is-visible");
    error.textContent = "";

    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const demoPassword = String(data.get("demo_password") || "");
    const accepted = data.get("terms") === "on";

    if (!name) {
      error.textContent = text.enterName;
      error.classList.add("is-visible");
      return;
    }

    if (!email && !phone) {
      error.textContent = text.enterContact;
      error.classList.add("is-visible");
      return;
    }

    if (!demoPassword) {
      error.textContent = text.enterPassword;
      error.classList.add("is-visible");
      return;
    }

    if (!(await isPasswordValid(demoPassword))) {
      error.textContent = text.wrongPassword;
      error.classList.add("is-visible");
      return;
    }

    if (!accepted) {
      error.textContent = text.acceptTerms;
      error.classList.add("is-visible");
      return;
    }

    try {
      window.sessionStorage.setItem(storageKey, "true");
      window.sessionStorage.setItem(passwordStorageKey, "true");
    } catch {
      // Demo still unlocks if sessionStorage is unavailable.
    }

    unlock();
    closeModal();
    openDemoUrl(activeButton);
  });

  demoButtons.forEach((button) => {
    button.addEventListener("click", () => {
      chooseDemo(button.dataset.demoAgent || "AI Agent Demo", button);
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });
})();
