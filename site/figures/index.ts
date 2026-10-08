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
import { mount as uruHome, ROBOT } from './uru-home';
import { mount as assistantDesk } from './assistant-desk';
import { mount as uruStudy } from './uru-study';
import { mount as uruFaces } from './uru-faces';

export const FIGURES = {
  'uru-home': {
    id: 'uru-home',
    label: `A concept drawing of ${ROBOT}, a soft round helper robot, at home in a living room with an armchair, a cup of tea, a photo album, a window, a bookshelf and a phone, a cat asleep on the rug. Point at one and ${ROBOT} turns toward it: the cup lifts, the album opens, the curtains part, a book slides out or the phone tips up.`,
    subject: `${ROBOT} at home`,
    hint: 'Point around the room',
    touch: 'Tap around the room',
    rest: 'rest',
    range: [3, 6, 9], // the head tilt, in degrees
    viewBox: [20, 3, 360, 310],
    tour: { mode: 'step', points: [[182, 128.9], [317, 119.3], [285, 162], [317, 167.7], [101, 167.7], [74, 128.9]] }, // hello, window, tea, photos, book, call
    engine: uruHome,
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
  'uru-study': {
    id: 'uru-study',
    label: `An illustration of ${ROBOT}, the helper robot we are researching. It is not a design. ${ROBOT}'s soft cover, a soft inner shell, a light frame and the gliding base ring are drawn apart above a sketching board with three fabric swatches. Pointing at a layer draws the layers above it clear.`,
    subject: `${ROBOT}, in layers`,
    hint: 'Point at a layer',
    touch: 'Tap a layer',
    rest: 'rest',
    range: [6, 10, 14], // the lift, in world units
    viewBox: [89, 6, 222, 308], // portrait; holds at the slider's top end
    tour: { mode: 'step', points: [[200, 112], [200, 195], [200, 232], [200, 262]] }, // cover, shell, frame, base
    engine: uruStudy,
  },
  'uru-faces': {
    id: 'uru-faces',
    label: `${ROBOT} on a braided rug beside a sideboard on which stand five framed portraits of its face, one expression each: happy, curious, listening, thinking and sleepy. Pointing at a portrait lifts it and turns it to face you, and ${ROBOT} turns toward it and takes on that expression.`,
    subject: `${ROBOT}'s faces`,
    hint: 'Point at a portrait',
    touch: 'Tap a portrait',
    rest: 'rest',
    range: [3, 5, 7], // the rise, in world units
    viewBox: [27, 9, 346, 305], // holds at the slider's top end
    tour: { mode: 'step', points: [[191.4, 104.3], [226, 123.4], [251.9, 132.9], [286.5, 152], [321.1, 171]] }, // happy, curious, listening, thinking, sleepy
    engine: uruFaces,
  },
} satisfies Record<string, Spec>;

export type FigureName = keyof typeof FIGURES;
