'use strict';

/* ================= 工具 ================= */
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const UNITS = ['个', '秒', '分钟'];
const fmtDate = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayStr = () => fmtDate(new Date());
const todayIdx = () => (new Date().getDay() + 6) % 7;
const fmtRest = s => { if (!s) return ''; if (s >= 120) { const m = s / 60; return (m % 1 ? m.toFixed(1) : m) + '分钟'; } return s + '秒'; };
const toSec = (n, unit) => unit === '分钟' ? n * 60 : (unit === '小时' ? n * 3600 : n);
const fmtTime = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), ss = s % 60; return (m < 10 ? '' + m : m) + ':' + String(ss).padStart(2, '0'); };
const fmtPre = n => (n >= 60 && n % 60 === 0) ? (n / 60) + '分' : n + 's';
const LIB = (typeof Fig3D !== 'undefined') ? Fig3D.LIB : {};
const fig = (key, size, live) => Fig3D.make(key, size, live);

/* ================= 提示音 ================= */
let actx = null;
function beep(f, d) {
  f = f || 880; d = d || .18;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(.001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.35, actx.currentTime + .03);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + d);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + d);
  } catch (e) { /* 无音频环境则静默 */ }
}

/* ================= 计时器预设 ================= */
const PRESETS_KEY = 'fit-timer-presets';
const DEF_PRESETS = [10, 15, 20, 30, 60, 90, 120];
function getPresets() {
  try { const p = JSON.parse(localStorage.getItem(PRESETS_KEY)); if (Array.isArray(p) && p.length) return p; } catch (e) {}
  return DEF_PRESETS.slice();
}
function savePresets(p) { localStorage.setItem(PRESETS_KEY, JSON.stringify(p)); }

/* ================= 自由计时器（每个动作卡片内一个） ================= */
const freeT = {};   // uid -> {mode, running, remain, total, since, end}
const openFrees = new Set();
const editingFrees = new Set();

function freeTimerTick(now) {
  for (const k in freeT) {
    const t = freeT[k];
    if (!t.running) continue;
    if (t.mode === 'countdown') {
      t.remain = Math.max(0, (t.end - now) / 1000);
      if (now >= t.end) { t.running = false; t.remain = 0; beep(660, .25); }
    } else {
      t.remain = (now - t.since) / 1000;
    }
    const box = $('.freet[data-uid="' + k + '"] #ftTime');
    if (box) box.textContent = fmtTime(t.mode === 'stop' ? t.remain : t.remain);
  }
}

/* ================= 组内计时（全屏覆盖层） ================= */
let timerOv = null;   // {ex, setIdx, phase, total, remain, end}
let chooseN = 0, chooseLo = 0, chooseHi = 0;

function showTimerOv() {
  if (!$('#timerOvRoot')) {
    const n = el('div', 'timerov', '<div class="tov-inner" id="tovInner"></div>');
    n.id = 'timerOvRoot';
    document.body.appendChild(n);
  }
}
function closeTimerOv() {
  const n = $('#timerOvRoot'); if (n) n.remove();
  timerOv = null; ensureTick();
}
function buildTov() {
  const ex = timerOv.ex, si = timerOv.setIdx;
  const title = esc(ex.name) + ' · 第' + (si + 1) + '组 <span style="color:var(--dim);font-size:13px">/ 共' + ex.sets + '组</span>';
  let inner = '';
  if (timerOv.phase === 'choose') {
    inner = '<div class="tov-title">' + title + '</div>' +
      '<div class="tov-phase ph-action">动作倒计时 · 选择时长</div>' +
      '<div class="choose-row"><button id="tovMin">−</button><div class="cval"><b id="tovNum">' + chooseN + '</b><span>秒</span></div><button id="tovPlus">＋</button></div>' +
      '<div class="tov-sub">第' + (si + 1) + '组时长范围 ' + chooseLo + '~' + chooseHi + ' 秒，倒计时结束后自动打卡</div>' +
      '<div class="tov-btns"><button class="bigbtn" id="tovStart">开始这组</button><button class="bigbtn ghost" id="tovCancel">取消</button></div>';
  } else if (timerOv.phase === 'action') {
    inner = '<div class="tov-title">' + title + '</div>' +
      '<div class="tov-phase ph-action">动作倒计时</div>' +
      '<div class="tov-num" id="tovNum">' + fmtTime(timerOv.remain) + '</div>' +
      '<div class="tov-bar"><i id="tovBar"></i></div>' +
      '<div class="tov-btns"><button class="bigbtn ghost" id="tovSkip">跳过</button><button class="bigbtn ghost" id="tovCancel">取消</button></div>';
  } else if (timerOv.phase === 'rest') {
    inner = '<div class="tov-title">' + title + '</div>' +
      '<div class="tov-phase ph-rest">间歇倒计时</div>' +
      '<div class="tov-num" id="tovNum">' + fmtTime(timerOv.remain) + '</div>' +
      '<div class="tov-bar"><i id="tovBar"></i></div>' +
      '<div class="tov-btns"><button class="bigbtn" id="tovDone">提前结束</button><button class="bigbtn ghost" id="tovCancel">取消</button></div>';
  } else if (timerOv.phase === 'reps') {
    inner = '<div class="tov-title">' + title + '</div>' +
      '<div class="tov-phase ph-reps">已打卡 ✓</div>' +
      '<div class="tov-num reps" id="tovNum">本组 ' + esc(ex.num) + (ex.numMax ? '~' + ex.numMax : '') + ' ' + esc(ex.unit) + '</div>' +
      (ex.rest ? '<div class="tov-sub">完成后开始组间休息</div><div class="tov-btns"><button class="bigbtn" id="tovRest">开始间歇 ' + fmtRest(ex.rest) + '</button><button class="bigbtn ghost" id="tovCancel">关闭</button></div>'
               : '<div class="tov-btns"><button class="bigbtn" id="tovCancel">完成</button></div>');
  } else if (timerOv.phase === 'done') {
    inner = '<div class="tov-title">' + title + '</div>' +
      '<div class="tov-phase ph-done">✓ 本组完成</div>' +
      '<div class="tov-num reps" id="tovNum">' + esc(ex.name) + '</div>' +
      '<div class="tov-sub">已完成第 ' + (si + 1) + ' 组，点击下一组继续</div>' +
      '<div class="tov-btns"><button class="bigbtn" id="tovCancel">好</button></div>';
  }
  $('#tovInner').innerHTML = inner;
}
function updateTovNumbers() {
  const n = $('#tovNum'); if (n && timerOv.phase !== 'choose') n.textContent = fmtTime(timerOv.remain);
  const b = $('#tovBar'); if (b) b.style.width = Math.round((1 - timerOv.remain / timerOv.total) * 100) + '%';
}

function startActionTimer(ex, setIdx, sec) {
  timerOv = { ex, setIdx, phase: 'action', total: sec, remain: sec, end: Date.now() + sec * 1000 };
  showTimerOv(); buildTov(); wireTov(); ensureTick();
}
function startRestTimer(ex, setIdx, sec) {
  timerOv = { ex, setIdx, phase: 'rest', total: sec, remain: sec, end: Date.now() + sec * 1000 };
  buildTov(); wireTov(); ensureTick();
}
function startChooseTimer(ex, setIdx, lo, hi) {
  chooseLo = lo; chooseHi = hi; chooseN = lo;
  timerOv = { ex, setIdx, phase: 'choose', total: hi, remain: hi, end: 0 };
  showTimerOv(); buildTov(); wireTov();
}
function startRepsBox(ex, setIdx) {
  timerOv = { ex, setIdx, phase: 'reps', total: 0, remain: 0, end: 0 };
  showTimerOv(); buildTov(); wireTov();
}

function wireTov() {
  const g = id => $('#tovInner').querySelector(id);
  const c = g('#tovCancel'); if (c) c.addEventListener('click', closeTimerOv);
  const s = g('#tovStart'); if (s) s.addEventListener('click', () => { startActionTimer(timerOv.ex, timerOv.setIdx, chooseN); });
  const m = g('#tovMin'); if (m) m.addEventListener('click', () => { if (chooseN > chooseLo) chooseN--; g('#tovNum').textContent = chooseN; });
  const p = g('#tovPlus'); if (p) p.addEventListener('click', () => { if (chooseN < chooseHi) chooseN++; g('#tovNum').textContent = chooseN; });
  const sk = g('#tovSkip'); if (sk) sk.addEventListener('click', () => timerPhaseDone());
  const dn = g('#tovDone'); if (dn) dn.addEventListener('click', () => { beep(); timerOv = { ex: timerOv.ex, setIdx: timerOv.setIdx, phase: 'done', total: 1, remain: 0, end: 0 }; buildTov(); wireTov(); });
  const r = g('#tovRest'); if (r) r.addEventListener('click', () => startRestTimer(timerOv.ex, timerOv.setIdx, timerOv.ex.rest));
}

function timerPhaseDone() {
  if (!timerOv) return;
  const { ex, setIdx, phase } = timerOv;
  if (phase === 'action') {
    const arr = getLogArr(ex.uid, ex.sets);
    if (!arr[setIdx]) { arr[setIdx] = true; save(); }
    renderDay(); renderHome(); refreshSheetDots(ex);
    beep(980, .25);
    if (ex.rest > 0) { startRestTimer(ex, setIdx, ex.rest); }
    else { timerOv = { ex, setIdx, phase: 'done', total: 1, remain: 0, end: 0 }; buildTov(); wireTov(); }
  } else if (phase === 'rest') {
    beep(660, .3); beep(880, .3);
    timerOv = { ex, setIdx, phase: 'done', total: 1, remain: 0, end: 0 }; buildTov(); wireTov();
  }
}

/* ================= 全局计时 tick ================= */
let timerInt = null;
function haveTimers() { return !!timerOv || Object.values(freeT).some(t => t.running); }
function ensureTick() {
  if (!timerInt && haveTimers()) timerInt = setInterval(() => {
    const now = Date.now();
    if (timerOv) {
      if (timerOv.phase === 'action' || timerOv.phase === 'rest') {
        timerOv.remain = Math.max(0, (timerOv.end - now) / 1000);
        if (timerOv.remain <= 0) timerPhaseDone();
        else updateTovNumbers();
      }
    }
    freeTimerTick(now);
    if (!haveTimers() && !timerOv) { clearInterval(timerInt); timerInt = null; }
  }, 200);
}

/* 打卡状态变化后，同步刷新详情弹层里的打卡圆点 */
function refreshSheetDots(ex) {
  if (!sheet.classList.contains('open')) return;
  const arr = getLogArr(ex.uid, ex.sets);
  sheet.querySelectorAll('.bigdot').forEach(d => d.classList.toggle('on', !!arr[+d.dataset.si]));
}

/* ================= 打卡流程 ================= */
function onSetTap(ex, setIdx) {
  const arr = getLogArr(ex.uid, ex.sets);
  if (arr[setIdx]) { arr[setIdx] = false; save(); renderDay(); renderHome(); refreshSheetDots(ex); return; }
  const timeBased = ex.unit === '秒' || ex.unit === '分钟' || ex.unit === '小时';
  if (timeBased) {
    const lo = toSec(ex.num, ex.unit), hi = ex.numMax ? toSec(ex.numMax, ex.unit) : lo;
    if (hi > lo) startChooseTimer(ex, setIdx, lo, hi);
    else startActionTimer(ex, setIdx, lo);
  } else {
    if (!arr[setIdx]) { arr[setIdx] = true; save(); }
    renderDay(); renderHome(); refreshSheetDots(ex);
    startRepsBox(ex, setIdx);
  }
}

/* ================= 数据结构 ================= */
const DAYTYPES = {
  strength: { label: '力量', cls: 'tp-strength' },
  speed: { label: '速度', cls: 'tp-speed' },
  recovery: { label: '主动恢复', cls: 'tp-recovery' },
  rest: { label: '休息', cls: 'tp-rest' },
};

const RECOVERY_ITEMS = [
  { uid: 'rc1', name: '泡沫轴滚动', desc: '针对训练部位滚动，遇到酸痛点停留 20~30 秒' },
  { uid: 'rc2', name: '动态拉伸流程', desc: '完成热身流程 8 个动作，充分活动关节', link: 'warmup' },
  { uid: 'rc3', name: '低强度有氧 20~30 分钟', desc: '快走 / 慢跑 / 慢速骑行三选一，以能轻松聊天的强度进行' },
  { uid: 'rc4', name: '饮食：略减碳水', desc: '足量蛋白质与蔬菜' },
  { uid: 'rc5', name: '作息：提前入睡', desc: '比平时多睡一小时' },
  { uid: 'rc6', name: '呼吸 / 冥想 10 分钟', desc: '午后在安静处专注呼吸或听冥想音频，帮助神经系统降频' },
];

const WARMUP_KEYS = ['wristrock', 'catcow', 'hkneelrot', 'butterfly', 'hip9090', 'rot9090', 'hamstretch', 'sofastretch'];

/* ================= 默认计划 ================= */
function ex(lib, o) {
  const L = LIB[lib] || { name: '自定义', cat: '自定义', desc: '' };
  return Object.assign({ uid: uid(), lib, name: L.name, sets: 3, num: 10, numMax: 0, unit: '个',
    note: '', rest: 0, load: '', goal: '', perSide: false, alt: null }, o || {});
}
function defaultPlan() {
  const rest = type => ({ type, ex: [] });
  return [
    { type: 'strength', ex: [
      ex('backsquat', { sets: 4, setsMax: 5, num: 1, numMax: 5, rest: 150, load: '中等偏重（先热身）', goal: '下肢基础力量' }),
      ex('press', { sets: 4, num: 3, numMax: 5, rest: 120, load: '中等重量', goal: '肩部 / 上肢推力', alt: { lib: 'bench', name: '卧推' } }),
      ex('rdl', { sets: 3, setsMax: 4, num: 8, numMax: 10, rest: 90, load: '中等重量', goal: '后侧链，重点臀肌' }),
      ex('oaplank', { sets: 3, num: 10, note: '两边交替，新手单臂平板；进阶平板哑铃划船', rest: 60, load: '自重 / 哑铃', goal: '核心抗旋转', alt: { lib: 'prow', name: '平板哑铃划船' } }),
      ex('invrow', { sets: 3, num: 8, numMax: 10, rest: 90, load: '自重', goal: '上背部肌群' }),
      ex('slrdl', { sets: 3, num: 6, numMax: 10, perSide: true, rest: 60, load: '轻~中等', goal: '平衡双腿力量' }),
    ] },
    { type: 'speed', ex: [
      ex('clean', { sets: 4, num: 1, numMax: 5, rest: 120, note: '有举重基础做高翻；新手做负重蹲跳5次。质量优先，动作变形立即降组', goal: '下肢爆发力', alt: { lib: 'jsquat', name: '负重蹲跳' } }),
      ex('clappu', { sets: 3, num: 6, numMax: 8, rest: 90, goal: '上肢爆发力' }),
      ex('kbswing', { sets: 3, num: 12, numMax: 15, rest: 90, load: '4~6kg起步', goal: '髋主导爆发力' }),
      ex('sideplank', { sets: 3, num: 30, numMax: 45, unit: '秒', perSide: true, rest: 60, goal: '体侧核心' }),
      ex('deadbug', { sets: 3, num: 30, numMax: 45, unit: '秒', rest: 60, goal: '核心稳定' }),
      ex('bulgarian', { sets: 3, num: 45, numMax: 60, unit: '秒', perSide: true, rest: 60, goal: '单腿稳定' }),
    ] },
    rest('recovery'),
    { type: 'strength', ex: [
      ex('dl', { sets: 4, num: 3, numMax: 5, rest: 150, load: '中等偏重（轻重量热身）', goal: '后侧链力量、髋发力模式' }),
      ex('pullup', { sets: 4, num: 5, rest: 120, load: '自重或轻负重', goal: '上肢拉力、背部肌群' }),
      ex('frontsquat', { sets: 3, setsMax: 4, num: 4, numMax: 6, rest: 105, load: '中等重量', goal: '下肢力量、躯干刚性' }),
      ex('dbbench', { sets: 3, num: 10, note: '左右交替，共10次', rest: 90, load: '中等重量', goal: '单侧上肢推、躯干稳定' }),
      ex('gobletlunge', { sets: 3, num: 12, numMax: 16, note: '共12~16次', rest: 90, load: '轻~中等', goal: '侧向发力、单腿控制' }),
      ex('bandanti', { sets: 3, num: 30, unit: '秒', perSide: true, rest: 60, load: '中等负荷', goal: '核心抗旋转' }),
    ] },
    { type: 'speed', ex: [
      ex('boxjump', { sets: 4, num: 5, rest: 120, note: '跳箱5次；或悬垂高翻1~5次。重量以动作质量优先', goal: '下肢爆发力、神经协调', alt: { lib: 'hangclean', name: '悬垂高翻' } }),
      ex('lateralhop', { sets: 4, num: 10, note: '每边10个来回', perSide: true, rest: 90, goal: '侧向爆发力、足踝稳定' }),
      ex('quickfeet', { sets: 4, num: 10, numMax: 15, unit: '秒', rest: 60, goal: '下肢敏捷、脚下移动' }),
      ex('copenhagen', { sets: 3, num: 20, numMax: 30, unit: '秒', perSide: true, rest: 60, note: '新手自重，进阶髋部加轻杠铃片', goal: '髋内收肌群、侧向稳定' }),
      ex('farmerwalk', { sets: 3, num: 20, unit: '米', note: '农夫行走20米来回；或半蹲侧向移动15步来回', rest: 90, load: '中等重量', goal: '躯干核心稳定', alt: { lib: 'shuffle', name: '半蹲侧向移动' } }),
    ] },
    rest('recovery'),
    rest('rest'),
  ];
}

/* ================= 存储 ================= */
const KEY = 'fitplan-v2';
let state = load();
pruneLog();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.plan) && s.plan.length === 7) return { plan: s.plan, log: s.log || {} };
  } catch (e) {}
  return { plan: defaultPlan(), log: {} };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('保存失败：存储空间不足'); } }
function pruneLog() {
  const cutoff = Date.now() - 120 * 864e5;
  for (const d in state.log) {
    const t = Date.parse(d);
    if (isNaN(t) || t < cutoff) delete state.log[d];
  }
}
function getLogArr(key, sets) {
  const day = state.log[todayStr()] || (state.log[todayStr()] = {});
  if (!Array.isArray(day[key]) || day[key].length !== sets) day[key] = new Array(sets).fill(false);
  return day[key];
}
function toggle(key, sets, i) { const arr = getLogArr(key, sets); arr[i] = !arr[i]; save(); }
function isDone(key, sets) { return sets > 0 && getLogArr(key, sets).every(Boolean); }
function warmupDone() { return WARMUP_KEYS.filter(k => isDone('warm-' + k, 1)).length; }
function recoveryDone() { return RECOVERY_ITEMS.filter(it => isDone(it.uid, 1)).length; }

/* ================= 界面 ================= */
const app = $('#app');
app.innerHTML =
  '<div id="home" class="screen"></div>' +
  '<div id="day" class="screen dayview"><div class="day-inner"></div></div>' +
  '<div id="tipbar" class="tipbar" style="display:none"></div>';

/* ---------- 首页 ---------- */
function renderHome() {
  const home = $('#home');
  const ti = todayIdx();
  const tdy = state.plan[ti], date = new Date();
  const dayEx = tdy.ex || [];
  const doneEx = dayEx.filter(e => isDone(e.uid, e.sets)).length;
  const counts = { strength: 0, speed: 0, recovery: 0, rest: 0 };
  state.plan.forEach(d => counts[d.type || (d.ex && d.ex.length ? 'strength' : 'rest')]++);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const showTip = !isStandalone && /iP(hone|ad|od)/.test(navigator.userAgent) && !sessionStorage.getItem('tipClosed');

  let weekHtml = '';
  for (let i = 0; i < 7; i++) {
    const day = state.plan[i];
    const tp = DAYTYPES[day.type || (day.ex && day.ex.length ? 'strength' : 'rest')];
    const cats = [...new Set(day.ex.map(e => LIB[e.lib] ? LIB[e.lib].cat : '自定义'))];
    const isToday = i === ti;
    let right;
    if (day.type === 'rest' || (!day.ex.length && day.type !== 'recovery')) right = '<span class="rest-tag">休息</span>';
    else if (day.type === 'recovery') right = '<span class="daycount">恢复清单 6 项</span>';
    else right = '<span class="daycount">' + day.ex.length + ' 个动作</span>';
    weekHtml +=
      '<div class="dayrow' + (isToday ? ' today' : '') + '" data-i="' + i + '">' +
        '<span class="typechip ' + tp.cls + '">' + tp.label + '</span>' +
        '<div class="dayname">' + DAY_NAMES[i] + (isToday ? '<em>今天</em>' : '') + '</div>' +
        '<div class="daymid">' + right + (cats.length && day.ex.length ? '<span class="cattags">' + cats.map(c => '<i>' + esc(c) + '</i>').join('') + '</span>' : '') + '</div>' +
        '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>' +
      '</div>';
  }

  let todayCard;
  if (day.type === 'recovery') {
    todayCard = '<div class="todaycard rec"><div class="tc-top"><span>主动恢复日 · ' + DAY_NAMES[ti] + '</span><span class="tc-num">' + recoveryDone() + '/6</span></div>' +
      '<div class="bar"><div class="bar-in" style="width:' + Math.round(recoveryDone() / 6 * 100) + '%"></div></div>' +
      '<div class="tc-list">' + RECOVERY_ITEMS.map(it => '<span class="tc-ex' + (isDone(it.uid, 1) ? ' done' : '') + '">' + esc(it.name.split('：')[0].split(' ')[0]) + '</span>').join('') + '</div></div>';
  } else if (!dayEx.length) {
    todayCard = '<div class="todaycard rest">今天完全休息，好好恢复 💤</div>';
  } else {
    todayCard = '<div class="todaycard"><div class="tc-top"><span>今日训练 · ' + DAYTYPES[day.type || 'strength'].label + '</span><span class="tc-num">' + doneEx + '/' + dayEx.length + '</span></div>' +
      '<div class="bar"><div class="bar-in" style="width:' + (dayEx.length ? Math.round(doneEx / dayEx.length * 100) : 0) + '%"></div></div>' +
      '<div class="tc-list">' + dayEx.map(e => '<span class="tc-ex' + (isDone(e.uid, e.sets) ? ' done' : '') + '">' + esc(e.name) + '</span>').join('') + '</div></div>';
  }

  home.innerHTML =
    '<div class="topbar"><div><h1>健身周计划</h1><div class="sub">' + (date.getMonth() + 1) + '月' + date.getDate() + '日 · ' + DAY_NAMES[ti] + ' · ' + counts.strength + '力量 ' + counts.speed + '速度 ' + counts.recovery + '恢复</div></div>' +
    '<button class="iconbtn" id="btnSettings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.3 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4z" fill="none"/></svg></button></div>' +
    todayCard +
    '<details class="ideacard"><summary>训练理念：合理 · 规律 · 全面</summary>' +
      '<p><b>重动作而非极限重量</b>普通训练者应关注动作模式标准、肌肉参与正确、关节灵活性，让身体更可控更协调。</p>' +
      '<p><b>规律训练稳下限</b>优先保证每周规律完成高质量训练，持续激活神经和肌肉，筑牢运动表现的下限。</p>' +
      '<p><b>全面训练防伤病</b>先追求能力全面，再强化单项。伤病发生率由能力下限的宽度决定，而非上限高度。</p></details>' +
    '<div class="sec-title">本周安排</div>' +
    '<div class="weeklist">' + weekHtml + '</div>';

  home.querySelectorAll('.dayrow').forEach(r => r.addEventListener('click', () => openDay(+r.dataset.i)));
  $('#btnSettings').addEventListener('click', openSettings);

  const tip = $('#tipbar');
  if (showTip) {
    tip.style.display = '';
    tip.innerHTML = '📲 想全屏使用？在 Safari 底部分享按钮里选「添加到主屏幕」<b id="tipClose">知道了</b>';
    tip.querySelector('#tipClose').addEventListener('click', () => { sessionStorage.setItem('tipClosed', '1'); tip.style.display = 'none'; });
  } else tip.style.display = 'none';
}

/* ---------- 日视图 ---------- */
let curDay = 0;
function openDay(i) { curDay = i; openFrees.clear(); renderDay(); $('#day').classList.add('open'); }
function closeDay() { $('#day').classList.remove('open'); }

function exMeta(e) {
  let s = (e.setsMax ? e.sets + '~' + e.setsMax : e.sets) + ' 组 × ';
  s += e.perSide ? '每边 ' : '';
  s += (e.numMax ? e.num + '~' + e.numMax : e.num) + ' ' + e.unit;
  if (e.rest) s += ' · 间歇 ' + fmtRest(e.rest);
  return s;
}

/* ---------- 长按拖拽排序动作 ---------- */
let suppressClick = false;
function initRowSort(listEl, day) {
  let drag = null, pressTimer = null;

  function onMove(e) {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    drag.row.style.transform = 'translateY(' + dy + 'px) scale(1.02)';
    const c = drag.rects[drag.s].top + drag.dragH / 2 + dy;
    let t = drag.s;
    drag.wraps.forEach((w, i) => {
      if (i === drag.s) return;
      const ci = drag.rects[i].top + drag.rects[i].height / 2;
      if (i > drag.s && c > ci) t++;
      if (i < drag.s && c < ci) t--;
    });
    t = Math.max(0, Math.min(drag.wraps.length - 1, t));
    if (t !== drag.t) {
      drag.t = t;
      const { s, wraps, dragH, gap } = drag;
      wraps.forEach((w, i) => {
        if (i === s) return;
        let sh = 0;
        if (s < i && i <= t) sh = -(dragH + gap);
        else if (t <= i && i < s) sh = (dragH + gap);
        w.style.transform = sh ? 'translateY(' + sh + 'px)' : '';
      });
    }
  }

  function finish(e, commit) {
    if (!drag) return;
    const d = drag; drag = null;
    document.removeEventListener('touchmove', d.blocker);
    d.row.removeEventListener('pointermove', onMove);
    d.row.removeEventListener('pointerup', onUp);
    d.row.removeEventListener('pointercancel', onCancel);
    const t = commit ? d.t : d.s;
    let slot = d.rects[d.s].top;
    if (t > d.s) for (let i = d.s + 1; i <= t; i++) slot += d.rects[i].height + d.gap;
    else if (t < d.s) for (let i = d.s; i > t; i--) slot -= d.rects[i].height + d.gap;
    d.row.style.transition = 'transform .18s ease';
    d.row.style.transform = 'translateY(' + Math.round(slot - d.rects[d.s].top) + 'px) scale(1)';
    setTimeout(() => {
      d.wraps.forEach(w => { w.style.transform = ''; w.style.transition = ''; w.classList.remove('dragging'); });
      listEl.classList.remove('sorting');
      if (t !== d.s) {
        const arr = state.plan[curDay].ex;
        const [moved] = arr.splice(d.s, 1);
        arr.splice(t, 0, moved);
        save();
        toast('「' + moved.name + '」已移到第 ' + (t + 1) + ' 位');
      }
      renderDay(); renderHome();
    }, 190);
  }
  function onUp(e) { finish(e, true); }
  function onCancel() { finish(null, false); }

  listEl.addEventListener('pointerdown', e => {
    if (drag) return;
    if (e.target.closest('.dot, .tbtn, .altchip, .freet, button')) return;
    const row = e.target.closest('.exwrap');
    if (!row || day.ex.length < 2) return;
    const s = +row.dataset.idx;
    const x0 = e.clientX, y0 = e.clientY;
    let alive = true;
    const mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 12) cancel(); };
    const pu = () => cancel();
    const cancel = () => {
      alive = false;
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', pu);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', pu);
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', pu);
      if (!alive || drag) return;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 450);
      const wraps = Array.from(listEl.querySelectorAll('.exwrap'));
      const rects = wraps.map(w => w.getBoundingClientRect());
      let gap = 8;
      for (let i = 1; i < rects.length; i++) { const g = rects[i].top - rects[i - 1].bottom; if (g > 0 && g < 40 && g < gap) gap = g; }
      drag = { row, wraps, rects, s, t: s, dragH: rects[s].height, gap, y0: e.clientY };
      drag.blocker = ev => ev.preventDefault();
      document.addEventListener('touchmove', drag.blocker, { passive: false });
      listEl.classList.add('sorting');
      row.classList.add('dragging');
      row.style.transform = 'translateY(0px) scale(1.02)';
      try { row.setPointerCapture(e.pointerId); } catch (err) {}
      row.addEventListener('pointermove', onMove);
      row.addEventListener('pointerup', onUp);
      row.addEventListener('pointercancel', onCancel);
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) {} }
    }, 380);
  });
}

function renderDay() {
  const wrap = $('#day .day-inner');
  const day = state.plan[curDay];
  const type = day.type || (day.ex.length ? 'strength' : 'rest');
  const date = new Date();

  let body = '';
  if (type === 'recovery') {
    body =
      '<div class="recnote">不去健身房，主动做恢复：促进血液循环、降低神经兴奋、释放肌肉紧张点、维护关节活动度。</div>' +
      '<div class="progcard"><div class="tc-top"><span>今日恢复 · ' + (date.getMonth() + 1) + '月' + date.getDate() + '日</span><span class="tc-num">' + recoveryDone() + '/' + RECOVERY_ITEMS.length + '</span></div>' +
      '<div class="bar"><div class="bar-in" style="width:' + Math.round(recoveryDone() / RECOVERY_ITEMS.length * 100) + '%"></div></div></div>' +
      '<div class="checklist">' + RECOVERY_ITEMS.map((it, i) =>
        '<div class="checkrow" data-rc="' + i + '"><i class="dot big' + (isDone(it.uid, 1) ? ' on' : '') + '"></i>' +
        '<div><div class="libname">' + esc(it.name) + (it.link ? ' <span class="linktag">查看流程 →</span>' : '') + '</div><div class="sub">' + esc(it.desc) + '</div></div></div>').join('') + '</div>';
  } else if (!day.ex.length) {
    body = '<div class="emptyday"><div class="dim" style="font-size:44px">😴</div><p>完全休息日</p><p class="dim">休息也是训练的一部分</p></div>';
  } else {
    let listHtml = '';
    day.ex.forEach((e, idx) => {
      const arr = getLogArr(e.uid, e.sets);
      const done = arr.filter(Boolean).length;
      const lib = LIB[e.lib];
      const running = freeT[e.uid] && freeT[e.uid].running;
      listHtml +=
        '<div class="exwrap' + (openFrees.has(e.uid) || running ? ' open' : '') + '" data-idx="' + idx + '">' +
          '<div class="exrow">' +
            '<div class="figbox" data-fig="' + esc(e.lib || 'custom') + '"></div>' +
            '<div class="exinfo">' +
              '<div class="exname">' + esc(e.name) + (lib ? '<span class="catchip">' + esc(lib.cat) + '</span>' : '') + (e.goal ? '<span class="goalchip">' + esc(e.goal) + '</span>' : '') + '</div>' +
              '<div class="exmeta">' + exMeta(e) + '</div>' +
              (e.note ? '<div class="exnote">' + esc(e.note) + '</div>' : '') +
              '<div class="exfoot">' +
                (e.load ? '<span class="loadtag">负重 ' + esc(e.load) + '</span>' : '') +
                (e.alt ? '<span class="altchip" data-alt="1">或 ' + esc(e.alt.name) + ' ⇄</span>' : '') +
                '<span class="dots">' + arr.map((d, si) => '<i class="dot' + (d ? ' on' : '') + '" data-si="' + si + '"></i>').join('') + '</span>' +
                '<button class="tbtn' + (running ? ' on' : '') + '" data-tog="' + esc(e.uid) + '">⏱' + (running ? ' ' + fmtTime(freeT[e.uid].mode === 'stop' ? freeT[e.uid].remain : freeT[e.uid].remain) : '') + '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="freet" data-uid="' + esc(e.uid) + '"></div>' +
        '</div>';
    });
    const wd = warmupDone();
    body =
      '<div class="warmcard' + (wd >= WARMUP_KEYS.length ? ' alldone' : '') + '" id="warmCard">' +
        '<span class="warmicon">🔥</span><div class="warmmid"><b>热身 · 动态拉伸</b><span>训练前必做 · 8 个动作 · 约 10 分钟</span></div>' +
        '<span class="tc-num">' + wd + '/' + WARMUP_KEYS.length + '</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>' +
      '<div class="progcard"><div class="tc-top"><span>今日完成 · ' + date.getMonth() + 1 + '月' + date.getDate() + '日</span><span class="tc-num">' + day.ex.filter(e => isDone(e.uid, e.sets)).length + '/' + day.ex.length + '</span></div>' +
      '<div class="bar"><div class="bar-in" style="width:' + Math.round(day.ex.filter(e => isDone(e.uid, e.sets)).length / day.ex.length * 100) + '%"></div></div></div>' +
      '<div class="exlist">' + listHtml + '</div>';
  }

  wrap.innerHTML =
    '<div class="topbar"><button class="iconbtn" id="btnBack"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>' +
    '<div><h1>' + DAY_NAMES[curDay] + '</h1><div class="sub">' + DAYTYPES[type].label + ' · ' + (day.ex.length ? day.ex.length + ' 个动作' : type === 'recovery' ? '恢复清单' : '休息日') + (curDay === todayIdx() ? ' · 今天' : '') + '</div></div>' +
    (type === 'strength' || type === 'speed' ? '<button class="iconbtn" id="btnAdd"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>' : '') + '</div>' +
    body +
    ((type === 'strength' || type === 'speed') ? '<div class="addbtn-wrap"><button class="bigbtn" id="btnAdd2">＋ 添加动作</button></div>' : '');

  wrap.querySelectorAll('.figbox').forEach(b => b.appendChild(fig(b.dataset.fig, 68, true)));
  $('#btnBack').addEventListener('click', closeDay);
  const add = () => openLibrary();
  if ($('#btnAdd')) $('#btnAdd').addEventListener('click', add);
  if ($('#btnAdd2')) $('#btnAdd2').addEventListener('click', add);
  if ($('#warmCard')) $('#warmCard').addEventListener('click', openWarmup);

  wrap.querySelectorAll('.checkrow').forEach(r => {
    r.addEventListener('click', ev => {
      if (ev.target.closest('.linktag')) { openWarmup(); return; }
      const it = RECOVERY_ITEMS[+r.dataset.rc];
      toggle(it.uid, 1, 0);
      renderDay(); renderHome();
    });
  });

  wrap.querySelectorAll('.exwrap').forEach(w => {
    const idx = +w.dataset.idx;
    const e = day.ex[idx];
    const row = w.querySelector('.exrow');
    row.addEventListener('click', ev => {
      if (suppressClick) { suppressClick = false; return; }
      if (ev.target.closest('.dot')) return;
      if (ev.target.closest('.altchip')) { swapAlt(idx); return; }
      if (ev.target.closest('.tbtn')) { toggleFreePanel(e.uid); return; }
      openDetail(idx);
    });
    w.querySelectorAll('.dot').forEach(d => d.addEventListener('click', ev => {
      ev.stopPropagation();
      onSetTap(e, +d.dataset.si);
    }));
  });

  const listEl = wrap.querySelector('.exlist');
  if (listEl) initRowSort(listEl, day);

  // 重新展开正在运行或用户已展开的自由计时器
  day.ex.forEach(e => {
    if (openFrees.has(e.uid) || (freeT[e.uid] && freeT[e.uid].running)) renderFreePanel(e.uid);
  });
}

function swapAlt(idx) {
  const e = state.plan[curDay].ex[idx];
  if (!e.alt) return;
  const old = { lib: e.lib, name: e.name };
  e.lib = e.alt.lib; e.name = e.alt.name;
  e.alt = old;
  save(); renderDay(); renderHome();
  toast('已切换为「' + e.name + '」');
}

/* ---------- 自由计时器面板 ---------- */
function renderFreePanel(k) {
  const box = $('.freet[data-uid="' + k + '"]');
  if (!box) return;
  const t = freeT[k] || (freeT[k] = { mode: 'countdown', running: false, remain: 30, total: 30 });
  const presets = getPresets();
  const editing = editingFrees.has(k);
  const sel = t.mode === 'countdown' ? Math.round(t.total || 30) : 0;
  const shown = t.running ? t.remain : (t.mode === 'countdown' ? (t.total || 30) : (t.remain || 0));
  box.innerHTML =
    '<div class="ft-head"><div class="seg tiny" id="ftMode">' +
      '<button data-m="countdown" class="' + (t.mode === 'countdown' ? 'on' : '') + '">倒计时</button>' +
      '<button data-m="stop" class="' + (t.mode === 'stop' ? 'on' : '') + '">计时器</button></div>' +
      '<button class="tbtn sm" id="ftEdit">' + (editing ? '完成' : '编辑预设') + '</button></div>' +
    (t.mode === 'countdown' ?
      '<div class="presets">' +
        presets.map(p => '<span class="pchip' + (sel === p ? ' on' : '') + '" data-p="' + p + '">' + fmtPre(p) + (editing ? '<b class="px" data-del="' + p + '">×</b>' : '') + '</span>').join('') +
        (editing ? '<span class="padd"><input id="ftCustom" type="number" min="1" max="3600" inputmode="numeric" placeholder="秒数"><button class="tbtn sm on" id="ftAdd">＋</button></span>'
                 : '<span class="pchip padd" id="ftCustomChip">＋ 自定义</span>') +
      '</div>' : '') +
    '<div class="ft-time" id="ftTime">' + fmtTime(shown) + '</div>' +
    '<div class="ft-btns"><button class="bigbtn slimbtn" id="ftGo">' + (t.running ? '暂停' : '开始') + '</button>' +
    '<button class="bigbtn ghost slimbtn" id="ftReset">重置</button></div>';

  const on = id => box.querySelector(id);
  on('#ftMode').addEventListener('click', ev => {
    const m = ev.target.dataset.m; if (!m) return;
    if (t.running) return;
    t.mode = m;
    if (m === 'stop') t.remain = 0;
    else { if (!t.total) t.total = 30; t.remain = t.total; }
    renderFreePanel(k);
  });
  on('#ftEdit').addEventListener('click', () => { editingFrees.has(k) ? editingFrees.delete(k) : editingFrees.add(k); renderFreePanel(k); });
  on('#ftGo').addEventListener('click', () => {
    if (t.running) {
      if (t.mode === 'countdown') { t.remain = Math.max(0, (t.end - Date.now()) / 1000); }
      else { t.remain = (Date.now() - t.since) / 1000; }
      t.running = false;
    } else {
      if (t.mode === 'countdown') { t.total = t.total || 30; t.remain = t.total; t.end = Date.now() + t.remain * 1000; }
      else { t.since = Date.now(); t.remain = 0; }
      t.running = true;
    }
    ensureTick(); renderFreePanel(k); refreshTbtn(k);
  });
  on('#ftReset').addEventListener('click', () => {
    t.running = false; t.remain = t.mode === 'countdown' ? (t.total || 30) : 0;
    renderFreePanel(k); refreshTbtn(k);
  });
  box.querySelectorAll('.pchip[data-p]').forEach(c => c.addEventListener('click', ev => {
    if (ev.target.closest('.px')) return;
    if (t.running) return;
    t.total = +c.dataset.p; t.remain = t.total;
    renderFreePanel(k);
  }));
  box.querySelectorAll('.px').forEach(x => x.addEventListener('click', ev => {
    ev.stopPropagation();
    const v = +x.dataset.del;
    savePresets(getPresets().filter(p => p !== v));
    if (Math.round(t.total) === v) t.total = 30;
    renderFreePanel(k);
  }));
  const cc = on('#ftCustomChip'); if (cc) cc.addEventListener('click', () => { editingFrees.add(k); renderFreePanel(k); });
  const ad = on('#ftAdd'); if (ad) ad.addEventListener('click', () => {
    const inp = on('#ftCustom'); const v = parseInt(inp && inp.value, 10);
    if (!v || v < 1) { toast('请输入秒数'); return; }
    const ps = getPresets(); if (!ps.includes(v)) { ps.push(v); ps.sort((a, b) => a - b); savePresets(ps); }
    t.total = v; t.remain = v; editingFrees.delete(k);
    renderFreePanel(k); toast('已添加 ' + fmtPre(v));
  });
}
function toggleFreePanel(k) {
  if (openFrees.has(k)) openFrees.delete(k);
  else { openFrees.add(k); renderFreePanel(k); }
  const w = $('.freet[data-uid="' + k + '"]');
  if (w) w.closest('.exwrap').classList.toggle('open', openFrees.has(k));
}
function refreshTbtn(k) {
  const btns = document.querySelectorAll('.tbtn[data-tog="' + k + '"]');
  const t = freeT[k];
  btns.forEach(b => {
    b.classList.toggle('on', !!(t && t.running));
    b.textContent = '⏱' + (t && t.running ? ' ' + fmtTime(t.mode === 'stop' ? t.remain : t.remain) : '');
  });
}

/* ---------- 热身流程 ---------- */
function openWarmup() {
  let html = '<div class="sheet-title">热身 · 动态拉伸</div>' +
    '<p class="desc">每次训练前完成，约 10 分钟；也可在恢复日做。作用：提升关节活动范围、增强肌肉弹性、预防损伤。</p>' +
    '<div class="progcard slim"><div class="tc-top"><span>今日热身完成</span><span class="tc-num">' + warmupDone() + '/' + WARMUP_KEYS.length + '</span></div>' +
    '<div class="bar"><div class="bar-in" style="width:' + Math.round(warmupDone() / WARMUP_KEYS.length * 100) + '%"></div></div></div>' +
    '<div class="warmlist">';
  WARMUP_KEYS.forEach(k => {
    const x = LIB[k]; if (!x) return;
    const on = isDone('warm-' + k, 1);
    html += '<div class="warmrow' + (on ? ' done' : '') + '" data-k="' + k + '">' +
      '<div class="figbox sm" data-fig="' + k + '"></div>' +
      '<div class="wm"><div class="libname">' + esc(x.name) + '<span class="catchip">' + esc(x.cat) + '</span></div><div class="sub">' + esc(x.desc) + '</div></div>' +
      '<i class="dot big' + (on ? ' on' : '') + '"></i></div>';
  });
  html += '</div><p class="dim small">注：原视频共 9 个动作，第 9 个待回看视频补充。</p>';
  openSheet(html);
  sheet.querySelectorAll('.figbox').forEach(b => b.appendChild(fig(b.dataset.fig, 54, false)));
  sheet.querySelectorAll('.warmrow').forEach(r => r.addEventListener('click', () => {
    toggle('warm-' + r.dataset.k, 1, 0);
    openWarmup(); renderDay(); renderHome();
  }));
}

/* ---------- 底部弹层 ---------- */
const mask = $('#mask'), sheet = $('#sheet'), sheetBody = $('#sheetBody');
function openSheet(html) {
  sheetBody.innerHTML = html;
  sheet.classList.add('open'); mask.classList.add('open');
  sheet.scrollTop = 0;
}
function closeSheet() { sheet.classList.remove('open'); mask.classList.remove('open'); }
mask.addEventListener('click', closeSheet);

/* 下滑关闭：拖动顶部把手（指针捕获保证跟手，甩动可关闭） */
(function initSheetDrag() {
  const handle = $('#sheetHandle');
  let d = null;
  handle.addEventListener('pointerdown', e => {
    if (!sheet.classList.contains('open')) return;
    d = { y0: e.clientY, ly: e.clientY, lt: performance.now(), moved: false };
    handle.setPointerCapture(e.pointerId);
    sheet.style.transition = 'none';
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if (!d) return;
    const dy = Math.max(0, e.clientY - d.y0);
    d.ly = e.clientY; d.lt = performance.now();
    if (dy > 4) d.moved = true;
    sheet.style.transform = dy > 0 ? 'translateY(' + dy + 'px)' : '';
  });
  handle.addEventListener('pointerup', e => {
    if (!d) return;
    const dy = Math.max(0, e.clientY - d.y0);
    const dt = Math.max(1, performance.now() - d.lt);
    const v = (e.clientY - d.ly) / dt;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 110 || (d.moved && v > .45 && dy > 24)) closeSheet();
    d = null;
  });
  handle.addEventListener('pointercancel', () => {
    d = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
  });
})();

/* ---------- 动作详情 ---------- */
function openDetail(idx) {
  const day = state.plan[curDay];
  const e = day.ex[idx];
  const lib = LIB[e.lib];
  const arr = getLogArr(e.uid, e.sets);
  const bigDots = arr.map((d, si) => '<i class="bigdot' + (d ? ' on' : '') + '" data-si="' + si + '">' + (si + 1) + '</i>').join('');
  openSheet(
    '<div class="sheet-fig" id="detailFig"></div>' +
    '<div class="orbothint">单指拖动小人可旋转视角</div>' +
    '<div class="sheet-head"><div><div class="sheet-title">' + esc(e.name) + '</div>' +
    (lib ? '<div class="sub">' + esc(lib.cat) + (e.goal ? ' · ' + esc(e.goal) : '') + '</div>' : '') + '</div></div>' +
    (lib ? '<p class="desc">' + esc(lib.desc) + '</p>' : '') +
    '<div class="chips">' +
      '<span class="metachip">' + exMeta(e) + '</span>' +
      (e.load ? '<span class="metachip">负重：' + esc(e.load) + '</span>' : '') +
      (e.perSide ? '<span class="metachip">左右两侧分别完成</span>' : '') +
    '</div>' +
    (e.note ? '<div class="notecard"><b>备注</b>' + esc(e.note) + '</div>' : '') +
    (e.alt ? '<div class="altcard">二选一动作，当前为「' + esc(e.name) + '」<button class="bigbtn ghost slimbtn" id="dtAlt">切换为 ' + esc(e.alt.name) + '</button></div>' : '') +
    '<div class="exmeta2">点圆点打卡每一组（时长的动作会自动倒计时）</div>' +
    '<div class="bigdots">' + bigDots + '</div>' +
    '<div class="btnrow"><button class="bigbtn ghost" id="dtEdit">编辑</button><button class="bigbtn danger" id="dtDel">移除</button></div>');
  const cv = fig(e.lib || 'custom', Math.min(300, Math.round(window.innerWidth * .72)), true);
  $('#detailFig').appendChild(cv);
  Fig3D.orbit(cv);
  sheet.querySelectorAll('.bigdot').forEach(d => d.addEventListener('click', () => {
    onSetTap(e, +d.dataset.si);
  }));
  if ($('#dtAlt')) $('#dtAlt').addEventListener('click', () => { swapAlt(idx); openDetail(idx); });
  $('#dtEdit').addEventListener('click', () => openForm(idx));
  $('#dtDel').addEventListener('click', () => {
    if (!confirm('确定从 ' + DAY_NAMES[curDay] + ' 移除「' + e.name + '」？')) return;
    day.ex.splice(idx, 1);
    save(); closeSheet(); renderDay(); renderHome();
  });
}

/* ---------- 动作库 ---------- */
const LIB_ORDER = ['热身', '腿', '后侧链', '胸', '背', '肩', '手臂', '核心', '爆发力', '敏捷', '全身', '恢复', '自定义'];
function openLibrary() {
  const groups = {};
  for (const k in LIB) { if (k === 'idle') continue; const c = LIB[k].cat; (groups[c] = groups[c] || []).push(k); }
  let html = '<div class="sheet-title">选择动作</div><div class="liblist">';
  for (const cat of LIB_ORDER) {
    if (!groups[cat]) continue;
    html += '<div class="libgroup">' + cat + '</div>';
    for (const k of groups[cat]) {
      const x = LIB[k];
      html += '<div class="librow" data-k="' + k + '"><div class="figbox sm" data-fig="' + k + '"></div>' +
        '<div><div class="libname">' + esc(x.name) + '</div><div class="sub">' + esc(x.desc.slice(0, 18)) + (x.desc.length > 18 ? '…' : '') + '</div></div>' +
        '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>';
    }
    delete groups[cat];
  }
  html += '<div class="libgroup">其他</div>';
  for (const c in groups) for (const k of groups[c]) {
    const x = LIB[k];
    html += '<div class="librow" data-k="' + k + '"><div class="figbox sm" data-fig="' + k + '"></div>' +
      '<div><div class="libname">' + esc(x.name) + '</div></div></div>';
  }
  html += '<div class="librow customrow" data-k="custom"><div class="plusfig">＋</div>' +
    '<div><div class="libname">自定义动作</div><div class="sub">输入自己的动作名称</div></div></div></div>';
  openSheet(html);
  sheet.querySelectorAll('.figbox').forEach(b => b.appendChild(fig(b.dataset.fig, 54, false)));
  sheet.querySelectorAll('.librow').forEach(r => r.addEventListener('click', () => {
    const k = r.dataset.k;
    if (k === 'custom') openForm(null, { lib: 'custom', name: '', sets: 3, num: 12, unit: '个' });
    else openForm(null, { lib: k, name: LIB[k].name, sets: 3, num: 12, unit: '个' });
  }));
}

/* ---------- 添加 / 编辑表单 ---------- */
function openForm(editIdx, preset) {
  const day = state.plan[curDay];
  const e = editIdx != null ? day.ex[editIdx] : Object.assign(
    { sets: 3, setsMax: 0, num: 12, numMax: 0, unit: '个', note: '', rest: 0, load: '', goal: '', perSide: false, alt: null }, preset);
  const lib = LIB[e.lib];
  let rest = e.rest || 0;
  let sets = e.sets, num = e.num, unit = e.unit, perSide = !!e.perSide;
  openSheet(
    '<div class="sheet-title">' + (editIdx != null ? '编辑动作' : '添加动作') + '</div>' +
    (lib ? '<div class="sheet-fig sm" id="formFig"></div>' : '') +
    '<label class="flabel">动作名称</label>' +
    '<input id="fName" class="finput" value="' + esc(e.name) + '" maxlength="20" placeholder="例如：保加利亚分腿蹲">' +
    '<label class="flabel">组数 / 每组次数</label>' +
    '<div class="rowline"><div class="stepper"><button id="fSetsDn">−</button><b id="fSetsVal">' + sets + '</b><button id="fSetsUp">＋</button></div>' +
    '<input id="fNum" class="finput num" type="number" inputmode="numeric" min="1" max="999" value="' + num + '">' +
    '<div class="seg" id="fUnit">' + UNITS.map(u => '<button class="' + (u === unit ? 'on' : '') + '" data-u="' + u + '">' + u + '</button>').join('') + '</div></div>' +
    '<div class="rowline note2"><input id="fNumMax" class="finput num" type="number" inputmode="numeric" min="0" max="999" value="' + (e.numMax || '') + '" placeholder="上限（可选）">' +
    '<input id="fSetsMax" class="finput num" type="number" inputmode="numeric" min="0" max="20" value="' + (e.setsMax || '') + '" placeholder="组数上限（可选）">' +
    '<button class="bigbtn ghost slimbtn' + (perSide ? ' on' : '') + '" id="fPerSide">每边分别做</button></div>' +
    '<label class="flabel" id="fRestLabel">组间间歇 ' + (rest ? fmtRest(rest) : '未设置') + '</label>' +
    '<div class="stepper wide"><button id="fRestDn">−</button><b id="fRestVal">' + (rest || '—') + '</b><button id="fRestUp">＋</button></div>' +
    '<label class="flabel">负荷（可选）</label>' +
    '<input id="fLoad" class="finput" value="' + esc(e.load) + '" maxlength="20" placeholder="例如：中等重量 / 8kg壶铃">' +
    '<label class="flabel">训练目标（可选）</label>' +
    '<input id="fGoal" class="finput" value="' + esc(e.goal) + '" maxlength="20" placeholder="例如：下肢爆发力">' +
    '<label class="flabel">备注（可选）</label>' +
    '<textarea id="fNote" class="finput area" rows="2" maxlength="120" placeholder="例如：质量优先，动作变形立即降组">' + esc(e.note) + '</textarea>' +
    '<div class="btnrow"><button class="bigbtn ghost" id="fCancel">取消</button><button class="bigbtn" id="fSave">保存</button></div>' +
    (editIdx != null ? '<div class="btnrow"><button class="bigbtn danger wide" id="fDel">删除此动作</button></div>' : ''));

  if (lib) $('#formFig').appendChild(fig(e.lib, 130, true));
  $('#fSetsDn').addEventListener('click', () => { sets = Math.max(1, sets - 1); $('#fSetsVal').textContent = sets; });
  $('#fSetsUp').addEventListener('click', () => { sets = Math.min(20, sets + 1); $('#fSetsVal').textContent = sets; });
  $('#fRestDn').addEventListener('click', () => { rest = Math.max(0, rest - 15); $('#fRestVal').textContent = rest || '—'; $('#fRestLabel').textContent = '组间间歇 ' + (rest ? fmtRest(rest) : '未设置'); });
  $('#fRestUp').addEventListener('click', () => { rest = Math.min(600, rest + 15); $('#fRestVal').textContent = rest; $('#fRestLabel').textContent = '组间间歇 ' + (rest ? fmtRest(rest) : '未设置'); });
  sheet.querySelectorAll('#fUnit button').forEach(b => b.addEventListener('click', () => {
    unit = b.dataset.u;
    sheet.querySelectorAll('#fUnit button').forEach(x => x.classList.toggle('on', x === b));
  }));
  $('#fPerSide').addEventListener('click', () => { perSide = !perSide; $('#fPerSide').classList.toggle('on', perSide); });
  $('#fCancel').addEventListener('click', closeSheet);
  $('#fSave').addEventListener('click', () => {
    const name = $('#fName').value.trim() || (lib ? lib.name : '自定义动作');
    const num2 = Math.max(1, Math.min(999, parseInt($('#fNum').value, 10) || 1));
    const data = {
      lib: e.lib, name, sets, setsMax: parseInt($('#fSetsMax').value, 10) || 0,
      num: num2, numMax: parseInt($('#fNumMax').value, 10) || 0, unit, perSide,
      rest, load: $('#fLoad').value.trim(), goal: $('#fGoal').value.trim(), note: $('#fNote').value.trim(), alt: e.alt || null,
    };
    if (editIdx != null) Object.assign(day.ex[editIdx], data);
    else day.ex.push(Object.assign({ uid: uid() }, data));
    save(); closeSheet(); renderDay(); renderHome();
    toast(editIdx != null ? '已保存修改' : '已添加到 ' + DAY_NAMES[curDay]);
  });
  if ($('#fDel')) $('#fDel').addEventListener('click', () => {
    if (!confirm('确定删除「' + e.name + '」？')) return;
    day.ex.splice(editIdx, 1);
    save(); closeSheet(); renderDay(); renderHome();
  });
}

/* ---------- 设置 ---------- */
function openSettings() {
  const th = getTheme();
  openSheet(
    '<div class="sheet-title">设置</div>' +
    '<label class="flabel">界面主题</label>' +
    '<div class="seg" id="thSeg">' +
      '<button data-th="dark" class="' + (th === 'dark' ? 'on' : '') + '">🌙 夜间</button>' +
      '<button data-th="light" class="' + (th === 'light' ? 'on' : '') + '">☀️ 日间</button></div>' +
    '<div class="setcard"><b>数据保存在本机浏览器中</b><p class="dim">记录保存在这台 iPhone 的本地存储里，换浏览器或清除网站数据会丢失，建议定期导出备份。</p></div>' +
    '<div class="btnrow"><button class="bigbtn ghost" id="stExport">导出备份</button><button class="bigbtn ghost" id="stImport">导入备份</button></div>' +
    '<div class="btnrow"><button class="bigbtn ghost" id="stSample">恢复示例计划</button><button class="bigbtn danger" id="stClear">清空全部数据</button></div>' +
    '<div class="setcard dim small">健身周计划 v3.0 · 3D 动作演示 · 组内计时 · 自由计时器</div>');
  sheet.querySelectorAll('#thSeg button').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.th;
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
    renderHome();
    if ($('#day').classList.contains('open')) renderDay();
    openSettings();
  }));
  $('#stExport').addEventListener('click', () => {
    const txt = JSON.stringify({ plan: state.plan, log: state.log });
    openSheet('<div class="sheet-title">导出备份</div>' +
      '<p class="dim">全选复制以下内容，保存到备忘录等地方。</p>' +
      '<textarea class="finput area" rows="8" readonly id="expTa">' + esc(txt) + '</textarea>' +
      '<div class="btnrow"><button class="bigbtn" id="expCopy">复制</button><button class="bigbtn ghost" id="expBack">返回</button></div>');
    const ta = $('#expTa'); ta.addEventListener('focus', () => ta.select());
    $('#expCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(txt); toast('已复制'); }
      catch (err) { ta.select(); document.execCommand('copy'); toast('已复制'); }
    });
    $('#expBack').addEventListener('click', openSettings);
  });
  $('#stImport').addEventListener('click', () => {
    openSheet('<div class="sheet-title">导入备份</div>' +
      '<p class="dim">粘贴之前导出的内容，将覆盖当前计划与打卡记录。</p>' +
      '<textarea class="finput area" rows="8" id="impTa" placeholder="在此粘贴 JSON"></textarea>' +
      '<div class="btnrow"><button class="bigbtn" id="impGo">导入</button><button class="bigbtn ghost" id="impBack">返回</button></div>');
    $('#impBack').addEventListener('click', openSettings);
    $('#impGo').addEventListener('click', () => {
      try {
        const d = JSON.parse($('#impTa').value);
        if (!d || !Array.isArray(d.plan) || d.plan.length !== 7) throw 0;
        d.plan.forEach(p => { if (!Array.isArray(p.ex)) throw 0; });
        state = { plan: d.plan, log: d.log || {} };
        save(); closeSheet(); renderHome();
        if ($('#day').classList.contains('open')) renderDay();
        toast('导入成功');
      } catch (err) { toast('内容格式不对，导入失败'); }
    });
  });
  $('#stSample').addEventListener('click', () => {
    if (!confirm('用示例计划覆盖当前安排？（打卡记录保留）')) return;
    state.plan = defaultPlan(); save(); renderHome();
    if ($('#day').classList.contains('open')) renderDay();
    closeSheet(); toast('已恢复示例计划');
  });
  $('#stClear').addEventListener('click', () => {
    if (!confirm('确定清空全部计划与打卡记录？此操作不可恢复。')) return;
    state = { plan: Array.from({ length: 7 }, () => ({ type: 'rest', ex: [] })), log: {} };
    save(); renderHome();
    if ($('#day').classList.contains('open')) renderDay();
    closeSheet(); toast('已清空');
  });
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- 主题 ---------- */
const THEME_KEY = 'fit-theme';
function getTheme() { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; }
function applyTheme(t) {
  document.body.classList.toggle('light', t === 'light');
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'light' ? '#f4f5f8' : '#0f1115');
  if (window.Fig3D && Fig3D.setTheme) Fig3D.setTheme(t);
}
applyTheme(getTheme());

/* ---------- 启动 ---------- */
renderHome();
if (location.hash.indexOf('#day') === 0) openDay(parseInt(location.hash.slice(4), 10) || 0);
if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}