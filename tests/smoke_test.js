// Headless smoke test for Flying Shetos (node tests/smoke_test.js) - no browser needed.
// Boots the real inline game script inside a stubbed DOM and simulates frames.
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
const code = blocks[blocks.length - 1];

const out = [];
const log = (...a) => out.push(a.join(' '));

// ---- canvas 2d context stub ----
function makeCtx() {
  const store = {};
  const gradient = { addColorStop() {} };
  return new Proxy(store, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => gradient;
      if (p === 'measureText') return () => ({ width: 42 });
      return () => undefined;
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
const ctx2d = makeCtx();

// ---- element stub ----
function makeEl(tag) {
  const el = {
    tagName: tag || 'DIV', children: [], dataset: {},
    style: new Proxy({}, { get: (t, p) => (p in t ? t[p] : ''), set: (t, p, v) => { t[p] = v; return true; } }),
    classList: (() => { const set = new Set(); return { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c), toggle: (c, f) => { f = f === undefined ? !set.has(c) : !!f; f ? set.add(c) : set.delete(c); return f; } }; })(),
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, insertBefore() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    closest: () => null, querySelector: () => makeEl(), querySelectorAll: () => [],
    getContext: () => ctx2d, width: 480, height: 360, clientWidth: 480, clientHeight: 360,
    innerHTML: '', innerText: '', textContent: '', value: '', checked: false, disabled: false,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 480, bottom: 360, width: 480, height: 360 }),
    focus() {}, blur() {}, click() {}, play: () => Promise.resolve(), pause() {},
  };
  return el;
}
const elements = {};
const documentStub = {
  getElementById: (id) => elements[id] || (elements[id] = makeEl()),
  querySelectorAll: () => [], querySelector: () => makeEl(),
  addEventListener() {}, removeEventListener() {},
  createElement: (t) => makeEl(t), createElementNS: (ns, t) => makeEl(t),
  body: makeEl('BODY'), documentElement: makeEl('HTML'), head: makeEl('HEAD'),
  hidden: false, visibilityState: 'visible',
  fonts: { ready: Promise.resolve(), load: () => Promise.resolve() },
};

class ImageStub {
  constructor() { this.complete = true; this.naturalWidth = 100; this.naturalHeight = 100; this.width = 50; this.height = 50; }
  set src(v) { this._src = v; if (this.onload) setTimeout(() => this.onload && this.onload(), 0); }
  get src() { return this._src; }
  addEventListener() {}
}
class AudioStub {
  constructor(src) { this.src = src; this.currentTime = 0; this.volume = 1; this.playbackRate = 1; this.paused = true; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {} cloneNode() { return new AudioStub(this.src); }
  addEventListener() {} removeEventListener() {}
}
const lsStore = {};
const localStorageStub = {
  getItem: (k) => (k in lsStore ? lsStore[k] : null),
  setItem: (k, v) => { lsStore[k] = String(v); },
  removeItem: (k) => { delete lsStore[k]; },
  clear: () => { for (const k in lsStore) delete lsStore[k]; },
};

const rafCbs = [];
const sandbox = {
  console: { log, warn: () => {}, error: (...a) => out.push('CONSOLE ERROR: ' + a.join(' ')) },
  document: documentStub, localStorage: localStorageStub,
  Image: ImageStub, Audio: AudioStub,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => { rafCbs.push(cb); return rafCbs.length; },
  cancelAnimationFrame: () => {},
  setInterval: () => 0, clearInterval: () => {},
  setTimeout: () => 0, clearTimeout: () => {},   // don't run deferred UI timers
  navigator: { language: 'en', userAgent: 'node-smoke', onLine: true },
  location: { href: 'http://localhost/', hostname: 'localhost', reload() {}, search: '' },
  innerWidth: 960, innerHeight: 720, devicePixelRatio: 1,
  fetch: () => Promise.resolve({ json: () => Promise.resolve({}), ok: true }),
  HTMLMediaElement: class HTMLMediaElement {}, HTMLElement: class HTMLElement {},
  HTMLInputElement: class HTMLInputElement {}, HTMLCanvasElement: class HTMLCanvasElement {},
  Event: class Event { constructor(t) { this.type = t; } }, KeyboardEvent: class KeyboardEvent { constructor(t) { this.type = t; } },
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {},
  scrollTo: () => {}, alert: () => {}, prompt: () => null, confirm: () => false,
  __log: log,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

let failed = 0;
function check(name, cond, extra) {
  log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra !== undefined ? ' | ' + extra : ''));
  if (!cond) failed++;
}

try {
  vm.runInContext(code, sandbox, { filename: 'game-inline.js' });
  check('script boots without throwing', true);
} catch (e) {
  check('script boots without throwing', false, e.message);
  console.log(out.join('\n'));
  process.exit(1);
}

function run(snippet) { return vm.runInContext(snippet, sandbox, { filename: 'test-snippet.js' }); }
function stepFrames(n) { for (let i = 0; i < n; i++) run('Do_a_Frame();'); }

try {
  // --- skins registered correctly ---
  check('SKINS.santa exists with cost 240 + assets', run(`SKINS.santa && SKINS.santa.cost === 240 && SKINS.santa.src === 'santa_shetos.png' && SKINS.santa.big === 'big_santa_shetos.png'`));
  check('SKINS.witch exists with cost 260 + assets', run(`SKINS.witch && SKINS.witch.cost === 260 && SKINS.witch.src === 'witch_shetos.png' && SKINS.witch.big === 'big_witch_shetos.png'`));
  check('translations exist (en/de/ar/it)', run(`['en','de','ar','it'].every(l => TRANSLATIONS[l].santaBtn && TRANSLATIONS[l].sleighBlitzMsg && TRANSLATIONS[l].niceFilterMsg && TRANSLATIONS[l].witchBtn && TRANSLATIONS[l].broomMsg && TRANSLATIONS[l].batsMsg && TRANSLATIONS[l].batsLabel)`));

  // --- equip santa, button appears (only inside a run, like every other ability button) ---
  run(`availableSkins.push('santa', 'witch'); currentSkinKey = 'santa'; game_mode = 'running'; updateAbilityButtons();`);
  check('GIFT button visible for santa skin', elements['santa-btn'] && elements['santa-btn'].style.display === 'flex', elements['santa-btn'] && elements['santa-btn'].style.display);
  run(`currentSkinKey='default'; updateAbilityButtons();`);
  check('GIFT button hidden for default skin', elements['santa-btn'].style.display === 'none', elements['santa-btn'].style.display);
  run(`currentSkinKey = 'santa'; updateAbilityButtons();`);

  // --- start a run ---
  run(`game_mode = 'running'; isEndless = false; reset_game(); game_mode = 'running';`);
  stepFrames(3);

  // --- Naughty or Nice: pipe conversion ---
  run(`pipes.length = 0; for (let i = 0; i < 4; i++) { add_pipe(960, 120, 140); pipes.forEach(p => p.x -= 300); }
       const ids4 = [...new Set(pipes.map(p => p.pairId))]; pipes.forEach(p => p.x = 400 + ids4.indexOf(p.pairId) * 250);`);
  const pipeCount = run('pipes.length');
  run('activateNiceFilter();');
  const niceSegs = run('pipes.filter(p => p.nice).length');
  const nicePairs = run('new Set(pipes.filter(p => p.nice).map(p => p.pairId)).size');
  const quota = run('nicePipeQuota');
  check('filter converts 4 segments of 4 distinct pairs', niceSegs === 4 && nicePairs === 4, `segs=${niceSegs} pairs=${nicePairs} pipes=${pipeCount}`);
  check('quota exhausted when 4+ pairs ahead', quota === 0, 'quota=' + quota);
  check('each pair keeps one naughty side', run(`[...new Set(pipes.map(p => p.pairId))].every(id => { const m = pipes.filter(p => p.pairId === id); return m.some(q => q.nice) && m.some(q => !q.nice); })`));
  check('filter window active 7s', run('isNiceFilterActive === true && niceFilterTimer === 7 * FPS'), run('niceFilterTimer'));

  // quota: only 2 pairs ahead -> 2 converted, 2 left for the next spawns
  run(`isNiceFilterActive = false; niceFilterTimer = 0; pipes.forEach(p => p.nice = false); pipes.length = 0; for (let i = 0; i < 2; i++) { add_pipe(960, 120, 140); pipes.forEach(p => p.x -= 300); }
       const ids2 = [...new Set(pipes.map(p => p.pairId))]; pipes.forEach(p => p.x = 400 + ids2.indexOf(p.pairId) * 250); activateNiceFilter();`);
  check('fewer pairs ahead -> leftover quota', run('pipes.filter(p => p.nice).length === 2 && nicePipeQuota === 2'), run('nicePipeQuota'));
  run(`add_pipe(960, 120, 140);`);
  check('next spawned pair spends quota', run(`nicePipeQuota === 1 && pipes.filter(p => p.pairId === pipePairCounter && p.nice).length === 1`));
  run(`nicePipeQuota = 0;`);

  // nice pipes are passable: slide a nice pipe over the pinned bird
  // (bird.y = pipe.y + 10 sits inside the column for BOTH orientations)
  run(`const np = pipes.find(p => p.nice); np.x = bird.x - 15; bird.y = np.y + 10; bird.velocity_y = 0; game_mode = 'running';`);
  stepFrames(2);
  check('bird passes through nice pipe without dying', run(`game_mode === 'running'`), run('game_mode'));

  // naughty pipe still kills
  run(`santaCooldown = 0; isNiceFilterActive = false; niceFilterTimer = 0; pipes.forEach(p => p.nice = false);`);
  run(`const bp = pipes.find(p => p.visible); bp.x = bird.x - 15; bird.y = bp.y + 10; bird.velocity_y = 0;`);
  stepFrames(2);
  check('naughty pipe still lethal', run(`game_mode === 'over'`), run('game_mode'));

  // --- Sleigh Blitz: smashes pipes, invincible, magnet, 4x speed ---
  run(`game_mode = 'running'; reset_game(); game_mode = 'running'; pipes.length = 0; add_pipe(960, 120, 140);`);
  run(`isSleighActive = true; sleighTimer = 7 * FPS;`);
  run(`const tp = pipes[0]; tp.x = bird.x - 15; bird.y = tp.y + tp.MyImg.height - 20; bird.velocity_y = 0;`);
  stepFrames(2);
  check('sleigh smashes whole pipe pair', run(`pipes[0].visible === false && pipes[1].visible === false`) && run('game_mode === "running"'));
  check('sleigh boosts speed to 4x', run('speedMultiplier === 4'), run('speedMultiplier'));
  // magnet: star far away gets pulled in
  run(`stars.length = 0; stars.push(Object.assign(new MySprite(), { x: bird.x + 120, y: bird.y + 60, visible: true, velocity_x: pipe_speed, MyImg: STAR_IMG }));`);
  const before = run('Math.hypot(stars[0].x - bird.x, stars[0].y - bird.y)');
  stepFrames(6);
  const after = run('stars.length ? Math.hypot(stars[0].x - bird.x, stars[0].y - bird.y) : 0');
  check('sleigh magnet pulls collectibles', after < before, `${before.toFixed(1)} -> ${after.toFixed(1)}`);
  // sleigh ends -> 30s cooldown
  run(`sleighTimer = 1;`);
  stepFrames(2);
  const cd = run('santaCooldown');
  check('30s cooldown starts when sleigh ends', cd >= 30 * 40 - 3 && cd <= 30 * 40, cd);
  check('button shows cooldown seconds', /s$/.test(elements['santa-btn'].innerText), elements['santa-btn'].innerText);

  // --- trigger: 50/50 roll + cooldown gate ---
  run(`santaCooldown = 0; isSleighActive = false; isNiceFilterActive = false; game_mode = 'running';`);
  run(`const rr = Math.random; Math.random = () => 0.1; triggerSantaPower(); Math.random = rr;`);
  check('roll <0.5 gives Sleigh Blitz', run('isSleighActive === true'));
  run(`const rr2 = Math.random; isSleighActive = false; sleighTimer = 0; santaCooldown = 0; Math.random = () => 0.9; triggerSantaPower(); Math.random = rr2;`);
  check('roll >=0.5 gives Naughty or Nice', run('isNiceFilterActive === true'));
  run(`isNiceFilterActive = false; niceFilterTimer = 0; nicePipeQuota = 0; santaCooldown = 30 * FPS; isSleighActive = false;`);
  run(`const rr3 = Math.random; Math.random = () => 0.1; triggerSantaPower(); Math.random = rr3;`);
  check('power blocked during cooldown', run('isSleighActive === false && isNiceFilterActive === false'));

  // --- boss mode: ~10% of throws turn nice ---
  run(`game_mode = 'boss'; isBoss2 = false; isBoss3 = false; bossIntroState = 5; boss.movingIn = false; boss.x = 5000; boss.y = 150; isNiceFilterActive = true; niceFilterTimer = 7 * FPS; chocolates.length = 0;`);
  run(`for (let i = 0; i < 300; i++) spawnChocolate();`);
  const niceChocs = run('chocolates.filter(c => c.nice).length');
  check('~10% of boss throws turn nice (300 spawns)', niceChocs >= 12 && niceChocs <= 48, 'nice=' + niceChocs);
  run(`const nc = chocolates.find(c => c.nice); nc.x = bird.x + 5; nc.y = bird.y + 5; bird.visible = true;`);
  stepFrames(1);
  check('nice boss throw is harmless', run(`game_mode === 'boss'`), run('game_mode'));
  run(`const bc = chocolates.find(c => !c.nice); if (bc) { bc.x = bird.x + 5; bc.y = bird.y + 5; }`);
  stepFrames(1);
  check('normal boss throw still lethal', run(`game_mode === 'over'`), run('game_mode'));
  run(`game_mode = 'boss'; isBoss3 = true; dragonFire.length = 0; isNiceFilterActive = true; for (let i = 0; i < 200; i++) spawnDragonFan();`);
  const niceFire = run('dragonFire.filter(f => f.nice).length');
  check('dragon fireballs can turn nice too', niceFire > 0, 'nice=' + niceFire);

  // ================= WITCH SHETOS =================
  run(`currentSkinKey = 'witch'; game_mode = 'running'; updateAbilityButtons();`);
  check('MAGIC button visible for witch skin', elements['witch-btn'] && elements['witch-btn'].style.display === 'flex');

  // --- before Sunset: Broom Boost ---
  run(`game_mode = 'running'; reset_game(); game_mode = 'running'; currentSkinKey = 'witch'; currentBGIndex = 0; witchCooldown = 0;`);
  run(`triggerWitchPower();`);
  check('pre-Sunset activation gives Broom Boost', run('isBroomActive === true && isBatsActive === false && broomTimer === 12 * FPS'), run('broomTimer'));
  run(`bird.velocity_y = 8;`);
  stepFrames(10);
  const glideV = run('bird.velocity_y');
  check('broom eases sharp falls into a steady glide', glideV > 0 && glideV <= 2.4, 'vy=' + glideV.toFixed(2));
  const steadyV = run('bird.velocity_y');
  run(`flapBird();`);
  stepFrames(3);   // the flap starts a rise pulse: the glide easing swoops up over a few frames
  const flapV = run('bird.velocity_y');
  check('broom flap swoops upward smoothly, not a sharp jump', flapV > -4.4 && flapV < steadyV - 1.5, 'vy=' + flapV.toFixed(2));
  check('witch leans into the glide', run('bird.angle') < 0, 'angle=' + run('bird.angle').toFixed(1));
  stepFrames(30);
  const glideV2 = run('bird.velocity_y');
  check('glide settles back toward steady sink', glideV2 > flapV && glideV2 <= 2.4, 'vy=' + glideV2.toFixed(2));
  run(`pipes.length = 0; bird.y = 200;`);
  const yClimb0 = run('bird.y');
  run(`flapBird();`); stepFrames(7); run(`flapBird();`); stepFrames(7); run(`flapBird();`); stepFrames(7); run(`flapBird();`); stepFrames(7);
  const yClimb1 = run('bird.y');
  check('broom actually climbs with repeated flaps', yClimb1 < yClimb0 - 40, 'dy=' + (yClimb1 - yClimb0).toFixed(1));
  check('normal flap still sharp without broom', run(`isBroomActive = false; bird.velocity_y = 5; flapBird(); const v = bird.velocity_y; isBroomActive = true; v`) === run('jump_amount'));
  run(`isBroomActive = true; broomTimer = 1;`);
  stepFrames(2);
  const wcd = run('witchCooldown');
  check('30s cooldown starts when broom ends', wcd >= 30 * 40 - 3 && wcd <= 30 * 40, wcd);

  // --- Sunset or later: Bat's Protection ---
  run(`witchCooldown = 0; isBroomActive = false; broomTimer = 0; currentBGIndex = 2; witchBats = [];`);
  run(`triggerWitchPower();`);
  check('Sunset+ activation gives Bat\'s Protection', run('isBatsActive === true && witchBats.length === 4 && batsRemaining() === 4'), run('batsRemaining()'));
  check('bats last 15s', run('batsTimer === 15 * FPS'), run('batsTimer'));
  run(`pipes.length = 0; add_pipe(960, 120, 140); const tp2 = pipes[0]; tp2.x = bird.x - 15; bird.y = tp2.y + tp2.MyImg.height - 20; bird.velocity_y = 0; isBroomActive = false;`);
  stepFrames(2);
  check('bat blocks pipe collision (pair destroyed, bat spent)', run(`pipes[0].visible === false && pipes[1].visible === false && batsRemaining() === 3 && game_mode === 'running'`), run('batsRemaining()'));
  // (tag the chocolate: the boss may randomly spawn extra ones during the frame)
  run(`game_mode = 'boss'; isBoss2 = false; isBoss3 = false; bossIntroState = 5; boss.movingIn = false; boss.x = 5000; chocolates.length = 0; spawnChocolate(); const c2 = chocolates[0]; c2.nice = false; c2.tag = 1; c2.x = bird.x + 5; c2.y = bird.y + 5;`);
  stepFrames(1);
  check('bat blocks boss throw', run(`!chocolates.some(c => c.tag === 1) && batsRemaining() === 2`), run('batsRemaining()'));
  // park the bird high, let one orbit frame re-anchor the bats, THEN let the timer expire
  run(`bird.y = 120; bird.velocity_y = 0;`);
  stepFrames(1);
  run(`batsTimer = 1;`);
  stepFrames(2);
  check('bats released upward when time ends + cooldown', run(`!isBatsActive && witchBats.every(b => b.state === 'flee') && witchCooldown > 0`), run(`witchBats.map(b=>b.state).join(',')`));
  // consumed bats started fleeing from wherever the bird was when they blocked,
  // so give every bat enough frames to climb out of the screen (9px/frame)
  for (let f = 0; f < 120 && run('witchBats.length') > 0; f++) stepFrames(1);
  check('fleeing bats leave the screen', run('witchBats.length === 0'), run('witchBats.length'));
  run(`witchCooldown = 0; witchBats = []; isBatsActive = false; isBroomActive = false; currentBGIndex = 2; triggerWitchPower(); consumeBat(); consumeBat(); consumeBat();`);
  check('spending 3 of 4 bats keeps power on', run('isBatsActive === true && batsRemaining() === 1'));
  run(`consumeBat();`);
  check('last bat spent ends power + starts cooldown', run(`isBatsActive === false && witchCooldown === 30 * FPS`), run('witchCooldown'));
  run(`triggerWitchPower();`);
  check('witch power blocked during cooldown', run('isBroomActive === false && isBatsActive === false'));

  // --- stress runs ---
  run(`game_mode = 'running'; reset_game(); game_mode = 'running'; currentSkinKey = 'santa';`);
  for (let i = 0; i < 400; i++) {
    run(`if (santaCooldown <= 0 && !isSleighActive && !isNiceFilterActive) triggerSantaPower();`);
    stepFrames(5);
    if (run('game_mode') === 'over') run(`game_mode = 'running'; reset_game(); game_mode = 'running';`);
  }
  check('2000-frame stress run with random gifts: no crash', true);
  run(`game_mode = 'running'; reset_game(); game_mode = 'running'; currentSkinKey = 'witch';`);
  for (let i = 0; i < 400; i++) {
    if (i % 50 === 0) run(`currentBGIndex = (currentBGIndex + 1) % 5;`);
    run(`if (witchCooldown <= 0 && !isBroomActive && !isBatsActive) triggerWitchPower();`);
    stepFrames(5);
    if (run('game_mode') === 'over') run(`game_mode = 'running'; reset_game(); game_mode = 'running'; currentSkinKey = 'witch';`);
  }
  check('2000-frame witch stress run across zones: no crash', true);

  // ================= MOBILE-ONLY: NO KEYBOARD CONTROLS =================
  check('no character info mentions keyboard keys', run(`Object.values(SKINS).every(s => !/Press [A-Z]\\)|Right Click|Shift|keyboard/i.test(s.desc))`));
  run(`game_mode = 'running'; isBroomActive = false; isSleighActive = false; bird.velocity_y = 0;`);
  run(`Got_Player_Input({ type: 'keydown', keyCode: 32, key: ' ', preventDefault() {}, target: { tagName: 'CANVAS', closest: () => null } });`);
  check('space key no longer flaps', run('bird.velocity_y === 0'), run('bird.velocity_y'));
  run(`Got_Player_Input({ type: 'keydown', keyCode: 68, key: 'd', preventDefault() {}, target: { tagName: 'CANVAS', closest: () => null } });`);
  run(`Got_Player_Input({ type: 'keydown', key: 'e', preventDefault() {}, target: { tagName: 'CANVAS', closest: () => null } });`);
  check('ability hotkeys no longer fire', run(`santaCooldown === 0 && !isSleighActive && !isNiceFilterActive`));
  run(`Got_Player_Input({ type: 'mousedown', clientX: 100, clientY: 100, target: { tagName: 'CANVAS', closest: () => null } });`);
  check('tap/click still flaps (mobile input intact)', run('bird.velocity_y === jump_amount'), run('bird.velocity_y'));

  // ================= CHRISTMAS MAIN MENU =================
  check('xmas overlay canvas exists in menu', run(`!!document.getElementById('xmas-fx')`));
  run(`document.getElementById('landing-page').style.display = 'flex'; initXmasFlakes();`);
  // watch a flake high in the sky so landing/respawn on the snow can't confuse the check
  const flakeY0 = run(`(xmasFlakes.find(f => f.y < 400) || xmasFlakes[0]).y`);
  run(`xmasFrame(1000); xmasFrame(1050);`);
  const flakeY1 = run(`(xmasFlakes.find(f => f.y < 460 && f.y > 5) || xmasFlakes[0]).y`);
  check('snow falls while the menu is open', run('xmasFlakes.length') >= 50 && flakeY1 !== flakeY0, `y ${flakeY0.toFixed(1)} -> ${flakeY1.toFixed(1)}, n=${run('xmasFlakes.length')}`);
  run(`document.getElementById('landing-page').style.display = 'none';`);
  const frozen = run('xmasFlakes.map(f => f.y).join(",")');
  run(`xmasFrame(1100);`);
  check('xmas fx sleeps when menu is closed', run('xmasFlakes.map(f => f.y).join(",")') === frozen);
  run(`document.getElementById('landing-page').style.display = 'flex';`);

  // ============ CHRISTMAS MODE TOGGLE (remembered forever) ============
  check('christmas settings toggle is wired', run(`typeof toggleXmasMode === 'function' && SETTINGS_KEYS.xmasOn === 'flappyXmasOn' && !!document.getElementById('xmas-toggle')`));
  run(`toggleXmasMode(false);`);
  check('toggle off: xmas disabled + saved forever', run(`xmasMode === false && localStorage.getItem('flappyXmasOn') === '0'`));
  check('toggle off: landing loses christmas background', elements['landing-page'].classList.contains('no-xmas'));
  check('toggle off: settings checkbox syncs', elements['xmas-toggle'].checked === false);
  run(`xmasFlakes = [{ x: 10, y: 20, r: 2, s: 1, d: 0, o: 1 }]; xmasFrame(2000);`);
  check('toggle off: snow overlay frozen', run('xmasFlakes[0].y') === 20);
  run(`toggleXmasMode(true);`);
  check('toggle on: re-enabled + persisted', run(`xmasMode === true && localStorage.getItem('flappyXmasOn') === '1'`) && !elements['landing-page'].classList.contains('no-xmas') && elements['xmas-toggle'].checked === true);
  run(`xmasFrame(2100);`);
  check('toggle on: snow falls again', run('xmasFlakes[0].y') > 20);
} catch (e) {
  check('runtime simulation', false, e.stack.split('\n').slice(0, 4).join(' | '));
}

console.log(out.join('\n'));
console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
