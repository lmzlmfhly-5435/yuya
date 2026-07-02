const CONFIG = {
  relationshipStartDate: "2024-09-09",
  handPoint: { x: 0.666, y: 0.492 },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const app = document.querySelector("#app");
const loader = document.querySelector("#loader");
const enterButton = document.querySelector("#enterButton");
const todayButton = document.querySelector("#todayButton");
const randomButton = document.querySelector("#randomButton");
const dateInput = document.querySelector("#dateInput");
const sceneImage = document.querySelector("#sceneImage");
const starCanvas = document.querySelector("#starCanvas");
const starContext = starCanvas.getContext("2d");
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
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const startDate = parseLocalDate(CONFIG.relationshipStartDate);
const totalDays = getRelationshipDayCount();

let activeDay = totalDays;
let hoveredDay = null;
let canvasWidth = 0;
let canvasHeight = 0;
let dpr = 1;
let animationFrame = null;
let stars = [];
let travelRafId = null;
const handGlowEl = document.querySelector("#handGlow");

function getDayFromURL() {
  const params = new URLSearchParams(window.location.search);
  const day = parseInt(params.get("day"), 10);
  if (Number.isFinite(day)) {
    return Math.min(Math.max(1, day), totalDays);
  }
  return null;
}

function updateURL(day) {
  const url = new URL(window.location);
  url.searchParams.set("day", String(day));
  window.history.replaceState({}, "", url);
}

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
  const nextStars = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const random = seededRandom(day * 7283);
    const entry = messageByDay.get(day);
    const type = getStarType(day, entry);
    const hasMessage = !!(entry && (entry.title?.trim() || entry.message?.trim()));
    const specialBoost = type === "normal" ? 0 : type === "memory" ? 0.22 : 0.42;
    const x = 4.8 + random() * 90.4;
    const y = 5.5 + Math.pow(random(), 1.1) * 49;
    const skyDepth = Math.min(1, Math.max(0, (y - 5.5) / 49));
    const nearness = Math.min(1, 0.24 + skyDepth * 0.42 + random() * 0.34);
    const radius = 0.34 + random() * 0.64 + nearness * 0.34 + specialBoost;
    const hotRadius = Math.max(13, radius * 9 + (type === "normal" ? 0 : 8));
    const star = {
      day,
      type,
      hasMessage,
      x,
      y,
      radius,
      halo: 11 + radius * (10 + random() * 9),
      hue: type === "memory" ? 346 + random() * 18 : 39 + nearness * 8 + random() * 12,
      alpha: 0.28 + random() * 0.34 + specialBoost * 0.24 + nearness * 0.1,
      nearness,
      phase: random() * Math.PI * 2,
      speed: 0.0008 + random() * 0.0014,
      drift: 0.24 + nearness * 0.92 + random() * 0.52,
      hotRadius,
    };
    const hit = document.createElement("button");

    const messageClass = hasMessage ? " star--has-message" : "";
    hit.className = `star star--${type}${messageClass}`;
    hit.type = "button";
    hit.dataset.day = String(day);
    hit.style.setProperty("--x", `${star.x.toFixed(3)}%`);
    hit.style.setProperty("--y", `${star.y.toFixed(3)}%`);
    hit.style.setProperty("--hit", `${(hotRadius * 2).toFixed(1)}px`);
    hit.setAttribute("aria-label", `摘下第 ${day} 天的星星`);
    hit.addEventListener("pointerenter", () => {
      hoveredDay = day;
    });
    hit.addEventListener("pointerleave", () => {
      if (hoveredDay === day) {
        hoveredDay = null;
      }
    });
    hit.addEventListener("focus", () => {
      hoveredDay = day;
    });
    hit.addEventListener("blur", () => {
      if (hoveredDay === day) {
        hoveredDay = null;
      }
    });
    hit.addEventListener("click", () => selectStar(day));

    nextStars.push(star);
    fragment.appendChild(hit);
  }

  stars = nextStars;
  starLayer.replaceChildren(fragment);
}

function resizeStarCanvas() {
  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvasWidth = window.innerWidth;
  canvasHeight = window.innerHeight;
  starCanvas.width = Math.floor(canvasWidth * dpr);
  starCanvas.height = Math.floor(canvasHeight * dpr);
  starCanvas.style.width = `${canvasWidth}px`;
  starCanvas.style.height = `${canvasHeight}px`;
  starContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawStars(performance.now());
}

function drawStars(time = 0) {
  animationFrame = null;
  starContext.clearRect(0, 0, canvasWidth, canvasHeight);
  starContext.save();
  starContext.globalCompositeOperation = "lighter";

  for (const star of stars) {
    drawStar(star, time);
  }

  starContext.restore();

  if (!prefersReducedMotion && canvasWidth > 0 && canvasHeight > 0) {
    animationFrame = window.requestAnimationFrame(drawStars);
  }
}

function drawStar(star, time) {
  const selected = star.day === activeDay;
  const hovered = star.day === hoveredDay;
  const special = star.type !== "normal";
  const hasMessage = star.hasMessage;
  const twinkle =
    0.82 +
    Math.sin(time * star.speed + star.phase) * 0.1 +
    Math.sin(time * star.speed * 0.37 + star.phase * 1.7) * 0.035;
  const driftX = Math.sin(time * 0.00016 + star.phase) * star.drift * star.nearness;
  const driftY = Math.cos(time * 0.00013 + star.phase) * star.drift * 0.28;
  const x = (star.x / 100) * canvasWidth + driftX;
  const y = (star.y / 100) * canvasHeight + driftY;
  const glowScale = selected ? 2.28 : hovered ? 1.86 : special ? 1.22 : hasMessage ? 1.12 : 1;
  const coreScale = selected ? 1.32 : hovered ? 1.2 : special ? 1.08 : hasMessage ? 1.04 : 1;
  const alpha = Math.min(0.95, star.alpha * twinkle + (selected ? 0.18 : hovered ? 0.13 : 0));
  const coreRadius = star.radius * coreScale;
  const haloRadius = star.halo * glowScale;

  drawGlow(x, y, haloRadius, star.hue, alpha * (selected || hovered ? 0.46 : hasMessage ? 0.26 : 0.18));
  drawCore(x, y, coreRadius, star.hue, alpha);

  if (special || selected || hovered || hasMessage) {
    const airAlpha = selected ? 0.52 : hovered ? 0.38 : hasMessage ? 0.16 : 0.14;
    drawScintillation(x, y, coreRadius, star.hue, airAlpha, star.phase, time, star.nearness);
  }
}

function drawGlow(x, y, radius, hue, alpha) {
  const gradient = starContext.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `hsla(${hue}, 100%, 94%, ${alpha})`);
  gradient.addColorStop(0.22, `hsla(${hue}, 100%, 80%, ${alpha * 0.28})`);
  gradient.addColorStop(0.58, `hsla(${hue + 52}, 76%, 70%, ${alpha * 0.055})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  starContext.fillStyle = gradient;
  starContext.beginPath();
  starContext.arc(x, y, radius, 0, Math.PI * 2);
  starContext.fill();
}

function drawCore(x, y, radius, hue, alpha) {
  const gradient = starContext.createRadialGradient(
    x - radius * 0.26,
    y - radius * 0.28,
    0,
    x,
    y,
    Math.max(radius, 0.8) * 1.55,
  );
  gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  gradient.addColorStop(0.32, `hsla(${hue}, 100%, 88%, ${alpha * 0.72})`);
  gradient.addColorStop(0.62, `hsla(${hue}, 100%, 68%, ${alpha * 0.18})`);
  gradient.addColorStop(1, `hsla(${hue}, 100%, 62%, 0)`);

  starContext.fillStyle = gradient;
  starContext.beginPath();
  starContext.arc(x, y, Math.max(radius, 0.52), 0, Math.PI * 2);
  starContext.fill();
}

function drawScintillation(x, y, radius, hue, alpha, phase, time, nearness) {
  const lobeCount = 4;

  for (let i = 0; i < lobeCount; i += 1) {
    const angle = phase + i * 1.72 + Math.sin(time * 0.00012 + phase) * 0.16;
    const distance = radius * (2.4 + i * 0.28 + nearness * 0.9);
    const lobeX = x + Math.cos(angle) * distance;
    const lobeY = y + Math.sin(angle) * distance * 0.68;
    const lobeRadius = radius * (2.1 + i * 0.22);
    const lobeAlpha = alpha * (0.42 - i * 0.055);
    drawGlow(lobeX, lobeY, lobeRadius, hue + i * 9, lobeAlpha);
  }
}

function getStarScreenPoint(star) {
  return {
    x: (star.x / 100) * canvasWidth,
    y: (star.y / 100) * canvasHeight,
  };
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
  updateURL(nextDay);

  if (shouldAnimate) {
    const selectedStar = stars[nextDay - 1];
    if (selectedStar) {
      animateStarToHand(selectedStar);
    }
  }
}

function animateStarToHand(star) {
  if (travelRafId) {
    cancelAnimationFrame(travelRafId);
    travelRafId = null;
  }

  const oldCanvas = travelerLayer.querySelector(".travel-canvas");
  if (oldCanvas) oldCanvas.remove();
  const oldFly = travelerLayer.querySelector(".fly-star");
  if (oldFly) oldFly.remove();
  const oldBloom = travelerLayer.querySelector(".arrival-bloom");
  if (oldBloom) oldBloom.remove();
  handGlowEl.classList.remove("is-anticipating", "is-catching");
  app.classList.remove("is-star-traveling", "is-catching");

  const from = getStarScreenPoint(star);
  const to = getHandPoint();
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const side = dx >= 0 ? 1 : -1;
  const lift = Math.min(300, Math.max(120, dist * 0.22));

  const cp1 = {
    x: from.x + dx * 0.2 - side * dist * 0.08,
    y: from.y + dy * 0.08 - lift,
  };
  const cp2 = {
    x: from.x + dx * 0.66 + side * dist * 0.06,
    y: from.y + dy * 0.68 - lift * 0.18,
  };

  function bez(t, p0, p1, p2, p3) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  function posAt(t) {
    return {
      x: bez(t, from.x, cp1.x, cp2.x, to.x),
      y: bez(t, from.y, cp1.y, cp2.y, to.y),
    };
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  const scaleKeyframes = [
    { at: 0, val: 0.08 },
    { at: 0.18, val: 0.22 },
    { at: 0.46, val: 0.72 },
    { at: 0.68, val: 1.08 },
    { at: 0.84, val: 0.78 },
    { at: 0.96, val: 0.38 },
    { at: 1, val: 0.08 },
  ];

  function scaleAt(t) {
    for (let i = 0; i < scaleKeyframes.length - 1; i++) {
      const a = scaleKeyframes[i];
      const b = scaleKeyframes[i + 1];
      if (t >= a.at && t <= b.at) {
        const r = smoothstep((t - a.at) / (b.at - a.at));
        return a.val + (b.val - a.val) * r;
      }
    }
    return scaleKeyframes[scaleKeyframes.length - 1].val;
  }

  const flyEl = document.createElement("div");
  flyEl.className = "fly-star";
  flyEl.style.left = from.x + "px";
  flyEl.style.top = from.y + "px";

  const tailEl = document.createElement("div");
  tailEl.className = "fly-star__tail";
  flyEl.appendChild(tailEl);

  const coreEl = document.createElement("div");
  coreEl.className = "fly-star__core";
  flyEl.appendChild(coreEl);

  const auraEl = document.createElement("div");
  auraEl.className = "fly-star__aura";
  flyEl.appendChild(auraEl);

  travelerLayer.appendChild(flyEl);

  const dprLocal = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const canvas = document.createElement("canvas");
  canvas.className = "travel-canvas";
  canvas.width = Math.floor(w * dprLocal);
  canvas.height = Math.floor(h * dprLocal);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dprLocal, 0, 0, dprLocal, 0, 0);
  travelerLayer.appendChild(canvas);

  const DURATION = 1650;
  const trail = [];
  const MAX_TRAIL = 34;
  const t0 = performance.now();

  let wasLarge = false;
  app.classList.add("is-star-traveling");

  function drawTrailEntry(x, y, r, alpha, angle) {
    if (r <= 0.3 || alpha <= 0.005) return;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(255, 249, 220, ${alpha * 0.44})`);
    g.addColorStop(0.28, `rgba(246, 214, 123, ${alpha * 0.2})`);
    g.addColorStop(0.62, `rgba(132, 225, 216, ${alpha * 0.06})`);
    g.addColorStop(1, "rgba(132, 225, 216, 0)");

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(3.4, 0.52);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    const t = Math.min(1, (now - t0) / DURATION);
    const pathT = smoothstep(t);
    const pos = posAt(pathT);
    const previous = posAt(Math.max(0, pathT - 0.018));
    const angle = Math.atan2(pos.y - previous.y, pos.x - previous.x);
    const sc = scaleAt(t);
    const baseR = 9;
    const r = baseR * sc;
    const nearFocus = Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.08)));
    const blur = 0.08 + Math.max(0, sc - 0.9) * 0.2 + nearFocus * 0.12;
    const opacity = t < 0.1 ? 0.6 + t * 3.4 : t > 0.94 ? Math.max(0, 1 - (t - 0.94) / 0.06) : 0.96;

    trail.push({ x: pos.x, y: pos.y, r: r * (0.9 + nearFocus * 0.18), angle, ts: now });
    while (trail.length > MAX_TRAIL) trail.shift();

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < trail.length; i++) {
      const tr = trail[i];
      const age = (now - tr.ts) / 620;
      if (age >= 1) continue;
      const ta = (1 - age) * 0.26;
      const trR = tr.r * (1 - age * 0.58);
      drawTrailEntry(tr.x, tr.y, trR, ta, tr.angle);
    }
    ctx.restore();

    flyEl.style.left = pos.x + "px";
    flyEl.style.top = pos.y + "px";
    flyEl.style.transform = `translate(-50%, -50%) rotate(${angle}rad) scale(${sc})`;
    flyEl.style.setProperty("--fly-blur", `${blur.toFixed(2)}px`);
    flyEl.style.setProperty("--fly-opacity", opacity.toFixed(3));

    const isLarge = sc > 1.42;
    if (isLarge !== wasLarge) {
      wasLarge = isLarge;
      if (isLarge) {
        flyEl.classList.add("is-large");
      } else {
        flyEl.classList.remove("is-large");
      }
    }

    if (t >= 0.52 && !handGlowEl.classList.contains("is-anticipating")) {
      handGlowEl.classList.add("is-anticipating");
    }
    if (t >= 0.74 && !handGlowEl.classList.contains("is-catching")) {
      handGlowEl.classList.remove("is-anticipating");
      handGlowEl.classList.add("is-catching");
      app.classList.add("is-catching");
    }

    if (t < 1) {
      travelRafId = requestAnimationFrame(frame);
    } else {
      travelRafId = null;
      flyEl.remove();
      canvas.remove();
      const bloom = document.createElement("div");
      bloom.className = "arrival-bloom";
      bloom.style.left = to.x + "px";
      bloom.style.top = to.y + "px";
      travelerLayer.appendChild(bloom);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => bloom.classList.add("is-burst"));
      });
      setTimeout(() => {
        bloom.remove();
        handGlowEl.classList.remove("is-catching");
        app.classList.remove("is-star-traveling", "is-catching");
      }, 820);
    }
  }

  travelRafId = requestAnimationFrame(frame);
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
    const urlDay = getDayFromURL();
    selectStar(urlDay || activeDay, { animate: false });
  });

  todayButton.addEventListener("click", () => selectStar(totalDays));
  randomButton.addEventListener("click", () => {
    const filledDays = starMessages.filter(
      (entry) => entry.title?.trim() || entry.message?.trim(),
    );
    if (filledDays.length > 0) {
      const entry = filledDays[Math.floor(Math.random() * filledDays.length)];
      selectStar(entry.day);
    } else {
      const day = Math.floor(Math.random() * totalDays) + 1;
      selectStar(day);
    }
  });

  window.addEventListener("resize", () => {
    resizeStarCanvas();
    positionHandGlow();
  });
  sceneImage.addEventListener("load", positionHandGlow);
}

function init() {
  if (sceneImage.complete && sceneImage.naturalWidth > 0) {
    hideLoader();
  } else {
    sceneImage.addEventListener("load", hideLoader);
    sceneImage.addEventListener("error", hideLoader);
  }

  updateDayCounters();
  buildStars();
  resizeStarCanvas();
  setupDateInput();
  setupEvents();
  positionHandGlow();
  selectStar(totalDays, { animate: false });

  if (prefersReducedMotion) {
    drawStars(0);
  }
}

function hideLoader() {
  if (loader) {
    loader.classList.add("is-hidden");
  }
}

init();
