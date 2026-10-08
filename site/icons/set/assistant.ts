import type { IconDraw, Vec3 } from '../kit';
import { arc, NEAR, rad, RIGHT, ringOf, UP } from './parts';

/**
 * The assistant's highlights, one object each, from the README's list: local voice, the several
 * interfaces, searchable memory, coding with checkpoints, reminders and jobs, optional integrations, and
 * the locked-down default. One part of each, the one the highlight is about, is in the accent.
 */

/** Local voice: a desk microphone, its grille a mesh of seams; the hold-to-talk key on its base is the accent. */
export const voice: IconDraw = (k) => {
  k.line([[2.4, -2.6, 0.15], [4.4, -4.6, 0.15], [6.8, -4.6, 0.15], [8.8, -6.4, 0.15]], { tone: 'mid', detail: true });
  k.cyl(0, 0, 4.4, 0, 0.9, { b: 0.7 });
  k.cyl(0, 0, 3.3, 0.9, 1.4, { b: 0.4 });
  for (let i = 0; i < 18; i++) {
    const a = rad(-45 + i * 10);
    if (i % 3 === 1) continue;
    k.line([[3.75 * Math.cos(a), 3.75 * Math.sin(a), 0.9], [4.15 * Math.cos(a), 4.15 * Math.sin(a), 0.9]], { tone: 'lo', detail: true });
  }
  k.cyl(0, 0, 0.42, 1.4, 4.6, { b: 0.12 });
  k.cyl(0, 0, 0.95, 4.1, 4.8, { b: 0.3 });
  const body: [number, number][] = [[0.9, 0], [1.45, 0.1], [1.85, 0.4], [2.05, 0.9], [2.05, 4.4]];
  for (let t = 0; t <= 90; t += 10) body.push([2.05 * Math.cos(rad(t)), 4.4 + 2.05 * Math.sin(rad(t))]);
  const cap = k.lathe([0, 0, 4.6], body);
  cap.seam(0.9, { detail: true });
  cap.strip(2.55, 3.05, { out: 0.14, tone: 'edge' });
  for (const h of [3.7, 4.3, 4.9, 5.45]) cap.seam(h, { tone: 'lo' });
  for (const h of [3.4, 4.0, 4.6, 5.2, 5.8]) cap.seam(h, { tone: 'lo', detail: true });
  for (let d = -45; d <= 135; d += 22.5) cap.meridian(d, 3.1, 6.45, { detail: true });
  cap.patch(45, 1.2, [[-0.35, 0], [0.35, 0], [0.35, 0.9], [-0.35, 0.9]], { tone: 'lo', detail: true });
  const key = [2.05 * Math.cos(rad(45)), 2.05 * Math.sin(rad(45))];
  k.cyl(key[0], key[1], 0.82, 1.4, 1.95, { b: 0.3, tone: 'accent' });
};

/**
 * Several interfaces: a monitor showing the Console, chat on the right and the conversation list on the
 * left, with a keyboard in front; the orb, the small HUD that is one more door to the same assistant, is the accent.
 */
export const console: IconDraw = (k) => {
  k.box(4.6, 1.2, 10.4, 6.2, 0, 0.55, { r: 1.6, b: 0.5 });
  k.box(6.7, 1.4, 8.3, 2.5, 0.55, 5.4, { r: 0.5, b: 0.2 });
  k.box(0, 2.5, 15, 3.3, 3.2, 12, { r: 0.7, b: 0.3 });
  const y = 3.3;
  k.pane('y', y, 0.7, 3.9, 14.3, 11.3, { r: 0.45, tone: 'lo' });
  k.pane('y', y, 1.2, 4.4, 4.4, 10.8, { r: 0.35, tone: 'mid' });
  for (const z of [10, 9.2, 8.4, 7.6]) k.pane('y', y, 1.6, z - 0.35, 4.0, z + 0.15, { r: 0.18, tone: 'lo', detail: true });
  k.pane('y', y, 5.2, 9.1, 9.9, 10.4, { r: 0.55, tone: 'mid' });
  k.pane('y', y, 8.3, 7.3, 13.7, 8.5, { r: 0.55, tone: 'mid' });
  k.pane('y', y, 5.2, 5.9, 10.7, 6.9, { r: 0.5, tone: 'lo' });
  for (const [z, u1] of [[9.9, 9.0], [9.55, 7.6]] as const) k.line([[5.8, y, z], [u1, y, z]], { tone: 'lo', detail: true });
  for (const [z, u1] of [[8.1, 13.0], [7.75, 11.6]] as const) k.line([[8.9, y, z], [u1, y, z]], { tone: 'lo', detail: true });
  k.line([[5.8, y, 6.4], [9.8, y, 6.4]], { tone: 'lo', detail: true });
  k.pane('y', y, 5.2, 4.4, 13.7, 5.3, { r: 0.42, tone: 'mid' });
  k.shape('y', y, arc(13.15, 4.85, 0.22, 0, 360, 10), { tone: 'mid', detail: true });
  k.shape('y', y, arc(12.6, 9.9, 0.95, 0, 360, 24), { tone: 'accent', fill: 'ground' });
  k.shape('y', y, arc(12.6, 9.9, 0.55, 0, 360, 18), { tone: 'accent', detail: true });
  k.pane('y', y, 6.9, 3.45, 8.1, 3.7, { r: 0.12, tone: 'lo', detail: true });
  k.box(1.4, 7.0, 13.6, 10.4, 0, 0.6, { r: 0.6, b: 0.25 });
  for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) k.dot(2.2 + i * 0.98, 7.75 + row * 0.85, 0.6, { r: 0.24, tone: 'mid', detail: true });
  k.plate(4.4, 9.85, 10.6, 10.0, 0.6, { r: 0.06, tone: 'mid', detail: true });
};

/**
 * Searchable memory: an index-card box with its lid tipped back and dividers among the cards; the card
 * drawn up out of it, the one recalled, is the accent.
 */
export const memory: IconDraw = (k) => {
  const rim = 4.8, front = 7.0, lean = rad(22);
  const lid = k.face([0, 0, rim], [1, 0, 0], [0, -Math.sin(lean), Math.cos(lean)]);
  k.slab(lid, roundedRect(0.1, 0, 11.3, 4.4, 0.7), roundedRect(0.5, 0.4, 10.9, 4.0, 0.4), 0.45);
  k.on(lid).rect(4.4, 2.6, 7.0, 3.3, { r: 0.25, tone: 'lo', detail: true });
  k.box(0, 0, 11.4, front + 0.4, 0, rim, { r: 0.8, b: 0.35 });
  k.plate(0.45, 0.45, 10.95, front - 0.05, rim, { r: 0.45, tone: 'lo' });
  const inner = front - 0.05;
  const card = (y: number, top: number, tab: [number, number] | null, tone: 'mid' | 'accent' | 'edge', ruled = false) => {
    const foot = rim - 0.408 * (inner - y);
    const r = 0.35, u0 = 1.0, u1 = 10.4;
    const pts: [number, number][] = [[u0, foot], [u1, foot], ...arc(u1 - r, top - r, r, 0, 90, 3)];
    if (tab) pts.push([tab[1] + 0.3, top], ...arc(tab[1] - 0.25, top + 0.55, 0.25, 0, 90, 2), ...arc(tab[0] + 0.25, top + 0.55, 0.25, 90, 180, 2), [tab[0] - 0.3, top]);
    pts.push(...arc(u0 + r, top - r, r, 90, 180, 3));
    k.shape('y', y, pts, { tone, fill: 'ground' });
    if (ruled) for (let z = top - 1.0; z > rim + 0.4; z -= 0.62) k.line([[u0 + 0.6, y, z], [u1 - (z > top - 1.2 ? 0.6 : 2.4), y, z]], { tone: 'lo', detail: true });
  };
  card(1.0, 6.2, [1.6, 3.6], 'mid');
  card(1.9, 6.3, null, 'mid');
  card(2.8, 6.6, [6.2, 8.4], 'mid');
  card(3.7, 9.2, null, 'accent', true);
  card(4.6, 6.4, null, 'mid');
  card(5.5, 6.7, [3.6, 5.8], 'mid');
  card(6.4, 6.0, null, 'mid');
  k.pane('y', front + 0.4, 4.2, 2.2, 7.2, 3.6, { r: 0.3, tone: 'mid' });
  k.pane('y', front + 0.4, 4.55, 2.5, 6.85, 3.3, { r: 0.18, tone: 'lo', detail: true });
  k.pane('x', 11.4, 2.6, 2.6, 4.8, 3.2, { r: 0.3, tone: 'lo', detail: true });
};

/** A rounded rectangle as a ring in (u, v), for slabs. */
function roundedRect(u0: number, v0: number, u1: number, v1: number, r: number) {
  const pts: [number, number][] = [...arc(u1 - r, v0 + r, r, 270, 360, 4), ...arc(u1 - r, v1 - r, r, 0, 90, 4), ...arc(u0 + r, v1 - r, r, 90, 180, 4), ...arc(u0 + r, v0 + r, r, 180, 270, 4)];
  return ringOf(pts);
}

/**
 * Coding with checkpoints: an open laptop, the code on its screen beside a timeline of checkpoints; the
 * checkpoint you can rewind to is the accent.
 */
export const coding: IconDraw = (k) => {
  const lean = rad(11);
  k.box(0, 0, 13.4, 9.2, 0, 0.7, { r: 1.0, b: 0.4 });
  const screen = k.face([0, 0.85, 0.75], [1, 0, 0], [0, -Math.sin(lean), Math.cos(lean)]);
  k.slab(screen, roundedRect(0, 0, 13.4, 8.8, 0.7), roundedRect(0.35, 0.35, 13.05, 8.45, 0.45), 0.5);
  const s = k.on(screen);
  s.rect(0.75, 0.75, 12.65, 8.05, { r: 0.35, tone: 'lo' });
  for (const a of [1.35, 1.95, 2.55]) s.dot(a, 7.5, { r: 0.17, tone: 'lo', detail: true });
  s.line([[0.75, 7.0], [12.65, 7.0]], { tone: 'lo', detail: true });
  s.line([[2.2, 1.4], [2.2, 6.4]], { tone: 'mid' });
  for (const b of [6.0, 4.6, 2.0]) s.circle(2.2, b, 0.22, { tone: 'mid', fill: 'ground' });
  s.circle(2.2, 3.3, 0.48, { tone: 'accent', fill: 'ground' });
  s.dot(2.2, 3.3, { r: 0.2, tone: 'accent', detail: true });
  const code: [number, number, number][] = [[6.2, 0, 4.2], [5.5, 1, 6.0], [4.8, 2, 4.4], [4.1, 2, 5.8], [3.4, 1, 3.4], [2.7, 2, 5.2], [2.0, 0, 2.6], [1.3, 1, 4.6]];
  code.forEach(([b, indent, len], i) => {
    const a0 = 3.4 + indent * 0.9;
    const detail = i % 2 === 1;
    s.line([[a0, b], [a0 + len * 0.55, b]], { tone: b === 3.4 ? 'mid' : 'lo', detail });
    if (len > 4) s.line([[a0 + len * 0.55 + 0.45, b], [a0 + len * 1.0, b]], { tone: 'lo', detail: true });
  });
  k.plate(1.0, 3.0, 12.4, 6.4, 0.7, { r: 0.45, tone: 'lo' });
  for (let row = 0; row < 4; row++) for (let i = 0; i < 12; i++) k.dot(1.7 + i * 0.92, 3.6 + row * 0.78, 0.7, { r: 0.22, tone: 'mid', detail: true });
  k.plate(4.9, 6.9, 8.5, 8.6, 0.7, { r: 0.4, tone: 'mid' });
  k.pane('y', 9.2, 5.6, 0.22, 7.8, 0.42, { r: 0.1, tone: 'lo', detail: true });
};

/**
 * Reminders and scheduled jobs: a twin-bell alarm clock facing you on its two feet; its hands, set for
 * the reminder, are the accent.
 */
export const automation: IconDraw = (k) => {
  const c: Vec3 = [0, 0, 5.2], depth = 2.6, R = 4.1;
  const at = (s: number, up: number, deep = 0): Vec3 => [c[0] + RIGHT[0] * s + NEAR[0] * deep, c[1] + RIGHT[1] * s + NEAR[1] * deep, c[2] + up];
  for (const side of [-1, 1]) {
    const foot = at(side * R * Math.sin(rad(38)), -R * Math.cos(rad(38)) - 0.2, -0.4);
    k.lathe(foot, [[0.55, 0], [0.62, 0.5], [0.4, 1.3]], { axis: [RIGHT[0] * side * 0.45, RIGHT[1] * side * 0.45, -0.89], n: 24 });
  }
  k.line(arc(0, R - 0.4, 2.7, 25, 155, 16).map(([s, up]) => at(s, up, -0.9)), { tone: 'mid', detail: true });
  for (const side of [-1, 1]) {
    const tilt = rad(38);
    const axis: Vec3 = [RIGHT[0] * side * Math.sin(tilt), RIGHT[1] * side * Math.sin(tilt), Math.cos(tilt)];
    const base = at(side * (R + 0.3) * Math.sin(tilt), (R + 0.3) * Math.cos(tilt), -0.7);
    k.cyl(base[0] - axis[0] * 0.6, base[1] - axis[1] * 0.6, 0.18, base[2] - 1.0, base[2] + 0.2, { b: 0.06, detail: true });
    const bell: [number, number][] = [[2.1, 0], [2.15, 0.25]];
    for (let t = 0; t <= 90; t += 10) bell.push([2.15 * Math.cos(rad(t)), 0.25 + 1.75 * Math.sin(rad(t))]);
    const b = k.lathe(base, bell, { axis, n: 40 });
    b.seam(0.55, { tone: 'lo', detail: true });
    k.ball([base[0] + axis[0] * 2.25, base[1] + axis[1] * 2.25, base[2] + axis[2] * 2.25], 0.3, { crease: false, detail: true });
  }
  k.line([at(0, R - 0.2, -0.8), at(0, R + 1.3, -0.8)], { tone: 'mid' });
  k.ball(at(0, R + 1.55, -0.8), 0.38, { crease: false });
  const back = at(0, 0, -depth / 2);
  const shell = k.lathe(back, [[R - 0.35, 0], [R, 0.35], [R, depth - 0.45], [R - 0.3, depth]], { axis: NEAR, n: 64 });
  shell.seam(depth - 0.45, { tone: 'lo' });
  const face = k.face(at(0, 0, depth / 2), RIGHT, UP);
  const f = k.on(face);
  f.circle(0, 0, R - 0.55, { tone: 'mid', fill: 'ground' });
  for (let i = 0; i < 12; i++) {
    const t = rad(i * 30), r0 = i % 3 === 0 ? R - 1.35 : R - 1.1, r1 = R - 0.85;
    f.line([[r0 * Math.cos(t), r0 * Math.sin(t)], [r1 * Math.cos(t), r1 * Math.sin(t)]], { tone: i % 3 === 0 ? 'mid' : 'lo', detail: i % 3 !== 0 });
  }
  const hour = rad(90 - 300), minute = rad(90 - 60);
  f.line([[1.75 * Math.cos(hour), 1.75 * Math.sin(hour)], [0, 0], [2.6 * Math.cos(minute), 2.6 * Math.sin(minute)]], { tone: 'accent' });
  f.dot(0, 0, { r: 0.22, tone: 'accent' });
  f.line([[0, 0], [2.1 * Math.cos(rad(90 - 210)), 2.1 * Math.sin(rad(90 - 210))]], { tone: 'lo', detail: true });
};

/**
 * Optional integrations: a dock with three slots, two modules seated and the third lifted over its
 * contacts, to be reviewed before it goes in; the lifted module is the accent.
 */
export const integrations: IconDraw = (k) => {
  k.line([[1.5, 0.2, 0.6], [0.8, -1.8, 0.2], [-1.8, -2.6, 0.2], [-3.4, -1.6, 0.2]], { tone: 'mid', detail: true });
  k.box(0, 0, 15, 6.6, 0, 2.2, { r: 1.2, b: 0.5 });
  k.pane('y', 6.6, 1.0, 0.7, 14.0, 1.5, { r: 0.35, tone: 'lo', detail: true });
  for (const u of [12.0, 12.8, 13.6]) k.shape('y', 6.6, arc(u, 1.1, 0.16, 0, 360, 8), { tone: 'mid', detail: true });
  const slots: [number, number][] = [[0.9, 4.6], [5.7, 9.3], [10.4, 14.1]];
  for (const [x0, x1] of slots) k.plate(x0, 0.9, x1, 5.7, 2.2, { r: 0.5, tone: 'lo' });
  for (const [x0, x1] of slots) for (let i = 0; i < 5; i++) k.dot(x0 + 0.85 + i * ((x1 - x0 - 1.7) / 4), 3.3, 2.2, { r: 0.17, tone: 'mid', detail: x0 < 10 });
  k.box(1.0, 1.0, 4.5, 5.6, 2.2, 5.6, { r: 0.7, b: 0.3 });
  k.cyl(2.75, 3.3, 1.0, 5.6, 6.3, { b: 0.3 });
  k.cyl(2.75, 3.3, 0.35, 6.3, 6.6, { b: 0.1, detail: true });
  k.box(5.8, 1.0, 9.2, 5.6, 2.2, 4.6, { r: 0.7, b: 0.3 });
  for (let i = 0; i < 4; i++) k.line([[6.6 + i * 0.6, 5.6, 3.0], [6.6 + i * 0.6, 5.6, 3.9]], { tone: 'lo', detail: true });
  k.pane('x', 9.2, 2.0, 3.0, 4.6, 3.9, { r: 0.3, tone: 'lo', detail: true });
  k.box(11.3, 2.6, 13.2, 4.0, 4.0, 4.9, { r: 0.25, b: 0.1, tone: 'accent' });
  k.box(10.5, 1.0, 14.0, 5.6, 4.9, 7.8, { r: 0.7, b: 0.3, tone: 'accent' });
  k.plate(11.2, 1.7, 13.3, 4.9, 7.8, { r: 0.35, tone: 'lo', detail: true });
  k.pane('y', 5.6, 11.4, 5.7, 13.1, 6.9, { r: 0.3, tone: 'lo', detail: true });
};

/**
 * The locked-down default, Fortress: a keep with a round tower at each corner, crenellated walls and
 * arrow slits; its closed gate is the accent.
 */
export const security: IconDraw = (k) => {
  const lo = 0.9, wall = 6.6, tower = 8.8, R = 1.95, a = 1.4, b = 11.4;
  k.box(-1.6, -1.6, 14.4, 14.4, 0, lo, { r: 2.6, b: 0.7 });
  const turret = (x: number, y: number) => {
    k.cyl(x, y, R, lo, tower - 0.5, { b: 0.4 });
    k.cyl(x, y, R + 0.25, tower - 0.5, tower, { b: 0.35 });
    const merlons = Array.from({ length: 8 }, (_, i) => rad(22.5 + i * 45)).sort((p, q) => Math.cos(p) + Math.sin(p) - (Math.cos(q) + Math.sin(q)));
    for (const t of merlons) {
      const mx = x + (R - 0.15) * Math.cos(t), my = y + (R - 0.15) * Math.sin(t);
      const even = Math.round((t / Math.PI) * 4 - 0.5) % 2 === 0;
      k.box(mx - 0.42, my - 0.42, mx + 0.42, my + 0.42, tower, tower + 0.75, { r: 0.18, b: 0.08, detail: !even });
    }
    for (const z of [3.0, 5.6]) k.line([[x + R * Math.cos(rad(45)), y + R * Math.sin(rad(45)), z], [x + R * Math.cos(rad(45)), y + R * Math.sin(rad(45)), z + 1.0]], { tone: 'mid', detail: true });
    k.line(Array.from({ length: 13 }, (_, i): Vec3 => [x + R * Math.cos(rad(-45 + i * 15)), y + R * Math.sin(rad(-45 + i * 15)), lo + 2.0]), { tone: 'lo', detail: true });
  };
  const merlonRow = (pts: [number, number][]) => {
    for (const [x, y] of pts.sort((p, q) => p[0] + p[1] - (q[0] + q[1]))) k.box(x - 0.45, y - 0.45, x + 0.45, y + 0.45, wall, wall + 0.75, { r: 0.15, b: 0.08, detail: true });
  };
  const along = (fixed: number, axis: 'x' | 'y') => {
    const out: [number, number][] = [];
    for (let s = a + 2.6; s <= b - 2.4; s += 1.6) out.push(axis === 'x' ? [s, fixed] : [fixed, s]);
    return out;
  };
  turret(a, a);
  k.box(a, a, b, b, lo, wall, { r: 0.3, b: 0.25 });
  for (const z of [2.4, 3.9, 5.4]) {
    k.line([[a + 2.2, b, z], [b - 2.2, b, z]], { tone: 'lo', detail: true });
    k.line([[b, a + 2.2, z], [b, b - 2.2, z]], { tone: 'lo', detail: true });
  }
  for (const u of [3.4, 9.4]) k.pane('y', b, u - 0.18, 3.8, u + 0.18, 5.2, { r: 0.15, tone: 'mid', detail: true });
  for (const u of [3.4, 6.4, 9.4]) k.pane('x', b, u - 0.18, 3.8, u + 0.18, 5.2, { r: 0.15, tone: 'mid', detail: true });
  const g0 = 4.9, g1 = 7.9, gTop = 3.9;
  const gate: [number, number][] = [[g0, lo], [g1, lo], ...arc((g0 + g1) / 2, gTop, (g1 - g0) / 2, 0, 180, 14)];
  k.shape('y', b, gate, { tone: 'accent', fill: 'ground' });
  for (let u = g0 + 0.6; u < g1 - 0.3; u += 0.6) {
    const top = gTop + Math.sqrt(Math.max(0, ((g1 - g0) / 2) ** 2 - (u - (g0 + g1) / 2) ** 2)) - 0.1;
    k.line([[u, b, lo], [u, b, top]], { tone: 'accent', detail: true });
  }
  for (const z of [2.0, 3.2, 4.4]) k.line([[g0 + 0.05, b, z], [g1 - 0.05, b, z]], { tone: 'accent', detail: true });
  merlonRow([...along(a, 'x'), ...along(a, 'y')]);
  turret(a, b);
  turret(b, a);
  merlonRow([...along(b, 'x'), ...along(b, 'y')]);
  turret(b, b);
};
