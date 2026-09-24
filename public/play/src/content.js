// Resonance content: every number a player can feel lives here, so balance passes touch one file.

export const W = 360;
export const H = 560;
export const CENTER = { x: 180, y: 280 };
export const GRID = 4; // ticks per beat: the orchestra thinks in sixteenth notes

// Beings keep their identity for the whole run. Development changes how they play, never what they are.
export const BEINGS = {
  thread: {
    name: 'Thread', role: 'Sings a single line at the closest threat.', voice: 'thread', color: '#dfb3ee',
    hp: 30, range: 112, damage: 6, period: 4, subMax: 2, relay: 72, targets: 1, costScale: 1,
  },
  pulse: {
    name: 'Pulse', role: 'A low heartbeat that thumps everything near its target.', voice: 'pulse', color: '#ee9fb4',
    hp: 52, range: 84, damage: 5, period: 4, subMax: 1, relay: 62, splash: 30, costScale: 1.1,
  },
  bell: {
    name: 'Bell', role: 'Rings slowly and far, striking several threats at once.', voice: 'bell', color: '#f4ce9e',
    hp: 26, range: 146, damage: 13, period: 8, subMax: 2, relay: 80, targets: 3, costScale: 1.3,
  },
  drone: {
    name: 'Drone', role: 'Holds a low field that slows everything inside it. Carries the pulse far.', voice: 'drone', color: '#9fd6c4',
    hp: 44, range: 92, damage: 3, period: 16, subMax: 1, relay: 104, slow: 0.45, aura: true, costScale: 1.2,
  },
  spark: {
    name: 'Spark', role: 'Quick bright figures that leap between nearby threats.', voice: 'spark', color: '#a9c4ff',
    hp: 22, range: 100, damage: 3, period: 2, subMax: 1, relay: 56, chain: 3, costScale: 1.25,
  },
};

// Developments per being. `max` may be overridden per identity (subdivision uses subMax).
export const DEVELOPMENTS = {
  mastery: { name: 'Mastery', verb: 'deepens its technique', base: 28, growth: 1.75, max: 6 },
  subdivision: { name: 'Subdivision', verb: 'plays twice as often', base: 55, growth: 2.3 },
  octave: { name: 'Octave', verb: 'adds another octave to its voice', base: 60, growth: 2.2, max: 2 },
  reach: { name: 'Reach', verb: 'carries the pulse farther', base: 34, growth: 1.9, max: 3 },
};

export const ENEMIES = {
  drifter: { name: 'Drifter', hp: 12, speed: 16, radius: 8, dps: 5, strike: 8, reward: 1, color: '#ec9d92' },
  darter: { name: 'Darter', hp: 7, speed: 36, radius: 6, dps: 3, strike: 5, reward: 1, color: '#f4ce9e' },
  shell: { name: 'Shell', hp: 42, speed: 10, radius: 11, dps: 9, strike: 15, reward: 3, armor: 2, siege: true, color: '#a6bfee' },
};

export const WELL = { hp: 40, radius: 13, yield: 3, buildBase: 18, buildGrowth: 1.55, upgradeBase: 22, upgradeGrowth: 1.7, max: 8 };

export const CONDUCTOR = { hp: 100, reach: 96, power: 100, regen: 12, strikeRadius: 24, strikeCost: 4, accentCost: 6, gustCost: 30, wardDrain: 15, singCost: 45, singCooldown: 20, singLength: 8 };

// Orchestra-wide growth: bought with Resonance within a run.
export const GLOBAL = {
  touch: { name: 'Touch', detail: 'Each tap gathers and strikes harder.', base: 18, growth: 1.9, max: 12 },
  tempo: { name: 'Tempo', detail: 'The whole orchestra, and every well, plays faster.', base: 60, growth: 1.75, max: 8 },
  reach: { name: 'Conductor reach', detail: 'Your pulse travels farther before it needs a relay.', base: 55, growth: 2.1, max: 4 },
  breath: { name: 'Breath', detail: 'Conductor power returns faster.', base: 40, growth: 1.85, max: 6 },
};

// Echoes persist between runs. Each is a small, legible head start rather than a new system.
export const ECHOES = {
  headStart: { name: 'Head start', detail: '+25 starting Resonance', base: 3, growth: 1.6, max: 8 },
  deepWells: { name: 'Deep wells', detail: '+12% well yield', base: 4, growth: 1.7, max: 8 },
  steadyHand: { name: 'Steady hand', detail: '+1 Resonance per tap', base: 4, growth: 1.8, max: 6 },
  widePulse: { name: 'Wide pulse', detail: '+10 conductor reach', base: 5, growth: 1.9, max: 4 },
  resolve: { name: 'Resolve', detail: '+20 conductor health', base: 4, growth: 1.7, max: 6 },
};

// Motifs are this run's variation: one of three is offered after certain waves.
export const MOTIFS = {
  echoGust: { name: 'Echoing gust', detail: 'Every swipe returns one beat later at half strength.' },
  lingerWard: { name: 'Lingering ward', detail: 'Your ward lasts two seconds after you let go.' },
  beatChorus: { name: 'Beat chorus', detail: 'On-beat taps strike everything in a wide circle.' },
  doubleWells: { name: 'Answering wells', detail: 'Wells ring again on the third beat at half yield.' },
  sympathy: { name: 'Sympathetic strings', detail: 'An accent spreads to every connected neighbour.' },
  longPulse: { name: 'Long pulse', detail: 'Every being carries the pulse 20 farther.' },
  kindRepair: { name: 'Kind repair', detail: 'Rebuilding costs half as much.' },
  harvest: { name: 'Harvest song', detail: 'Defeated threats leave twice as much Resonance.' },
};
export const MOTIF_WAVES = [3, 7, 12, 17, 23, 30];

export const SITES = {
  // Ring radii scale an ellipse around the conductor; each ring lists what sleeps there.
  rings: [
    { radius: 88, contents: ['well', 'well', 'being'] },
    { radius: 158, contents: ['well', 'being', 'being', 'well'] },
    { radius: 222, contents: ['being', 'well', 'being', 'being', 'well'] },
  ],
  // Identities discovered in order of distance: familiar voices close, strange ones far.
  beingOrder: ['bell', 'drone', 'thread', 'spark', 'pulse', 'bell', 'drone', 'spark'],
};

export const AWAKEN = { base: 26, growth: 1.42 };
export const REBUILD_SHARE = 0.4;
export const INTERLUDE = { first: 35, normal: 22 };
export const CRISIS_EVERY = 5;
export const OFFLINE_CAP = 8 * 3600;
