import { unit, type IconDraw, type Vec3 } from '../kit';
import { along, arc, rad, RIGHT, pebble, UP, uruBox } from './parts';

/**
 * Uru, and what we want Uru to be: Uru itself, and "Made to carry", a cairn of three smooth pebbles. "Yours,
 * and only yours" shares the on-your-side icon, and "A memory you control" the assistant's memory icon.
 *
 * Uru is under wraps: its icon is the teaser the figures draw too (figures/uru-sealed.ts), a small square
 * box whose lid is lifted a crack, with Uru's two dome eyes peeking out of the dark gap and nothing between
 * them. The gap is the drawing's one dark solid; the eyes on it are its accent. The box is a light solid, as
 * the figures drew Uru's body: on the night band it stays white, with the dark gap.
 */

/** Uru, under wraps: the square box, its lid lifted a crack, the eyes peeking out of the gap; the eyes are the accent. */
export const uru: IconDraw = (k) => {
  const W = 9, H = 6.2;
  k.disc(W / 2, W / 2, W * 0.74, 0, { tone: 'lo', detail: true });
  uruBox(k, 0, 0, 0, W, H, { open: true, light: true });
  // a round seal on the right-front face with the rune ᚢ on it, along the centre line of the mark's bold cut:
  // its stem on the left as we see it, the roof falling to the right and the shorter leg straight down (across
  // this face, y runs right to left)
  const sy = W * 0.5, sz = H * 0.46, s = 1.75;
  k.light(true);
  k.shape('x', W, arc(sy, sz, 1.05, 0, 360, 28), { tone: 'mid', fill: 'ground', detail: true });
  k.shape('x', W, arc(sy, sz, 0.8, 0, 360, 24), { tone: 'lo', detail: true });
  k.line(([[0.124, -0.22], [0.124, 0.22], [-0.124, 0.067], [-0.124, -0.22]] as const).map(([a, b]): Vec3 => [W + 0.01, sy + a * s, sz + b * s]), { tone: 'mid', detail: true });
  k.light(false);
};

/** Made to carry: a cairn of three smooth pebbles, small, well made and settled; the top pebble is the accent. */
export const presence: IconDraw = (k) => {
  k.disc(0.2, 0.1, 5.4, 0, { tone: 'lo', detail: true });
  for (const [x, y, h, lean] of [[-3.9, 2.6, 1.6, -0.5], [-3.5, 3.1, 1.2, 0.3], [-4.3, 2.3, 1.0, -0.9]] as const) {
    k.line([[x, y, 0], [x + lean * 0.4, y, h * 0.6], [x + lean, y, h]], { tone: 'lo', detail: true });
  }
  pebble(k, [0, 0, 1.35], 4.0, 3.25, 1.35, 18);
  pebble(k, [0.35, -0.15, 3.5], 2.9, 2.35, 1.05, -14);
  pebble(k, [0.15, 0.1, 5.3], 1.95, 1.62, 0.88, 32, { tone: 'accent' });
  pebble(k, [4.6, 2.9, 0.48], 0.95, 0.75, 0.48, 10, { detail: true });
};
