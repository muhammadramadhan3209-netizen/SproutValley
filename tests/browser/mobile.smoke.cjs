// Optional browser gate: install Playwright and its Chromium, then run this file.
// Fixtures change only this isolated browser's save, never the shipped map/data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const output = process.env.SMOKE_OUTPUT || path.join(root, 'qa/browser');
const results = [];

(async () => {
  const { createServer, preview } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')));
  const production = process.env.SMOKE_PRODUCTION === '1';
  const server = production
    ? await preview({ root, preview: { host: '127.0.0.1', port: 5173 } })
    : await createServer({ root, server: { host: '127.0.0.1', port: 5173 } });
  if (!production) await server.listen();
  let browser;
  const errors = [], browserDiagnostics = [];
  fs.mkdirSync(output, { recursive: true });
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
      args: JSON.parse(process.env.CHROMIUM_ARGS_JSON || '[]') });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, hasTouch: true });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || url.protocol === 'data:') return route.continue();
      errors.push('Unexpected network dependency: ' + url.origin);
      return route.abort();
    });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() !== 'error') return;
      // Phaser 3.90 calls preventDefault on Chromium non-cancelable touchcancel.
      // Record that browser diagnostic; JS exceptions and all other errors fail.
      if (m.text().startsWith('Ignored attempt to cancel a touchcancel event')) browserDiagnostics.push(m.text());
      else errors.push(m.text()); });
    const cdp = await page.context().newCDPSession(page);
    const wait = ms => page.waitForTimeout(ms);
    const scene = (fn, arg) => page.evaluate(({ code, arg }) =>
      Function('s', 'arg', `return (${code})(s,arg)`)(window.__sproutValley.scene.getScenes(true)[0], arg), { code: fn.toString(), arg });
    const check = async (name, fn) => {
      await fn();
      assert.deepEqual(errors, [], 'No browser runtime errors');
      results.push({ name, passed: true }); console.log('PASS', name);
    };
    const state = () => scene(s => ({ x: s.player.x, y: s.player.y,
      vx: s.player.body.velocity.x, vy: s.player.body.velocity.y,
      frame: s.player.frame.name, animation: s.player.anims.currentAnim?.key }));
    const resetPlayer = async (x = 248, y = 176) => {
      await scene((s, p) => { s.virtualPad.reset(); s.player.body.reset(p.x, p.y); }, { x, y }); await wait(100);
    };
    const screenPoint = (x, y) => page.evaluate(({ x, y }) => {
      const game = window.__sproutValley, box = game.canvas.getBoundingClientRect();
      return { x: box.left + x * box.width / game.scale.width, y: box.top + y * box.height / game.scale.height };
    }, { x, y });
    const padPoint = async (dx = 28, dy = 0) => {
      const p = await scene((s, d) => ({ x: s.virtualPad._container.x + d.dx, y: s.virtualPad._container.y + d.dy }), { dx, dy });
      return screenPoint(p.x, p.y);
    };
    const buttonPoint = async id => {
      const p = await scene((s, id) => { const b = [...s.touchButtons._buttons, ...s.actionButtons._buttons].find(b => b.id === id);
        assertButton(b); return { x: b.container.x, y: b.container.y }; function assertButton(b) { if (!b) throw Error('Missing button: ' + id); } }, id);
      return screenPoint(p.x, p.y);
    };
    const tap = async id => { const p = await buttonPoint(id); await page.touchscreen.tap(p.x, p.y); await wait(120); };
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type,
      touchPoints: points.map(p => ({ radiusX: 3, radiusY: 3, force: 1, ...p })) });
    const closePanel = async name => {
      const p = await scene((s, name) => { const ui = s[name];
        const hit = ui.container.list.find(c => c.input && c.width === 32 && c.height === 32);
        if (!hit) throw Error('Missing close target');
        const matrix = hit.getWorldTransformMatrix(); return { x: matrix.tx, y: matrix.ty }; }, name);
      const screen = await screenPoint(p.x, p.y); await page.touchscreen.tap(screen.x, screen.y); await wait(120);
      assert.equal(await scene((s, name) => s[name].isVisible(), name), false);
    };
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.__sproutValley?.scene.isActive('MainMenuScene'));
    await page.touchscreen.tap(480, 270);
    await page.waitForFunction(() => window.__sproutValley?.scene.isActive('FarmScene'));
    await wait(300);

    await check('Farm boot, sliced textures, feet body and initialized soil', async () => {
      const v = await scene(s => ({ tiles: s.groundLayer.list.length,
        framesOK: s.groundLayer.list.every(i => i.frame.width === 16 && i.frame.height === 16),
        body: [s.player.body.width, s.player.body.height, s.player.body.bottom - s.player.y],
        solidsOK: s.solids.getChildren().every(z => (z.body.width === 16 && z.body.height === 16) || (z.body.width === 112 && z.body.height === 80)),
        boundSoil: s.farming.tileSprites[7][20] === s.groundLayer.list[7 * 30 + 20] }));
      assert.equal(v.tiles, 600); assert.equal(v.framesOK, true); assert.equal(v.solidsOK, true);
      assert.deepEqual(v.body, [16, 8, 0]); assert.equal(v.boundSoil, true);
    });
    await check('Keyboard four directions animate both steps and return to matching idle', async () => {
      for (const [key, facing, column, axis, sign] of [
        ['ArrowRight', 'right', 6, 'x', 1], ['a', 'left', 2, 'x', -1],
        ['w', 'up', 0, 'y', -1], ['ArrowDown', 'down', 4, 'y', 1]]) {
        await resetPlayer(); const before = await state();
        await page.keyboard.down(key);
        const frames = new Set();
        for (let i = 0; i < 10; i++) { await wait(65); const v = await state();
          assert.equal(v.animation, `player_walk_${facing}`); frames.add(v.frame); }
        const after = await state();
        assert.ok((after[axis] - before[axis]) * sign > 25);
        assert.deepEqual([...frames].sort((a, b) => a - b), [column, column + 8, column + 16]);
        await page.keyboard.up(key); await wait(80);
        const idle = await state(); assert.equal(idle.animation, `player_idle_${facing}`);
        assert.equal(idle.frame, column + 8); assert.equal(Math.hypot(idle.vx, idle.vy), 0);
      }
    });
    await check('Real touch drag, diagonal speed, second finger action and release', async () => {
      await resetPlayer(); const p = { ...await padPoint(), id: 1 };
      await touch('touchStart', [p]); await wait(250);
      let v = await state(); assert.ok(v.x > 258); assert.equal(v.vx, 80);
      const seedBefore = await scene(s => s.selectedSeed), action = { ...await buttonPoint('seed_cycle'), id: 2 };
      await touch('touchStart', [p, action]); await wait(80);
      await touch('touchEnd', [action]); await wait(100);
      assert.notEqual(await scene(s => s.selectedSeed), seedBefore); assert.equal((await state()).vx, 80, JSON.stringify(await scene(s => ({owner:s.virtualPad._pointerId, dir:s.virtualPad.getDirection(), pointers:s.input.manager.pointers.map(p=>({id:p.id,isDown:p.isDown,identifier:p.identifier,x:p.x,y:p.y}))}))));
      const diagonal = { ...await padPoint(50, 50), id: 1 };
      await touch('touchMove', [diagonal]); await wait(100); v = await state();
      assert.ok(Math.abs(Math.hypot(v.vx, v.vy) - 80) < 0.01);
      await touch('touchEnd', []); await wait(100); v = await state(); assert.equal(Math.hypot(v.vx, v.vy), 0);
      await touch('touchStart', [p]); await wait(80); await touch('touchCancel', []); await wait(100);
      assert.equal((await state()).vx, 0);
    });
    await check('Camera-scrolled menu hitboxes, modal movement lock and touch close', async () => {
      await resetPlayer(); assert.ok(await scene(s => s.cameras.main.scrollY > 0));
      const p = { ...await padPoint(), id: 1 };
      await touch('touchStart', [p]); await wait(100);
      await touch('touchStart', [p, { ...await buttonPoint('inventory'), id: 2 }]); await wait(120);
      assert.equal(await scene(s => s.inventoryUI.isVisible()), true);
      assert.equal((await state()).vx, 0);
      await touch('touchEnd', []); await closePanel('inventoryUI');
      for (const [id, panel] of [['quest', 'questUI'], ['achievement', 'achievementUI'], ['shop', 'shopUI']]) {
        await tap(id); assert.equal(await scene((s, p) => s[p].isVisible(), panel), true); await closePanel(panel);
      }
    });
    await check('Touch till, plant, water, growth frames and harvest inventory', async () => {
      await resetPlayer(328, 128); await scene(s => { s.selectedSeed = 'carrot'; });
      await tap('hoe');
      assert.deepEqual(await scene(s => { const t = s.farming.tileSprites[7][20]; return [t.texture.key, t.frame.name]; }), ['tileset_dirt', 0]);
      await tap('interact');
      assert.equal(await scene(s => s.farming.cropSprites[7][20]?.frame.name), 15);
      await tap('water');
      assert.deepEqual(await scene(s => [s.farming.cropSprites[7][20].texture.key, s.farming.tileSprites[7][20].tintTopLeft]), ['plants_watered', 0xb99778]);
      await scene(s => { s.farming.getPlotAtTile(20, 7).plantedAt = Date.now() - 10000; });
      await wait(1100);
      assert.equal(await scene(s => s.farming.getPlotAtTile(20, 7).stage), 3);
      assert.equal(await scene(s => s.farming.cropSprites[7][20].frame.name), 19);
      await resetPlayer(360, 160);
      await page.screenshot({ path: path.join(output, 'farm-landscape.png') });
      await resetPlayer(328, 128);
      const before = await scene(s => s.inventory.countItem('harvest_carrot'));
      await tap('harvest');
      assert.equal(await scene(s => s.inventory.countItem('harvest_carrot')), before + 1);
      assert.equal(await scene(s => s.farming.cropSprites[7][20]), null);
    });
    await check('World bounds and colliders block movement at the shore and house', async () => {
      await resetPlayer(180, 112); await page.keyboard.down('ArrowLeft'); await wait(500); await page.keyboard.up('ArrowLeft');
      assert.ok((await state()).x >= 168 - 0.1, 'House right edge at 160 plus half-body 8');
      await resetPlayer(56, 280); await page.keyboard.down('ArrowLeft'); await wait(500); await page.keyboard.up('ArrowLeft');
      assert.ok((await state()).x >= 56 - 0.1, 'Water ends at x=48');
      await resetPlayer(450, 288); await page.keyboard.down('ArrowRight'); await wait(500); await page.keyboard.up('ArrowRight');
      assert.ok((await state()).x <= 456 + 0.1);
    });
    await check('Wide landscape fills view, camera stays in bounds, portrait pauses input', async () => {
      await page.setViewportSize({ width: 800, height: 360 }); await wait(300);
      const v = await page.evaluate(() => { const g = window.__sproutValley, s = g.scene.getScene('FarmScene'), c = s.cameras.main;
        return { size: [g.scale.width, g.scale.height], view: [c.worldView.x, c.worldView.y, c.worldView.right, c.worldView.bottom],
          canvas: [g.canvas.getBoundingClientRect().width, g.canvas.getBoundingClientRect().height], follows: c._follow === s.player }; });
      assert.deepEqual(v.size, [480, 216]); assert.deepEqual(v.canvas, [800, 360]); assert.equal(v.follows, true);
      assert.ok(v.view[0] >= 0 && v.view[1] >= 0 && v.view[2] <= 480 && v.view[3] <= 320);
      await page.screenshot({ path: path.join(output, 'farm-wide.png') });
      const p = { ...await padPoint(), id: 1 }; await touch('touchStart', [p]);
      await page.setViewportSize({ width: 360, height: 800 }); await wait(250);
      assert.equal(await page.locator('#rotate-device').isVisible(), true);
      assert.equal(await page.evaluate(() => window.__sproutValley.loop.running), false);
      await touch('touchCancel', []);
      await page.setViewportSize({ width: 960, height: 540 }); await wait(250);
      assert.equal(await page.locator('#rotate-device').isVisible(), false); assert.equal((await state()).vx, 0);
    });
    await check('Existing Farm/Lake portals, Lake input/fishing and safe saved re-entry', async () => {
      await resetPlayer(440, 96);
      await page.waitForFunction(() => window.__sproutValley.scene.isActive('LakeScene')); await wait(200);
      assert.equal(await scene(s => s.fishing.tileMap === s.tileMap), true);
      assert.equal(await scene(s => !!s.keyUp && !!s.keyDown), true);
      await tap('cast'); assert.notEqual(await scene(s => s.fishing.getState()), 'idle');
      await scene(s => s.fishing.cancel(s.player));
      await page.screenshot({ path: path.join(output, 'lake-landscape.png') });
      await scene(s => { const t = s.portalTrigger; s.player.body.reset(t.x, t.y + 4); });
      await page.waitForFunction(() => window.__sproutValley.scene.isActive('FarmScene')); await wait(500);
      assert.equal(await scene(s => s.scene.key), 'FarmScene');
      assert.deepEqual(await scene(s => [s.player.x, s.player.y]), [248, 176]);
      assert.ok(await scene(s => s.inventory.countItem('harvest_carrot') >= 1));
      assert.equal(await scene(s => s.farming.tileSprites[7][20].texture.key), 'tileset_dirt');
      await scene(s => s._captureAndSave());
      await page.reload(); await page.waitForFunction(() => window.__sproutValley?.scene.isActive('MainMenuScene'));
      await page.touchscreen.tap(480, 270); await wait(500);
      assert.ok(await scene(s => s.inventory.countItem('harvest_carrot') >= 1));
    });
  } catch (error) {
    results.push({ name: 'Failure', passed: false, message: error.stack });
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ production, results, browserErrors: errors, browserDiagnostics }, null, 2));
    await browser?.close();
    if (production) await new Promise(resolve => server.httpServer.close(resolve));
    else await server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
