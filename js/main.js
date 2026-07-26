(function () {
  const STATE = {
    MENU: 'menu',
    GROUND: 'ground',
    HANDLE: 'handle',
    LADDER: 'ladder',
    AIR: 'air',
    ROPE_FLY: 'rope_fly',
    ROPE_ATTACHED: 'rope_attached',
    OVER: 'over',
    PAUSED: 'paused',
  };

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  let W = 800;
  let H = 600;
  let DPR = 1;

  const world = NinjaWorld.createWorld();
  const rope = NinjaRope.createRopeState();
  let state = STATE.MENU;
  let stateBeforePause = null;
  let player = { x: 120, y: 200, vx: 0, vy: 0, move: 0, w: 12, feet: 24, fallGrace: 0 };
  let lastTime = 0;
  let rafId = 0;
  let elapsed = 0;
  let runCoins = 0;
  let attachedHandle = null;
  let attachedLadder = null;
  let ignoreHandle = null; // don't re-grab this handle right after leaping off
  let ignoreHandleT = 0;
  let touchPlay = false; // mobile/touch session: tilt + side taps
  let motionOn = false;

  const keys = Object.create(null);
  const input = {
    move: 0,
    fire: false,
    detach: false,
    shorten: false,
    lengthen: false,
    aimDX: 0.7,
    aimDY: -0.7,
    aiming: false,
  };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const vv = window.visualViewport;
    W = Math.round((vv && vv.width) || canvas.clientWidth || window.innerWidth);
    H = Math.round((vv && vv.height) || canvas.clientHeight || window.innerHeight);
    // Prefer the game-container box after fullscreen
    const root = document.getElementById('game-container');
    if (root) {
      const r = root.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        W = Math.round(r.width);
        H = Math.round(r.height);
      }
    }
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (window.NinjaDisplay) NinjaDisplay.updateRotateGate();
  }

  function show(el, on) {
    el.classList.toggle('hidden', !on);
  }

  function showPauseBtn(on) {
    document.getElementById('pauseBtn').style.display = on ? 'block' : 'none';
  }

  function showControls(on) {
    const el = document.getElementById('controls');
    // Touch/tilt sessions hide the old button pad
    el.classList.toggle('visible', on && !touchPlay);
    const hints = document.getElementById('mobileHints');
    if (hints) hints.classList.toggle('visible', on && touchPlay);
  }

  function isPlayable() {
    const hsOpen = document.getElementById('hideSeekScreen').style.display === 'block';
    const battleOpen = !document.getElementById('battleOverlay').classList.contains('hidden');
    return (
      state !== STATE.PAUSED &&
      state !== STATE.MENU &&
      state !== STATE.OVER &&
      !hsOpen &&
      !battleOpen
    );
  }

  function showSideButtons(on) {
    document.querySelectorAll('.side-btn').forEach((b) => {
      b.style.display = on ? 'flex' : 'none';
    });
  }

  function updateHud() {
    const dist = Math.floor(world.distance);
    const dv = document.getElementById('distanceVal');
    const cv = document.getElementById('coinVal');
    const bv = document.getElementById('bestVal');
    if (dv) dv.textContent = dist;
    if (cv) cv.textContent = NinjaSkins.coins;
    if (bv) bv.textContent = NinjaSkins.bestDistance;
  }

  function refreshHudLabels() {
    const dist = Math.floor(world.distance);
    document.getElementById('distanceChip').innerHTML = NinjaI18n.t('hud.distance', {
      value: `<span id="distanceVal">${dist}</span>`,
    });
    document.getElementById('bestChip').innerHTML = NinjaI18n.t('hud.best', {
      value: `<span id="bestVal">${NinjaSkins.bestDistance}</span>`,
    });
    document.getElementById('coinVal').textContent = NinjaSkins.coins;
    document.getElementById('battleBtnLabel').textContent = NinjaI18n.t('side.battle');
    document.getElementById('hideSeekBtnLabel').textContent = NinjaI18n.t('side.hideSeek');
    document.getElementById('ctrlFire').textContent = NinjaI18n.t('controls.fire');
    document.getElementById('ctrlShorten').textContent = NinjaI18n.t('controls.shorten');
    document.getElementById('ctrlLengthen').textContent = NinjaI18n.t('controls.lengthen');
    document.getElementById('ctrlDetach').textContent = NinjaI18n.t('controls.detach');
  }

  function resetRun() {
    NinjaWorld.resetWorld(world, H, W);
    Object.assign(rope, NinjaRope.createRopeState());
    const startPlat = world.platforms[0];
    player.x = startPlat.x + 60;
    player.y = startPlat.y - player.feet;
    player.vx = 0;
    player.vy = 0;
    player.move = 0;
    player.fallGrace = 0;
    attachedHandle = null;
    attachedLadder = null;
    ignoreHandle = null;
    ignoreHandleT = 0;
    runCoins = 0;
    elapsed = 0;
    lastTime = 0;
  }

  function goMenu() {
    state = STATE.MENU;
    if (window.NinjaMotion) NinjaMotion.disable();
    motionOn = false;
    touchPlay = false;
    document.body.classList.remove('touch-play');
    if (window.NinjaDisplay) NinjaDisplay.leavePlayDisplay();
    show(document.getElementById('menuOverlay'), true);
    show(document.getElementById('gameOverOverlay'), false);
    show(document.getElementById('pauseOverlay'), false);
    showPauseBtn(false);
    showControls(false);
    showSideButtons(true);
    updateHud();
  }

  function startGame() {
    resetRun();
    state = STATE.GROUND;
    show(document.getElementById('menuOverlay'), false);
    show(document.getElementById('gameOverOverlay'), false);
    show(document.getElementById('pauseOverlay'), false);
    showPauseBtn(true);
    touchPlay = !!(window.NinjaMotion && NinjaMotion.prefersTouch());
    document.body.classList.toggle('touch-play', touchPlay);
    showControls(true);
    showSideButtons(false);
    lastTime = 0;

    const afterDisplay = () => {
      resize();
      if (window.NinjaDisplay) NinjaDisplay.updateRotateGate();
      if (touchPlay && window.NinjaMotion) {
        NinjaMotion.enable().then((ok) => {
          motionOn = !!ok;
          const status = document.getElementById('motionStatus');
          if (status) {
            status.textContent = ok
              ? NinjaI18n.t('mobile.tiltOn')
              : NinjaI18n.t('mobile.tiltOff');
          }
          if (ok) NinjaMotion.recalibrate();
        });
      } else {
        motionOn = false;
      }
    };

    if (window.NinjaDisplay) {
      NinjaDisplay.enterPlayDisplay().then(afterDisplay).catch(afterDisplay);
    } else {
      afterDisplay();
    }
  }

  function gameOver() {
    if (state === STATE.OVER) return;
    state = STATE.OVER;
    if (window.NinjaMotion) NinjaMotion.disable();
    motionOn = false;
    // Keep fullscreen so Retry can continue without browser chrome returning mid-session;
    // leave on quit-to-menu only.
    NinjaSkins.updateBest(world.distance);
    if (runCoins > 0) {
      // already added on pickup
    }
    document.getElementById('finalScore').textContent = Math.floor(world.distance);
    document.getElementById('bestScoreRow').innerHTML = NinjaI18n.t('gameOver.best', {
      value: NinjaSkins.bestDistance,
    });
    show(document.getElementById('gameOverOverlay'), true);
    showPauseBtn(false);
    showControls(false);
    showSideButtons(true);
    updateHud();
  }

  function togglePause() {
    if (state === STATE.OVER || state === STATE.MENU) return;
    if (state === STATE.PAUSED) {
      resumeFromPause();
      return;
    }
    stateBeforePause = state;
    state = STATE.PAUSED;
    show(document.getElementById('pauseOverlay'), true);
  }

  function resumeFromPause() {
    if (state !== STATE.PAUSED) return;
    state = stateBeforePause || STATE.AIR;
    show(document.getElementById('pauseOverlay'), false);
    lastTime = 0;
  }

  function collectCoins(dt) {
    for (const c of world.coins) {
      if (c.collected) {
        if (c.popLife > 0) c.popLife -= dt * 3;
        continue;
      }
      const dx = player.x - c.x;
      const dy = player.y - c.y;
      if (dx * dx + dy * dy < 22 * 22) {
        c.collected = true;
        c.popLife = 1;
        runCoins += 1;
        NinjaSkins.addCoins(1);
        updateHud();
      }
    }
  }

  function syncAim() {
    if (input.aiming || Math.hypot(input.aimDX, input.aimDY) > 0.05) {
      NinjaRope.setAimFromDir(rope, input.aimDX, input.aimDY);
    } else if (!('ontouchstart' in window)) {
      // mouse aim handled separately
    }
  }

  function leapOffHandle() {
    const h = attachedHandle;
    attachedHandle = null;
    // Modest leap — reach the next handle (~70–80px), not skip two
    player.vy = -450;
    const dir = player.move !== 0 ? player.move : 1;
    player.vx = dir * 145;
    ignoreHandle = h;
    ignoreHandleT = 0.28;
    state = STATE.AIR;
  }

  function tryFire() {
    if (state === STATE.ROPE_ATTACHED || state === STATE.ROPE_FLY) return;
    if (
      state !== STATE.GROUND &&
      state !== STATE.HANDLE &&
      state !== STATE.LADDER &&
      state !== STATE.AIR
    ) {
      return;
    }
    // Leaving a handle (tap/Space) must leap — never silent-drop
    if (state === STATE.HANDLE) {
      leapOffHandle();
    } else if (state === STATE.LADDER) {
      attachedLadder = null;
      player.vy = Math.min(player.vy, -220);
    }
    if (NinjaRope.fire(rope, player)) {
      state = STATE.ROPE_FLY;
    }
  }

  function tryDetach() {
    if (state === STATE.ROPE_ATTACHED) {
      NinjaRope.detach(rope, player);
      state = STATE.AIR;
      return;
    }
    if (state === STATE.HANDLE) {
      leapOffHandle();
      return;
    }
    if (state === STATE.LADDER) {
      attachedLadder = null;
      player.vy = -460;
      player.vx = player.move * 160;
      state = STATE.AIR;
      return;
    }
    if (state === STATE.GROUND) {
      player.vy = -500;
      player.vx += player.move * 40;
      state = STATE.AIR;
    }
  }

  function update(dt) {
    if (state === STATE.MENU || state === STATE.OVER || state === STATE.PAUSED) return;
    // Freeze while the landscape gate is up
    if (
      touchPlay &&
      window.NinjaDisplay &&
      document.body.classList.contains('play-active') &&
      !NinjaDisplay.isLandscape()
    ) {
      return;
    }

    elapsed += dt;
    player.move = input.move;
    if (keys['a'] || keys['arrowleft']) player.move = -1;
    if (keys['d'] || keys['arrowright']) player.move = 1;

    // Shared vertical axis: rope length while swinging, climb while on a ladder
    // (mutually exclusive states — no ambiguity).
    rope.lengthInput = 0;
    if (input.shorten || keys['w'] || keys['q'] || keys['arrowup']) rope.lengthInput = -1;
    if (input.lengthen || keys['s'] || keys['e'] || keys['arrowdown']) rope.lengthInput = 1;

    // Android-first tilt overrides when motion is live
    if (motionOn && window.NinjaMotion) {
      const m = NinjaMotion.sample();
      if (m.fresh) {
        if (Math.abs(m.move) > 0.35) player.move = Math.sign(m.move);
        if (m.lengthInput) rope.lengthInput = m.lengthInput;
      }
    }

    syncAim();
    if (rope.cooldown > 0) rope.cooldown -= dt;
    if (ignoreHandleT > 0) {
      ignoreHandleT -= dt;
      if (ignoreHandleT <= 0) ignoreHandle = null;
    }
    NinjaRope.tickFallGrace(player, dt);

    if (input.fire) {
      input.fire = false;
      tryFire();
    }
    if (input.detach) {
      input.detach = false;
      tryDetach();
    }

    NinjaWorld.updateCamera(world, dt, H, player.x, W);
    NinjaWorld.updateTargets(world, dt, rope.attached && rope.attached.target);

    const gScale = NinjaRope.fallGravityScale(player);

    if (state === STATE.ROPE_FLY) {
      const hit = NinjaRope.updateProjectile(rope, world, dt);
      // Still apply light gravity while shot is in air
      player.vy += NinjaRope.GRAVITY * gScale * dt;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      resolvePlatformLanding();
      if (hit) {
        NinjaRope.attachTo(rope, player, hit);
        state = STATE.ROPE_ATTACHED;
      } else if (!rope.projectile) {
        state = STATE.AIR;
      }
    } else if (state === STATE.ROPE_ATTACHED) {
      const prevY = player.y;
      NinjaRope.updateAttached(rope, player, dt);
      if (rope.attached) {
        NinjaRope.resolveAttachedPlatform(rope, player, world, prevY, player.feet);
      } else {
        state = STATE.AIR;
      }
    } else if (state === STATE.HANDLE && attachedHandle) {
      player.x = attachedHandle.x;
      player.y = attachedHandle.y + 8;
      player.vx = 0;
      player.vy = 0;
    } else if (state === STATE.LADDER && attachedLadder) {
      updateLadderClimb(dt);
    } else {
      // GROUND or AIR
      if (state !== STATE.GROUND) {
        player.vy += NinjaRope.GRAVITY * gScale * dt;
      } else {
        player.vy = 0;
        player.vx = player.move * 160;
      }
      if (state === STATE.AIR) {
        player.vx += player.move * 520 * dt;
        player.vx *= Math.pow(0.98, dt * 60);
      }
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      resolvePlatformLanding();
      tryGrabHandle();
      tryGrabLadder();
    }

    collectCoins(dt);

    const sx = NinjaWorld.worldToScreen(world, player.x);
    const offLeft = world.scrollUnlocked && sx < -player.w;
    if (offLeft || player.y - player.feet > H + 10) {
      gameOver();
    }
  }

  function resolvePlatformLanding() {
    if (state === STATE.ROPE_ATTACHED || state === STATE.HANDLE || state === STATE.LADDER) return;
    if (player.vy < 0) return;
    const plat = NinjaWorld.platformAt(world, player.x, player.y, player.w, player.feet);
    if (plat) {
      player.y = plat.y - player.feet;
      player.vy = 0;
      player.vx *= 0.5;
      // Keep rope projectile in flight even while feet are on a platform
      if (state !== STATE.ROPE_FLY) state = STATE.GROUND;
    } else if (state === STATE.GROUND) {
      state = STATE.AIR;
    }
  }

  function tryGrabHandle() {
    if (
      state === STATE.ROPE_ATTACHED ||
      state === STATE.ROPE_FLY ||
      state === STATE.HANDLE ||
      state === STATE.LADDER
    ) {
      return;
    }
    if (player.vy < -120) return; // still rising hard — wait for apex
    const h = NinjaWorld.handleAt(world, player.x, player.y - 8, 22);
    if (!h || (ignoreHandleT > 0 && h === ignoreHandle)) return;
    attachedHandle = h;
    attachedLadder = null;
    state = STATE.HANDLE;
    player.vx = 0;
    player.vy = 0;
  }

  function tryGrabLadder() {
    if (
      state === STATE.ROPE_ATTACHED ||
      state === STATE.ROPE_FLY ||
      state === STATE.HANDLE ||
      state === STATE.LADDER
    ) {
      return;
    }
    const l = NinjaWorld.ladderAt(world, player.x, player.y, player.w, player.feet);
    if (!l) return;
    // From ground: only mount when pressing up; from air: grab while falling/idle
    if (state === STATE.GROUND && rope.lengthInput >= 0) return;
    if (state === STATE.AIR && player.vy < -90) return;
    attachedLadder = l;
    attachedHandle = null;
    state = STATE.LADDER;
    player.x = l.x;
    player.vx = 0;
    player.vy = 0;
  }

  function updateLadderClimb(dt) {
    const l = attachedLadder;
    if (!l) {
      state = STATE.AIR;
      return;
    }
    // Stay on the ladder unless the player walks clearly off it
    player.x = l.x + player.move * 6;
    if (Math.abs(player.x - l.x) > l.w * 0.55 && Math.abs(player.move) > 0) {
      attachedLadder = null;
      player.vx = player.move * 140;
      state = STATE.AIR;
      return;
    }
    player.x = l.x;

    const climbSpeed = 180;
    if (rope.lengthInput !== 0) {
      player.y += rope.lengthInput * climbSpeed * dt;
    }

    // Standing height at ladder top (= feet on the upper platform)
    const standY = l.topY - player.feet;
    const bottomLimit = l.bottomY - player.feet;

    if (player.y <= standY + 3) {
      player.y = standY;
      // Mount the higher platform when climbing up (or already at the lip)
      if (rope.lengthInput <= 0) {
        const plat = NinjaWorld.platformNear(world, l.x, l.topY, l.w * 0.5 + 20, 14);
        attachedLadder = null;
        player.vx = 0;
        player.vy = 0;
        if (plat) {
          player.x = Math.max(plat.x + 10, Math.min(plat.x + plat.w - 10, l.x));
          player.y = plat.y - player.feet;
          state = STATE.GROUND;
        } else {
          state = STATE.AIR;
        }
        return;
      }
    } else if (player.y >= bottomLimit) {
      player.y = bottomLimit;
      if (rope.lengthInput > 0) {
        attachedLadder = null;
        state = STATE.AIR;
        return;
      }
    }

    player.vx = 0;
    player.vy = 0;
  }

  function draw() {
    NinjaWorld.drawBackground(ctx, W, H, world);
    NinjaWorld.drawWorld(ctx, world, W, H, elapsed);

    const canAim =
      state === STATE.GROUND ||
      state === STATE.HANDLE ||
      state === STATE.LADDER ||
      state === STATE.AIR ||
      state === STATE.ROPE_FLY;
    if (canAim && state !== STATE.MENU && state !== STATE.OVER) {
      NinjaRope.drawAim(ctx, rope, player, world, W);
    }
    NinjaRope.drawRope(ctx, rope, player, world);

    const sx = NinjaWorld.worldToScreen(world, player.x);
    const skin = NinjaSkins.getCurrentSkin();
    let pose = 'idle';
    let angle = 0;
    if (state === STATE.ROPE_ATTACHED) pose = 'rope';
    if (state === STATE.HANDLE || state === STATE.LADDER) pose = 'handle';
    if (state === STATE.AIR || state === STATE.ROPE_FLY) {
      angle = Math.atan2(player.vy, Math.abs(player.vx) + 1) * 0.15;
    }
    NinjaSkins.drawPlayer(ctx, sx, player.y, skin, { pose, angle, time: elapsed });

    const danger = NinjaWorld.dangerFactor(sx, player.y, W, H, world.scrollUnlocked);
    NinjaWorld.drawDangerVignette(ctx, W, H, danger);

    // Distance HUD number refresh without full re-i18n every frame
    const dv = document.getElementById('distanceVal');
    if (dv) dv.textContent = Math.floor(world.distance);
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    let dt = Math.min((ts - lastTime) / 1000, 0.033);
    lastTime = ts;
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // ---- Skins UI ----
  function renderSkinGrid() {
    const grid = document.getElementById('skinsGrid');
    grid.innerHTML = '';
    document.getElementById('skinsProgress').textContent = NinjaI18n.t('skins.progress', {
      owned: NinjaSkins.ownedSkins.length,
      total: NinjaSkins.SKINS.length,
      coins: NinjaSkins.coins,
    });
    NinjaSkins.SKINS.forEach((skin) => {
      const isOwned = NinjaSkins.isOwned(skin.id);
      const isSelected = NinjaSkins.selectedSkinId === skin.id && isOwned;
      const canAfford = NinjaSkins.coins >= skin.price;
      const card = document.createElement('div');
      card.className =
        'skin-card' +
        (isOwned || canAfford ? ' unlocked' : ' locked') +
        (isSelected ? ' selected' : '');
      const previewWrap = document.createElement('div');
      previewWrap.style.cssText =
        'background:rgba(255,255,255,0.12);border-radius:6px;padding:3px;margin-bottom:2px;';
      const cnv = document.createElement('canvas');
      cnv.className = 'skin-preview';
      cnv.width = 36;
      cnv.height = 44;
      NinjaSkins.drawMiniNinja(cnv.getContext('2d'), skin);
      previewWrap.appendChild(cnv);
      card.appendChild(previewWrap);
      const nameEl = document.createElement('div');
      nameEl.className = 'skin-name';
      nameEl.textContent = NinjaSkins.skinName(skin.id);
      card.appendChild(nameEl);
      const statusEl = document.createElement('div');
      statusEl.className = 'skin-req';
      if (isOwned) {
        statusEl.textContent = isSelected ? NinjaI18n.t('skins.selected') : NinjaI18n.t('skins.select');
        statusEl.style.color = isSelected ? '#d8a23a' : '#6fd86f';
      } else {
        statusEl.textContent = '🪙 ' + skin.price;
        statusEl.style.color = canAfford ? '#ffd454' : '#a05a5a';
      }
      card.appendChild(statusEl);
      card.addEventListener('click', () => {
        if (isOwned) NinjaSkins.selectSkin(skin.id);
        else if (canAfford) {
          NinjaSkins.buySkin(skin.id);
          NinjaSkins.selectSkin(skin.id);
        }
        renderSkinGrid();
        updateHud();
      });
      grid.appendChild(card);
    });
  }

  // ---- Input ----
  function bindHold(el, onDown, onUp) {
    const down = (e) => {
      e.preventDefault();
      onDown();
    };
    const up = (e) => {
      e.preventDefault();
      onUp();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  }

  function setupControls() {
    bindHold(
      document.getElementById('btnLeft'),
      () => {
        input.move = -1;
      },
      () => {
        if (input.move < 0) input.move = 0;
      }
    );
    bindHold(
      document.getElementById('btnRight'),
      () => {
        input.move = 1;
      },
      () => {
        if (input.move > 0) input.move = 0;
      }
    );
    bindHold(
      document.getElementById('btnShorten'),
      () => {
        input.shorten = true;
      },
      () => {
        input.shorten = false;
      }
    );
    bindHold(
      document.getElementById('btnLengthen'),
      () => {
        input.lengthen = true;
      },
      () => {
        input.lengthen = false;
      }
    );
    document.getElementById('btnFire').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.fire = true;
    });
    document.getElementById('btnDetach').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.detach = true;
    });

    const pad = document.getElementById('aimPad');
    const knob = document.getElementById('aimKnob');
    function aimFromEvent(e) {
      const rect = pad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const max = rect.width * 0.35;
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, max);
      dx = (dx / len) * cl;
      dy = (dy / len) * cl;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      input.aimDX = dx / max || input.aimDX;
      input.aimDY = dy / max || input.aimDY;
      input.aiming = true;
      NinjaRope.setAimFromDir(rope, input.aimDX, input.aimDY);
    }
    pad.addEventListener('pointerdown', (e) => {
      pad.setPointerCapture(e.pointerId);
      aimFromEvent(e);
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pressure > 0) aimFromEvent(e);
    });
    pad.addEventListener('pointerup', () => {
      input.aiming = false;
      knob.style.transform = 'translate(-50%, -50%)';
    });

    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      const playable = isPlayable();
      const hsOpen = document.getElementById('hideSeekScreen').style.display === 'block';
      const battleOpen = !document.getElementById('battleOverlay').classList.contains('hidden');
      if (e.code === 'Space') {
        e.preventDefault();
        if (playable) input.fire = true;
      }
      if (e.key === 'Shift') {
        e.preventDefault();
        if (playable) input.detach = true;
      }
      if (e.key === 'Escape' && !hsOpen && !battleOpen) togglePause();
    });
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });

    canvas.addEventListener('pointermove', (e) => {
      if (input.aiming || touchPlay) return;
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * W;
      const my = ((e.clientY - rect.top) / rect.height) * H;
      const sx = NinjaWorld.worldToScreen(world, player.x);
      NinjaRope.setAimFromDir(rope, mx - sx, my - player.y);
      input.aimDX = rope.aimX;
      input.aimDY = rope.aimY;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch: tap anywhere = aim+fire; swipe up = jump. Optional Jump button too.
    const gesture = { id: null, x0: 0, y0: 0, x1: 0, y1: 0, t0: 0 };
    const SWIPE_UP = 48;

    function aimAtClient(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const mx = ((clientX - rect.left) / rect.width) * W;
      const my = ((clientY - rect.top) / rect.height) * H;
      const sx = NinjaWorld.worldToScreen(world, player.x);
      NinjaRope.setAimFromDir(rope, mx - sx, my - player.y);
      input.aimDX = rope.aimX;
      input.aimDY = rope.aimY;
    }

    function endTouchGesture(e) {
      if (gesture.id == null || e.pointerId !== gesture.id) return;
      const dx = gesture.x1 - gesture.x0;
      const dy = gesture.y1 - gesture.y0;
      gesture.id = null;

      // Dominant upward swipe → jump/detach (does not fire)
      if (dy < -SWIPE_UP && Math.abs(dy) > Math.abs(dx) * 1.1) {
        input.detach = true;
        return;
      }
      // Tap or drag-to-aim: fire toward release point
      aimAtClient(gesture.x1, gesture.y1);
      input.fire = true;
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        input.detach = true;
        return;
      }
      if (!isPlayable()) return;
      if (e.target.closest('#controls, .side-btn, #pauseBtn, #langToggle, #mobileHints, #mobileJumpBtn')) {
        return;
      }

      if (touchPlay) {
        e.preventDefault();
        gesture.id = e.pointerId;
        gesture.x0 = gesture.x1 = e.clientX;
        gesture.y0 = gesture.y1 = e.clientY;
        gesture.t0 = performance.now();
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (_) {}
        // Live aim preview while finger is down
        aimAtClient(e.clientX, e.clientY);
        return;
      }

      if (e.pointerType === 'mouse' && e.button === 0) {
        input.fire = true;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!touchPlay || gesture.id !== e.pointerId) return;
      gesture.x1 = e.clientX;
      gesture.y1 = e.clientY;
      aimAtClient(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerup', endTouchGesture);
    canvas.addEventListener('pointercancel', endTouchGesture);

    const jumpBtn = document.getElementById('mobileJumpBtn');
    if (jumpBtn) {
      jumpBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isPlayable()) input.detach = true;
      });
    }
  }

  function wireUi() {
    document.getElementById('playBtn').addEventListener('click', startGame);
    document.getElementById('retryBtn').addEventListener('click', startGame);
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
    document.getElementById('resumeBtn').addEventListener('click', resumeFromPause);
    document.getElementById('quitBtn').addEventListener('click', () => {
      show(document.getElementById('pauseOverlay'), false);
      goMenu();
    });
    document.getElementById('langToggle').addEventListener('click', () => NinjaI18n.toggleLanguage());
    document.getElementById('openSkinsBtn').addEventListener('click', () => {
      if (state !== STATE.MENU && state !== STATE.OVER && state !== STATE.PAUSED) {
        stateBeforePause = state;
        state = STATE.PAUSED;
      }
      show(document.getElementById('skinsOverlay'), true);
      renderSkinGrid();
    });
    document.getElementById('closeSkinsBtn').addEventListener('click', () => {
      show(document.getElementById('skinsOverlay'), false);
      if (state === STATE.PAUSED && stateBeforePause) {
        state = stateBeforePause;
        lastTime = 0;
      }
    });
    document.getElementById('menuSkinsBtn').addEventListener('click', () => {
      show(document.getElementById('skinsOverlay'), true);
      renderSkinGrid();
    });
    document.getElementById('helpBtn').addEventListener('click', () => {
      if (state !== STATE.MENU && state !== STATE.OVER && state !== STATE.PAUSED) {
        stateBeforePause = state;
        state = STATE.PAUSED;
      }
      show(document.getElementById('helpOverlay'), true);
    });
    document.getElementById('menuHelpBtn').addEventListener('click', () => {
      show(document.getElementById('helpOverlay'), true);
    });
    document.getElementById('closeHelpBtn').addEventListener('click', () => {
      show(document.getElementById('helpOverlay'), false);
      if (state === STATE.PAUSED && stateBeforePause) {
        state = stateBeforePause;
        lastTime = 0;
      }
    });

    window.addEventListener('ninjagrip:langchange', () => {
      refreshHudLabels();
      NinjaI18n.applyDomTranslations();
      if (!document.getElementById('skinsOverlay').classList.contains('hidden')) renderSkinGrid();
      document.getElementById('bestScoreRow').innerHTML = NinjaI18n.t('gameOver.best', {
        value: NinjaSkins.bestDistance,
      });
    });
  }

  // Expose for mini-games
  window.NinjaGrip = {
    get state() {
      return state;
    },
    setPaused(on) {
      if (on) {
        if (state !== STATE.PAUSED && state !== STATE.MENU && state !== STATE.OVER) {
          stateBeforePause = state;
          state = STATE.PAUSED;
        }
      } else if (state === STATE.PAUSED) {
        resumeFromPause();
      }
    },
    addCoins(n) {
      NinjaSkins.addCoins(n);
      updateHud();
    },
    refreshHud: updateHud,
    STATE,
  };

  async function boot() {
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => {
      setTimeout(resize, 100);
      setTimeout(resize, 300);
      setTimeout(resize, 600);
    });
    if (window.NinjaDisplay) NinjaDisplay.bind();
    document.addEventListener('fullscreenchange', () => {
      // If the user leaves fullscreen mid-run, pause so chrome doesn't eat the playfield unnoticed
      if (
        document.body.classList.contains('play-active') &&
        window.NinjaDisplay &&
        !NinjaDisplay.isFullscreen() &&
        state !== STATE.MENU &&
        state !== STATE.OVER &&
        state !== STATE.PAUSED
      ) {
        togglePause();
      }
      resize();
    });
    await NinjaI18n.initI18n();
    refreshHudLabels();
    setupControls();
    wireUi();
    NinjaWorld.resetWorld(world, H, W);
    goMenu();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  boot();
})();
