import type { IconDraw } from './kit';
import * as assistant from './set/assistant';
import * as principles from './set/principles';
import * as site from './set/site';
import * as uru from './set/uru';

/**
 * Every icon the site draws, by its file name in docs/assets/icons/. Each group lives in its own file under
 * set/. A name here is the contract with the pages: renaming one renames its files.
 */
export const ICONS = {
  voice: assistant.voice,
  console: assistant.console,
  memory: assistant.memory,
  coding: assistant.coding,
  automation: assistant.automation,
  integrations: assistant.integrations,
  security: assistant.security,
  gentle: principles.gentle,
  private: principles.privateHome,
  'honest-about-limits': principles.honest,
  'human-in-the-loop': principles.human,
  'on-your-side': principles.onYourSide,
  'open-to-inspection': principles.openBook,
  uru: uru.uru,
  'soft-presence': uru.presence,
  tests: site.tests,
  install: site.install,
  research: site.research,
  follow: site.follow,
} satisfies Record<string, IconDraw>;

export type IconName = keyof typeof ICONS;

/**
 * What each icon is for and what it shows, for the people building the pages; written into icons.json.
 * `card` is the heading the strategy's copy gives the icon's card (strategy.md section 4); `shows` is the
 * object and its accent part. The text beside an icon carries the meaning, so the icon itself is decorative.
 */
export const ABOUT: Record<IconName, { page: string; card: string; shows: string }> = {
  voice: { page: '/assistant', card: 'Local voice.', shows: 'A desk microphone with a mesh grille; the hold-to-talk key on its base is the accent.' },
  console: { page: '/assistant', card: 'One assistant, several doors.', shows: 'A monitor showing the Console, conversation list and chat, with a keyboard; the orb HUD on the screen is the accent.' },
  memory: { page: '/assistant and /uru', card: 'A memory you can search. Also: A memory you control.', shows: 'An index-card box with its lid tipped back and dividers; the card drawn up out of it is the accent.' },
  coding: { page: '/assistant', card: 'Coding with an undo.', shows: 'An open laptop with code beside a timeline of checkpoints; the checkpoint to rewind to is the accent.' },
  automation: { page: '/assistant', card: 'Reminders, jobs and chat.', shows: 'A twin-bell alarm clock facing you; its hands are the accent.' },
  integrations: { page: '/assistant', card: 'Room to grow, carefully.', shows: 'A dock with two modules seated and a third lifted over its contacts; the lifted module is the accent.' },
  security: { page: '/assistant', card: 'Local by design, honest about the edges', shows: 'A keep with four round towers, crenellations and arrow slits: Fortress, the default mode; its closed gate is the accent.' },
  gentle: { page: '/ and /uru', card: 'Calm by design.', shows: 'A plump tufted cushion with a feather resting on it; the feather is the accent.' },
  private: { page: '/ and /uru', card: 'Locked down by default. Also: Private by default.', shows: 'A small house with its door shut and the curtains drawn; the curtains are the accent.' },
  'honest-about-limits': { page: '/ and /uru', card: 'Honest about limits.', shows: 'A spirit level ruled along its top; its bubble is the accent.' },
  'human-in-the-loop': { page: '/uru', card: 'Open with everyone around you.', shows: 'A person at the centre of a round track with Uru\'s small box, shut, on the track; the person is the accent.' },
  'on-your-side': { page: '/ and /uru', card: 'On your side. Also: Yours, and only yours.', shows: 'A person and Uru\'s small square box side by side under one umbrella, which the person holds over them both; the umbrella is the accent.' },
  'open-to-inspection': { page: '/', card: 'Open to inspection. Also: Built in the open.', shows: 'An open book, its pages ruled; the ribbon run out over its edge is the accent.' },
  uru: { page: '/, /uru, /assistant (cross-link), 404', card: 'Uru (the product card, the cross-link band)', shows: 'Uru, under wraps: a small square box, its lid lifted a crack, and Uru\'s two dome eyes peeking out of the dark gap, nothing between them; a round seal with the rune on its side (96px and up). The eyes are the accent.' },
  'soft-presence': { page: '/uru', card: 'Made to carry.', shows: 'A cairn of three smooth pebbles; the top pebble is the accent.' },
  tests: { page: '/assistant', card: 'Tests you can run yourself', shows: 'A multimeter with leads and probes; the selector knob is the accent.' },
  install: { page: '/assistant', card: 'Install', shows: 'An opened box with its flaps folded out, its contents lifting free; the contents are the accent.' },
  research: { page: '/uru', card: 'Where we are. Also: the "In development" status.', shows: 'A banding wheel on the bench with a round tin on it, its lid on and a paper band sealing it (96px and up), and a pencil laid by; the sealed tin is the accent.' },
  follow: { page: '/ and /uru', card: 'Follow along. Also: Come along for the build.', shows: 'A mailbox on its post with the flag up; the flag is the accent.' },
};
