const CONFIG = {
  relationshipStartDate: "2024-09-09",
  ambientStarCount: { desktop: 42, mobile: 24 },
  maxCanvasDpr: 1.5,
  stateSyncIntervalMs: 12000,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PERSON_STORAGE_KEY = "star-tree-person";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lowPowerDevice =
  (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

const startDate = parseLocalDate(CONFIG.relationshipStartDate);
const totalDays = getRelationshipDayCount();
const today = dateForDay(totalDays);
const sourceMessages = Array.isArray(window.STAR_MESSAGES) ? window.STAR_MESSAGES : [];
const sourceByDay = new Map(sourceMessages.map((entry) => [Number(entry.day), entry]));

const curatedMemories = new Map([
  [
    1,
    {
      title: "我们从这里开始",
      message: "从这一天起，我的以后里开始有了你。现在回头看，还是会觉得遇见你真好。",
      type: "anniversary",
    },
  ],
  [
    100,
    {
      title: "已经习惯身边有你",
      message: "一百天以后，我已经开始习惯找你、想你，也习惯把今天发生的事先说给你听。",
      type: "memory",
    },
  ],
  [
    365,
    {
      title: "第一次一起走完四季",
      message: "春夏秋冬都一起走过了。比起纪念一整年，我更高兴的是下一年身边还是你。",
      type: "anniversary",
    },
  ],
  [
    520,
    {
      title: "我想一直这样喜欢你",
      message: "不只是在特别浪漫的时候。我想在每一个普通的早晨和夜晚，都继续这样喜欢你。",
      type: "letter",
    },
  ],
]);

const prologue = document.querySelector("#prologue");
const experience = document.querySelector("#experience");
const enterButton = document.querySelector("#enterButton");
const brand = document.querySelector(".brand");
const todayButton = document.querySelector("#todayButton");
const randomButton = document.querySelector("#randomButton");
const motionToggle = document.querySelector("#motionToggle");
const motionToggleLabel = document.querySelector(".motion-toggle__label");
const identitySelect = document.querySelector("#identitySelect");
const logoutButton = document.querySelector("#logoutButton");
const viewButtons = [...document.querySelectorAll(".view-nav__button")];
const views = [...document.querySelectorAll(".view")];
const dayCountNodes = document.querySelectorAll("[data-day-count]");
const seasonCountNodes = document.querySelectorAll("[data-season-count]");
const memoryCountNodes = document.querySelectorAll("[data-memory-count]");
const nextAnniversaryNodes = document.querySelectorAll("[data-next-anniversary]");
const todayDateLabel = document.querySelector("#todayDateLabel");
const tonightMessage = document.querySelector("#tonightMessage");
const letterDate = document.querySelector("#letterDate");
const dateInput = document.querySelector("#dateInput");
const ambientCanvas = document.querySelector("#ambientCanvas");
const ambientContext = ambientCanvas.getContext("2d", { alpha: true });
const mapCanvas = document.querySelector("#mapCanvas");
const mapContext = mapCanvas.getContext("2d", { alpha: true });
const mapMonths = document.querySelector("#mapMonths");
const mapEmpty = document.querySelector("#mapEmpty");
const mapYearLabel = document.querySelector("#mapYearLabel");
const prevYearButton = document.querySelector("#prevYearButton");
const nextYearButton = document.querySelector("#nextYearButton");
const memoryRail = document.querySelector("#memoryRail");
const memorySheet = document.querySelector("#memorySheet");
const memoryBackdrop = document.querySelector("#memoryBackdrop");
const closeMemoryButton = document.querySelector("#closeMemoryButton");
const previousMemoryButton = document.querySelector("#previousMemoryButton");
const nextMemoryButton = document.querySelector("#nextMemoryButton");
const memoryKind = document.querySelector("#memoryKind");
const memoryIndex = document.querySelector("#memoryIndex");
const memoryDay = document.querySelector("#memoryDay");
const memoryTitle = document.querySelector("#memoryTitle");
const memoryMessage = document.querySelector("#memoryMessage");
const memoryDate = document.querySelector("#memoryDate");
const performanceNote = document.querySelector("#performanceNote");
const sceneImage = document.querySelector("#sceneImage");
const personButtons = [...document.querySelectorAll("[data-person]")];
const moodButtons = [...document.querySelectorAll("[data-mood]")];
const moodNodes = document.querySelectorAll("[data-mood-for]");
const moodTimeNodes = document.querySelectorAll("[data-mood-time-for]");
const currentPersonNameNodes = document.querySelectorAll("[data-current-person-name]");
const whisperForm = document.querySelector("#whisperForm");
const whisperAuthor = document.querySelector("#whisperAuthor");
const whisperMessage = document.querySelector("#whisperMessage");
const whisperCount = document.querySelector("#whisperCount");
const whisperList = document.querySelector("#whisperList");
const nightQuestion = document.querySelector("#nightQuestion");
const questionShuffle = document.querySelector("#questionShuffle");
const nightAnswerForm = document.querySelector("#nightAnswerForm");
const nightAnswerMessage = document.querySelector("#nightAnswerMessage");
const nightAnswerCount = document.querySelector("#nightAnswerCount");
const nightAnswerList = document.querySelector("#nightAnswerList");
const wishForm = document.querySelector("#wishForm");
const wishInput = document.querySelector("#wishInput");
const wishList = document.querySelector("#wishList");

let activeView = "tonight";
let activeDay = totalDays;
let mapYear = today.getFullYear();
let mapPoints = [];
let ambientStars = [];
let ambientFrameId = null;
let ambientWidth = 0;
let ambientHeight = 0;
let lastAmbientFrame = 0;
let motionDisabled = prefersReducedMotion || Boolean(lowPowerDevice);
let noteTimer = null;
let lastFocusedElement = null;
let nextShootingStarAt = 2600;
let shootingStar = null;
let selectedPerson = "yuya";
let privateStateLoaded = false;
let privateWhispers = [];
let privateWishes = [];
let privateAnswers = [];
let stateSyncTimer = null;
let questionIndex = 0;

const nightQuestions = [
  "最近哪一个瞬间，让你特别想抱抱我？",
  "如果今晚可以立刻见面，你最想先和我做什么？",
  "有没有一句话，你其实很早就想告诉我？",
  "最近的我，哪一个小细节让你觉得很可爱？",
  "如果把我们的今天收藏起来，你会给它起什么名字？",
  "下一次见面时，你想让我抱你多久？",
];

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateToInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRelationshipDayCount() {
  const now = new Date();
  const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((localToday - startDate) / MS_PER_DAY) + 1);
}

function dateForDay(day) {
  const date = new Date(startDate);
  date.setDate(startDate.getDate() + Number(day) - 1);
  return date;
}

function dayForDate(date) {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((normalized - startDate) / MS_PER_DAY) + 1;
}

function clampDay(day) {
  return Math.min(totalDays, Math.max(1, Number(day) || 1));
}

function formatChineseDate(date) {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function formatShortDate(date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function getDaysUntilNextAnniversary() {
  let next = new Date(today.getFullYear(), startDate.getMonth(), startDate.getDate());
  if (next < today) {
    next = new Date(today.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
  }
  return Math.max(0, Math.round((next - today) / MS_PER_DAY));
}

function seededRandom(seed) {
  let value = seed + 0x6d2b79f5;
  return function next() {
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function getStarType(day, entry = sourceByDay.get(day)) {
  if (entry?.type) return entry.type;
  if (curatedMemories.has(day)) return curatedMemories.get(day).type;
  if (day === totalDays) return "today";
  if (day % 365 === 0) return "anniversary";
  if (day % 100 === 0 || day % 77 === 0) return "memory";
  return "normal";
}

function getMemory(day) {
  const safeDay = clampDay(day);
  const source = sourceByDay.get(safeDay) || {};
  const curated = curatedMemories.get(safeDay) || {};
  const type = getStarType(safeDay, source);
  const hasWrittenContent = Boolean(source.title?.trim() || source.message?.trim());
  let fallbackTitle = "想起你的某一天";
  let fallbackMessage = "那天也许没有发生什么大事，但只要那时候身边有你，我就愿意把它留下来。";

  if (safeDay === totalDays) {
    fallbackTitle = "今晚也想抱着你";
    fallbackMessage = "如果你就在我身边，我大概不会说太多话。只会让你靠着我，再把你抱紧一点。";
  } else if (type === "anniversary") {
    fallbackTitle = "又陪你走了一圈";
    fallbackMessage = "比起过了多久，我更在意的是这一路都是和你一起走过来的。";
  } else if (type === "memory") {
    fallbackTitle = "我舍不得忘记的那天";
    fallbackMessage = "有些细节可能会慢慢模糊，但我不会忘记那时喜欢你的感觉。";
  }

  return {
    day: safeDay,
    date: dateForDay(safeDay),
    title: source.title?.trim() || curated.title || fallbackTitle,
    message: source.message?.trim() || curated.message || fallbackMessage,
    type,
    hasWrittenContent,
  };
}

function getKindLabel(type) {
  return (
    {
      normal: "A day with you",
      memory: "I remember this",
      anniversary: "Another year with you",
      letter: "Only for you",
      future: "For our future",
      today: "Tonight, I miss you",
    }[type] || "Only for you"
  );
}

function updateURL(day) {
  const url = new URL(window.location.href);
  url.searchParams.set("day", String(day));
  window.history.replaceState({}, "", url);
}

function getURLDay() {
  const day = Number(new URLSearchParams(window.location.search).get("day"));
  return Number.isFinite(day) && day >= 1 && day <= totalDays ? day : null;
}

function showNote(message) {
  window.clearTimeout(noteTimer);
  performanceNote.textContent = message;
  performanceNote.classList.add("is-visible");
  noteTimer = window.setTimeout(() => performanceNote.classList.remove("is-visible"), 2600);
}

function updateMotionState({ announce = false } = {}) {
  document.body.classList.toggle("is-motion-off", motionDisabled);
  document.body.classList.toggle("is-lite", Boolean(lowPowerDevice));
  motionToggle.setAttribute("aria-pressed", String(!motionDisabled));
  motionToggleLabel.textContent = motionDisabled ? "静态" : "动态";

  if (motionDisabled) {
    stopAmbientAnimation();
    drawAmbientStars(0);
  } else {
    startAmbientAnimation();
  }

  if (announce) {
    showNote(motionDisabled ? "已切换为静态节能模式" : "已开启轻量动态效果");
  }
}

function createAmbientStars() {
  const count = window.innerWidth <= 680
    ? CONFIG.ambientStarCount.mobile
    : CONFIG.ambientStarCount.desktop;
  const random = seededRandom(92471);
  ambientStars = Array.from({ length: count }, (_, index) => ({
    x: 0.04 + random() * 0.9,
    y: 0.04 + Math.pow(random(), 1.25) * 0.58,
    radius: 0.45 + random() * 1.15,
    alpha: 0.18 + random() * 0.5,
    speed: 0.00045 + random() * 0.0008,
    phase: random() * Math.PI * 2,
    accent: index % 11 === 0,
  }));
}

function resizeAmbientCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, motionDisabled ? 1 : CONFIG.maxCanvasDpr);
  ambientWidth = window.innerWidth;
  ambientHeight = window.innerHeight;
  ambientCanvas.width = Math.floor(ambientWidth * dpr);
  ambientCanvas.height = Math.floor(ambientHeight * dpr);
  ambientCanvas.style.width = `${ambientWidth}px`;
  ambientCanvas.style.height = `${ambientHeight}px`;
  ambientContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  createAmbientStars();
  drawAmbientStars(performance.now());
}

function drawAmbientStars(time) {
  ambientContext.clearRect(0, 0, ambientWidth, ambientHeight);
  ambientContext.save();
  ambientContext.globalCompositeOperation = "lighter";

  for (const star of ambientStars) {
    const twinkle = motionDisabled ? 1 : 0.78 + Math.sin(time * star.speed + star.phase) * 0.22;
    const x = star.x * ambientWidth;
    const y = star.y * ambientHeight;
    const alpha = star.alpha * twinkle;

    if (star.accent) {
      const glow = ambientContext.createRadialGradient(x, y, 0, x, y, 13);
      glow.addColorStop(0, `rgba(255, 242, 195, ${alpha * 0.42})`);
      glow.addColorStop(1, "rgba(255, 242, 195, 0)");
      ambientContext.fillStyle = glow;
      ambientContext.beginPath();
      ambientContext.arc(x, y, 13, 0, Math.PI * 2);
      ambientContext.fill();
    }

    ambientContext.fillStyle = `rgba(255, 247, 218, ${alpha})`;
    ambientContext.beginPath();
    ambientContext.arc(x, y, star.radius, 0, Math.PI * 2);
    ambientContext.fill();
  }

  if (!motionDisabled && time >= nextShootingStarAt && !shootingStar) {
    const random = seededRandom(Math.floor(time));
    shootingStar = {
      startedAt: time,
      duration: 760 + random() * 280,
      x: ambientWidth * (0.18 + random() * 0.5),
      y: ambientHeight * (0.08 + random() * 0.2),
      length: 70 + random() * 54,
    };
  }

  if (shootingStar) {
    const progress = (time - shootingStar.startedAt) / shootingStar.duration;
    if (progress >= 1) {
      shootingStar = null;
      nextShootingStarAt = time + 5400 + Math.random() * 5200;
    } else if (progress >= 0) {
      const travel = progress * Math.min(ambientWidth * 0.28, 320);
      const x = shootingStar.x + travel;
      const y = shootingStar.y + travel * 0.36;
      const alpha = Math.sin(progress * Math.PI) * 0.72;
      const gradient = ambientContext.createLinearGradient(
        x - shootingStar.length,
        y - shootingStar.length * 0.36,
        x,
        y,
      );
      gradient.addColorStop(0, "rgba(255, 241, 190, 0)");
      gradient.addColorStop(1, `rgba(255, 244, 207, ${alpha})`);
      ambientContext.strokeStyle = gradient;
      ambientContext.lineWidth = 1.15;
      ambientContext.beginPath();
      ambientContext.moveTo(x - shootingStar.length, y - shootingStar.length * 0.36);
      ambientContext.lineTo(x, y);
      ambientContext.stroke();
    }
  }

  ambientContext.restore();
}

function ambientLoop(time) {
  ambientFrameId = window.requestAnimationFrame(ambientLoop);
  if (time - lastAmbientFrame < 40) return;
  if (document.hidden || activeView !== "tonight" || memorySheet.classList.contains("is-open")) return;
  lastAmbientFrame = time;
  drawAmbientStars(time);
}

function startAmbientAnimation() {
  if (motionDisabled || ambientFrameId) return;
  ambientFrameId = window.requestAnimationFrame(ambientLoop);
}

function stopAmbientAnimation() {
  if (!ambientFrameId) return;
  window.cancelAnimationFrame(ambientFrameId);
  ambientFrameId = null;
}

function switchView(target) {
  if (!target || target === activeView) return;
  activeView = target;

  views.forEach((view) => view.classList.toggle("is-active", view.dataset.view === target));
  viewButtons.forEach((button) => {
    const selected = button.dataset.target === target;
    button.classList.toggle("is-active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  document.body.classList.toggle("view-map", target === "map");
  document.body.classList.toggle("view-memories", target === "memories");
  document.body.classList.toggle("view-pulse", target === "pulse");
  document.body.classList.toggle("view-letter", target === "letter");

  if (target === "map") {
    window.requestAnimationFrame(resizeMapCanvas);
  }

  if (target === "memories") {
    buildMemoryRail();
  }

  if (target === "pulse" || target === "letter") {
    startStateSync();
  } else {
    stopStateSync();
  }

  if (target === "tonight" && !motionDisabled) startAmbientAnimation();
  else if (target !== "tonight") drawAmbientStars(performance.now());
}

function getMapRangeForYear(year) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const rangeStart = year === startDate.getFullYear() && startDate > yearStart ? startDate : yearStart;
  const rangeEnd = year === today.getFullYear() && today < yearEnd ? today : yearEnd;
  if (rangeStart > today || rangeEnd < startDate) return null;
  return { start: rangeStart, end: rangeEnd };
}

const monthCenters = [
  [0.12, 0.2], [0.37, 0.16], [0.63, 0.19], [0.87, 0.16],
  [0.15, 0.49], [0.4, 0.45], [0.64, 0.5], [0.87, 0.46],
  [0.12, 0.79], [0.37, 0.75], [0.63, 0.8], [0.87, 0.75],
];

function buildMapPoints(width, height) {
  const range = getMapRangeForYear(mapYear);
  mapPoints = [];
  if (!range) return;

  const date = new Date(range.start);
  while (date <= range.end) {
    const day = dayForDate(date);
    if (day >= 1 && day <= totalDays) {
      const month = date.getMonth();
      const center = monthCenters[month];
      const random = seededRandom(day * 9283);
      const angle = random() * Math.PI * 2;
      const distance = 18 + Math.sqrt(random()) * Math.min(width / 11, height / 8);
      const x = center[0] * width + Math.cos(angle) * distance;
      const y = center[1] * height + Math.sin(angle) * distance * 0.64;
      const type = getStarType(day);
      mapPoints.push({
        day,
        month,
        x,
        y,
        type,
        hasContent: sourceByDay.has(day) || curatedMemories.has(day),
        radius: type === "normal" ? 1.1 + random() * 0.65 : 2.2 + random() * 0.7,
      });
    }
    date.setDate(date.getDate() + 1);
  }
}

function drawMap() {
  const rect = mapCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (!width || !height) return;

  mapContext.clearRect(0, 0, width, height);
  mapContext.save();

  const byMonth = Array.from({ length: 12 }, () => []);
  mapPoints.forEach((point) => byMonth[point.month].push(point));

  mapContext.lineWidth = 0.65;
  for (const points of byMonth) {
    if (points.length < 2) continue;
    mapContext.beginPath();
    points.forEach((point, index) => {
      if (index === 0) mapContext.moveTo(point.x, point.y);
      else mapContext.lineTo(point.x, point.y);
    });
    mapContext.strokeStyle = "rgba(158, 181, 205, 0.12)";
    mapContext.stroke();
  }

  mapContext.globalCompositeOperation = "lighter";
  for (const point of mapPoints) {
    const special = point.type !== "normal" || point.hasContent;
    const alpha = special ? 0.86 : 0.38;

    if (special) {
      const glow = mapContext.createRadialGradient(point.x, point.y, 0, point.x, point.y, 15);
      glow.addColorStop(0, `rgba(255, 232, 162, ${alpha * 0.42})`);
      glow.addColorStop(1, "rgba(255, 232, 162, 0)");
      mapContext.fillStyle = glow;
      mapContext.beginPath();
      mapContext.arc(point.x, point.y, 15, 0, Math.PI * 2);
      mapContext.fill();
    }

    mapContext.fillStyle = special
      ? `rgba(255, 239, 190, ${alpha})`
      : `rgba(201, 218, 232, ${alpha})`;
    mapContext.beginPath();
    mapContext.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
    mapContext.fill();
  }

  mapContext.restore();
  mapEmpty.hidden = mapPoints.length > 0;
}

function resizeMapCanvas() {
  const rect = mapCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, motionDisabled ? 1 : CONFIG.maxCanvasDpr);
  mapCanvas.width = Math.floor(rect.width * dpr);
  mapCanvas.height = Math.floor(rect.height * dpr);
  mapContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildMapPoints(rect.width, rect.height);
  drawMap();
  buildMonthMarkers();
}

function buildMonthMarkers() {
  mapMonths.replaceChildren();
  const range = getMapRangeForYear(mapYear);
  const currentMonth = mapYear === today.getFullYear() ? today.getMonth() : -1;

  monthCenters.forEach((center, month) => {
    const monthStart = new Date(mapYear, month, 1);
    const monthEnd = new Date(mapYear, month + 1, 0);
    const inRange = range && monthEnd >= range.start && monthStart <= range.end;
    if (!inRange) return;

    const button = document.createElement("button");
    button.className = "month-marker";
    if (month === currentMonth) button.classList.add("is-current");
    button.type = "button";
    button.style.left = `${center[0] * 100}%`;
    button.style.top = `${center[1] * 100}%`;
    button.textContent = `${String(month + 1).padStart(2, "0")} 月`;
    button.setAttribute("aria-label", `打开 ${mapYear} 年 ${month + 1} 月的一颗星`);
    button.addEventListener("click", () => openMonthMemory(month));
    mapMonths.appendChild(button);
  });
}

function openMonthMemory(month) {
  const candidates = mapPoints.filter((point) => point.month === month);
  if (!candidates.length) return;
  const meaningful = candidates.find((point) => point.hasContent || point.type !== "normal");
  const chosen = meaningful || candidates[Math.floor(candidates.length / 2)];
  openMemory(chosen.day);
}

function updateMapYear(nextYear) {
  const minYear = startDate.getFullYear();
  const maxYear = today.getFullYear();
  mapYear = Math.min(maxYear, Math.max(minYear, nextYear));
  mapYearLabel.textContent = String(mapYear);
  prevYearButton.disabled = mapYear <= minYear;
  nextYearButton.disabled = mapYear >= maxYear;
  resizeMapCanvas();
}

function getChapterDays() {
  const writtenDays = sourceMessages
    .filter((entry) => entry.title?.trim() || entry.message?.trim())
    .map((entry) => Number(entry.day));
  return [...new Set([1, 100, 365, 520, totalDays, ...writtenDays])]
    .filter((day) => day >= 1 && day <= totalDays)
    .sort((a, b) => a - b);
}

function buildMemoryRail() {
  if (memoryRail.childElementCount) return;
  const fragment = document.createDocumentFragment();

  getChapterDays().forEach((day, index) => {
    const memory = getMemory(day);
    const button = document.createElement("button");
    button.className = "chapter-card";
    button.type = "button";
    button.setAttribute("aria-label", `打开第 ${day} 天：${memory.title}`);

    const number = document.createElement("span");
    number.className = "chapter-card__number";
    number.textContent = `CHAPTER ${String(index + 1).padStart(2, "0")}`;

    const star = document.createElement("span");
    star.className = "chapter-card__star";
    star.setAttribute("aria-hidden", "true");
    star.textContent = "✦";

    const content = document.createElement("div");
    content.className = "chapter-card__content";

    const title = document.createElement("h3");
    title.textContent = memory.title;

    const message = document.createElement("p");
    message.textContent = memory.message;

    const time = document.createElement("time");
    time.dateTime = dateToInputValue(memory.date);
    time.textContent = `DAY ${String(day).padStart(3, "0")} · ${formatShortDate(memory.date)}`;

    content.append(title, message, time);
    button.append(number, star, content);
    button.addEventListener("click", () => openMemory(day));
    fragment.appendChild(button);
  });

  memoryRail.appendChild(fragment);
}

function openMemory(day) {
  activeDay = clampDay(day);
  const memory = getMemory(activeDay);
  lastFocusedElement = document.activeElement;

  memoryKind.textContent = getKindLabel(memory.type);
  memoryIndex.textContent = `${String(activeDay).padStart(3, "0")} / ${String(totalDays).padStart(3, "0")}`;
  memoryDay.textContent = `第 ${activeDay} 天`;
  memoryTitle.textContent = memory.title;
  memoryMessage.textContent = memory.message;
  memoryDate.dateTime = dateToInputValue(memory.date);
  memoryDate.textContent = formatChineseDate(memory.date);
  previousMemoryButton.disabled = activeDay <= 1;
  nextMemoryButton.disabled = activeDay >= totalDays;

  memorySheet.classList.add("is-open");
  memorySheet.setAttribute("aria-hidden", "false");
  updateURL(activeDay);
  stopAmbientAnimation();
  window.setTimeout(() => closeMemoryButton.focus(), 80);
}

function closeMemory() {
  memorySheet.classList.remove("is-open");
  memorySheet.setAttribute("aria-hidden", "true");
  if (!motionDisabled && activeView === "tonight") startAmbientAnimation();
  if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
}

function setupDateInput() {
  dateInput.min = CONFIG.relationshipStartDate;
  dateInput.max = dateToInputValue(today);
  dateInput.value = dateToInputValue(today);
  dateInput.addEventListener("change", () => {
    const selectedDate = parseLocalDate(dateInput.value);
    const day = dayForDate(selectedDate);
    if (day < 1 || day > totalDays) return;
    updateMapYear(selectedDate.getFullYear());
    openMemory(day);
  });
}

function relativeTime(timestamp) {
  if (!timestamp) return "刚刚";
  const date = new Date(Number(timestamp) * 1000);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("登录已失效");
  }
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(result.error || "暂时没有连上我们的星空");
  return result;
}

function renderMoods(moods = {}) {
  moodNodes.forEach((node) => {
    const value = moods[node.dataset.moodFor]?.mood;
    node.textContent = value || "还没留下心情";
  });
  moodTimeNodes.forEach((node) => {
    const updatedAt = moods[node.dataset.moodTimeFor]?.updatedAt;
    node.textContent = updatedAt ? `更新于 ${relativeTime(updatedAt)}` : "还没有更新";
  });
}

function renderWhispers() {
  whisperList.replaceChildren();
  if (!privateWhispers.length) {
    const empty = document.createElement("p");
    empty.className = "whisper-empty";
    empty.textContent = "第一句话，还在等我们写下。";
    whisperList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  [...privateWhispers].reverse().forEach((item) => {
    const article = document.createElement("article");
    article.className = "whisper-item";

    const star = document.createElement("span");
    star.className = "whisper-item__star";
    star.setAttribute("aria-hidden", "true");
    star.textContent = "✦";

    const copy = document.createElement("div");
    const author = document.createElement("strong");
    author.textContent = item.author === "yuya" ? "YUYA" : "ZHENNAN";
    const message = document.createElement("p");
    message.textContent = String(item.message || "").slice(0, 160);
    copy.append(author, message);

    const time = document.createElement("time");
    time.textContent = relativeTime(item.createdAt);
    article.append(star, copy, time);
    fragment.appendChild(article);
  });
  whisperList.appendChild(fragment);
}

function renderWishes() {
  wishList.replaceChildren();
  const fragment = document.createDocumentFragment();
  privateWishes.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.classList.toggle("is-done", item.done === true);

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.wishId = item.id;
    button.setAttribute(
      "aria-label",
      `${item.done ? "标记为未完成" : "标记为已完成"}：${item.text}`,
    );

    const mark = document.createElement("span");
    mark.textContent = item.done ? "✓" : "○";
    const text = document.createElement("b");
    text.textContent = String(item.text || "").slice(0, 80);
    button.append(mark, text);
    listItem.appendChild(button);
    fragment.appendChild(listItem);
  });
  wishList.appendChild(fragment);
}

function renderAnswers() {
  nightAnswerList.replaceChildren();
  if (!privateAnswers.length) {
    const empty = document.createElement("p");
    empty.className = "question-answer-empty";
    empty.textContent = "今晚的第一份回答，还在等你们写下。";
    nightAnswerList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  [...privateAnswers].reverse().slice(0, 4).forEach((item) => {
    const article = document.createElement("article");
    const meta = document.createElement("strong");
    meta.textContent = `${item.author === "yuya" ? "YUYA" : "ZHENNAN"} · ${relativeTime(item.createdAt)}`;
    const answer = document.createElement("p");
    answer.textContent = String(item.answer || "").slice(0, 160);
    const question = document.createElement("small");
    question.textContent = String(item.question || "").slice(0, 120);
    article.append(meta, answer, question);
    fragment.appendChild(article);
  });
  nightAnswerList.appendChild(fragment);
}

function applyPrivateState(state = {}) {
  privateStateLoaded = true;
  privateWhispers = Array.isArray(state.whispers) ? state.whispers : [];
  privateWishes = Array.isArray(state.wishes) ? state.wishes : [];
  privateAnswers = Array.isArray(state.answers) ? state.answers : [];
  renderMoods(state.moods);
  renderWhispers();
  renderWishes();
  renderAnswers();
}

async function loadPrivateState({ force = false, silent = false } = {}) {
  if (privateStateLoaded && !force) return;
  try {
    const state = await apiRequest("/api/state");
    applyPrivateState(state);
  } catch (error) {
    if (!silent && error.message !== "登录已失效") showNote(error.message);
  }
}

function stopStateSync() {
  if (!stateSyncTimer) return;
  window.clearInterval(stateSyncTimer);
  stateSyncTimer = null;
}

function startStateSync() {
  stopStateSync();
  if (!["pulse", "letter"].includes(activeView) || document.hidden) return;
  loadPrivateState({ force: true });
  stateSyncTimer = window.setInterval(() => {
    loadPrivateState({ force: true, silent: true });
  }, CONFIG.stateSyncIntervalMs);
}

function readSavedPerson() {
  try {
    const saved = window.localStorage.getItem(PERSON_STORAGE_KEY);
    return saved === "zhennan" ? "zhennan" : "yuya";
  } catch {
    return "yuya";
  }
}

function selectPerson(person, { persist = true } = {}) {
  if (!personButtons.some((button) => button.dataset.person === person)) return;
  selectedPerson = person;
  personButtons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.person === person);
  });
  currentPersonNameNodes.forEach((node) => {
    node.textContent = person === "yuya" ? "Yuya" : "Zhennan";
  });
  identitySelect.value = person;
  whisperAuthor.value = person;
  if (persist) {
    try {
      window.localStorage.setItem(PERSON_STORAGE_KEY, person);
    } catch {
      // Device-local identity is a convenience; the shared state still works without it.
    }
  }
}

async function saveMood(button) {
  const mood = button.dataset.mood;
  moodButtons.forEach((item) => { item.disabled = true; });
  try {
    const result = await apiRequest("/api/mood", {
      method: "POST",
      body: JSON.stringify({ person: selectedPerson, mood }),
    });
    renderMoods(result.moods);
    moodButtons.forEach((item) => {
      item.classList.toggle("is-selected", item.dataset.mood === mood);
    });
    showNote(`${selectedPerson === "yuya" ? "Yuya" : "Zhennan"} 的心情已经点亮`);
  } catch (error) {
    if (error.message !== "登录已失效") showNote(error.message);
  } finally {
    moodButtons.forEach((item) => { item.disabled = false; });
  }
}

async function submitWhisper(event) {
  event.preventDefault();
  const message = whisperMessage.value.trim();
  if (!message || message.length > 160) {
    showNote("写下 1—160 个字，再把它变成星星");
    whisperMessage.focus();
    return;
  }
  const submitButton = whisperForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  try {
    const result = await apiRequest("/api/whispers", {
      method: "POST",
      body: JSON.stringify({ author: whisperAuthor.value, message }),
    });
    privateWhispers.push(result.whisper);
    privateWhispers = privateWhispers.slice(-12);
    renderWhispers();
    whisperMessage.value = "";
    whisperCount.textContent = "0";
    showNote("这句话已经变成星星了");
  } catch (error) {
    if (error.message !== "登录已失效") showNote(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function toggleWish(button) {
  const item = privateWishes.find((wish) => wish.id === button.dataset.wishId);
  if (!item) return;
  button.disabled = true;
  try {
    const result = await apiRequest("/api/wishes", {
      method: "POST",
      body: JSON.stringify({ action: "toggle", id: item.id, done: !item.done }),
    });
    privateWishes = Array.isArray(result.wishes) ? result.wishes : privateWishes;
    renderWishes();
    showNote(item.done ? "愿望重新放回清单了" : "又一起完成了一件事");
  } catch (error) {
    if (error.message !== "登录已失效") showNote(error.message);
    button.disabled = false;
  }
}

async function submitWish(event) {
  event.preventDefault();
  const text = wishInput.value.trim();
  if (!text || text.length > 80) {
    showNote("写下 1—80 个字，再加入愿望清单");
    wishInput.focus();
    return;
  }
  const submitButton = wishForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  try {
    const result = await apiRequest("/api/wishes", {
      method: "POST",
      body: JSON.stringify({ action: "add", text }),
    });
    privateWishes = Array.isArray(result.wishes) ? result.wishes : privateWishes;
    renderWishes();
    wishInput.value = "";
    showNote("新的愿望已经收好了");
  } catch (error) {
    if (error.message !== "登录已失效") showNote(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function submitNightAnswer(event) {
  event.preventDefault();
  const answer = nightAnswerMessage.value.trim();
  if (!answer || answer.length > 160) {
    showNote("写下 1—160 个字，再留下回答");
    nightAnswerMessage.focus();
    return;
  }
  const submitButton = nightAnswerForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  try {
    const result = await apiRequest("/api/answers", {
      method: "POST",
      body: JSON.stringify({
        author: selectedPerson,
        question: nightQuestions[questionIndex],
        answer,
      }),
    });
    privateAnswers.push(result.answer);
    privateAnswers = privateAnswers.slice(-8);
    renderAnswers();
    nightAnswerMessage.value = "";
    nightAnswerCount.textContent = "0";
    showNote(`${selectedPerson === "yuya" ? "Yuya" : "Zhennan"} 的回答已经留下`);
  } catch (error) {
    if (error.message !== "登录已失效") showNote(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function logout() {
  logoutButton.disabled = true;
  try {
    await apiRequest("/api/logout", { method: "POST" });
    window.location.replace("/login");
  } catch (error) {
    if (error.message !== "登录已失效") {
      showNote(error.message);
      logoutButton.disabled = false;
    }
  }
}

function shuffleQuestion() {
  let next = Math.floor(Math.random() * nightQuestions.length);
  if (next === questionIndex) next = (next + 1) % nightQuestions.length;
  questionIndex = next;
  nightQuestion.classList.remove("is-changing");
  void nightQuestion.offsetWidth;
  nightQuestion.textContent = `“${nightQuestions[questionIndex]}”`;
  nightQuestion.classList.add("is-changing");
}

function setupPointerMotion() {
  if (!window.matchMedia("(pointer: fine)").matches || lowPowerDevice) return;
  let frame = null;
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  window.addEventListener("pointermove", (event) => {
    x = event.clientX;
    y = event.clientY;
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      document.documentElement.style.setProperty("--pointer-x", `${x}px`);
      document.documentElement.style.setProperty("--pointer-y", `${y}px`);
      if (!motionDisabled && sceneImage) {
        const sceneX = ((x / window.innerWidth) - 0.5) * -0.7;
        const sceneY = ((y / window.innerHeight) - 0.5) * -0.45;
        document.documentElement.style.setProperty("--scene-x", `${sceneX}%`);
        document.documentElement.style.setProperty("--scene-y", `${sceneY}%`);
      }
    });
  }, { passive: true });
}

function setupEvents() {
  enterButton.addEventListener("click", () => {
    const urlDay = getURLDay();
    if (motionDisabled) {
      document.body.classList.add("is-entered");
      if (urlDay) openMemory(urlDay);
      return;
    }
    document.body.classList.add("is-entering");
    window.setTimeout(() => {
      document.body.classList.add("is-entered");
      if (urlDay) openMemory(urlDay);
    }, 510);
    window.setTimeout(() => document.body.classList.remove("is-entering"), 1260);
  });

  brand.addEventListener("click", (event) => {
    event.preventDefault();
    switchView("tonight");
  });

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.target));
  });

  todayButton.addEventListener("click", () => openMemory(totalDays));
  randomButton.addEventListener("click", () => {
    const choices = getChapterDays();
    const currentIndex = choices.indexOf(activeDay);
    let index = Math.floor(Math.random() * choices.length);
    if (choices.length > 1 && index === currentIndex) index = (index + 1) % choices.length;
    openMemory(choices[index]);
  });

  motionToggle.addEventListener("click", () => {
    motionDisabled = !motionDisabled;
    updateMotionState({ announce: true });
    resizeAmbientCanvas();
    if (activeView === "map") resizeMapCanvas();
  });

  identitySelect.addEventListener("change", () => selectPerson(identitySelect.value));
  logoutButton.addEventListener("click", logout);
  personButtons.forEach((button) => {
    button.addEventListener("click", () => selectPerson(button.dataset.person));
  });
  moodButtons.forEach((button) => {
    button.addEventListener("click", () => saveMood(button));
  });
  whisperAuthor.addEventListener("change", () => selectPerson(whisperAuthor.value));
  whisperMessage.addEventListener("input", () => {
    whisperCount.textContent = String(whisperMessage.value.length);
  });
  whisperForm.addEventListener("submit", submitWhisper);
  wishForm.addEventListener("submit", submitWish);
  wishList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-wish-id]");
    if (button) toggleWish(button);
  });
  nightAnswerMessage.addEventListener("input", () => {
    nightAnswerCount.textContent = String(nightAnswerMessage.value.length);
  });
  nightAnswerForm.addEventListener("submit", submitNightAnswer);
  questionShuffle.addEventListener("click", shuffleQuestion);

  prevYearButton.addEventListener("click", () => updateMapYear(mapYear - 1));
  nextYearButton.addEventListener("click", () => updateMapYear(mapYear + 1));

  mapCanvas.addEventListener("click", (event) => {
    const rect = mapCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = null;
    let nearestDistance = Infinity;

    for (const point of mapPoints) {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }

    if (nearest && nearestDistance <= 24) openMemory(nearest.day);
  });

  closeMemoryButton.addEventListener("click", closeMemory);
  memoryBackdrop.addEventListener("click", closeMemory);
  previousMemoryButton.addEventListener("click", () => {
    if (activeDay > 1) openMemory(activeDay - 1);
  });
  nextMemoryButton.addEventListener("click", () => {
    if (activeDay < totalDays) openMemory(activeDay + 1);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && memorySheet.classList.contains("is-open")) closeMemory();
  });

  let resizeFrame = null;
  window.addEventListener("resize", () => {
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      resizeAmbientCanvas();
      if (activeView === "map") resizeMapCanvas();
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAmbientAnimation();
      stopStateSync();
    } else {
      if (!motionDisabled && activeView === "tonight") startAmbientAnimation();
      if (["pulse", "letter"].includes(activeView)) startStateSync();
    }
  });

  document.documentElement.dataset.starTreeEvents = "ready";
}

function init() {
  dayCountNodes.forEach((node) => {
    node.textContent = String(totalDays);
  });
  seasonCountNodes.forEach((node) => {
    node.textContent = String(Math.max(1, Math.ceil(totalDays / 90)));
  });
  memoryCountNodes.forEach((node) => {
    node.textContent = String(getChapterDays().length);
  });
  nextAnniversaryNodes.forEach((node) => {
    node.textContent = String(getDaysUntilNextAnniversary());
  });
  todayDateLabel.textContent = formatShortDate(today);
  tonightMessage.textContent = getMemory(totalDays).message;
  letterDate.textContent = formatChineseDate(today);
  mapYearLabel.textContent = String(mapYear);

  setupDateInput();
  setupEvents();
  setupPointerMotion();
  selectPerson(readSavedPerson(), { persist: false });
  updateMapYear(mapYear);
  resizeAmbientCanvas();
  updateMotionState();

  const params = new URLSearchParams(window.location.search);
  if (params.has("unlock")) {
    const cleanURL = new URL(window.location.href);
    cleanURL.searchParams.delete("unlock");
    window.history.replaceState({}, "", cleanURL);
  }
  if (params.get("enter") === "1") {
    document.body.classList.add("is-entered");
  }
  if (["map", "memories", "pulse", "letter"].includes(params.get("view"))) {
    switchView(params.get("view"));
  }
  if (params.get("enter") === "1" && getURLDay()) {
    window.setTimeout(() => openMemory(getURLDay()), motionDisabled ? 0 : 300);
  }

  if (lowPowerDevice && !prefersReducedMotion) {
    window.setTimeout(() => showNote("已自动启用轻量模式，可在右上角开启动态"), 900);
  }
}

init();
