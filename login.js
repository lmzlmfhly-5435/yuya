const form = document.querySelector("#loginForm");
const passwordInput = document.querySelector("#password");
const passwordField = document.querySelector(".password-field");
const passwordDots = document.querySelector(".password-dots");
const statusNode = document.querySelector("#loginStatus");
const submitButton = form.querySelector("button");
const stars = document.querySelector("#loginStars");

const fragment = document.createDocumentFragment();
for (let index = 0; index < 42; index += 1) {
  const star = document.createElement("i");
  const seed = (index * 9301 + 49297) % 233280;
  star.style.left = `${(seed % 997) / 9.97}%`;
  star.style.top = `${((seed * 37) % 991) / 9.91}%`;
  star.style.setProperty("--speed", `${2.4 + (seed % 40) / 10}s`);
  star.style.opacity = String(0.25 + (seed % 60) / 100);
  fragment.appendChild(star);
}
stars.appendChild(fragment);

function syncPasswordDots() {
  passwordInput.value = passwordInput.value.replace(/\D/g, "").slice(0, 8);
  passwordDots.textContent = "•".repeat(passwordInput.value.length);
  passwordField.classList.toggle("has-value", passwordInput.value.length > 0);
}

passwordInput.addEventListener("input", () => {
  syncPasswordDots();
  statusNode.classList.remove("is-error");
  statusNode.textContent = "密码不会保存在浏览器里";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = passwordInput.value;
  if (!/^\d{8}$/.test(password)) {
    statusNode.textContent = "请输入完整的 8 位数字";
    statusNode.classList.add("is-error");
    passwordInput.focus();
    return;
  }

  submitButton.disabled = true;
  statusNode.classList.remove("is-error");
  statusNode.textContent = "正在确认是你……";
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password }),
    });
    const result = await response.json();
    if (!response.ok) {
      const remaining = Number.isFinite(result.remaining) && result.remaining > 0
        ? `，还可尝试 ${result.remaining} 次`
        : "";
      throw new Error(`${result.error || "暂时无法进入"}${remaining}`);
    }
    passwordInput.value = "";
    document.body.classList.add("is-unlocking");
    statusNode.textContent = "门开了，欢迎回来";
    window.setTimeout(() => window.location.replace(`/?unlock=${Date.now()}`), 620);
  } catch (error) {
    statusNode.textContent = error.message || "网络似乎断开了";
    statusNode.classList.add("is-error");
    passwordInput.select();
  } finally {
    submitButton.disabled = false;
  }
});

passwordInput.focus({ preventScroll: true });
window.requestAnimationFrame(syncPasswordDots);
