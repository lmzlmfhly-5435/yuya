const CONFIG = {
  relationshipStartDate: "2024-09-09",
  handPoint: { x: 0.596, y: 0.414 },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const app = document.querySelector("#app");
const enterButton = document.querySelector("#enterButton");
const todayButton = document.querySelector("#todayButton");
const randomButton = document.querySelector("#randomButton");
const dateInput = document.querySelector("#dateInput");
const sceneImage = document.querySelector("#sceneImage");
const starLayer = document.querySelector("#starLayer");
const travelerLayer = document.querySelector("#travelerLayer");
const projection = document.querySelector("#projection");
const projectionDay = document.querySelector("#projectionDay");
const projectionTitle = document.querySelector("#projectionTitle");
const projectionMessage = document.querySelector("#projectionMessage");
const projectionDate = document.querySelector("#projectionDate");
const dayCountNodes = document.querySelectorAll("[data-day-count]");

const starMessages = Array.isArray(window.STAR_MESSAGES) ? window.STAR_MESSAGES : [];
const messageByDay = new Map(starMessages.map((entry) => [Number(entry.day), entry]));

const startDate = parseLocalDate(CONFIG.relationshipStartDate);
const totalDays = getRelationshipDayCount();
let activeDay = totalDays;

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRelationshipDayCount() {
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(1, Math.floor((localToday - startDate) / MS_PER_DAY) + 1);
}

function dateForDay(day) {
  const date = new Date(startDate);
  date.setDate(startDate.getDate() + day - 1);
  return date;
}

function dayForDate(dateString) {
  const date = parseLocalDate(dateString);
  return Math.floor((date - startDate) / MS_PER_DAY) + 1;
}

function formatChineseDate(date) {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function seededRandom(seed) {
  let value = seed + 0x6d2b79f5;
  return function next() {
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function getStarType(day, entry) {
  if (entry?.type) {
    return entry.type;
  }

  if (day === totalDays) {
    return "letter";
  }

  if (day === 1 || day % 365 === 0 || day === 520) {
    return "anniversary";
  }

  if (day % 100 === 0 || day % 77 === 0) {
    return "memory";
  }

  return "normal";
}

function buildStars() {
  const fragment = document.createDocumentFragment();

  for (let day = 1; day <= totalDays; day += 1) {
    const random = seededRandom(day * 7283);
    const entry = messageByDay.get(day);
    const type = getStarType(day, entry);
    const x = 6 + random() * 88;
    const verticalBias = Math.pow(random(), 1.08);
    const y = 8 + verticalBias * 50;
    const depth = Math.round(-180 + random() * 360);
    const depthScale = 0.72 + ((depth + 180) / 360) * 0.52;
    const typeBoost = type === "normal" ? 0 : 1.2;
    const size = 2.1 + random() * 3.4 + typeBoost;
    const hue = 38 + random() * 22;
    const thread = 38 + random() * 120;
    const threadAlpha = type === "normal" ? 0.035 + random() * 0.055 : 0.08 + random() * 0.14;
    const star = document.createElement("button");
    const core = document.createElement("span");

    star.className = `star star--${type}`;
    star.type = "button";
    star.dataset.day = String(day);
    star.style.setProperty("--x", `${x.toFixed(3)}%`);
    star.style.setProperty("--y", `${y.toFixed(3)}%`);
    star.style.setProperty("--size", `${size.toFixed(2)}px`);
    star.style.setProperty("--depth", `${depth}px`);
    star.style.setProperty("--scale", depthScale.toFixed(3));
    star.style.setProperty("--hue", hue.toFixed(1));
    star.style.setProperty("--halo", (0.18 + random() * 0.26).toFixed(3));
    star.style.setProperty("--thread", `${thread.toFixed(1)}px`);
    star.style.setProperty("--thread-alpha", threadAlpha.toFixed(3));
    star.style.setProperty("--sway", `${(7 + random() * 9).toFixed(2)}s`);
    star.style.setProperty("--twinkle", `${(2.6 + random() * 3.4).toFixed(2)}s`);
    star.style.setProperty("--delay", `${(-random() * 5).toFixed(2)}s`);
    star.setAttribute("aria-label", `摘下第 ${day} 天的星星`);
    star.addEventListener("click", () => selectStar(day));
    core.className = "star__core";
    core.setAttribute("aria-hidden", "true");
    star.appendChild(core);
    fragment.appendChild(star);
  }

  starLayer.replaceChildren(fragment);
}

function getStarCopy(day) {
  const entry = messageByDay.get(day) || {};
  const date = entry.date ? parseLocalDate(entry.date) : dateForDay(day);
  const title = entry.title?.trim() || defaultTitleForDay(day);
  const message = entry.message?.trim() || defaultMessageForDay(day);

  return {
    date,
    title,
    message,
  };
}

function defaultTitleForDay(day) {
  if (day === 1) {
    return "第一颗星，从遇见你开始";
  }

  if (day === totalDays) {
    return "今天的星星，刚刚亮起来";
  }

  if (day % 365 === 0) {
    return `第 ${day} 天，我们绕过了一整圈太阳`;
  }

  if (day === 520) {
    return "第 520 天，宇宙偷偷替我告白";
  }

  return `第 ${day} 天的星光`;
}

function defaultMessageForDay(day) {
  if (day === totalDays) {
    return "这里以后可以写今天想对她说的话。现在先让这颗星替你亮着。";
  }

  if (day === 1) {
    return "这一天的内容还可以慢慢补上，但它会一直是整片星空的起点。";
  }

  return "这颗星星还没有写下正式的话，但它已经属于我们。";
}

function selectStar(day, options = {}) {
  const shouldAnimate = options.animate !== false;
  const nextDay = Math.min(Math.max(1, day), totalDays);
  const previous = starLayer.querySelector(".star.is-active");
  const next = starLayer.querySelector(`[data-day="${nextDay}"]`);
  const copy = getStarCopy(nextDay);
  const dateValue = toDateInputValue(copy.date);

  activeDay = nextDay;
  previous?.classList.remove("is-active");
  next?.classList.add("is-active");

  projectionDay.textContent = `第 ${nextDay} 天`;
  projectionTitle.textContent = copy.title;
  projectionMessage.textContent = copy.message;
  projectionDate.dateTime = dateValue;
  projectionDate.textContent = formatChineseDate(copy.date);
  dateInput.value = dateValue;
  projection.classList.add("is-visible");

  if (shouldAnimate && next) {
    animateStarToHand(next);
  }
}

function animateStarToHand(star) {
  const starRect = star.getBoundingClientRect();
  const from = {
    x: starRect.left + starRect.width / 2,
    y: starRect.top + starRect.height / 2,
  };
  const target = getHandPoint();
  const traveler = document.createElement("span");

  traveler.className = "traveling-star";
  traveler.style.left = `${from.x}px`;
  traveler.style.top = `${from.y}px`;
  travelerLayer.appendChild(traveler);

  app.classList.add("is-catching");

  const animation = traveler.animate(
    [
      {
        transform: "translate(-50%, -50%) scale(0.55)",
        opacity: 0.95,
        offset: 0,
      },
      {
        transform: `translate(calc(-50% + ${(target.x - from.x) * 0.56}px), calc(-50% + ${(target.y - from.y) * 0.32}px)) scale(1.24)`,
        opacity: 1,
        offset: 0.62,
      },
      {
        transform: `translate(calc(-50% + ${target.x - from.x}px), calc(-50% + ${target.y - from.y}px)) scale(1.65)`,
        opacity: 0,
        offset: 1,
      },
    ],
    {
      duration: 1150,
      easing: "cubic-bezier(0.18, 0.78, 0.18, 1)",
      fill: "forwards",
    },
  );

  animation.addEventListener("finish", () => {
    traveler.remove();
    window.setTimeout(() => app.classList.remove("is-catching"), 240);
  });
}

function getHandPoint() {
  const rect = sceneImage.getBoundingClientRect();
  const naturalRatio = sceneImage.naturalWidth / sceneImage.naturalHeight;
  const boxRatio = rect.width / rect.height;
  let renderedWidth = rect.width;
  let renderedHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (boxRatio > naturalRatio) {
    renderedHeight = rect.width / naturalRatio;
    offsetY = (rect.height - renderedHeight) / 2;
  } else {
    renderedWidth = rect.height * naturalRatio;
    offsetX = (rect.width - renderedWidth) / 2;
  }

  return {
    x: rect.left + offsetX + renderedWidth * CONFIG.handPoint.x,
    y: rect.top + offsetY + renderedHeight * CONFIG.handPoint.y,
  };
}

function positionHandGlow() {
  const point = getHandPoint();
  document.documentElement.style.setProperty("--hand-x", `${point.x}px`);
  document.documentElement.style.setProperty("--hand-y", `${point.y}px`);
}

function setupDateInput() {
  dateInput.min = CONFIG.relationshipStartDate;
  dateInput.max = toDateInputValue(dateForDay(totalDays));
  dateInput.value = toDateInputValue(dateForDay(totalDays));
  dateInput.addEventListener("change", () => {
    const day = dayForDate(dateInput.value);
    selectStar(day);
  });
}

function updateDayCounters() {
  dayCountNodes.forEach((node) => {
    node.textContent = String(totalDays);
  });
}

function setupEvents() {
  enterButton.addEventListener("click", () => {
    app.classList.add("is-entered");
    selectStar(activeDay, { animate: false });
  });

  todayButton.addEventListener("click", () => selectStar(totalDays));
  randomButton.addEventListener("click", () => {
    const day = Math.floor(Math.random() * totalDays) + 1;
    selectStar(day);
  });

  window.addEventListener("resize", positionHandGlow);
  sceneImage.addEventListener("load", positionHandGlow);
}

function init() {
  updateDayCounters();
  buildStars();
  setupDateInput();
  setupEvents();
  positionHandGlow();
  selectStar(totalDays, { animate: false });
}

init();
