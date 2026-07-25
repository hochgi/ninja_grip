(function (global) {
  // Strength (color / hang time) is independent of hit size.
  const STRENGTH = {
    weak: { hangTime: 4.0, color: '#c44b3a', weight: 0.35 },
    medium: { hangTime: 8.4, color: '#d8a23a', weight: 0.4 },
    strong: { hangTime: 14.0, color: '#6fd86f', weight: 0.25 },
  };
  const SIZES = [
    { radius: 12, weight: 0.3 },
    { radius: 18, weight: 0.4 },
    { radius: 26, weight: 0.3 },
  ];
  // Back-compat alias
  const TARGET_TIERS = STRENGTH;

  const BASE_SCROLL = 42;
  const SCROLL_RAMP = 0.008;
  const SCROLL_UNLOCK_FRAC = 0.5;
  const CAMERA_ANCHOR_FRAC = 0.4;
  // Generate this far past the leading frontier so props exist off-screen before needed.
  const GEN_AHEAD_MIN = 2200;
  const GEN_AHEAD_VIEWPORTS = 3.0;
  // Gradual regen whenever below full (skipped while currently gripped).
  const HEAL_RATE = 0.12; // ~8s empty → full
  const ATTACH_MIN = 0.2; // seconds of rope-time needed to latch again
  // Specialty set-pieces (handle-hang / platform-jump), spaced along the run.
  const SPECIAL_FIRST_X = 650;
  const SPECIAL_GAP_MIN = 780;
  const SPECIAL_GAP_EXTRA = 620;
  const HANDLE_RUN_COUNT = 10;
  const LADDER_W = 26;

  function pickWeighted(rand, items, key) {
    key = key || 'weight';
    let total = 0;
    for (const it of items) total += it[key];
    let r = rand() * total;
    for (const it of items) {
      r -= it[key];
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  function pickStrength(rand) {
    const entries = Object.keys(STRENGTH).map((id) => ({ id, ...STRENGTH[id] }));
    return pickWeighted(rand, entries).id;
  }

  function pickSize(rand) {
    return pickWeighted(rand, SIZES).radius;
  }

  function genAheadDist(W) {
    return Math.max(GEN_AHEAD_MIN, (W || 800) * GEN_AHEAD_VIEWPORTS);
  }

  function createWorld() {
    return {
      cameraX: 0,
      distance: 0,
      scrollUnlocked: false,
      platforms: [],
      handles: [],
      targets: [],
      coins: [],
      ladders: [],
      nextX: 0,
      seed: Math.random() * 1e9,
      elapsed: 0,
      nextSpecialAt: SPECIAL_FIRST_X,
      specialIsHandles: true,
    };
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function resetWorld(world, H, W) {
    world.cameraX = 0;
    world.distance = 0;
    world.scrollUnlocked = false;
    world.platforms = [];
    world.handles = [];
    world.targets = [];
    world.coins = [];
    world.ladders = [];
    world.nextX = 0;
    world.seed = Math.random() * 1e9;
    world.elapsed = 0;
    world.nextSpecialAt = SPECIAL_FIRST_X;
    world.specialIsHandles = true;
    ensureChunks(world, H, 0, genAheadDist(W));
  }

  function pushCoin(world, x, y, rand) {
    world.coins.push({
      x,
      y,
      collected: false,
      popLife: 0,
      bob: rand() * Math.PI * 2,
    });
  }

  function pushLadder(world, x, topY, bottomY) {
    const top = Math.min(topY, bottomY);
    const bottom = Math.max(topY, bottomY);
    if (bottom - top < 60) return null;
    const lad = { x, topY: top, bottomY: bottom, w: LADDER_W };
    world.ladders.push(lad);
    return lad;
  }

  /** ~10-handle hang chain with entry/exit pads; almost no rope targets. */
  function emitHandleRun(world, startX, groundY, H, rand) {
    const n = HANDLE_RUN_COUNT + Math.floor(rand() * 3); // 10–12
    const spacing = 68 + rand() * 12; // reachable with boosted hang-leap
    const entryW = 100 + rand() * 40;
    const baseY = groundY - 30 - rand() * (H * 0.18);
    let x = startX;

    world.platforms.push({ x, y: baseY + 50, w: entryW, h: 16 });
    // Ladder up onto the run (or to a higher ledge)
    if (rand() < 0.7) {
      const highY = baseY - 70 - rand() * 50;
      world.platforms.push({ x: x + 8, y: highY, w: 86, h: 16 });
      pushLadder(world, x + 36, highY, baseY + 50);
    }

    x += entryW + 24;
    // First handle near entry jump height
    let hy = baseY - 10 - rand() * 20;
    for (let i = 0; i < n; i++) {
      hy += (rand() - 0.5) * 22;
      hy = Math.max(groundY - H * 0.42, Math.min(groundY - 80, hy));
      world.handles.push({ x: x + i * spacing, y: hy, r: 12 });
      if (i % 3 === 1) pushCoin(world, x + i * spacing, hy - 28, rand);
    }

    const endX = x + (n - 1) * spacing + 36;
    const exitW = 100 + rand() * 40;
    const exitY = hy + 28 + rand() * 20;
    world.platforms.push({ x: endX, y: exitY, w: exitW, h: 16 });
    // Sparse escape rope only near the exit
    if (rand() < 0.45) {
      world.targets.push(makeTarget(endX + exitW * 0.5, exitY - 120 - rand() * 40, rand));
    }
    return endX + exitW + 80;
  }

  /** Platform-jump gauntlet: gaps, no rope, rare handles. */
  function emitPlatformRun(world, startX, groundY, H, rand) {
    const n = 7 + Math.floor(rand() * 3); // 7–9 pads
    let x = startX;
    let platY = groundY - 20 - rand() * (H * 0.2);
    let prevY = platY;

    for (let i = 0; i < n; i++) {
      const pw = 72 + rand() * 48;
      platY = prevY + (rand() - 0.5) * 70;
      platY = Math.max(groundY - H * 0.42, Math.min(groundY - 40, platY));
      world.platforms.push({ x, y: platY, w: pw, h: 16 });
      if (rand() < 0.55) pushCoin(world, x + pw * 0.5, platY - 34, rand);

      // Mid-run ladder to a higher ledge once
      if (i === Math.floor(n / 2) && rand() < 0.65) {
        const highY = platY - 90 - rand() * 40;
        const lx = x + pw * 0.35;
        world.platforms.push({ x: lx - 20, y: highY, w: 80, h: 16 });
        pushLadder(world, lx, highY, platY);
        pushCoin(world, lx + 20, highY - 30, rand);
      }

      const gap = 88 + rand() * 42;
      x += pw + gap;
      prevY = platY;
    }
    return x + 40;
  }

  /**
   * Fill content out to frontierX + aheadDist.
   * frontier should be max(camera, player) so flinging ahead never hits empty air.
   */
  function ensureChunks(world, H, frontierX, aheadDist) {
    const rand = mulberry32((world.seed + world.nextX) | 0);
    const groundY = H * 0.72;
    const limit = frontierX + aheadDist;
    while (world.nextX < limit) {
      const x = world.nextX;
      if (x === 0) {
        world.platforms.push({ x: 40, y: groundY, w: 220, h: 18 });
        world.targets.push(makeTarget(180, groundY - 160, rand));
        world.handles.push({ x: 280, y: groundY - 90, r: 12 });
        world.nextX = 320;
        continue;
      }

      // Guaranteed specialty stretches, alternating hang-run ↔ platform-jump.
      if (x >= world.nextSpecialAt) {
        const endX = world.specialIsHandles
          ? emitHandleRun(world, x, groundY, H, rand)
          : emitPlatformRun(world, x, groundY, H, rand);
        world.specialIsHandles = !world.specialIsHandles;
        world.nextSpecialAt = endX + SPECIAL_GAP_MIN + rand() * SPECIAL_GAP_EXTRA;
        world.nextX = endX;
        continue;
      }

      const gap = 140 + rand() * 120;
      const platW = 90 + rand() * 140;
      const platY = groundY - rand() * (H * 0.35);
      world.platforms.push({ x: x + 20, y: platY, w: platW, h: 16 });

      if (rand() < 0.55) {
        const hx = x + 40 + rand() * Math.max(40, platW - 40);
        world.handles.push({ x: hx, y: platY - 70 - rand() * 50, r: 11 });
      }

      // Occasional ladder to a higher perch in normal chunks
      if (rand() < 0.22) {
        const highY = platY - 100 - rand() * 60;
        const lx = x + 30 + rand() * Math.max(20, platW - 40);
        world.platforms.push({ x: lx - 24, y: highY, w: 72 + rand() * 40, h: 16 });
        pushLadder(world, lx, highY, platY);
        if (rand() < 0.5) {
          world.handles.push({ x: lx + 10, y: highY - 55 - rand() * 30, r: 11 });
        }
        if (rand() < 0.4) {
          world.targets.push(makeTarget(lx + 20, highY - 100 - rand() * 40, rand));
        }
      }

      const nTargets = 1 + (rand() < 0.45 ? 1 : 0);
      for (let i = 0; i < nTargets; i++) {
        const tx = x + 30 + rand() * (platW + 80);
        const ty = platY - 100 - rand() * 140;
        world.targets.push(makeTarget(tx, ty, rand));
      }

      if (rand() < 0.7) {
        pushCoin(world, x + platW * 0.5, platY - 36, rand);
      }

      if (rand() < 0.4) {
        world.targets.push(makeTarget(x + platW + gap * 0.5, platY - 80 - rand() * 100, rand));
      }

      world.nextX = x + platW + gap;
    }

    const minX = world.cameraX - 400;
    world.platforms = world.platforms.filter((p) => p.x + p.w > minX);
    world.handles = world.handles.filter((h) => h.x > minX);
    world.targets = world.targets.filter((t) => t.x > minX && !t.removed);
    world.coins = world.coins.filter((c) => c.x > minX && (!c.collected || c.popLife > 0));
    world.ladders = world.ladders.filter((l) => l.x + l.w > minX);
  }

  function makeTarget(x, y, rand) {
    const strengthId = pickStrength(rand);
    const def = STRENGTH[strengthId];
    const hang = def.hangTime * (0.85 + rand() * 0.3);
    const radius = pickSize(rand);
    return {
      x,
      y,
      tier: strengthId,
      radius,
      color: def.color,
      maxDurability: hang,
      durability: hang,
      removed: false,
    };
  }

  /** Slow regen toward full rope-time; busy (gripped) target skips healing. */
  function updateTargets(world, dt, busyTarget) {
    for (const t of world.targets) {
      if (t.removed || t === busyTarget) continue;
      if (t.durability >= t.maxDurability) {
        t.durability = t.maxDurability;
        continue;
      }
      t.durability = Math.min(t.maxDurability, t.durability + t.maxDurability * HEAL_RATE * dt);
    }
  }

  function targetUsable(t) {
    return t && !t.removed && t.durability > ATTACH_MIN;
  }

  function scrollSpeed(world) {
    return BASE_SCROLL + world.distance * SCROLL_RAMP;
  }

  function updateCamera(world, dt, H, playerX, W) {
    world.elapsed += dt;
    const screenX = playerX - world.cameraX;
    const ahead = genAheadDist(W);
    const frontier = Math.max(world.cameraX, playerX);

    if (!world.scrollUnlocked) {
      if (screenX >= W * SCROLL_UNLOCK_FRAC) {
        world.scrollUnlocked = true;
      } else {
        ensureChunks(world, H, frontier, ahead);
        return;
      }
    }

    const forced = world.cameraX + scrollSpeed(world) * dt;
    const follow = playerX - W * CAMERA_ANCHOR_FRAC;
    world.cameraX = Math.max(forced, follow);
    world.distance = Math.max(world.distance, world.cameraX / 10);
    ensureChunks(world, H, Math.max(world.cameraX, playerX), ahead);
  }

  function worldToScreen(world, x) {
    return x - world.cameraX;
  }

  function dangerFactor(screenX, screenY, W, H, scrollUnlocked) {
    let f = 0;
    if (scrollUnlocked) {
      const leftZone = W * 0.1;
      if (screenX < leftZone) f = Math.max(f, 1 - screenX / leftZone);
    }
    const bottomZone = H * 0.1;
    const fromBottom = H - screenY;
    if (fromBottom < bottomZone) f = Math.max(f, 1 - fromBottom / bottomZone);
    return Math.max(0, Math.min(1, f));
  }

  function drawBackground(ctx, W, H, world) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b2420');
    g.addColorStop(0.55, '#1f1b17');
    g.addColorStop(1, '#14110f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(216,162,58,0.06)';
    ctx.lineWidth = 2;
    const offset = (world.cameraX * 0.2) % 80;
    for (let x = -offset; x < W + 80; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 40, H);
      ctx.stroke();
    }
  }

  function drawWorld(ctx, world, W, H, time) {
    for (const p of world.platforms) {
      const sx = worldToScreen(world, p.x);
      if (sx + p.w < -20 || sx > W + 20) continue;
      ctx.fillStyle = '#3a3024';
      ctx.fillRect(sx, p.y, p.w, p.h);
      ctx.fillStyle = '#d8a23a';
      ctx.fillRect(sx, p.y, p.w, 3);
    }

    for (const l of world.ladders) {
      const sx = worldToScreen(world, l.x - l.w / 2);
      if (sx + l.w < -20 || sx > W + 20) continue;
      const h = l.bottomY - l.topY;
      ctx.fillStyle = '#5a4834';
      ctx.fillRect(sx, l.topY, l.w, h);
      ctx.strokeStyle = '#c4a46a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 3, l.topY);
      ctx.lineTo(sx + 3, l.bottomY);
      ctx.moveTo(sx + l.w - 3, l.topY);
      ctx.lineTo(sx + l.w - 3, l.bottomY);
      ctx.stroke();
      ctx.strokeStyle = '#a88858';
      ctx.lineWidth = 2;
      for (let y = l.topY + 10; y < l.bottomY - 4; y += 14) {
        ctx.beginPath();
        ctx.moveTo(sx + 2, y);
        ctx.lineTo(sx + l.w - 2, y);
        ctx.stroke();
      }
    }

    for (const h of world.handles) {
      const sx = worldToScreen(world, h.x);
      if (sx < -30 || sx > W + 30) continue;
      ctx.strokeStyle = '#8a7a5a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, h.y - 40);
      ctx.lineTo(sx, h.y);
      ctx.stroke();
      ctx.fillStyle = '#e8b454';
      ctx.beginPath();
      ctx.arc(sx, h.y, h.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a4d1f';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (const t of world.targets) {
      if (t.removed) continue;
      const sx = worldToScreen(world, t.x);
      if (sx < -40 || sx > W + 40) continue;
      const ratio = t.maxDurability > 0 ? t.durability / t.maxDurability : 0;
      const depleted = !targetUsable(t);

      ctx.strokeStyle = depleted ? 'rgba(200,180,140,0.28)' : 'rgba(200,180,140,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, t.y - t.radius - 30);
      ctx.lineTo(sx, t.y - t.radius);
      ctx.stroke();

      ctx.fillStyle = t.color;
      ctx.globalAlpha = depleted ? 0.18 + ratio * 0.4 : 0.35 + ratio * 0.65;
      ctx.beginPath();
      ctx.arc(sx, t.y, t.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = depleted ? 'rgba(240,217,168,0.45)' : '#f0d9a8';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.strokeStyle = ratio < 0.35 ? '#ff4d4d' : '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, t.y, t.radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    for (const c of world.coins) {
      if (c.collected && c.popLife <= 0) continue;
      let sx = worldToScreen(world, c.x);
      let sy = c.y + Math.sin(time * 3 + c.bob) * 5;
      if (c.collected) {
        ctx.globalAlpha = Math.max(0, c.popLife);
        sy -= (1 - c.popLife) * 30;
      }
      if (sx < -40 || sx > W + 40) {
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.fillStyle = '#ffd454';
      ctx.shadowColor = '#ffd454';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#a3742a';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('¥', sx, sy + 1);
      ctx.globalAlpha = 1;
    }
  }

  function drawDangerVignette(ctx, W, H, factor) {
    if (factor <= 0) return;
    const a = factor * 0.55;
    const lg = ctx.createLinearGradient(0, 0, W * 0.12, 0);
    lg.addColorStop(0, `rgba(200,30,30,${a})`);
    lg.addColorStop(1, 'rgba(200,30,30,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W * 0.12, H);
    const bg = ctx.createLinearGradient(0, H, 0, H - H * 0.12);
    bg.addColorStop(0, `rgba(200,30,30,${a})`);
    bg.addColorStop(1, 'rgba(200,30,30,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, H - H * 0.12, W, H * 0.12);
  }

  function platformAt(world, x, y, hw, hh) {
    for (const p of world.platforms) {
      if (x + hw > p.x && x - hw < p.x + p.w && y + hh >= p.y && y + hh <= p.y + p.h + 8) {
        return p;
      }
    }
    return null;
  }

  /** Find a platform near a world point (e.g. ladder top lip). */
  function platformNear(world, x, y, xSlop, ySlop) {
    xSlop = xSlop != null ? xSlop : 24;
    ySlop = ySlop != null ? ySlop : 12;
    let best = null;
    let bestDist = Infinity;
    for (const p of world.platforms) {
      if (y < p.y - ySlop || y > p.y + p.h + ySlop) continue;
      if (x < p.x - xSlop || x > p.x + p.w + xSlop) continue;
      const cx = Math.max(p.x, Math.min(p.x + p.w, x));
      const d = Math.abs(cx - x) + Math.abs(p.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  function handleAt(world, x, y, reach) {
    for (const h of world.handles) {
      const dx = x - h.x;
      const dy = y - h.y;
      if (dx * dx + dy * dy < (h.r + reach) * (h.r + reach)) return h;
    }
    return null;
  }

  /** Body overlap with a ladder (x centered, vertical span). */
  function ladderAt(world, x, y, hw, hh) {
    const feet = y + hh;
    const head = y - hh * 0.6;
    for (const l of world.ladders) {
      if (x + hw < l.x - l.w / 2 || x - hw > l.x + l.w / 2) continue;
      if (feet < l.topY - 6 || head > l.bottomY + 6) continue;
      return l;
    }
    return null;
  }

  function targetHit(world, x, y) {
    for (const t of world.targets) {
      if (!targetUsable(t)) continue;
      const dx = x - t.x;
      const dy = y - t.y;
      if (dx * dx + dy * dy <= t.radius * t.radius) return t;
    }
    return null;
  }

  global.NinjaWorld = {
    TARGET_TIERS,
    STRENGTH,
    BASE_SCROLL,
    createWorld,
    resetWorld,
    updateCamera,
    updateTargets,
    scrollSpeed,
    worldToScreen,
    dangerFactor,
    drawBackground,
    drawWorld,
    drawDangerVignette,
    platformAt,
    platformNear,
    handleAt,
    ladderAt,
    targetHit,
    ensureChunks,
  };
})(window);
