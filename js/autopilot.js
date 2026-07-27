/**
 * Dev-only autopilot for testing long runs / hard sections.
 * Unlock: ?dev=1 in the URL, or type the word "pilot" (with the game focused).
 * Toggle via the AUTO / MANUAL button once unlocked.
 */
(function (global) {
  const STORAGE_KEY = 'ninjaGripDevUnlock';
  let unlocked = false;
  let active = false;
  let buffer = '';
  let bufferT = 0;
  let leapCooldown = 0;
  let fireCooldown = 0;

  function fromQuery() {
    try {
      const q = new URLSearchParams(global.location.search);
      return q.get('dev') === '1' || q.get('autopilot') === '1';
    } catch (_) {
      return false;
    }
  }

  function init() {
    unlocked = fromQuery() || global.sessionStorage.getItem(STORAGE_KEY) === '1';
    if (fromQuery()) {
      try {
        global.sessionStorage.setItem(STORAGE_KEY, '1');
      } catch (_) {}
      unlocked = true;
    }
    syncButton();
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try {
      global.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch (_) {}
    syncButton();
  }

  function isUnlocked() {
    return unlocked;
  }

  function isActive() {
    return unlocked && active;
  }

  function setActive(on) {
    if (!unlocked) return;
    active = !!on;
    leapCooldown = 0;
    fireCooldown = 0;
    syncButton();
  }

  function toggle() {
    if (!unlocked) return;
    setActive(!active);
  }

  function syncButton() {
    const btn = document.getElementById('autopilotBtn');
    if (!btn) return;
    btn.classList.toggle('hidden', !unlocked);
    btn.classList.toggle('on', active);
    btn.textContent = active ? 'AUTO' : 'MANUAL';
    btn.title = active ? 'Autopilot on — click for manual' : 'Manual — click for autopilot';
  }

  /** Eat keystrokes for the "pilot" cheat (call from keydown). */
  function onKey(e) {
    if (!e || !e.key || e.key.length !== 1) return;
    const ch = e.key.toLowerCase();
    if (!/[a-z]/.test(ch)) return;
    buffer += ch;
    bufferT = 2.5;
    if (buffer.length > 16) buffer = buffer.slice(-16);
    if (buffer.indexOf('pilot') >= 0) {
      buffer = '';
      unlock();
      setActive(true);
    }
  }

  function tickTimers(dt) {
    if (bufferT > 0) {
      bufferT -= dt;
      if (bufferT <= 0) buffer = '';
    }
    if (leapCooldown > 0) leapCooldown -= dt;
    if (fireCooldown > 0) fireCooldown -= dt;
  }

  function usableTarget(t) {
    return t && !t.removed && t.durability > 0.25;
  }

  function nearestTarget(world, player, aheadOnly) {
    let best = null;
    let bestD = Infinity;
    for (const t of world.targets) {
      if (!usableTarget(t)) continue;
      const dx = t.x - player.x;
      const dy = t.y - player.y;
      if (aheadOnly && dx < -20) continue;
      const d = Math.hypot(dx, dy);
      if (d < 40 || d > 270) continue;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  function nextHandle(world, player, ignore) {
    let best = null;
    let bestDx = Infinity;
    for (const h of world.handles) {
      if (h === ignore) continue;
      const dx = h.x - player.x;
      if (dx < 20 || dx > 140) continue;
      const dy = Math.abs(h.y - (player.y - 8));
      if (dy > 90) continue;
      if (dx < bestDx) {
        bestDx = dx;
        best = h;
      }
    }
    return best;
  }

  function platformUnder(world, x, y, feet) {
    return global.NinjaWorld.platformAt(world, x, y, 12, feet);
  }

  function gapAhead(world, player) {
    const plat = platformUnder(world, player.x, player.y, player.feet);
    if (!plat) return true;
    const edge = plat.x + plat.w;
    return player.x > edge - 36;
  }

  function ladderAhead(world, player) {
    let best = null;
    let bestDx = Infinity;
    for (const l of world.ladders) {
      const dx = l.x - player.x;
      if (dx < -20 || dx > 80) continue;
      if (player.y + player.feet < l.topY - 10) continue;
      if (player.y - 20 > l.bottomY) continue;
      if (Math.abs(dx) < bestDx) {
        bestDx = Math.abs(dx);
        best = l;
      }
    }
    return best;
  }

  function aimAt(input, player, world, tx, ty) {
    const dx = tx - player.x;
    const dy = ty - player.y;
    const len = Math.hypot(dx, dy) || 1;
    input.aimDX = dx / len;
    input.aimDY = dy / len;
    input.aiming = true;
  }

  /**
   * Overwrite input for this frame. Call after human/tilt sampling.
   * ctx: { state, player, world, rope, W, H, input, attachedHandle, dt }
   */
  function tick(ctx) {
    if (!isActive()) return;
    const { state, player, world, rope, W, input, attachedHandle, dt } = ctx;
    tickTimers(dt || 0);

    // Reset continuous axes; one-shots cleared by main after consume
    input.move = 0;
    input.shorten = false;
    input.lengthen = false;

    const sx = player.x - world.cameraX;
    const dangerLeft = world.scrollUnlocked && sx < W * 0.28;
    const preferRight = !world.scrollUnlocked || sx < W * 0.58 || dangerLeft;

    if (state === 'rope_attached' && rope.attached) {
      const a = rope.attached;
      input.move = 1;
      if (player.y > (ctx.H || 600) * 0.62) input.shorten = true;
      if (a.length > 200) input.shorten = true;
      if (a.length < 70 && player.y < 120) input.lengthen = true;
      // Release on a forward swing toward the right
      const goodAngle = a.angle > 0.45 && a.angle < 1.35 && a.omega > 0.35;
      const mustBail = a.target.durability < 1.0 || dangerLeft;
      if ((goodAngle || mustBail) && leapCooldown <= 0) {
        input.detach = true;
        leapCooldown = 0.35;
      }
      return;
    }

    if (state === 'handle') {
      input.move = 1;
      if (leapCooldown <= 0) {
        input.detach = true;
        leapCooldown = 0.4;
      }
      return;
    }

    if (state === 'ladder') {
      input.shorten = true; // climb up (shared ↑)
      input.move = 0;
      return;
    }

    if (state === 'rope_fly') {
      input.move = preferRight ? 1 : 0;
      return;
    }

    // GROUND / AIR — stay ahead, jump gaps, hang, rope, climb
    input.move = preferRight ? 1 : sx > W * 0.72 ? -1 : 1;

    const lad = ladderAhead(world, player);
    if (lad && state === 'ground' && Math.abs(lad.x - player.x) < 28) {
      input.shorten = true; // mount
      return;
    }
    if (lad && lad.x > player.x && lad.x - player.x < 70) {
      input.move = 1;
      return;
    }

    const nh = nextHandle(world, player, attachedHandle);
    if (nh && state === 'ground' && nh.x - player.x < 95 && leapCooldown <= 0) {
      input.detach = true;
      leapCooldown = 0.35;
      return;
    }
    if (nh && state === 'air' && nh.x > player.x) {
      input.move = 1;
      return;
    }

    if (state === 'ground' && gapAhead(world, player) && leapCooldown <= 0) {
      // Prefer rope over blind jump when a target is in range
      const t = nearestTarget(world, player, true);
      if (t && fireCooldown <= 0 && !rope.projectile && !rope.attached) {
        aimAt(input, player, world, t.x, t.y);
        input.fire = true;
        fireCooldown = 0.45;
      } else {
        input.detach = true;
        leapCooldown = 0.3;
      }
      return;
    }

    // Opportunistic rope toward forward/up target when safe or in air
    if (
      fireCooldown <= 0 &&
      !rope.projectile &&
      !rope.attached &&
      (state === 'ground' || state === 'air')
    ) {
      const t = nearestTarget(world, player, true);
      if (t) {
        const falling = state === 'air' && player.vy > 80;
        const low = player.y > (ctx.H || 600) * 0.55;
        if (falling || low || dangerLeft || (state === 'ground' && sx > W * 0.4)) {
          aimAt(input, player, world, t.x, t.y);
          input.fire = true;
          fireCooldown = 0.5;
        }
      }
    }
  }

  global.NinjaAutopilot = {
    init,
    unlock,
    isUnlocked,
    isActive,
    setActive,
    toggle,
    onKey,
    tick,
    syncButton,
  };
})(window);
