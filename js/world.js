(function (global) {
  const TARGET_TIERS = {
    weak: { radius: 14, hangTime: 4.0, color: '#c44b3a', weight: 0.35 },
    medium: { radius: 20, hangTime: 8.4, color: '#d8a23a', weight: 0.4 },
    strong: { radius: 28, hangTime: 14.0, color: '#6fd86f', weight: 0.25 },
  };

  // Forced drift once scrolling is unlocked (gentle; ramps with distance).
  const BASE_SCROLL = 42;
  const SCROLL_RAMP = 0.008; // per meter of distance
  // Unlock when the player first crosses this fraction of the viewport (center).
  const SCROLL_UNLOCK_FRAC = 0.5;
  // After unlock, camera tries to keep the player around this screen-x fraction.
  // Slightly left of center so there is room ahead to aim at targets.
  const CAMERA_ANCHOR_FRAC = 0.4;

  function pickTier(rand) {
    const r = rand();
    if (r < TARGET_TIERS.weak.weight) return 'weak';
    if (r < TARGET_TIERS.weak.weight + TARGET_TIERS.medium.weight) return 'medium';
    return 'strong';
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
      nextX: 0,
      seed: Math.random() * 1e9,
      elapsed: 0,
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

  function resetWorld(world, H) {
    world.cameraX = 0;
    world.distance = 0;
    world.scrollUnlocked = false;
    world.platforms = [];
    world.handles = [];
    world.targets = [];
    world.coins = [];
    world.nextX = 0;
    world.seed = Math.random() * 1e9;
    world.elapsed = 0;
    ensureChunks(world, H, 900);
  }

  function ensureChunks(world, H, aheadX) {
    const rand = mulberry32((world.seed + world.nextX) | 0);
    const groundY = H * 0.72;
    while (world.nextX < world.cameraX + aheadX) {
      const x = world.nextX;
      if (x === 0) {
        // Starter platform under the player
        world.platforms.push({ x: 40, y: groundY, w: 220, h: 18 });
        world.targets.push(makeTarget(180, groundY - 160, 'strong', rand));
        world.handles.push({ x: 280, y: groundY - 90, r: 12 });
        world.nextX = 320;
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

      const nTargets = 1 + (rand() < 0.45 ? 1 : 0);
      for (let i = 0; i < nTargets; i++) {
        const tx = x + 30 + rand() * (platW + 80);
        const ty = platY - 100 - rand() * 140;
        world.targets.push(makeTarget(tx, ty, pickTier(rand), rand));
      }

      if (rand() < 0.7) {
        world.coins.push({
          x: x + platW * 0.5,
          y: platY - 36,
          collected: false,
          popLife: 0,
          bob: rand() * Math.PI * 2,
        });
      }

      // Occasional floating coin / extra target over gaps
      if (rand() < 0.4) {
        world.targets.push(
          makeTarget(x + platW + gap * 0.5, platY - 80 - rand() * 100, pickTier(rand), rand)
        );
      }

      world.nextX = x + platW + gap;
    }

    // Cull far behind
    const minX = world.cameraX - 400;
    world.platforms = world.platforms.filter((p) => p.x + p.w > minX);
    world.handles = world.handles.filter((h) => h.x > minX);
    world.targets = world.targets.filter((t) => t.x > minX && !t.removed);
    world.coins = world.coins.filter((c) => c.x > minX && (!c.collected || c.popLife > 0));
  }

  function makeTarget(x, y, tier, rand) {
    const def = TARGET_TIERS[tier];
    const hang = def.hangTime * (0.85 + rand() * 0.3);
    return {
      x,
      y,
      tier,
      radius: def.radius,
      color: def.color,
      maxDurability: hang,
      durability: hang,
      broken: false,
      removed: false,
    };
  }

  function scrollSpeed(world) {
    return BASE_SCROLL + world.distance * SCROLL_RAMP;
  }

  /**
   * Camera stays still until the player crosses mid-screen (practice window).
   * After unlock: cameraX = max(cameraX + forcedScroll*dt, player.x - anchor),
   * so rushing ahead pulls the view forward, while lagging still faces slow pressure.
   */
  function updateCamera(world, dt, H, playerX, W) {
    world.elapsed += dt;
    const screenX = playerX - world.cameraX;

    if (!world.scrollUnlocked) {
      if (screenX >= W * SCROLL_UNLOCK_FRAC) {
        world.scrollUnlocked = true;
      } else {
        ensureChunks(world, H, 1000);
        return;
      }
    }

    const forced = world.cameraX + scrollSpeed(world) * dt;
    const follow = playerX - W * CAMERA_ANCHOR_FRAC;
    world.cameraX = Math.max(forced, follow);
    world.distance = Math.max(world.distance, world.cameraX / 10);
    ensureChunks(world, H, 1000);
  }

  function worldToScreen(world, x) {
    return x - world.cameraX;
  }

  function dangerFactor(screenX, screenY, W, H, scrollUnlocked) {
    // 1 at kill edge, 0 when safe. Bottom always; left only after scroll unlock.
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

    // Parallax beams
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
    // Platforms
    for (const p of world.platforms) {
      const sx = worldToScreen(world, p.x);
      if (sx + p.w < -20 || sx > W + 20) continue;
      ctx.fillStyle = '#3a3024';
      ctx.fillRect(sx, p.y, p.w, p.h);
      ctx.fillStyle = '#d8a23a';
      ctx.fillRect(sx, p.y, p.w, 3);
    }

    // Handles
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

    // Targets
    for (const t of world.targets) {
      if (t.broken || t.removed) continue;
      const sx = worldToScreen(world, t.x);
      if (sx < -40 || sx > W + 40) continue;
      const ratio = t.durability / t.maxDurability;
      ctx.strokeStyle = 'rgba(200,180,140,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, t.y - t.radius - 30);
      ctx.lineTo(sx, t.y - t.radius);
      ctx.stroke();

      ctx.fillStyle = t.color;
      ctx.globalAlpha = 0.35 + ratio * 0.65;
      ctx.beginPath();
      ctx.arc(sx, t.y, t.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#f0d9a8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Durability arc
      ctx.strokeStyle = ratio < 0.35 ? '#ff4d4d' : '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, t.y, t.radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    // Coins
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
    // Left edge
    const lg = ctx.createLinearGradient(0, 0, W * 0.12, 0);
    lg.addColorStop(0, `rgba(200,30,30,${a})`);
    lg.addColorStop(1, 'rgba(200,30,30,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W * 0.12, H);
    // Bottom edge
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

  function handleAt(world, x, y, reach) {
    for (const h of world.handles) {
      const dx = x - h.x;
      const dy = y - h.y;
      if (dx * dx + dy * dy < (h.r + reach) * (h.r + reach)) return h;
    }
    return null;
  }

  function targetHit(world, x, y) {
    for (const t of world.targets) {
      if (t.broken || t.removed) continue;
      const dx = x - t.x;
      const dy = y - t.y;
      if (dx * dx + dy * dy <= t.radius * t.radius) return t;
    }
    return null;
  }

  global.NinjaWorld = {
    TARGET_TIERS,
    BASE_SCROLL,
    createWorld,
    resetWorld,
    updateCamera,
    scrollSpeed,
    worldToScreen,
    dangerFactor,
    drawBackground,
    drawWorld,
    drawDangerVignette,
    platformAt,
    handleAt,
    targetHit,
    ensureChunks,
  };
})(window);
