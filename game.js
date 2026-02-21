// ================== UI / DOM ==================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menuScreen = document.getElementById("menuScreen");
const gameScreen = document.getElementById("gameScreen");
const leaderboardScreen = document.getElementById("leaderboardScreen");

const startBtn = document.getElementById("startBtn");
const backToMenuBtn = document.getElementById("backToMenu");
const leaderboardBtn = document.getElementById("leaderboardBtn");
const lbBackBtn = document.getElementById("lbBackBtn");

const scoreDisplay = document.getElementById("scoreDisplay");
const statusDisplay = document.getElementById("statusDisplay");
const powerDisplay = document.getElementById("powerDisplay");
const debugDisplay = document.getElementById("debugDisplay");

const modeSelect = document.getElementById("modeSelect");
const langSelect = document.getElementById("langSelect");

const titleText = document.getElementById("titleText");
const modeLabel = document.getElementById("modeLabel");
const langLabel = document.getElementById("langLabel");
const hintText = document.getElementById("hintText");

const lbTitle = document.getElementById("lbTitle");
const lbList = document.getElementById("lbList");
const lbHint = document.getElementById("lbHint");
const lbTabNormal = document.getElementById("lbTabNormal");
const lbTabHardcore = document.getElementById("lbTabHardcore");

// ================== PERF SWITCH ==================
// Если ноут снова будет шуметь — поставь true
const LOW_FX = true; // выключает тяжёлые свечения/тени

// ================== I18N ==================
const I18N = {
  ru: {
    title: "Snake Arena",
    start: "Начать игру",
    leaderboard: "Лидерборд",
    mode: "Режим",
    normal: "Обычный",
    hardcore: "Хардкор",
    language: "Язык",
    menu: "Меню",
    back: "Назад",
    score: "Счёт",
    controls: "Управление: стрелки. (Мобилка позже)",
    bites: "Укусы",
    hardcoreTag: "Хардкор",
    powerNone: "Бонусов нет",
    over: "Поражение",
    lbTitle: "Лидерборд",
    lbHint: "Пока это локальный лидерборд на этом устройстве. Telegram-лидерборд подключим позже.",
  },
  en: {
    title: "Snake Arena",
    start: "Start Game",
    leaderboard: "Leaderboard",
    mode: "Mode",
    normal: "Normal",
    hardcore: "Hardcore",
    language: "Language",
    menu: "Menu",
    back: "Back",
    score: "Score",
    controls: "Controls: arrow keys. (Mobile later)",
    bites: "Bites",
    hardcoreTag: "Hardcore",
    powerNone: "No powerups",
    over: "Game Over",
    lbTitle: "Leaderboard",
    lbHint: "This is a local leaderboard on this device. Telegram leaderboard will be added later.",
  }
};

let lang = "ru";
function t(key){ return I18N[lang][key] ?? key; }

function applyLang() {
  titleText.textContent = t("title");
  startBtn.textContent = t("start");
  leaderboardBtn.textContent = t("leaderboard");
  modeLabel.textContent = t("mode") + ":";
  langLabel.textContent = t("language") + ":";
  backToMenuBtn.textContent = t("menu");
  lbBackBtn.textContent = t("back");
  hintText.textContent = t("controls");
  lbTitle.textContent = t("lbTitle");
  lbHint.textContent = t("lbHint");

  const opts = modeSelect.querySelectorAll("option");
  opts.forEach(o => {
    if (o.value === "normal") o.textContent = t("normal");
    if (o.value === "hardcore") o.textContent = t("hardcore");
  });

  lbTabNormal.textContent = t("normal");
  lbTabHardcore.textContent = t("hardcore");
}

// ================== GAME CONFIG ==================
const GRID = 28;
const CELL = canvas.width / GRID;

const BASE_TICK_MS = 120;

const DROP = {
  fruitWeights: [
    { type: "apple", w: 70 },
    { type: "pear", w: 20 },
    { type: "pineapple", w: 10 },
  ],
  powerChance: 0.20,
  powerWeights: [
    { type: "energy", w: 40 },
    { type: "salad", w: 28 },
    { type: "star", w: 22 },
    { type: "bomb", w: 10 },
  ],
};

const FRUITS = {
  apple:     { score: 1, c1: "#ff4d4d", c2: "#c92a2a" },
  pear:      { score: 2, c1: "#ffd24a", c2: "#caa221" },
  pineapple: { score: 3, c1: "#ffb14a", c2: "#d17b1a", legendary: true },
};

const POWERS = {
  energy: { duration: 8000,  colors: ["#77d9ff", "#1aa9e6"] },
  bomb:   { duration: 0,     colors: ["#ff6b6b", "#c92a2a"] },
  salad:  { duration: 0,     colors: ["#7dff87", "#1fba4a"] },
  star:   { duration: 10000, colors: ["#ffd24a", "#d1a31a"] },
};

// ================== GAME STATE ==================
let mode = "normal";
let alive = false;
let timerId = null;

let snake = [];
let dir = { x: 1, y: 0 };
let nextDir = { x: 1, y: 0 };

let score = 0;
let bitesLeft = 2;

let pickup = null; // {kind:"fruit"|"power", type, x,y}

let scoreMult = 1;
let speedMult = 1;
let powerTimers = { speedUntil: 0, starUntil: 0 };

let lbMode = "normal";

// визуальные эффекты
let particles = []; // {x,y,vx,vy,life,max,r,color}
let rings = [];     // {x,y,life,max,r0,r1,color}
let lastT = performance.now();
let phase = 0;

// ================== UTIL ==================
function randInt(n){ return Math.floor(Math.random()*n); }
function samePos(a,b){ return a.x===b.x && a.y===b.y; }
function wrapCoord(v){ return (v + GRID) % GRID; }

function pickWeighted(list){
  const sum = list.reduce((s,it)=>s+it.w,0);
  let r = Math.random()*sum;
  for (const it of list){
    r -= it.w;
    if (r <= 0) return it.type;
  }
  return list[list.length-1].type;
}

function randomEmptyCell(){
  while(true){
    const p = { x: randInt(GRID), y: randInt(GRID) };
    const onSnake = snake.some(s => samePos(s,p));
    const onPickup = pickup && pickup.x === p.x && pickup.y === p.y;
    if (!onSnake && !onPickup) return p;
  }
}

function spawnPickup(){
  const isPower = Math.random() < DROP.powerChance;
  const p = randomEmptyCell();
  if (isPower){
    const type = pickWeighted(DROP.powerWeights);
    pickup = { kind:"power", type, ...p };
  } else {
    const type = pickWeighted(DROP.fruitWeights);
    pickup = { kind:"fruit", type, ...p };
  }
}

// ================== UI NAV ==================
function showMenu(){
  menuScreen.classList.add("active");
  gameScreen.classList.remove("active");
  leaderboardScreen.classList.remove("active");
}
function showGame(){
  menuScreen.classList.remove("active");
  gameScreen.classList.add("active");
  leaderboardScreen.classList.remove("active");
}
function showLeaderboard(){
  menuScreen.classList.remove("active");
  gameScreen.classList.remove("active");
  leaderboardScreen.classList.add("active");
}

// ================== HUD ==================
function formatPowerText(){
  const now = Date.now();
  const starLeft = Math.max(0, powerTimers.starUntil - now);
  const speedLeft = Math.max(0, powerTimers.speedUntil - now);

  const parts = [];
  if (starLeft > 0) parts.push(`⭐ x2 ${Math.ceil(starLeft/1000)}s`);
  if (speedLeft > 0) parts.push(`⚡ ${Math.ceil(speedLeft/1000)}s`);
  return parts.length ? parts.join(" | ") : t("powerNone");
}

function updateHud(){
  scoreDisplay.textContent = `${t("score")}: ${score}`;
  if (mode === "normal"){
    statusDisplay.textContent = `${t("normal")} · ${t("bites")}: ${bitesLeft}`;
  } else {
    statusDisplay.textContent = `${t("hardcoreTag")}`;
  }
  powerDisplay.textContent = formatPowerText();
}

// ================== LOCAL LEADERBOARD ==================
function lbKey(m){ return `snake_arena_lb_${m}`; }

function loadLB(m){
  try{
    const raw = localStorage.getItem(lbKey(m));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}

function saveLB(m, arr){
  localStorage.setItem(lbKey(m), JSON.stringify(arr.slice(0,10)));
}

function submitScoreLocal(m, s){
  const arr = loadLB(m);
  arr.push({ score: s, at: Date.now() });
  arr.sort((a,b)=>b.score-a.score);
  saveLB(m, arr);
}

function setLBTab(m){
  lbMode = m;
  lbTabNormal.classList.toggle("active", m==="normal");
  lbTabHardcore.classList.toggle("active", m==="hardcore");
}

function renderLB(){
  const arr = loadLB(lbMode);
  lbList.innerHTML = "";

  if (arr.length === 0){
    const div = document.createElement("div");
    div.className = "lbRow";
    div.textContent = (lang === "ru") ? "Пока пусто. Сыграй матч." : "Empty. Play a match.";
    lbList.appendChild(div);
    return;
  }

  arr.slice(0,10).forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "lbRow";

    const left = document.createElement("div");
    left.className = "left";

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = String(idx+1);

    const when = new Date(it.at).toLocaleString();

    const meta = document.createElement("div");
    meta.innerHTML = `<div style="font-weight:700">${it.score}</div><div style="color:#a9a9ba;font-size:12px">${when}</div>`;

    left.appendChild(badge);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.style.color = "#a9a9ba";
    right.textContent = lbMode;

    row.appendChild(left);
    row.appendChild(right);
    lbList.appendChild(row);
  });
}

// ================== GAME CORE ==================
function stopLoop(){
  if (timerId){
    clearInterval(timerId);
    timerId = null;
  }
}

function startLoop(){
  stopLoop();
  timerId = setInterval(gameTick, BASE_TICK_MS / speedMult);
}

function resetGame(){
  snake = [
    { x: Math.floor(GRID/2), y: Math.floor(GRID/2) },
    { x: Math.floor(GRID/2)-1, y: Math.floor(GRID/2) },
    { x: Math.floor(GRID/2)-2, y: Math.floor(GRID/2) }
  ];

  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };

  score = 0;
  bitesLeft = 2;

  scoreMult = 1;
  speedMult = 1;
  powerTimers.starUntil = 0;
  powerTimers.speedUntil = 0;

  particles = [];
  rings = [];
  pickup = null;
  spawnPickup();

  alive = true;
  updateHud();
  startLoop();
  draw();
}

function applyPowersTimers(){
  const now = Date.now();
  scoreMult = (now < powerTimers.starUntil) ? 2 : 1;
  const newSpeed = (now < powerTimers.speedUntil) ? 1.35 : 1;

  const changed = (newSpeed !== speedMult);
  speedMult = newSpeed;
  if (changed) startLoop();
}

function gameOver(){
  alive = false;
  stopLoop();
  submitScoreLocal(mode, score);
  updateHud();
  alert(t("over"));
  showMenu();
}

function selfCollisionIndex(pos){
  return snake.findIndex(seg => samePos(seg, pos));
}

function addPickupFX(kind, type, cx, cy){
  // цвета для частиц
  let colors = ["#ffffff", "#bbbbbb"];
  if (kind === "fruit"){
    const f = FRUITS[type];
    colors = [f.c1, f.c2, "#ffffff"];
  } else {
    colors = POWERS[type].colors.concat(["#ffffff"]);
  }

  // кольцо
  rings.push({
    x: cx, y: cy,
    life: 0.35, max: 0.35,
    r0: CELL*0.2, r1: CELL*1.2,
    color: colors[0]
  });

  // частицы
  const n = 18;
  for (let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2;
    const sp = (CELL*3.0) * (0.35 + Math.random()*0.65);
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a)*sp,
      vy: Math.sin(a)*sp,
      life: 0.45 + Math.random()*0.25,
      max: 0.45 + Math.random()*0.25,
      r: CELL*(0.05 + Math.random()*0.08),
      color: colors[(Math.random()*colors.length)|0]
    });
  }
}

function applyPower(type){
  const now = Date.now();

  if (type === "energy"){
    powerTimers.speedUntil = Math.max(powerTimers.speedUntil, now + POWERS.energy.duration);
  } else if (type === "star"){
    powerTimers.starUntil = Math.max(powerTimers.starUntil, now + POWERS.star.duration);
  } else if (type === "salad"){
    score += 10;
  } else if (type === "bomb"){
    const len = snake.length;
    const cut = Math.max(1, Math.floor(len * 0.1));
    const newLen = Math.max(3, len - cut);
    snake = snake.slice(0, newLen);
  }
}

function gameTick(){
  if (!alive) return;

  applyPowersTimers();
  dir = nextDir;

  const head = snake[0];
  const newHead = { x: wrapCoord(head.x + dir.x), y: wrapCoord(head.y + dir.y) };

  // self collision
  const hitIndex = selfCollisionIndex(newHead);
  if (hitIndex !== -1){
    if (mode === "hardcore"){
      gameOver();
      return;
    } else {
      if (bitesLeft > 0){
        snake = snake.slice(0, hitIndex);
        bitesLeft--;
      } else {
        gameOver();
        return;
      }
    }
  }

  snake.unshift(newHead);

  // pickup
  if (pickup && pickup.x === newHead.x && pickup.y === newHead.y){
    const cx = pickup.x * CELL + CELL/2;
    const cy = pickup.y * CELL + CELL/2;

    if (pickup.kind === "fruit"){
      const f = FRUITS[pickup.type];
      score += f.score * scoreMult;
      addPickupFX("fruit", pickup.type, cx, cy);
      spawnPickup();
    } else {
      applyPower(pickup.type);
      addPickupFX("power", pickup.type, cx, cy);
      spawnPickup();
    }
  } else {
    snake.pop();
  }

  updateHud();
  draw();
}

// ================== DRAW HELPERS (SILHOUETTES) ==================
function withShadow(color, blur, fn){
  if (LOW_FX) { fn(); return; }
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  fn();
  ctx.restore();
}

function circle(x,y,r,fill){
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fill();
}

function roundRect(x,y,w,h,r,fill,stroke){
  const rr = Math.max(0, Math.min(r, w/2, h/2));
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
  if (fill){
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke){
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, CELL*0.06);
    ctx.stroke();
  }
}

function drawApple(cx,cy,scale){
  const r = CELL*0.28*scale;
  // body (two circles merged)
  ctx.fillStyle = FRUITS.apple.c1;
  ctx.beginPath();
  ctx.arc(cx - r*0.45, cy, r, 0, Math.PI*2);
  ctx.arc(cx + r*0.45, cy, r, 0, Math.PI*2);
  ctx.fill();

  // bottom notch
  ctx.fillStyle = FRUITS.apple.c2;
  ctx.beginPath();
  ctx.arc(cx, cy + r*0.65, r*0.55, 0, Math.PI*2);
  ctx.fill();

  // stem
  ctx.strokeStyle = "#5b3a1e";
  ctx.lineWidth = CELL*0.09;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy - r*1.1);
  ctx.lineTo(cx + r*0.1, cy - r*0.5);
  ctx.stroke();

  // leaf
  ctx.fillStyle = "#3bd16f";
  ctx.beginPath();
  ctx.ellipse(cx + r*0.55, cy - r*0.85, r*0.45, r*0.25, -0.6, 0, Math.PI*2);
  ctx.fill();

  // highlight
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx - r*0.65, cy - r*0.35, r*0.35, r*0.55, 0.2, 0, Math.PI*2);
  ctx.fill();
}

function drawPear(cx,cy,scale){
  const r = CELL*0.30*scale;

  // body shape: two circles (big bottom + small top)
  ctx.fillStyle = FRUITS.pear.c1;
  ctx.beginPath();
  ctx.arc(cx, cy + r*0.30, r*1.05, 0, Math.PI*2);
  ctx.arc(cx, cy - r*0.70, r*0.70, 0, Math.PI*2);
  ctx.fill();

  // outline-ish
  ctx.strokeStyle = FRUITS.pear.c2;
  ctx.lineWidth = CELL*0.06;
  ctx.beginPath();
  ctx.arc(cx, cy + r*0.30, r*1.05, 0.2, Math.PI*2-0.2);
  ctx.stroke();

  // stem + leaf
  ctx.strokeStyle = "#5b3a1e";
  ctx.lineWidth = CELL*0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy - r*1.6);
  ctx.lineTo(cx + r*0.05, cy - r*1.0);
  ctx.stroke();

  ctx.fillStyle = "#3bd16f";
  ctx.beginPath();
  ctx.ellipse(cx + r*0.55, cy - r*1.25, r*0.45, r*0.22, -0.7, 0, Math.PI*2);
  ctx.fill();

  // highlight
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx - r*0.35, cy - r*0.20, r*0.28, r*0.55, 0.1, 0, Math.PI*2);
  ctx.fill();
}

function drawPineapple(cx,cy,scale){
  const r = CELL*0.30*scale;
  const bodyW = r*1.6;
  const bodyH = r*2.05;

  // legendary glow
  if (!LOW_FX){
    const pulse = 0.5 + 0.5*Math.sin(phase*2.5);
    withShadow("rgba(255,177,74,0.75)", 10 + pulse*10, () => {
      circle(cx, cy, r*1.25, "rgba(255,177,74,0.22)");
    });
  }

  // body
  roundRect(cx - bodyW/2, cy - bodyH/2 + r*0.15, bodyW, bodyH, r*0.45, FRUITS.pineapple.c1, FRUITS.pineapple.c2);

  // diamond grid
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = Math.max(1, CELL*0.04);
  for (let y = -2; y <= 2; y++){
    ctx.beginPath();
    ctx.moveTo(cx - bodyW/2, cy + y*r*0.35);
    ctx.lineTo(cx + bodyW/2, cy + (y+2)*r*0.35);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - bodyW/2, cy + (y+2)*r*0.35);
    ctx.lineTo(cx + bodyW/2, cy + y*r*0.35);
    ctx.stroke();
  }
  ctx.restore();

  // crown (leaves)
  ctx.fillStyle = "#33d17a";
  for (let i=-2;i<=2;i++){
    ctx.beginPath();
    ctx.moveTo(cx + i*r*0.25, cy - bodyH/2 - r*0.05);
    ctx.lineTo(cx + i*r*0.25 + r*0.18, cy - bodyH/2 - r*0.75);
    ctx.lineTo(cx + i*r*0.25 + r*0.36, cy - bodyH/2 - r*0.05);
    ctx.closePath();
    ctx.fill();
  }

  // highlight
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.ellipse(cx - r*0.35, cy - r*0.20, r*0.25, r*0.70, 0.15, 0, Math.PI*2);
  ctx.fill();
}

function drawEnergy(cx,cy,scale){
  const r = CELL*0.30*scale;
  const w = r*1.3;
  const h = r*2.1;

  if (!LOW_FX){
    withShadow("rgba(119,217,255,0.55)", 10, () => {
      roundRect(cx - w/2, cy - h/2, w, h, r*0.35, "rgba(119,217,255,0.18)");
    });
  }

  // can body
  roundRect(cx - w/2, cy - h/2, w, h, r*0.35, "#77d9ff", "#0e5f85");
  // top cap
  roundRect(cx - w/2, cy - h/2, w, r*0.35, r*0.2, "rgba(255,255,255,0.35)");
  // stripe
  roundRect(cx - w*0.15, cy - h*0.45, w*0.30, h*0.9, r*0.2, "rgba(0,0,0,0.12)");

  // lightning icon
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.moveTo(cx - r*0.15, cy - r*0.55);
  ctx.lineTo(cx + r*0.15, cy - r*0.05);
  ctx.lineTo(cx + r*0.02, cy - r*0.05);
  ctx.lineTo(cx + r*0.22, cy + r*0.55);
  ctx.lineTo(cx - r*0.20, cy + r*0.05);
  ctx.lineTo(cx - r*0.05, cy + r*0.05);
  ctx.closePath();
  ctx.fill();
}

function drawBomb(cx,cy,scale){
  const r = CELL*0.30*scale;

  if (!LOW_FX){
    withShadow("rgba(255,107,107,0.55)", 10, () => {
      circle(cx, cy, r*1.15, "rgba(255,107,107,0.18)");
    });
  }

  // bomb ball
  circle(cx, cy + r*0.10, r*1.05, "#23252f");
  // highlight
  circle(cx - r*0.35, cy - r*0.15, r*0.25, "rgba(255,255,255,0.16)");

  // fuse base
  roundRect(cx - r*0.20, cy - r*1.15, r*0.40, r*0.35, r*0.15, "#6b6f7a");
  // fuse
  ctx.strokeStyle = "#caa221";
  ctx.lineWidth = CELL*0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy - r*0.98);
  ctx.quadraticCurveTo(cx + r*0.55, cy - r*1.30, cx + r*0.65, cy - r*0.90);
  ctx.stroke();

  // spark
  const sp = 0.5 + 0.5*Math.sin(phase*5.0);
  circle(cx + r*0.70, cy - r*0.90, r*0.14 + sp*r*0.08, "#ffb14a");
}

function drawSalad(cx,cy,scale){
  const r = CELL*0.30*scale;

  if (!LOW_FX){
    withShadow("rgba(125,255,135,0.45)", 10, () => {
      circle(cx, cy, r*1.2, "rgba(125,255,135,0.16)");
    });
  }

  // bowl
  roundRect(cx - r*1.25, cy, r*2.5, r*0.95, r*0.45, "#2b2f3a", "#11131a");
  // greens
  circle(cx - r*0.7, cy - r*0.2, r*0.6, "#3bd16f");
  circle(cx + r*0.0, cy - r*0.45, r*0.75, "#2fbf67");
  circle(cx + r*0.8, cy - r*0.15, r*0.55, "#44e07a");
  // tomato
  circle(cx + r*0.45, cy - r*0.05, r*0.22, "#ff4d4d");
  // shine
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.ellipse(cx - r*0.6, cy + r*0.35, r*0.45, r*0.18, 0.2, 0, Math.PI*2);
  ctx.fill();
}

function drawStar(cx,cy,scale){
  const r = CELL*0.32*scale;

  if (!LOW_FX){
    const pulse = 0.5 + 0.5*Math.sin(phase*3.0);
    withShadow("rgba(255,210,74,0.65)", 12 + pulse*8, () => {
      circle(cx, cy, r*1.15, "rgba(255,210,74,0.18)");
    });
  }

  // star polygon
  const spikes = 5;
  const outer = r*1.05;
  const inner = r*0.45;
  ctx.beginPath();
  for (let i=0;i<spikes*2;i++){
    const ang = (Math.PI/2) + i*(Math.PI/spikes);
    const rr = (i%2===0) ? outer : inner;
    const x = cx + Math.cos(ang)*rr;
    const y = cy - Math.sin(ang)*rr;
    if (i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffd24a";
  ctx.fill();
  ctx.strokeStyle = "#b88914";
  ctx.lineWidth = CELL*0.06;
  ctx.stroke();

  // highlight
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx - r*0.25, cy - r*0.25, r*0.25, r*0.14, -0.3, 0, Math.PI*2);
  ctx.fill();
}

// ================== RENDER ==================
function updateFX(dt){
  // particles
  const g = CELL*12; // gravity-ish in px/sec^2
  for (let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0){ particles.splice(i,1); continue; }
    p.vy += g*dt;
    p.x += p.vx*dt;
    p.y += p.vy*dt;
  }
  // rings
  for (let i=rings.length-1;i>=0;i--){
    const r = rings[i];
    r.life -= dt;
    if (r.life <= 0){ rings.splice(i,1); continue; }
  }
}

function drawFX(){
  // rings
  for (const r of rings){
    const k = 1 - (r.life / r.max); // 0..1
    const rr = r.r0 + (r.r1 - r.r0)*k;
    const a = 1 - k;
    ctx.save();
    ctx.globalAlpha = a*0.9;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(1, CELL*0.08);
    ctx.beginPath();
    ctx.arc(r.x, r.y, rr, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  // particles
  for (const p of particles){
    const a = Math.max(0, p.life / p.max);
    ctx.save();
    ctx.globalAlpha = a;
    circle(p.x, p.y, p.r, p.color);
    ctx.restore();
  }
}

function drawPickup(p){
  const cx = p.x * CELL + CELL/2;
  const cy = p.y * CELL + CELL/2;
  const scale = 1.0;

  if (p.kind === "fruit"){
    if (p.type === "apple") drawApple(cx, cy, scale);
    if (p.type === "pear") drawPear(cx, cy, scale);
    if (p.type === "pineapple") drawPineapple(cx, cy, scale);
  } else {
    if (p.type === "energy") drawEnergy(cx, cy, scale);
    if (p.type === "bomb") drawBomb(cx, cy, scale);
    if (p.type === "salad") drawSalad(cx, cy, scale);
    if (p.type === "star") drawStar(cx, cy, scale);
  }
}

function drawSnake(){
  // body tube with outline (читаемость)
  const bodyW = CELL * 0.72;
  const outlineW = bodyW + CELL*0.12;

  // outline
  ctx.lineWidth = outlineW;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  for (let i=0;i<snake.length;i++){
    const a = snake[i];
    const ax = a.x*CELL + CELL/2;
    const ay = a.y*CELL + CELL/2;
    if (i===0){ ctx.moveTo(ax,ay); continue; }
    const b = snake[i-1];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (dx > 1 || dy > 1) ctx.moveTo(ax, ay);
    else ctx.lineTo(ax, ay);
  }
  ctx.stroke();

  // main body
  ctx.lineWidth = bodyW;
  ctx.strokeStyle = "#35c94a";
  ctx.beginPath();
  for (let i=0;i<snake.length;i++){
    const a = snake[i];
    const ax = a.x*CELL + CELL/2;
    const ay = a.y*CELL + CELL/2;
    if (i===0){ ctx.moveTo(ax,ay); continue; }
    const b = snake[i-1];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (dx > 1 || dy > 1) ctx.moveTo(ax, ay);
    else ctx.lineTo(ax, ay);
  }
  ctx.stroke();

  // head
  const head = snake[0];
  const hx = head.x*CELL + CELL/2;
  const hy = head.y*CELL + CELL/2;
  const hr = CELL*0.42;

  if (!LOW_FX){
    withShadow("rgba(0,0,0,0.35)", 8, () => {
      circle(hx+2, hy+3, hr, "rgba(0,0,0,0.20)");
    });
  }

  circle(hx, hy, hr, "#7CFF6B");
  // highlight
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.ellipse(hx - hr*0.35, hy - hr*0.35, hr*0.35, hr*0.20, -0.3, 0, Math.PI*2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();

  // eyes (смотрят по направлению)
  const eyeDist = hr*0.55;
  const eyeR = hr*0.20;
  const pupilR = eyeR*0.55;

  const fx = dir.x, fy = dir.y;
  const sx = -dir.y, sy = dir.x;

  const e1x = hx + sx*eyeDist + fx*(hr*0.10);
  const e1y = hy + sy*eyeDist + fy*(hr*0.10);
  const e2x = hx - sx*eyeDist + fx*(hr*0.10);
  const e2y = hy - sy*eyeDist + fy*(hr*0.10);

  circle(e1x, e1y, eyeR, "#fff");
  circle(e2x, e2y, eyeR, "#fff");

  const look = eyeR*0.45;
  circle(e1x + fx*look, e1y + fy*look, pupilR, "#111");
  circle(e2x + fx*look, e2y + fy*look, pupilR, "#111");
}

function draw(){
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT)/1000);
  lastT = now;
  phase += dt;

  updateFX(dt);

  ctx.clearRect(0,0,canvas.width,canvas.height);

  // легкая подложка для читабельности (очень дешево)
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.restore();

  if (pickup) drawPickup(pickup);
  drawSnake();
  drawFX();

  debugDisplay.textContent = pickup ? `${pickup.kind}:${pickup.type}` : "";
}

// ================== INPUT ==================
document.addEventListener("keydown", (e) => {
  if (!alive) return;
  if (e.key === "ArrowUp" && dir.y !== 1) nextDir = { x: 0, y: -1 };
  if (e.key === "ArrowDown" && dir.y !== -1) nextDir = { x: 0, y: 1 };
  if (e.key === "ArrowLeft" && dir.x !== 1) nextDir = { x: -1, y: 0 };
  if (e.key === "ArrowRight" && dir.x !== -1) nextDir = { x: 1, y: 0 };
});
// ===== Mobile controls (buttons + swipe) =====
const mobileControls = document.getElementById("mobileControls");

function setDirFromUI(d){
  if (!alive) return;
  if (d === "up" && dir.y !== 1) nextDir = { x: 0, y: -1 };
  if (d === "down" && dir.y !== -1) nextDir = { x: 0, y: 1 };
  if (d === "left" && dir.x !== 1) nextDir = { x: -1, y: 0 };
  if (d === "right" && dir.x !== -1) nextDir = { x: 1, y: 0 };
}

mobileControls?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-dir]");
  if (!btn) return;
  setDirFromUI(btn.dataset.dir);
});

// Swipe on canvas
let touchStartX = 0, touchStartY = 0;
const SWIPE_MIN = 18; // px

canvas.addEventListener("touchstart", (e) => {
  if (!e.touches?.length) return;
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}, { passive: true });

canvas.addEventListener("touchmove", (e) => {
  // prevent page scroll while swiping on canvas
  e.preventDefault();
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  const t = e.changedTouches?.[0];
  if (!t) return;

  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;

  if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;

  if (Math.abs(dx) > Math.abs(dy)) {
    setDirFromUI(dx > 0 ? "right" : "left");
  } else {
    setDirFromUI(dy > 0 ? "down" : "up");
  }
}, { passive: true });

// Telegram WebApp polish (safe even outside Telegram)
try {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.expand();
    tg.ready();
  }
} catch {}
// ================== UI EVENTS ==================
startBtn.addEventListener("click", () => {
  mode = modeSelect.value;
  showGame();
  resetGame();
});

backToMenuBtn.addEventListener("click", () => {
  alive = false;
  stopLoop();
  showMenu();
});

leaderboardBtn.addEventListener("click", () => {
  setLBTab("normal");
  renderLB();
  showLeaderboard();
});

lbBackBtn.addEventListener("click", () => showMenu());

document.querySelectorAll(".tabBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    const m = btn.dataset.lbmode;
    setLBTab(m);
    renderLB();
  });
});

langSelect.addEventListener("change", () => {
  lang = langSelect.value;
  applyLang();
  updateHud();
  renderLB();
});

// ================== INIT ==================
(function init(){
  lang = (langSelect.value === "en") ? "en" : "ru";
  applyLang();
  showMenu();
  updateHud();
})();