'use strict';
/* ============================================================
   fig3d.js — 自研 3D 人体演示引擎（零依赖）
   关节运动学 → 透视投影 → Canvas 2D 渲染（带明暗层次）
   纯数据/计算部分可在 Node 中运行（用于姿态校验）
   ============================================================ */

/* ---------- 向量 / 旋转 ---------- */
const RAD = Math.PI / 180;
const v3 = (x, y, z) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function rotZv(t, p) { const c = Math.cos(t), s = Math.sin(t); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; }
function rotXv(t, p) { const c = Math.cos(t), s = Math.sin(t); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
function rotYv(t, p) { const c = Math.cos(t), s = Math.sin(t); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }

/* ---------- 身体尺寸（米） ---------- */
const D = {
  TOR: .52,   // 骨盆→胸
  NECK: .17,  // 胸→头心
  HR: .105,   // 头半径
  SHW: .185,  // 肩半宽
  HIW: .096,  // 髋半宽
  UA: .29, FA: .26,     // 上臂/前臂
  UL: .44, LL: .41,     // 大腿/小腿
  FOOT: .21,
  rT: .125, rA: .052, rF: .045, rUL: .075, rLL: .058, rFoot: .042, rHand: .05,
};

/* ---------- 姿态语义 ----------
   p:[x,y,z] 骨盆位置  rot:[前倾,转向,侧倾]（度）
   tp 躯干前倾  tYaw 躯干水平旋转  h 头前倾
   aL/aR:[肩前举,肩外展]  eL/eR 肘弯（正=向前弯）
   lL/lR:[髋前屈,髋外展]  kL/kR 膝弯
   fm: 'auto' 脚掌放平 | 'toes' 脚尖绷直
   角度均在世界「身体坐标系」：+X=面朝方向, +Y=头顶方向, +Z=身体右侧  */
const BASE = { p: [0, .91, 0], rot: [0, 0, 0], tp: 0, tYaw: 0, h: 0,
  aL: [4, 6], eL: 4, aR: [4, 6], eR: 4,
  lL: [3, 4], kL: 4, lR: [3, 4], kR: 4, fm: 'auto' };
const F = o => { const f = Object.assign({}, BASE, o); return f; };

/* 四肢方向：flex 前屈(+)，abd 外展(+)，side -1左/+1右 */
function limbDir(flex, abd, side) {
  let d = rotXv(abd * -side * RAD, [0, -1, 0]);
  d = rotZv(flex * RAD, d);
  return d;
}

/* ---------- 正向运动学 ---------- */
function fk(f) {
  const Rb = x => rotZv(-f.rot[0] * RAD, rotYv(f.rot[1] * RAD, rotXv(f.rot[2] * RAD, x)));
  const Rt = x => Rb(rotZv(-f.tp * RAD, rotYv((f.tYaw || 0) * RAD, x)));
  const pelvis = f.p;
  const torsoDir = Rt([0, 1, 0]);
  const chest = add(pelvis, mul(torsoDir, D.TOR));
  const head = add(chest, mul(torsoDir, D.NECK));
  const headDir = norm(rotZv(-f.h * RAD, torsoDir));
  const rightT = Rt([0, 0, 1]);
  const rightB = Rb([0, 0, 1]);
  const shL = add(chest, add(mul(torsoDir, -.05), mul(rightT, -D.SHW)));
  const shR = add(chest, add(mul(torsoDir, -.05), mul(rightT, D.SHW)));

  const arm = (sh, a, e, side, fa) => {
    const up = Rt(limbDir(a[0], a[1], side));
    const fo = Rt(limbDir(a[0] + e, fa != null ? fa : a[1], side));
    const el = add(sh, mul(up, D.UA));
    const ha = add(el, mul(fo, D.FA));
    return { el, ha, up, fo };
  };
  const AL = arm(shL, f.aL, f.eL, -1, f.faL), AR = arm(shR, f.aR, f.eR, 1, f.faR);

  const hipL = add(pelvis, add([0, -.02, 0], mul(rightB, -D.HIW)));
  const hipR = add(pelvis, add([0, -.02, 0], mul(rightB, D.HIW)));
  const leg = (hip, l, k, side) => {
    const th = Rb(limbDir(l[0], l[1], side));
    const sh = Rb(limbDir(l[0] - k, l[1], side));
    const kn = add(hip, mul(th, D.UL));
    const an = add(kn, mul(sh, D.LL));
    let to;
    if (f.fm === 'toes') {
      to = add(an, mul(sh, D.FOOT * .9));
    } else {
      let flat = Rb([1, 0, 0]); flat = [flat[0], 0, flat[2]];
      to = len(flat) < .3 ? add(an, mul(sh, D.FOOT * .9)) : add(an, mul(norm(flat), D.FOOT));
    }
    if (to[1] < 0) to = [to[0], 0, to[2]];
    return { kn, an, to, th, sh };
  };
  const LL = leg(hipL, f.lL, f.kL, -1), LR = leg(hipR, f.lR, f.kR, 1);

  return { pelvis, chest, head, headDir, shL, shR, elL: AL.el, haL: AL.ha, elR: AR.el, haR: AR.ha,
    hipL, hipR, knL: LL.kn, anL: LL.an, toL: LL.to, knR: LR.kn, anR: LR.an, toR: LR.to,
    torsoDir, Rb, Rt, rightB };
}

/* ---------- 相机 ---------- */
function makeCam(cam, W, H) {
  const az = cam.az * RAD, el = cam.el * RAD, d = cam.dist;
  const tgt = [cam.tx || 0, cam.ty, cam.tz || 0];
  const eye = add(tgt, [Math.cos(el) * Math.cos(az) * d, Math.sin(el) * d, Math.cos(el) * Math.sin(az) * d]);
  const zA = norm(sub(tgt, eye));
  const xA = norm(cross(zA, [0, 1, 0]));
  const yA = cross(xA, zA);
  const f = (H / 2) / Math.tan((cam.fov || 40) * RAD / 2);
  return p => {
    const w = sub(p, eye);
    const cz = dot(w, zA);
    if (cz < .05) return { x: -9999, y: -9999, z: 999 };
    const cx = dot(w, xA), cy = dot(w, yA);
    return { x: W / 2 + cx * f / cz, y: H / 2 - cy * f / cz, z: cz };
  };
}

/* ---------- 动作库 ----------
   cam: az 0=正面 90=侧面；el 仰角；dist 距离；ty 注视高度
   props: 器械；frames: 循环关键帧；tf: 缩略图帧号 */
const SQUAT_B = F({ p: [0, .5], tp: 24, h: -14, lL: [96, 5], kL: 102, lR: [96, 7], kR: 102, aL: [72, 8], eL: 6, aR: [72, 8], eR: 6 });
const STAND = F({});
const PRONE = F({ rot: [78, 0, 0], p: [.05, .5, 0], fm: 'toes', tp: 0, lL: [-6, 4], kL: 8, lR: [-6, 4], kR: 8, aL: [92, 6], eL: 2, aR: [92, 6], eR: 2 });
const SUPINE = F({ rot: [-82, 0, 0], p: [.05, .16, 0], lL: [42, 10], kL: 92, lR: [42, 10], kR: 92 });
const QUAD = F({ p: [0, .48], tp: 22, aL: [90, 5], eL: 2, aR: [90, 5], eR: 2, lL: [0, 4], kL: 96, lR: [0, 4], kR: 96, fm: 'toes' });
const HALFKN = F({ p: [0, .56], tp: 22, lL: [22, 5], kL: 58, lR: [22, 5], kR: 58, aL: [20, 8], eL: 8, aR: [20, 8], eR: 8 });

const LIB3D = {
  /* ===== 基础自重 ===== */
  squat: { name: '深蹲', cat: '腿', dur: 1700, cam: { az: 90, el: 13, dist: 3.1, ty: .9 }, tf: 1,
    desc: '双脚与肩同宽，下蹲至大腿平行地面，膝盖方向与脚尖一致。',
    frames: [STAND, SQUAT_B] },
  pushup: { name: '俯卧撑', cat: '胸', dur: 1500, cam: { az: 90, el: 14, dist: 3.0, ty: .55 }, tf: 1,
    desc: '双手略宽于肩，身体保持一条直线，下降至胸口接近地面。',
    frames: [PRONE, F(Object.assign({}, PRONE, { p: [.05, .42, 0], eL: 62, eR: 62 }))] },
  plank: { name: '平板支撑', cat: '核心', dur: 2600, cam: { az: 90, el: 14, dist: 3.0, ty: .5 }, tf: 0,
    desc: '手肘撑地，身体从头到脚保持一条直线，收紧核心。',
    frames: [F(Object.assign({}, PRONE, { aL: [92, 6], eL: 84, aR: [92, 6], eR: 84, p: [.05, .44, 0] })),
             F(Object.assign({}, PRONE, { aL: [92, 6], eL: 86, aR: [92, 6], eR: 86, p: [.05, .46, 0] }))] },
  lunge: { name: '弓步蹲', cat: '腿', dur: 1800, cam: { az: 90, el: 13, dist: 3.1, ty: .85 }, tf: 1,
    desc: '向前跨一步，后腿膝盖下沉至接近地面，前膝不超过脚尖。',
    frames: [F({ lL: [14, 4], kL: 16, lR: [-22, 4], kR: 20, tp: 6 }),
             F({ p: [0, .6], tp: 14, lL: [58, 4], kL: 96, lR: [-58, 4], kR: 92, aL: [10, 6], aR: [10, 6] })] },
  jumpingjack: { name: '开合跳', cat: '全身', dur: 850, cam: { az: 0, el: 12, dist: 3.2, ty: .95 }, tf: 1,
    desc: '双脚跳开同时双手上举过头顶，再跳回并拢。',
    frames: [F({ aL: [4, 8], aR: [4, 8], lL: [3, 3], lR: [3, 3] }),
             F({ p: [0, 1.05], aL: [160, 52], aR: [160, 52], lL: [2, 26], lR: [2, 26], kL: 6, kR: 6, eL: 2, eR: 2 })] },
  crunch: { name: '卷腹', cat: '核心', dur: 1600, cam: { az: 90, el: 15, dist: 2.8, ty: .45 }, tf: 1,
    desc: '仰卧屈膝，下背贴地，用腹部力量抬起肩胛骨。',
    frames: [F(Object.assign({}, SUPINE, { p: [.1, .15, 0], tp: 4, aL: [96, 8], eL: 42, aR: [96, 8], eR: 42 })),
             F(Object.assign({}, SUPINE, { p: [.1, .15, 0], tp: 34, h: 18, aL: [110, 8], eL: 38, aR: [110, 8], eR: 38 }))] },
  situp: { name: '仰卧起坐', cat: '核心', dur: 2000, cam: { az: 90, el: 15, dist: 2.9, ty: .5 }, tf: 1,
    desc: '仰卧屈膝，起身至躯干接近大腿后缓慢回落。',
    frames: [F(Object.assign({}, SUPINE, { p: [.1, .15, 0], tp: 0, aL: [80, 10], eL: 30, aR: [80, 10], eR: 30 })),
             F(Object.assign({}, SUPINE, { p: [.1, .16, 0], rot: [-52, 0, 0], tp: 24, aL: [95, 10], eL: 45, aR: [95, 10], eR: 45 }))] },
  highknees: { name: '高抬腿', cat: '全身', dur: 520, cam: { az: 0, el: 11, dist: 3.1, ty: .95 }, tf: 0,
    desc: '原地快速跑步，膝盖抬至髋部高度，前脚掌着地。',
    frames: [F({ p: [0, .93], lL: [88, 4], kL: 78, lR: [12, 4], kR: 18, aL: [72, 8], eL: 78, aR: [-38, 8], eR: 62, h: -4 }),
             F({ p: [0, .93], lR: [88, 4], kR: 78, lL: [12, 4], kL: 18, aR: [72, 8], eR: 78, aL: [-38, 8], eL: 62, h: -4 })] },
  burpee: { name: '波比跳', cat: '全身', dur: 3000, cam: { az: 60, el: 13, dist: 3.3, ty: .8 }, tf: 2,
    desc: '下蹲手撑地→后伸腿成平板→收腿站起→全力跳起。',
    frames: [STAND,
      F({ p: [0, .62], tp: 38, h: -20, lL: [78, 5], kL: 100, lR: [78, 5], kR: 100, aL: [88, 5], eL: 2, aR: [88, 5], eR: 2, fm: 'toes' }),
      F(Object.assign({}, PRONE, { p: [.05, .5, 0] })),
      F({ p: [0, .62], tp: 38, h: -20, lL: [78, 5], kL: 100, lR: [78, 5], kR: 100, aL: [88, 5], eL: 2, aR: [88, 5], eR: 2, fm: 'toes' }),
      F({ p: [0, 1.28], lL: [2, 4], kL: 4, lR: [2, 4], kR: 4, aL: [162, 10], aR: [162, 10], eL: 4, eR: 4 })] },
  mountain: { name: '登山跑', cat: '核心', dur: 700, cam: { az: 70, el: 14, dist: 3.0, ty: .55 }, tf: 0,
    desc: '平板支撑姿势，双腿交替快速向胸口提膝。',
    frames: [F(Object.assign({}, PRONE, { lL: [72, 4], kL: 96, lR: [-14, 4], kR: 10 })),
             F(Object.assign({}, PRONE, { lR: [72, 4], kR: 96, lL: [-14, 4], kL: 10 }))] },
  curl: { name: '二头弯举', cat: '手臂', dur: 1400, cam: { az: 70, el: 12, dist: 2.9, ty: .95 }, tf: 1,
    desc: '上臂固定贴身，前臂弯举至收缩顶点后缓慢下放。',
    props: [{ t: 'db', at: 'both' }],
    frames: [F({ aL: [6, 7], eL: 6, aR: [6, 7], eR: 6 }),
             F({ aL: [6, 7], eL: 128, aR: [6, 7], eR: 128 })] },
  dbrow: { name: '俯身哑铃划船', cat: '背', dur: 1500, cam: { az: 90, el: 13, dist: 3.0, ty: .8 }, tf: 1,
    desc: '俯身屈膝保持背部平直，将哑铃拉至腹侧并挤压背肌。',
    props: [{ t: 'db', at: 'both' }],
    frames: [F({ p: [0, .84], tp: 55, h: -35, lL: [12, 5], kL: 22, lR: [12, 5], kR: 22, aL: [-50, 8], eL: 4, aR: [-50, 8], eR: 4 }),
             F({ p: [0, .84], tp: 55, h: -35, lL: [12, 5], kL: 22, lR: [12, 5], kR: 22, aL: [-50, 8], eL: -92, aR: [-50, 8], eR: -92 })] },

  /* ===== 力量日 ===== */
  backsquat: { name: '杠铃深蹲', cat: '腿', dur: 1800, cam: { az: 90, el: 13, dist: 3.2, ty: .95 }, tf: 1,
    desc: '重动作模式而非极限重量：先热身，中等偏重，下蹲至大腿平行。',
    props: [{ t: 'barbell', at: 'shoulders' }],
    frames: [STAND, SQUAT_B] },
  frontsquat: { name: '杠铃前蹲', cat: '腿', dur: 1800, cam: { az: 90, el: 13, dist: 3.2, ty: .95 }, tf: 1,
    desc: '杠铃架于锁骨前，肘高抬，蹲底保持躯干直立。',
    props: [{ t: 'barbell', at: 'chest' }],
    frames: [F({ aL: [22, 12], eL: 122, aR: [22, 12], eR: 122 }),
             F(Object.assign({}, SQUAT_B, { aL: [22, 12], eL: 122, aR: [22, 12], eR: 122, tp: 12 }))] },
  press: { name: '实力推', cat: '肩', dur: 1900, cam: { az: 70, el: 11, dist: 2.9, ty: 1.25 }, tf: 1,
    desc: '站姿推举：从锁骨位垂直上推至手臂伸直，躯干收紧不后仰。',
    props: [{ t: 'barbell', at: 'hands' }],
    frames: [F({ aL: [8, 14], eL: 112, aR: [8, 14], eR: 112, h: -6, tp: -2 }),
             F({ aL: [172, 16], eL: 4, aR: [172, 16], eR: 4, tp: -5, h: 0 })] },
  bench: { name: '卧推', cat: '胸', dur: 1800, cam: { az: 90, el: 18, dist: 2.9, ty: .55 }, tf: 1,
    desc: '肩胛后收沉，杠铃落至胸口，推起时肘略内收。',
    props: [{ t: 'bench' }, { t: 'barbell', at: 'hands' }],
    frames: [F(Object.assign({}, SUPINE, { aL: [96, 16], eL: 76, aR: [96, 16], eR: 76 })),
             F(Object.assign({}, SUPINE, { aL: [96, 16], eL: 4, aR: [96, 16], eR: 4 }))] },
  dbbench: { name: '哑铃交替卧推', cat: '胸', dur: 1900, cam: { az: 90, el: 18, dist: 2.9, ty: .55 }, tf: 0,
    desc: '左右交替推举，躯干保持稳定不旋转。',
    props: [{ t: 'bench' }, { t: 'db', at: 'both' }],
    frames: [F(Object.assign({}, SUPINE, { aL: [96, 14], eL: 4, aR: [96, 14], eR: 84 })),
             F(Object.assign({}, SUPINE, { aL: [96, 14], eL: 84, aR: [96, 14], eR: 4 }))] },
  rdl: { name: '罗马尼亚硬拉', cat: '后侧链', dur: 2000, cam: { az: 90, el: 13, dist: 3.1, ty: .85 }, tf: 1,
    desc: '膝微屈，髋后移俯身，杠铃贴大腿下行，起身夹臀刺激臀肌。',
    props: [{ t: 'barbell', at: 'hands' }],
    frames: [F({ aL: [0, 11], eL: 2, aR: [0, 11], eR: 2 }),
             F({ p: [-.05, .82], tp: 70, h: -42, lL: [7, 5], kL: 13, lR: [7, 5], kR: 13, aL: [-70, 11], eL: 2, aR: [-70, 11], eR: 2 })] },
  dl: { name: '杠铃硬拉', cat: '后侧链', dur: 2100, cam: { az: 90, el: 13, dist: 3.2, ty: .85 }, tf: 1,
    desc: '轻重量热身后中等偏重；蹬地伸髋站起，杠铃全程贴身。',
    props: [{ t: 'barbell', at: 'hands' }],
    frames: [F({ p: [-.04, .66], tp: 44, h: -22, lL: [48, 6], kL: 56, lR: [48, 6], kR: 56, aL: [-44, 10], eL: 2, aR: [-44, 10], eR: 2 }),
             F({ aL: [0, 10], eL: 2, aR: [0, 10], eR: 2 })] },
  slrdl: { name: '单腿硬拉', cat: '后侧链', dur: 2100, cam: { az: 90, el: 13, dist: 3.1, ty: .8 }, tf: 1,
    desc: '单腿站立俯身，后腿伸直抬起与躯干成一线，左右交替。',
    props: [{ t: 'db', at: 'both' }],
    frames: [F({ lL: [2, 4], kL: 3, lR: [-12, 4], kR: 4, aL: [0, 8], eL: 3, aR: [0, 8], eR: 3 }),
             F({ p: [0, .8], tp: 72, h: -45, lL: [6, 4], kL: 7, lR: [-78, 5], kR: 4, aL: [-72, 8], eL: 3, aR: [-72, 8], eR: 3 })] },
  oaplank: { name: '单臂平板支撑', cat: '核心', dur: 2400, cam: { az: 75, el: 14, dist: 3.0, ty: .5 }, tf: 0,
    desc: '新手核心抗旋：单臂撑地，骨盆不下沉不旋转。',
    frames: [F(Object.assign({}, PRONE, { aL: [92, 5], eL: 84, aR: [4, 88], eR: 2, p: [.05, .44, 0] })),
             F(Object.assign({}, PRONE, { aL: [92, 5], eL: 86, aR: [4, 88], eR: 2, p: [.05, .46, 0] }))] },
  prow: { name: '平板哑铃划船', cat: '核心', dur: 1700, cam: { az: 75, el: 14, dist: 3.0, ty: .5 }, tf: 1,
    desc: '进阶核心抗旋：平板姿势单臂将哑铃拉至髋部，两边交替。',
    props: [{ t: 'db', at: 'handR' }],
    frames: [F(Object.assign({}, PRONE, { aL: [92, 6], eL: 2, aR: [92, 6], eR: 2, p: [.05, .5, 0] })),
             F(Object.assign({}, PRONE, { aL: [92, 6], eL: 2, aR: [-38, 6], eR: -88, p: [.05, .5, 0] }))] },
  invrow: { name: '水平引体', cat: '背', dur: 1800, cam: { az: 90, el: 14, dist: 3.0, ty: .7 }, tf: 1,
    desc: '仰卧横杆下，身体成直线，胸口拉向横杆，上背部发力。',
    props: [{ t: 'bar', h: .95 }],
    frames: [F({ rot: [-58, 0, 0], p: [.05, .58, 0], fm: 'auto', lL: [-4, 4], kL: 6, lR: [-4, 4], kR: 6, aL: [178, 10], eL: 2, aR: [178, 10], eR: 2 }),
             F({ rot: [-52, 0, 0], p: [.05, .72, 0], fm: 'auto', lL: [-4, 4], kL: 6, lR: [-4, 4], kR: 6, aL: [178, 10], eL: 82, aR: [178, 10], eR: 82, tp: 8 })] },
  pullup: { name: '引体向上', cat: '背', dur: 2000, cam: { az: 90, el: 12, dist: 2.9, ty: 1.5 }, tf: 1,
    desc: '肩胛先下沉发力，下巴过杠，离心阶段缓慢回落。',
    props: [{ t: 'bar', h: 2.05 }],
    frames: [F({ p: [0, 1.32], aL: [178, 11], eL: 2, aR: [178, 11], eR: 2, lL: [-6, 4], kL: 22, lR: [-6, 4], kR: 22, tp: -2 }),
             F({ p: [0, 1.5], aL: [176, 11], eL: 96, aR: [176, 11], eR: 96, lL: [26, 4], kL: 88, lR: [26, 4], kR: 88, h: -8, tp: 4 })] },
  clean: { name: '杠铃高翻', cat: '爆发力', dur: 2400, cam: { az: 90, el: 12, dist: 3.2, ty: .9 }, tf: 2,
    desc: '硬底鞋；杠铃贴身，靠腿臀发力，手臂顺势接住，不用手臂提拉。',
    props: [{ t: 'barbell', at: 'hands' }],
    frames: [F({ p: [-.05, .84], tp: 30, h: -18, lL: [24, 6], kL: 34, lR: [24, 6], kR: 34, aL: [-28, 10], eL: 2, aR: [-28, 10], eR: 2 }),
             F({ p: [0, 1.02], tp: -6, h: 0, lL: [0, 6], kL: 4, lR: [0, 6], kR: 4, aL: [-6, 10], eL: 2, aR: [-6, 10], eR: 2 }),
             F({ p: [0, .8], tp: 6, h: -6, lL: [14, 6], kL: 26, lR: [14, 6], kR: 26, aL: [16, 11], eL: 118, aR: [16, 11], eR: 118 })] },
  hangclean: { name: '悬垂高翻', cat: '爆发力', dur: 2400, cam: { az: 90, el: 12, dist: 3.2, ty: .9 }, tf: 2,
    desc: '杠铃悬于膝上发力翻至肩，质量优先不追极限重量。',
    props: [{ t: 'barbell', at: 'hands' }],
    frames: [F({ p: [-.06, .8], tp: 34, h: -22, lL: [16, 6], kL: 22, lR: [16, 6], kR: 22, aL: [-34, 10], eL: 2, aR: [-34, 10], eR: 2 }),
             F({ p: [0, 1.02], tp: -6, lL: [0, 6], kL: 4, lR: [0, 6], kR: 4, aL: [-4, 10], eL: 2, aR: [-4, 10], eR: 2 }),
             F({ p: [0, .8], tp: 6, lL: [14, 6], kL: 26, lR: [14, 6], kR: 26, aL: [16, 11], eL: 118, aR: [16, 11], eR: 118 })] },
  jsquat: { name: '负重蹲跳', cat: '爆发力', dur: 1800, cam: { az: 90, el: 13, dist: 3.3, ty: 1.0 }, tf: 1,
    desc: '落地轻缓，屈髋屈膝吸收冲击，保护膝盖与腰椎。',
    props: [{ t: 'barbell', at: 'shoulders' }],
    frames: [F({ p: [0, .74], tp: 20, lL: [42, 6], kL: 66, lR: [42, 6], kR: 66 }),
             F({ p: [0, 1.22], lL: [0, 6], kL: 4, lR: [0, 6], kR: 4, fm: 'toes' }),
             F({ p: [0, .8], tp: 22, lL: [48, 6], kL: 74, lR: [48, 6], kR: 74 })] },
  clappu: { name: '击掌俯卧撑', cat: '爆发力', dur: 1500, cam: { az: 75, el: 15, dist: 3.1, ty: .55 }, tf: 1,
    desc: '核心收紧避免塌腰，高度以能稳定控制为准，注意落地缓冲。',
    frames: [F(Object.assign({}, PRONE, { p: [.05, .42, 0], eL: 64, eR: 64 })),
             F(Object.assign({}, PRONE, { p: [.05, .72, 0], eL: 4, eR: 4, aL: [92, 38], aR: [92, 38], lL: [-6, 8], lR: [-6, 8], kL: 24, kR: 24 })),
             F(Object.assign({}, PRONE, { p: [.05, .42, 0], eL: 64, eR: 64 }))] },
  kbswing: { name: '壶铃摆荡', cat: '爆发力', dur: 1300, cam: { az: 90, el: 13, dist: 3.1, ty: .85 }, tf: 1,
    desc: '4~6kg起步；力量来自髋关节快速伸展，腰背中立，不用手臂甩。',
    props: [{ t: 'kb', at: 'hands' }],
    frames: [F({ p: [-.04, .8], tp: 58, h: -30, lL: [10, 5], kL: 20, lR: [10, 5], kR: 20, aL: [-52, 5], eL: 6, aR: [-52, 5], eR: 6 }),
             F({ p: [0, 1.0], tp: -8, h: 0, lL: [-2, 5], kL: 3, lR: [-2, 5], kR: 3, aL: [86, 6], eL: 10, aR: [86, 6], eR: 10 })] },
  sideplank: { name: '侧平板支撑', cat: '核心', dur: 2600, cam: { az: 0, el: 12, dist: 2.8, ty: .55 }, tf: 0,
    desc: '体侧成一直线，收紧侧腰，髋部不下沉、不向支撑侧倾斜。',
    frames: [F({ rot: [0, 0, 84], p: [0, .46, 0], tp: 0, lL: [0, -30], kL: 2, lR: [0, 12], kR: 2,
        aR: [0, 90], eR: -90, faR: 0, aL: [0, 84], eL: 2, h: 0, fm: 'auto' }),
      F({ rot: [0, 0, 84], p: [0, .48, 0], tp: 0, lL: [0, -30], kL: 2, lR: [0, 25], kR: 2,
        aR: [0, 90], eR: -90, faR: 0, aL: [0, 84], eL: 2, h: 0, fm: 'auto' })] },
  deadbug: { name: '死虫式', cat: '核心', dur: 2000, cam: { az: 0, el: 40, dist: 2.9, ty: .3 }, tf: 0,
    desc: '下背部贴地，对侧手脚缓慢伸展；过快或代偿时缩短幅度。',
    frames: [F(Object.assign({}, SUPINE, { p: [0, .14, 0], tp: 0, aL: [96, 14], eL: 4, aR: [96, 14], eR: 4, lL: [82, 8], kL: 84, lR: [82, 8], kR: 84 })),
             F(Object.assign({}, SUPINE, { p: [0, .14, 0], tp: 0, aL: [150, 14], eL: 4, aR: [30, 14], eR: 4, lL: [12, 8], kL: 6, lR: [82, 8], kR: 96 })),
             F(Object.assign({}, SUPINE, { p: [0, .14, 0], tp: 0, aL: [30, 14], eL: 4, aR: [150, 14], eR: 4, lL: [82, 8], kL: 96, lR: [12, 8], kR: 6 })) ] },
  bulgarian: { name: '保加利亚蹲', cat: '腿', dur: 2600, cam: { az: 90, el: 13, dist: 3.0, ty: .8 }, tf: 0,
    desc: '后腿搭稳固支撑物，前腿约90°全脚着地，重心均匀躯干挺直。',
    props: [{ t: 'bench', pos: [-.62, .21, 0], size: [ .5, .42, .4] }],
    frames: [F({ p: [.06, .74], tp: 12, lL: [26, 5], kL: 82, lR: [-52, 5], kR: 98, aL: [12, 7], eL: 4, aR: [12, 7], eR: 4 }),
             F({ p: [.06, .76], tp: 12, lL: [26, 5], kL: 84, lR: [-52, 5], kR: 98, aL: [12, 7], eL: 4, aR: [12, 7], eR: 4 })] },
  gobletlunge: { name: '高脚杯侧弓步蹲', cat: '腿', dur: 1900, cam: { az: 0, el: 12, dist: 3.1, ty: .85 }, tf: 1,
    desc: '哑铃抱于胸前，向侧方跨步下蹲，蹬回，左右交替，练侧向发力。',
    props: [{ t: 'db', at: 'hands' }],
    frames: [F({ aL: [40, 14], eL: 118, aR: [40, 14], eR: 118, tp: 4 }),
             F({ p: [0, .72, -.16], tp: 24, lL: [4, 40], kL: 86, lR: [2, 4], kR: 8, aL: [40, 14], eL: 118, aR: [40, 14], eR: 118 })] },
  bandanti: { name: '弹力带站姿抗旋', cat: '核心', dur: 2100, cam: { az: 55, el: 10, dist: 3.0, ty: 1.05 }, tf: 1,
    desc: '双手握带于胸前推出，躯干抵抗旋转保持朝前，每边交替。',
    props: [{ t: 'band', anchor: [0, 1.25, .9] }],
    frames: [F({ aL: [58, 4], eL: 96, aR: [58, 4], eR: 96, tp: 0, tYaw: 0 }),
             F({ aL: [88, 4], eL: 10, aR: [88, 4], eR: 10, tp: 0, tYaw: -8 })] },
  boxjump: { name: '跳箱', cat: '爆发力', dur: 2300, cam: { az: 85, el: 13, dist: 3.3, ty: .9 }, tf: 1,
    desc: '全力起跳屈膝落箱（全脚掌），走下而非跳下，动作质量优先。',
    props: [{ t: 'box', pos: [.55, .26, 0], size: [.55, .52, .6] }],
    frames: [F({ p: [0, .78], tp: 20, lL: [40, 6], kL: 62, lR: [40, 6], kR: 62, aL: [30, 8], aR: [30, 8] }),
             F({ p: [.3, 1.1], lL: [4, 6], kL: 8, lR: [4, 6], kR: 8, aL: [140, 10], aR: [140, 10], fm: 'toes' }),
             F({ p: [.55, .72], tp: 14, lL: [62, 6], kL: 98, lR: [62, 6], kR: 98, aL: [30, 8], aR: [30, 8] })] },
  lateralhop: { name: '单脚侧向跳', cat: '爆发力', dur: 900, cam: { az: 0, el: 12, dist: 3.0, ty: .85 }, tf: 1,
    desc: '单脚左右连续横跳，落地稳定不内翻，练足踝稳定性。',
    frames: [F({ p: [0, .92, .18], lR: [2, 4], kR: 16, lL: [46, 5], kL: 76, aL: [30, 8], eL: 40, aR: [-30, 8], eR: 40 }),
             F({ p: [0, 1.1, -.1], lR: [2, 4], kR: 5, lL: [46, 5], kL: 76, fm: 'toes', aL: [30, 8], aR: [-30, 8] }),
             F({ p: [0, .92, -.32], lR: [10, 4], kR: 30, lL: [46, 5], kL: 76, aL: [30, 8], eL: 40, aR: [-30, 8], eR: 40 })] },
  quickfeet: { name: '半蹲快速移动', cat: '敏捷', dur: 520, cam: { az: 85, el: 12, dist: 3.1, ty: .8 }, tf: 0,
    desc: '半蹲姿势前后快速小碎步，脚下保持弹性与频率。',
    frames: [F({ p: [0, .86], tp: 22, lL: [34, 6], kL: 64, lR: [20, 6], kR: 48, aL: [24, 8], eL: 24, aR: [24, 8], eR: 24 }),
             F({ p: [0, .86], tp: 22, lL: [20, 6], kL: 48, lR: [34, 6], kR: 64, aL: [24, 8], eL: 24, aR: [24, 8], eR: 24 })] },
  copenhagen: { name: '哥本哈根支撑', cat: '核心', dur: 2600, cam: { az: 0, el: 12, dist: 2.9, ty: .55 }, tf: 0,
    desc: '上侧腿搭凳，前臂支撑，髋部上顶成直线；新手自重，进阶髋部加轻杠铃片。练髋内收肌群。',
    props: [{ t: 'bench', pos: [0, .16, -.55], size: [.6, .32, .4] }],
    frames: [F({ rot: [0, 0, 84], p: [0, .5, 0], lL: [0, 58], kL: 6, lR: [0, -6], kR: 4, aR: [0, 90], eR: -90, faR: 0, aL: [0, 55], eL: 2, h: 0 }),
             F({ rot: [0, 0, 84], p: [0, .52, 0], lL: [0, 58], kL: 6, lR: [0, -6], kR: 4, aR: [0, 90], eR: -90, faR: 0, aL: [0, 55], eL: 2, h: 0 })] },
  farmerwalk: { name: '农夫行走', cat: '核心', dur: 1100, cam: { az: 80, el: 12, dist: 3.0, ty: .9 }, tf: 0,
    desc: '双手持中等重量，躯干刚性行走，肩胛稳定不耸肩。',
    props: [{ t: 'db', at: 'both' }],
    frames: [F({ aL: [2, 6], eL: 2, aR: [2, 6], eR: 2, lL: [26, 4], kL: 12, lR: [-18, 4], kR: 30 }),
             F({ aL: [2, 6], eL: 2, aR: [2, 6], eR: 2, lR: [26, 4], kR: 12, lL: [-18, 4], kL: 30 })] },
  shuffle: { name: '半蹲侧向移动', cat: '敏捷', dur: 900, cam: { az: 0, el: 12, dist: 3.1, ty: .8 }, tf: 0,
    desc: '半蹲姿势向侧方连续移步，不交叉腿，重心平稳。',
    frames: [F({ p: [0, .86, .14], tp: 20, lL: [4, 34], kL: 66, lR: [4, 4], kR: 52, aL: [24, 8], aR: [24, 8] }),
             F({ p: [0, .86, -.14], tp: 20, lR: [4, 34], kR: 66, lL: [4, 4], kL: 52, aL: [24, 8], aR: [24, 8] })] },

  /* ===== 拉伸 / 恢复 ===== */
  wristrock: { name: '手腕活动', cat: '热身', dur: 1900, cam: { az: 85, el: 15, dist: 2.7, ty: .5 }, tf: 1,
    desc: '手掌不离开地面，重心后移、手臂伸直，动作温和。',
    frames: [QUAD, F(Object.assign({}, QUAD, { p: [-.1, .4], tp: 8, h: -20, kL: 118, kR: 118 }))] },
  catcow: { name: '猫驼式伸展', cat: '热身', dur: 2200, cam: { az: 85, el: 15, dist: 2.7, ty: .5 }, tf: 0,
    desc: '四足跪姿，抬头时骨盆前倾、低头时骨盆后倾，带动胸椎屈伸。',
    frames: [F(Object.assign({}, QUAD, { tp: -22, h: -28, lL: [4, 4], kL: 92 })),
             F(Object.assign({}, QUAD, { tp: 16, h: 26, lL: [-6, 4], kL: 98 }))] },
  hkneelrot: { name: '半跪姿转体', cat: '热身', dur: 2000, cam: { az: 0, el: 13, dist: 2.8, ty: .85 }, tf: 1,
    desc: '下半身骨盆保持不动，上半身转体带动手臂打开，拉伸上半身死角。',
    frames: [F({ p: [0, .66], lR: [86, 4], kR: 92, lL: [2, 6], kL: 104, tp: 6, aL: [82, 6], eL: 6, aR: [82, 6], eR: 6, h: 0 }),
             F({ p: [0, .66], lR: [86, 4], kR: 92, lL: [2, 6], kL: 104, tp: 4, tYaw: 42, aL: [60, 70], eL: 8, aR: [78, 6], eR: 24, h: 6 })] },
  butterfly: { name: '坐姿内收肌伸展', cat: '热身', dur: 2400, cam: { az: 0, el: 20, dist: 2.7, ty: .45 }, tf: 1,
    desc: '坐姿脚心相对，双膝向两侧打开，身体缓缓前倾。',
    frames: [F({ p: [0, .3], rot: [-8, 0, 0], lL: [55, 45], kL: 125, lR: [55, 45], kR: 125, aL: [66, 22], eL: 26, aR: [66, 22], eR: 26, tp: 4, h: 0 }),
             F({ p: [0, .28], rot: [-8, 0, 0], lL: [55, 45], kL: 125, lR: [55, 45], kR: 125, aL: [66, 22], eL: 26, aR: [66, 22], eR: 26, tp: 34, h: 14 })] },
  hip9090: { name: '90/90髋部伸展', cat: '热身', dur: 2400, cam: { az: 0, el: 18, dist: 2.8, ty: .45 }, tf: 0,
    desc: '双腿前后均成90°坐姿，活动髋部，前腿一侧可缓缓前倾加深。',
    frames: [F({ p: [0, .3], rot: [-6, 0, 0], lL: [76, 8], kL: 92, lR: [-6, 42], kR: 96, aL: [70, 18], eL: 14, aR: [70, 18], eR: 14, tp: 6 }),
             F({ p: [0, .28], rot: [-6, 0, 0], lL: [76, 8], kL: 92, lR: [-6, 42], kR: 96, aL: [70, 18], eL: 14, aR: [70, 18], eR: 14, tp: 30, h: 10 })] },
  rot9090: { name: '90/90转体', cat: '热身', dur: 2200, cam: { az: 0, el: 18, dist: 2.8, ty: .45 }, tf: 1,
    desc: '保持90/90腿位，躯干向后侧腿方向旋转，打开髋部旋转活动度。',
    frames: [F({ p: [0, .3], rot: [-6, 0, 0], lL: [76, 8], kL: 92, lR: [-6, 42], kR: 96, aL: [70, 18], eL: 14, aR: [70, 18], eR: 14, tp: 6, tYaw: -18 }),
             F({ p: [0, .3], rot: [-6, 0, 0], lL: [76, 8], kL: 92, lR: [-6, 42], kR: 96, aL: [86, 18], eL: 10, aR: [52, 40], eR: 16, tp: 2, tYaw: 44 })] },
  hamstretch: { name: '仰卧后侧链伸展', cat: '热身', dur: 2400, cam: { az: 90, el: 18, dist: 2.9, ty: .45 }, tf: 0,
    desc: '仰卧，双手环抱一侧腿窝，将腿向身体方向轻拉，膝盖微屈亦可。',
    frames: [F(Object.assign({}, SUPINE, { p: [0, .13, 0], tp: 0, lL: [118, 6], kL: 6, lR: [6, 6], kR: 4, aL: [128, 8], eL: 16, aR: [10, 8], eR: 4 })),
             F(Object.assign({}, SUPINE, { p: [0, .13, 0], tp: 0, lL: [138, 6], kL: 4, lR: [6, 6], kR: 4, aL: [140, 8], eL: 22, aR: [10, 8], eR: 4 }))] },
  sofastretch: { name: '沙发前侧伸展', cat: '热身', dur: 2400, cam: { az: 90, el: 14, dist: 3.0, ty: .6 }, tf: 1,
    desc: '脚背搭在沙发上，跪姿向前送髋，拉伸大腿前侧与髋屈肌。',
    props: [{ t: 'sofa', pos: [-.52, .19, 0], size: [.5, .38, .45] }],
    frames: [F({ p: [.1, .68], tp: 18, lL: [72, 5], kL: 88, lR: [-64, 5], kR: 108, aL: [10, 7], aR: [10, 7], h: 0 }),
             F({ p: [.16, .7], tp: -10, lL: [76, 5], kL: 88, lR: [-64, 5], kR: 108, aL: [10, 7], aR: [10, 7], h: 4 })] },
  foamroll: { name: '泡沫轴放松', cat: '恢复', dur: 2200, cam: { az: 90, el: 15, dist: 3.0, ty: .5 }, tf: 0,
    desc: '针对训练部位缓慢滚动，遇到酸痛点停留 20~30 秒呼吸放松。',
    props: [{ t: 'roller', pos: [0, .08, 0] }],
    frames: [F({ p: [.05, .4], rot: [-14, 0, 0], lL: [58, 10], kL: 82, lR: [58, 10], kR: 82, aL: [-34, 8], eL: 4, aR: [-34, 8], eR: 4, tp: 6 }),
             F({ p: [-.1, .42], rot: [-14, 0, 0], lL: [58, 10], kL: 82, lR: [58, 10], kR: 82, aL: [-34, 8], eL: 4, aR: [-34, 8], eR: 4, tp: 24, h: 12 })] },
  idle: { name: '通用', cat: '自定义', dur: 3000, cam: { az: 78, el: 12, dist: 3.1, ty: .95 }, tf: 0,
    desc: '',
    frames: [STAND, F(Object.assign({}, STAND, { p: [0, .935, 0] }))] },
};

/* 数据规范化：p / rot 统一补齐为 3 维 */
for (const _k in LIB3D) {
  for (const _f of LIB3D[_k].frames) {
    _f.p = _f.p.concat([0, 0, 0]).slice(0, 3);
    _f.rot = _f.rot.concat([0, 0, 0]).slice(0, 3);
  }
}

/* ---------- 帧插值 ---------- */
function lerpFrame(a, b, t) {
  const o = {};
  const L1 = (x, y) => x + (y - x) * t;
  o.p = a.p.map((x, i) => L1(x, b.p[i]));
  o.rot = a.rot.map((x, i) => L1(x, b.rot[i]));
  o.tp = L1(a.tp, b.tp); o.tYaw = L1(a.tYaw || 0, b.tYaw || 0); o.h = L1(a.h, b.h);
  o.eL = L1(a.eL, b.eL); o.eR = L1(a.eR, b.eR);
  o.kL = L1(a.kL, b.kL); o.kR = L1(a.kR, b.kR);
  o.aL = a.aL.map((x, i) => L1(x, b.aL[i])); o.aR = a.aR.map((x, i) => L1(x, b.aR[i]));
  o.lL = a.lL.map((x, i) => L1(x, b.lL[i])); o.lR = a.lR.map((x, i) => L1(x, b.lR[i]));
  o.fm = a.fm;
  if (a.faL != null || b.faL != null) o.faL = L1(a.faL != null ? a.faL : b.faL, b.faL != null ? b.faL : a.faL, t);
  if (a.faR != null || b.faR != null) o.faR = L1(a.faR != null ? a.faR : b.faR, b.faR != null ? b.faR : a.faR, t);
  return o;
}

/* ============================================================
   浏览器渲染部分
   ============================================================ */
const HAS_DOM = typeof document !== 'undefined';

if (HAS_DOM) (function () {
  const figs = [];
  let rafId = null;

  const COL = {
    body: [214, 224, 238], bodyB: [150, 160, 180],
    head: [226, 233, 244],
    steel: [158, 168, 186], plate: [242, 140, 58], db: [255, 159, 67],
    kb: [255, 176, 84], bench: [86, 96, 118], box: [88, 100, 124],
    sofa: [96, 106, 128], post: [120, 128, 148], band: [110, 193, 255], roller: [127, 212, 193],
    outline: [18, 23, 33],
  };
  const css = c => 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const BG = [19, 23, 32];

  function drawFig(cv, ex, frame, camS) {
    const ctx = cv.getContext('2d');
    const W = cv._w, H = cv._h;
    ctx.setTransform(cv._dpr, 0, 0, cv._dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cam = Object.assign({}, ex.cam, camS || {});
    const proj = makeCam(cam, W, H);
    const J = fk(frame);

    const items = [];
    const P = p => proj(p);
    let zMin = 1e9, zMax = -1e9;
    const track = s => { if (s.z > 0 && s.z < 1e8) { zMin = Math.min(zMin, s.z); zMax = Math.max(zMax, s.z); } };

    const cap = (a, b, r, col) => {
      const A = P(a), B = P(b); track(A); track(B);
      items.push({ z: (A.z + B.z) / 2, t: 'cap', A, B, r, col });
    };
    const sph = (c, r, col) => { const A = P(c); track(A); items.push({ z: A.z, t: 'sph', A, r, col }); };
    const disc = (c, axis, r, col) => {
      const A = P(c); track(A);
      const pts = [];
      for (let i = 0; i < 14; i++) {
        const ang = i / 14 * Math.PI * 2;
        const u = norm(cross(axis, Math.abs(axis[1]) < .9 ? [0, 1, 0] : [1, 0, 0]));
        const w = cross(axis, u);
        const pt = add(c, add(mul(u, Math.cos(ang) * r), mul(w, Math.sin(ang) * r)));
        pts.push(P(pt));
      }
      items.push({ z: A.z + .02, t: 'poly', pts, col, A });
    };
    const box = (c, size, col) => {
      const [sx, sy, sz] = size, x0 = c[0] - sx / 2, x1 = c[0] + sx / 2, y0 = c[1] - sy / 2, y1 = c[1] + sy / 2, z0 = c[2] - sz / 2, z1 = c[2] + sz / 2;
      const faces = [
        { n: [0, 1, 0], p: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], s: 1.15 },
        { n: [0, -1, 0], p: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], s: .6 },
        { n: [1, 0, 0], p: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], s: .95 },
        { n: [-1, 0, 0], p: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], s: .75 },
        { n: [0, 0, 1], p: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], s: .9 },
        { n: [0, 0, -1], p: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], s: .7 },
      ];
      const eye = proj(c);
      const camDir = norm(sub([cam.tx || 0, cam.ty, cam.tz || 0], add(c, [0, 0, 0])));
      for (const f of faces) {
        if (dot(f.n, norm(sub(eye ? [0, 1, 0] : [0, 1, 0], f.n))) > 2) continue; // never
        const pts = f.p.map(P);
        pts.forEach(track);
        const mid = f.p.reduce((a, b) => add(a, b), [0, 0, 0]).map(x => x / 4);
        const M = P(mid);
        items.push({ z: M.z, t: 'poly', pts, col: mix(col, BG, 1 - f.s), A: M });
      }
    };

    /* --- 身体 --- */
    cap(J.pelvis, J.chest, D.rT, COL.body);
    sph(J.head, D.HR, COL.head);
    sph(add(J.chest, mul(J.torsoDir, -.1)), D.rT * .8, COL.body);
    const arms = [[J.shL, J.elL, J.haL], [J.shR, J.elR, J.haR]];
    for (const [sh, el, ha] of arms) {
      cap(sh, el, D.rA, COL.body);
      cap(el, ha, D.rF, COL.bodyB);
      sph(ha, D.rHand, COL.body);
    }
    const legs = [[J.hipL, J.knL, J.anL, J.toL], [J.hipR, J.knR, J.anR, J.toR]];
    for (const [hip, kn, an, to] of legs) {
      cap(hip, kn, D.rUL, COL.body);
      cap(kn, an, D.rLL, COL.bodyB);
      cap(an, to, D.rFoot, COL.bodyB);
    }

    /* --- 器械 --- */
    const RbZ = J.Rb([0, 0, 1]);
    const handsMid = mul(add(J.haL, J.haR), .5);
    const shMid = add(mul(add(J.shL, J.shR), .5), mul(J.torsoDir, .07));
    const chestBar = add(add(mul(add(J.shL, J.shR), .5), mul(J.torsoDir, .05)), mul(J.Rt([1, 0, 0]), .13));
    for (const pr of (ex.props || [])) {
      if (pr.t === 'barbell') {
        const c = pr.at === 'shoulders' ? shMid : pr.at === 'chest' ? chestBar : handsMid;
        cap(add(c, mul(RbZ, -.88)), add(c, mul(RbZ, .88)), .022, COL.steel);
        disc(add(c, mul(RbZ, .52)), RbZ, .19, COL.plate);
        disc(add(c, mul(RbZ, -.52)), RbZ, .19, COL.plate);
        disc(add(c, mul(RbZ, .62)), RbZ, .07, COL.steel);
        disc(add(c, mul(RbZ, -.62)), RbZ, .07, COL.steel);
      } else if (pr.t === 'db') {
        const hs = pr.at === 'both' ? [J.haL, J.haR] : pr.at === 'handR' ? [J.haR] : pr.at === 'handL' ? [J.haL] : [handsMid];
        for (const h of hs) {
          cap(add(h, mul(RbZ, -.13)), add(h, mul(RbZ, .13)), .018, COL.steel);
          disc(add(h, mul(RbZ, .15)), RbZ, .055, COL.db);
          disc(add(h, mul(RbZ, -.15)), RbZ, .055, COL.db);
        }
      } else if (pr.t === 'kb') {
        sph(handsMid, .088, COL.kb);
        const up = [0, 1, 0];
        cap(add(handsMid, mul(RbZ, -.09)), add(handsMid, [0, .17, 0]), .017, COL.steel);
        cap(add(handsMid, mul(RbZ, .09)), add(handsMid, [0, .17, 0]), .017, COL.steel);
      } else if (pr.t === 'bench') {
        box(pr.pos || [0, .21, 0], pr.size || [1.15, .42, .36], COL.bench);
      } else if (pr.t === 'box') {
        box(pr.pos, pr.size, COL.box);
      } else if (pr.t === 'sofa') {
        box(pr.pos, pr.size, COL.sofa);
      } else if (pr.t === 'bar') {
        const h = pr.h;
        cap([0, 0, -.55], [0, h, -.55], .03, COL.post);
        cap([0, 0, .55], [0, h, .55], .03, COL.post);
        cap([0, h, -.6], [0, h, .6], .024, COL.steel);
      } else if (pr.t === 'band') {
        const a = pr.anchor;
        cap([a[0], 0, a[2]], a, .025, COL.post);
        const mid = mul(add(a, handsMid), .5);
        const ctrl = add(mid, [0, -.06, 0]);
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10, u = 1 - t;
          const pt = [u * u * a[0] + 2 * u * t * ctrl[0] + t * t * handsMid[0],
                      u * u * a[1] + 2 * u * t * ctrl[1] + t * t * handsMid[1],
                      u * u * a[2] + 2 * u * t * ctrl[2] + t * t * handsMid[2]];
          pts.push(P(pt));
        }
        pts.forEach(track);
        items.push({ z: pts[5].z, t: 'polyline', pts, col: COL.band });
      } else if (pr.t === 'roller') {
        cap(add(pr.pos, mul(RbZ, -.25)), add(pr.pos, mul(RbZ, .25)), .075, COL.roller);
      }
    }

    /* --- 地面阴影 --- */
    const gy = proj([J.pelvis[0], 0, J.pelvis[2]]);
    if (gy.z > 0 && gy.z < 1e8) {
      const f = (H / 2) / Math.tan((cam.fov || 40) * RAD / 2);
      const rx = .62 * f / gy.z, ry = rx * .3;
      const g = ctx.createRadialGradient(gy.x, gy.y, 0, gy.x, gy.y, Math.max(rx, 4));
      g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.translate(gy.x, gy.y); ctx.scale(1, Math.max(ry / rx, .01)); ctx.translate(-gy.x, -gy.y);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gy.x, gy.y, rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* --- 深度排序绘制 --- */
    const zr = Math.max(zMax - zMin, .001);
    items.sort((a, b) => b.z - a.z);
    const stroke = (A, B, w, style) => {
      ctx.lineCap = 'round'; ctx.lineWidth = w; ctx.strokeStyle = style;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    };
    for (const it of items) {
      const t = Math.min(1, Math.max(0, (it.z - zMin) / zr));
      const dim = t * .5;
      const col = mix(it.col, BG, dim);
      const f = (H / 2) / Math.tan((cam.fov || 40) * RAD / 2);
      if (it.t === 'cap') {
        const w = Math.max(2.5, 2 * it.r * f / it.z);
        stroke(it.A, it.B, w + 2.5, css(mix(COL.outline, BG, dim * .6)));
        stroke(it.A, it.B, w, css(col));
      } else if (it.t === 'sph') {
        const r = Math.max(3, it.r * f / it.z);
        ctx.fillStyle = css(mix(COL.outline, BG, dim * .6));
        ctx.beginPath(); ctx.arc(it.A.x, it.A.y, r + 1.5, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createRadialGradient(it.A.x - r * .35, it.A.y - r * .35, r * .2, it.A.x, it.A.y, r);
        g.addColorStop(0, css(mix(mix(it.col, [255, 255, 255], .35), BG, dim)));
        g.addColorStop(1, css(mix(it.col, BG, dim)));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(it.A.x, it.A.y, r, 0, Math.PI * 2); ctx.fill();
      } else if (it.t === 'poly') {
        ctx.fillStyle = css(mix(COL.outline, BG, dim * .6));
        ctx.beginPath(); it.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
        ctx.fillStyle = css(col);
        ctx.beginPath(); it.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
      } else if (it.t === 'polyline') {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = css(mix(COL.outline, BG, dim * .6)); ctx.lineWidth = 6;
        ctx.beginPath(); it.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
        ctx.strokeStyle = css(col); ctx.lineWidth = 3.5;
        ctx.beginPath(); it.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      }
    }
  }

  /* --- 画布创建与注册 --- */
  function make(key, size, live) {
    const ex = LIB3D[key] || LIB3D.idle;
    const cv = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.className = 'fig';
    cv._w = size; cv._h = size; cv._dpr = dpr;
    cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    if (live) {
      const fig = { cv, ex, key, vis: true, t0: performance.now() - Math.random() * 5000, last: 0, cam: { az: ex.cam.az, el: ex.cam.el } };
      fig.io = new IntersectionObserver(es => { fig.vis = es[0].isIntersecting; });
      fig.io.observe(cv);
      cv._fig = fig;
      figs.push(fig);
      ensureRAF();
      return cv;
    }
    drawFig(cv, ex, ex.frames[ex.tf || 0], null);
    return cv;
  }

  function updateFig(fig, now) {
    const ex = fig.ex;
    const t = ((now - fig.t0) % ex.dur) / ex.dur;
    const n = ex.frames.length;
    const x = t * n, i = Math.floor(x) % n, j = (i + 1) % n;
    const e = .5 - .5 * Math.cos(Math.PI * (x - Math.floor(x)));
    drawFig(fig.cv, ex, lerpFrame(ex.frames[i], ex.frames[j], e), fig.cam);
  }
  function tick(now) {
    for (let i = figs.length - 1; i >= 0; i--) {
      const f = figs[i];
      if (!f.cv.isConnected) { if (f.io) f.io.disconnect(); figs.splice(i, 1); continue; }
      if (f.vis && now - f.last > 28) { updateFig(f, now); f.last = now; }
    }
    rafId = figs.length ? requestAnimationFrame(tick) : null;
  }
  function ensureRAF() { if (!rafId && figs.length) rafId = requestAnimationFrame(tick); }

  /* --- 详情视图：拖动旋转 --- */
  function orbit(cv) {
    if (!cv._fig) return;
    const fig = cv._fig;
    let px = 0, py = 0, down = false;
    const start = e => { down = true; px = e.clientX; py = e.clientY; e.preventDefault(); };
    const move = e => {
      if (!down) return;
      const dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY;
      fig.cam.az = (fig.cam.az - dx * .45 + 3600) % 360;
      fig.cam.el = Math.min(80, Math.max(2, fig.cam.el + dy * .3));
    };
    const end = () => { down = false; };
    cv.addEventListener('pointerdown', start);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  window.Fig3D = { make, orbit, LIB: LIB3D };
})();

/* Node 导出（姿态校验用） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LIB3D, fk, lerpFrame, makeCam, D, BASE, F };
}
