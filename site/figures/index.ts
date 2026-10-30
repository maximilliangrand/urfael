import type { Spec } from '../hairline/mount';

/**
 * The figures the site draws, by the name a plate gives in data-figure:
 * `<figure class="plate" data-figure="name" data-fig="1">`. Each one is an
 * engine in this folder, drawn to the hairline-create skill's ten rules, and
 * its spec, which carries everything the figure says about itself:
 *
 *   name: {
 *     id: 'name',                 // the figure's own name, as data-hairline on its stage
 *     label: '…',                 // the accessible name: what it shows and what the pointer does, a sentence or two
 *     subject: '…',               // the plate's top-right corner, two or three words
 *     hint: 'Point at …',         // the plate's bottom-left corner, an instruction
 *     touch: 'Tap …',             // the hint on touch screens (optional)
 *     rest: 'rest',               // the read-out before anything is touched
 *     range: [lo, mid, hi],       // the engine's own number at intensity 0, 0.5 and 1; the plate mounts at 0.5
 *     viewBox: [x, y, w, h],      // a crop of the 400 × 320 drawing (optional); it sets the plate's aspect ratio
 *     tour: { mode: 'step', points: [[x, y], …] },  // where scrolling points, in viewBox units (optional)
 *     focusable: true,            // keyboard-operable, with a live region (optional)
 *     engine: mount,              // the figure's mount function
 *   },
 *
 * A figure joins by being imported here and listed below. Nothing in a
 * figure may touch the DOM when it is imported: the build imports this
 * registry in Node to write each plate's aspect ratio into plate.css.
 */

// demo.ts stays in this folder as the commented example figure; it is not on the site, so it is not registered.
import { mount as assistantDesk } from './assistant-desk';
import { mount as uruFaces } from './uru-faces';
import { mount as uruSealed } from './uru-sealed';
import { ROBOT } from './uru-kit';

export const FIGURES = {
  'uru-sealed': {
    id: 'uru-sealed',
    label: `Two sealed boxes on a shop plinth, a square one and a round tin, each closed with a paper band and a round seal. The tin's lid sits a little ajar, and ${ROBOT}'s eyes peek out of the dark gap. Point at a box, or move between them with the arrow keys, and its lid lifts a crack and ${ROBOT} peeks out.`,
    subject: `${ROBOT}, under wraps`,
    hint: 'Point at a box',
    touch: 'Tap a box',
    rest: 'rest',
    range: [3, 3.8, 4.6], // the lid's lift at its front edge, in world units
    viewBox: [10, 3, 380, 318], // holds at the slider's top end
    tour: { mode: 'step', points: [[161, 112.7], [222.7, 179.7]] }, // square box, round tin
    focusable: true, // the arrow keys walk the two boxes; Escape or blur returns to rest
    engine: uruSealed,
  },
  'assistant-desk': {
    id: 'assistant-desk',
    label: 'The open-source assistant as a working desk in a room corner: a laptop with the Console open, a desk microphone, a card cabinet, a code window beside a checkpoint stack, a docked phone with chat bubbles, a wall clock and calendar, and a padlocked strongbox on a shelf, with the computer it runs on under the desk. Pointing at a part, or moving through the parts with the arrow keys, lifts it and shows what it does while the others settle back.',
    subject: 'Assistant desk',
    hint: 'Point at a part',
    touch: 'Tap a part',
    rest: 'rest',
    range: [6, 10, 14], // the lift, in world units
    viewBox: [30, 1, 340, 322],
    tour: { mode: 'step', points: [[140.5, 121.8], [200, 131.8], [132, 91.6], [259.5, 162], [72.5, 91.6], [302, 151.9], [251, 81.5]] }, // voice, console, memory, code, reminders, channels, security
    focusable: true, // arrow keys walk the parts in story order; Escape or blur returns to rest
    engine: assistantDesk,
  },
  'uru-faces': {
    id: 'uru-faces',
    label: `Five framed portraits of ${ROBOT}'s face on a sideboard, one expression each: happy, curious, listening, thinking and sleepy, with a floor lamp in the corner. One portrait is awake. Pointing at a portrait lifts it and turns it to face you, and it comes alive and takes on its expression.`,
    subject: `${ROBOT}'s faces`,
    hint: 'Point at a portrait',
    touch: 'Tap a portrait',
    rest: 'rest',
    range: [3, 5, 7], // the rise, in world units
    viewBox: [26, 1, 348, 322], // holds at the slider's top end
    tour: { mode: 'step', points: [[149.1, 90.9], [191, 114], [233.5, 126.7], [272.7, 150.1], [310.7, 170.1]] }, // happy, curious, listening, thinking, sleepy
    engine: uruFaces,
  },
} satisfies Record<string, Spec>;

export type FigureName = keyof typeof FIGURES;
