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
const LIB = (typeof Fig3D !== 'undefined') ? Fig3D.LIB : {};
const fig = (key, size, live) => Fig3D.make(key, size, live);

/* ================= 数据结构 ================= */
const DAYTYPES = {
  strength: { label: '力量', cls: 'tp-strength' },
  speed: { label: '速度', cls: 'tp-speed' },
  recovery: { label: '主动恢复', cls: 'tp-recovery' },
  rest: { label: '休息', cls: 'tp-rest' },
};

/* 恢复日清单（周三 / 周六共用） */
const RECOVERY_ITEMS = [
  { uid: 'rc1', name: '泡沫轴滚动', desc: '针对训练部位滚动，遇到酸痛点停留 20~30 秒' },
  { uid: 'rc2', name: '动态拉伸流程', desc: '完成热身流程 8 个动作，充分活动关节', link: 'warmup' },
  { uid: 'rc3', name: '低强度有氧 20~30 分钟', desc: '快走 / 慢跑 / 慢速骑行三选一，以能轻松聊天的强度进行' },
  { uid: 'rc4', name: '饮食：略减碳水', desc: '足量蛋白质与蔬菜' },
  { uid: 'rc5', name: '作息：提前入睡', desc: '比平时多睡一小时' },
  { uid: 'rc6', name: '呼吸 / 冥想 10 分钟', desc: '午后在安静处专注呼吸或听冥想音频，帮助神经系统降频' },
];

/* 训练前动态拉伸（原计划第9个动作待回看视频补充） */
const WARMUP_KEYS = ['wristrock', 'catcow', 'hkneelrot', 'butterfly', 'hip9090', 'rot9090', 'hamstretch', 'sofastretch'];

/* ================= 默认计划（大海运动表现 · 下半年周计划） ================= */
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
  } catch (e) { /* 数据损坏则重建 */ }
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

/* 打卡记录 */
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
function openDay(i) { curDay = i; renderDay(); $('#day').classList.add('open'); }
function closeDay() { $('#day').classList.remove('open'); }

function exMeta(e) {
  let s = (e.setsMax ? e.sets + '~' + e.setsMax : e.sets) + ' 组 × ';
  s += e.perSide ? '每边 ' : '';
  s += (e.numMax ? e.num + '~' + e.numMax : e.num) + ' ' + e.unit;
  if (e.rest) s += ' · 间歇 ' + fmtRest(e.rest);
  return s;
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
      const dots = arr.map((d, si) => '<i class="dot' + (d ? ' on' : '') + '" data-si="' + si + '"></i>').join('');
      const lib = LIB[e.lib];
      listHtml +=
        '<div class="exrow" data-idx="' + idx + '">' +
          '<div class="figbox" data-fig="' + esc(e.lib || 'custom') + '"></div>' +
          '<div class="exinfo">' +
            '<div class="exname">' + esc(e.name) + (lib ? '<span class="catchip">' + esc(lib.cat) + '</span>' : '') + (e.goal ? '<span class="goalchip">' + esc(e.goal) + '</span>' : '') + '</div>' +
            '<div class="exmeta">' + exMeta(e) + '</div>' +
            (e.note ? '<div class="exnote">' + esc(e.note) + '</div>' : '') +
            '<div class="exfoot">' + (e.load ? '<span class="loadtag">负重 ' + esc(e.load) + '</span>' : '') + (e.alt ? '<span class="altchip" data-alt="1">或 ' + esc(e.alt.name) + ' ⇄</span>' : '') + '<span class="dots">' + dots + '</span></div>' +
          '</div>' +
        '</div>';
    });
    const wd = warmupDone();
    body =
      '<div class="warmcard' + (wd >= WARMUP_KEYS.length ? ' alldone' : '') + '" id="warmCard">' +
        '<span class="warmicon">🔥</span><div class="warmmid"><b>热身 · 动态拉伸</b><span>训练前必做 · 8 个动作 · 约 10 分钟</span></div>' +
        '<span class="tc-num">' + wd + '/' + WARMUP_KEYS.length + '</span><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>' +
      '<div class="progcard"><div class="tc-top"><span>今日完成 · ' + (date.getMonth() + 1) + '月' + date.getDate() + '日</span><span class="tc-num">' + day.ex.filter(e => isDone(e.uid, e.sets)).length + '/' + day.ex.length + '</span></div>' +
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

  wrap.querySelectorAll('.exrow').forEach(r => {
    const idx = +r.dataset.idx;
    r.addEventListener('click', ev => {
      if (ev.target.closest('.dot')) return;
      if (ev.target.closest('.altchip')) { swapAlt(idx); return; }
      openDetail(idx);
    });
    r.querySelectorAll('.dot').forEach(d => d.addEventListener('click', ev => {
      ev.stopPropagation();
      const e = day.ex[idx];
      toggle(e.uid, e.sets, +d.dataset.si);
      renderDay(); renderHome();
    }));
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
    '<div class="exmeta2">点圆点打卡每一组</div>' +
    '<div class="bigdots">' + bigDots + '</div>' +
    '<div class="btnrow"><button class="bigbtn ghost" id="dtEdit">编辑</button><button class="bigbtn danger" id="dtDel">移除</button></div>');
  const cv = fig(e.lib || 'custom', Math.min(300, Math.round(window.innerWidth * .72)), true);
  $('#detailFig').appendChild(cv);
  Fig3D.orbit(cv);
  sheet.querySelectorAll('.bigdot').forEach(d => d.addEventListener('click', () => {
    toggle(e.uid, e.sets, +d.dataset.si);
    openDetail(idx); renderDay(); renderHome();
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
  openSheet(
    '<div class="sheet-title">设置</div>' +
    '<div class="setcard"><b>数据保存在本机浏览器中</b><p class="dim">记录保存在这台 iPhone 的本地存储里，换浏览器或清除网站数据会丢失，建议定期导出备份。</p></div>' +
    '<div class="btnrow"><button class="bigbtn ghost" id="stExport">导出备份</button><button class="bigbtn ghost" id="stImport">导入备份</button></div>' +
    '<div class="btnrow"><button class="bigbtn ghost" id="stSample">恢复示例计划</button><button class="bigbtn danger" id="stClear">清空全部数据</button></div>' +
    '<div class="setcard dim small">健身周计划 v2.0 · 3D 动作演示 · 添加到主屏幕后可离线使用</div>');
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

/* ---------- 启动 ---------- */
renderHome();
if (location.hash.indexOf('#day') === 0) openDay(parseInt(location.hash.slice(4), 10) || 0);
if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
