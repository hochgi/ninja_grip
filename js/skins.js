(function (global) {
  const STORAGE = {
    coins: 'ninjagrip_coins',
    owned: 'ninjagrip_owned_skins',
    selected: 'ninjagrip_selected_skin',
    best: 'ninjagrip_best',
  };

  const SKINS = [
    { id: 'classic', price: 0, body: '#161412', sash: '#d8742a', headband: '#d8742a', tail: '#c44b3a', eyes: '#f0d9a8' },
    { id: 'crimson', price: 30, body: '#1a1210', sash: '#c4302a', headband: '#c4302a', tail: '#8a1f1f', eyes: '#f0d9a8' },
    { id: 'jade', price: 50, body: '#101a14', sash: '#3a9d6e', headband: '#3a9d6e', tail: '#1f6b46', eyes: '#f0d9a8' },
    { id: 'azure', price: 75, body: '#10141a', sash: '#3a7dc4', headband: '#3a7dc4', tail: '#1f4f8a', eyes: '#f0d9a8' },
    { id: 'gold', price: 100, body: '#161310', sash: '#e8b454', headband: '#e8b454', tail: '#a3742a', eyes: '#2b1d0d' },
    { id: 'violet', price: 130, body: '#14101a', sash: '#8a4fc4', headband: '#8a4fc4', tail: '#5a2f8a', eyes: '#f0d9a8' },
    { id: 'storm', price: 160, body: '#16181a', sash: '#7a8a9a', headband: '#7a8a9a', tail: '#4a5a6a', eyes: '#f0d9a8' },
    { id: 'sakura', price: 200, body: '#1a1216', sash: '#e88fa8', headband: '#e88fa8', tail: '#c45a7a', eyes: '#2b1d0d' },
    { id: 'venom', price: 250, body: '#101810', sash: '#6dbf3a', headband: '#6dbf3a', tail: '#3a7d1f', eyes: '#c4302a' },
    { id: 'obsidian', price: 300, body: '#0a0a0a', sash: '#3a3a3a', headband: '#3a3a3a', tail: '#1a1a1a', eyes: '#c4302a' },
    { id: 'phoenix', price: 360, body: '#1a1410', sash: '#e8742a', headband: '#e85a2a', tail: '#c43a1a', eyes: '#f0d9a8' },
    { id: 'glacier', price: 420, body: '#101618', sash: '#7ad4e8', headband: '#7ad4e8', tail: '#3a9dc4', eyes: '#2b1d0d' },
    { id: 'shadow', price: 500, body: '#0d0d0f', sash: '#2a2a3a', headband: '#5a3a8a', tail: '#2a1a4a', eyes: '#8a4fc4' },
    { id: 'ember', price: 600, body: '#1a1010', sash: '#ff6a3a', headband: '#ff6a3a', tail: '#c4302a', eyes: '#f0d9a8' },
    { id: 'royal', price: 700, body: '#10101a', sash: '#d4af37', headband: '#5a2f8a', tail: '#d4af37', eyes: '#f0d9a8' },
    { id: 'toxic', price: 850, body: '#0d1a0d', sash: '#aaff3a', headband: '#aaff3a', tail: '#6dbf1f', eyes: '#aaff3a' },
    { id: 'midnight', price: 1000, body: '#08080c', sash: '#3a3a6a', headband: '#7a7ad4', tail: '#3a3a6a', eyes: '#7a7ad4' },
    { id: 'solar', price: 1200, body: '#1a1608', sash: '#ffd454', headband: '#ffaa2a', tail: '#ff7a1a', eyes: '#2b1d0d' },
    { id: 'abyss', price: 1500, body: '#05050a', sash: '#1a2a4a', headband: '#2a4a7a', tail: '#0a1530', eyes: '#3a9dc4' },
    { id: 'legend', price: 2000, body: '#161412', sash: '#ffd454', headband: '#c4302a', tail: '#3a7dc4', eyes: '#ffd454' },
  ];

  function safeParse(json, fallback) {
    try {
      const v = JSON.parse(json);
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function loadInt(key, fallback) {
    const n = parseInt(localStorage.getItem(key) || String(fallback), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  let coins = loadInt(STORAGE.coins, 0);
  let ownedSkins = safeParse(localStorage.getItem(STORAGE.owned) || '["classic"]', ['classic']);
  if (!Array.isArray(ownedSkins)) ownedSkins = ['classic'];
  if (!ownedSkins.includes('classic')) ownedSkins.push('classic');
  let selectedSkinId = localStorage.getItem(STORAGE.selected) || 'classic';
  let bestDistance = loadInt(STORAGE.best, 0);

  function saveCoins() {
    localStorage.setItem(STORAGE.coins, String(coins));
  }
  function saveOwned() {
    localStorage.setItem(STORAGE.owned, JSON.stringify(ownedSkins));
  }
  function saveBest() {
    localStorage.setItem(STORAGE.best, String(bestDistance));
  }

  function isOwned(id) {
    return ownedSkins.includes(id);
  }

  function buySkin(id) {
    const skin = SKINS.find((s) => s.id === id);
    if (!skin || isOwned(id) || coins < skin.price) return false;
    coins -= skin.price;
    ownedSkins.push(id);
    saveCoins();
    saveOwned();
    return true;
  }

  function getCurrentSkin() {
    let skin = SKINS.find((s) => s.id === selectedSkinId);
    if (!skin || !isOwned(selectedSkinId)) skin = SKINS[0];
    return skin;
  }

  function selectSkin(id) {
    if (!isOwned(id)) return false;
    selectedSkinId = id;
    localStorage.setItem(STORAGE.selected, id);
    return true;
  }

  function addCoins(n) {
    coins += n;
    saveCoins();
  }

  function updateBest(dist) {
    const d = Math.floor(dist);
    if (d > bestDistance) {
      bestDistance = d;
      saveBest();
      return true;
    }
    return false;
  }

  function skinName(id) {
    return (global.NinjaI18n && global.NinjaI18n.t('skinsNames.' + id)) || id;
  }

  function drawMiniNinja(c, skin) {
    c.clearRect(0, 0, 36, 44);
    c.save();
    c.translate(18, 22);
    c.fillStyle = skin.body;
    c.beginPath();
    c.ellipse(0, 6, 7, 11, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = skin.sash;
    c.beginPath();
    c.ellipse(0, 7, 3, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = skin.body;
    c.beginPath();
    c.arc(0, -6, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = skin.eyes;
    c.beginPath();
    c.ellipse(-2.2, -6.5, 1.2, 0.8, 0, 0, Math.PI * 2);
    c.ellipse(2.2, -6.5, 1.2, 0.8, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = skin.headband;
    c.fillRect(-6, -9, 12, 2.5);
    c.restore();
  }

  function drawPlayer(ctx, x, y, skin, opts) {
    opts = opts || {};
    const angle = opts.angle || 0;
    const t = opts.time || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.ellipse(0, 10, 9, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = skin.sash;
    ctx.beginPath();
    ctx.ellipse(0, 12, 4, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = skin.body;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (opts.pose === 'handle') {
      ctx.moveTo(-4, 2);
      ctx.lineTo(-2, -16);
      ctx.moveTo(5, 4);
      ctx.lineTo(14, 2);
    } else if (opts.pose === 'rope') {
      ctx.moveTo(-3, 2);
      ctx.lineTo(0, -16);
      ctx.moveTo(3, 2);
      ctx.lineTo(0, -16);
    } else {
      ctx.moveTo(-6, 4);
      ctx.lineTo(-10, 16);
      ctx.moveTo(6, 4);
      ctx.lineTo(10, 16);
    }
    ctx.stroke();

    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.arc(0, -8, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = skin.eyes;
    ctx.beginPath();
    ctx.ellipse(-3, -9, 1.6, 1, 0, 0, Math.PI * 2);
    ctx.ellipse(3, -9, 1.6, 1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = skin.headband;
    ctx.fillRect(-8, -12, 16, 3.5);
    ctx.strokeStyle = skin.tail;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-7, -10.5);
    ctx.lineTo(-15, -4 + Math.sin(t * 10) * 3);
    ctx.moveTo(-9, -10.5);
    ctx.lineTo(-17, -7 + Math.sin(t * 10 + 1) * 3);
    ctx.stroke();

    ctx.restore();
  }

  global.NinjaSkins = {
    SKINS,
    get coins() {
      return coins;
    },
    get ownedSkins() {
      return ownedSkins;
    },
    get selectedSkinId() {
      return selectedSkinId;
    },
    get bestDistance() {
      return bestDistance;
    },
    isOwned,
    buySkin,
    getCurrentSkin,
    selectSkin,
    addCoins,
    updateBest,
    skinName,
    drawMiniNinja,
    drawPlayer,
    saveCoins,
  };
})(window);
