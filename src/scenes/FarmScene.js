import { showDialogPanel } from '../ui/dialogLayout.js';
import {
  SCENE_KEYS,
  COLORS,
  FARM_WORLD,
  FARMING,
  SHARED_INVENTORY_KEY,
  SHARED_ACHIEVEMENT_KEY,
  STARTING_SEEDS,
  TILE_SIZE,
  TILE_GRASS,
  TILE_DIRT,
  TILE_WATER
} from '../config/constants.js';
import { Player } from '../entities/Player.js';
import { groundFrame, HOUSE_LAYERS } from '../config/assetFrames.js';
import { staticRectangle, restoreWalkablePosition } from '../utils/worldPhysics.js';
import { layoutSceneUI, isModalOpen } from '../ui/sceneLayout.js';
import { FarmingSystem } from '../systems/FarmingSystem.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { ItemSystem } from '../systems/ItemSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { TimeSystem } from '../systems/TimeSystem.js';
import { EconomySystem } from '../systems/EconomySystem.js';
import { DecorationSystem } from '../systems/DecorationSystem.js';
import { NPCSystem } from '../systems/NPCSystem.js';
import { QuestSystem } from '../systems/QuestSystem.js';
import { AchievementSystem } from '../systems/AchievementSystem.js';
import { InventoryUI } from '../ui/InventoryUI.js';
import { ShopUI } from '../ui/ShopUI.js';
import { ToastUI } from '../ui/ToastUI.js';
import { QuestUI } from '../ui/QuestUI.js';
import { AchievementUI } from '../ui/AchievementUI.js';
import { AchievementPopup } from '../ui/AchievementPopup.js';
import { TouchButtons } from '../ui/TouchButtons.js';
import { ActionButtons, FARM_ACTION_DEFS } from '../ui/ActionButtons.js';
import { VirtualPad } from '../ui/VirtualPad.js';
import cropsData from '../data/crops.json' with { type: 'json' };
import questData from '../data/quests.json' with { type: 'json' };

const COLLISION_TILES = new Set([TILE_WATER]);

export class FarmScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.FARM });
  }

  init() {
    this.selectedSeed = 'carrot';
    this.selectedTool = null;
    this.actionCooldown = 0;
    this.buildMode = false;
    this.buildItem = null;
    this._goldDisplayed = null;
    this._goldTween = null;
  }

  create() {
    const worldPixelW = FARM_WORLD.width * TILE_SIZE;
    const worldPixelH = FARM_WORLD.height * TILE_SIZE;

    this.cameras.main.setBackgroundColor(COLORS.background);
    this.cameras.main.setBounds(0, 0, worldPixelW, worldPixelH);

    this.physics.world.setBounds(0, 0, worldPixelW, worldPixelH);

    this.saveSystem = this._getSharedSave();
    this.timeSystem = this._getSharedTime();
    this.economy = this._getSharedEconomy();
    this.decoration = this._getSharedDecoration();
    this.npc = this._getSharedNpc();
    this.quest = this._getSharedQuest();
    this.achievement = this._getSharedAchievement();
    this.inventory = this._getSharedInventory();
    this.items = new ItemSystem();
    this.inventory.itemSystem = this.items;
    this.economy.setItemSystem(this.items);
    this.decoration.itemSystem = this.items;
    this.decoration.inventory = this.inventory;
    this._seedStartingInventoryIfEmpty();

    this.npc.setQuestHandlers({
      onStart: (questId) => this.quest.startQuest(questId),
      onComplete: (questId) => this.quest.applyReward(questId, this.economy, this.inventory)
    });

    this.buildMap();
    this.farming = new FarmingSystem(
      this,
      { dimensions: { width: FARM_WORLD.width, height: FARM_WORLD.height } },
      this.inventory,
      cropsData
    );
    this.farming.setTimeSystem(this.timeSystem);

    this.inventoryUI = new InventoryUI(this, this.inventory, this.items);
    this.shopUI = new ShopUI(this, this.economy, this.inventory, this.items);
    this.toastUI = new ToastUI(this);
    this.questUI = new QuestUI(this, this.quest, this.economy, this.inventory, this.items);
    this.achievementUI = new AchievementUI(this, this.achievement, this.items);
    this.achievementPopup = new AchievementPopup(this);
    this.achievementPopup.bindToAchievementSystem(this.achievement);
    this.virtualPad = new VirtualPad(this, {
      onChange: (dir) => {
        if (this.player && typeof this.player.setTouchDirection === 'function') {
          this.player.setTouchDirection(dir);
        }
      }
    });
    this.touchButtons = new TouchButtons(this, {
      top: true,
      onPress: (id) => this._onTouchButton(id)
    });
    this.actionButtons = new ActionButtons(this, {
      defs: FARM_ACTION_DEFS,
      onPress: (id) => this._onTouchButton(id)
    });

    this.buildBoundaries();
    this.spawnPlayer();
    this.spawnNPCs();
    this.setupCamera();
    this.placeDecorations();
    this.createHUD();
    this.setupInputs();

    this._restoreFromSave();
    this._autoStartQuests();
    this._setupAutoSave();
  }

  _notifyQuestComplete(completed) {
    if (!completed || !completed.length) return;
    for (const q of completed) {
      const def = (this.quest && typeof this.quest.get === 'function') ? this.quest.get(q.id) : null;
      const title = def?.title || q.id;
      const reward = def?.reward || {};
      const lines = ['QUEST COMPLETE', title];
      if (Number.isFinite(reward.gold) && reward.gold > 0) lines.push(`+${reward.gold} Gold`);
      this.toastUI.show(lines.join('\n'), { kind: 'quest', duration: 3500 });
      this._scheduleAutoSave(0);
    }
  }

  _processAchievementUnlocks(unlocked) {
    if (!unlocked || !unlocked.length) return;
    for (const ach of unlocked) {
      this.achievement.applyReward(ach.id, this.economy, this.inventory);
      this.toastUI.show(`Achievement Unlocked: ${ach.title || ach.id}`, { kind: 'achievement' });
      this._scheduleAutoSave(0);
    }
  }

  _getSharedSave() {
    if (!this.game.registry.has('__sproutValleySave')) {
      this.game.registry.set('__sproutValleySave', new SaveSystem());
    }
    return this.game.registry.get('__sproutValleySave');
  }

  _getSharedTime() {
    if (!this.game.registry.has('__sproutValleyTime')) {
      this.game.registry.set('__sproutValleyTime', new TimeSystem());
    }
    return this.game.registry.get('__sproutValleyTime');
  }

  _getSharedEconomy() {
    if (!this.game.registry.has('__sproutValleyEconomy')) {
      this.game.registry.set('__sproutValleyEconomy', new EconomySystem());
    }
    return this.game.registry.get('__sproutValleyEconomy');
  }

  _getSharedDecoration() {
    if (!this.game.registry.has('__sproutValleyDecoration')) {
      this.game.registry.set('__sproutValleyDecoration', new DecorationSystem(this, null, null));
    }
    const dec = this.game.registry.get('__sproutValleyDecoration');
    dec.scene = this;
    dec.itemSystem = this.items;
    dec.inventory = this.inventory;
    return dec;
  }

  _getSharedNpc() {
    if (!this.game.registry.has('__sproutValleyNpc')) {
      this.game.registry.set('__sproutValleyNpc', new NPCSystem(this, this.timeSystem));
    }
    const npc = this.game.registry.get('__sproutValleyNpc');
    npc.scene = this;
    if (this.timeSystem) npc.setTimeSystem(this.timeSystem);
    return npc;
  }

  _getSharedQuest() {
    if (!this.game.registry.has('__sproutValleyQuest')) {
      this.game.registry.set('__sproutValleyQuest', new QuestSystem());
    }
    return this.game.registry.get('__sproutValleyQuest');
  }

  _getSharedAchievement() {
    if (!this.game.registry.has(SHARED_ACHIEVEMENT_KEY)) {
      this.game.registry.set(SHARED_ACHIEVEMENT_KEY, new AchievementSystem());
    }
    return this.game.registry.get(SHARED_ACHIEVEMENT_KEY);
  }

  _restoreFromSave() {
    if (!this.saveSystem.hasSave()) return;
    this.saveSystem.loadGame();
    this.saveSystem.restoreInventoryTo(this.inventory);
    this.saveSystem.restoreFarmingTo(this.farming);
    this.saveSystem.restoreTimeTo(this.timeSystem);
    this.saveSystem.restoreEconomyTo(this.economy);
    if (this.decoration) this.saveSystem.restoreDecorationsTo(this.decoration);
    if (this.npc) this.saveSystem.restoreNpcsTo(this.npc);
    if (this.quest) this.saveSystem.restoreQuestsTo(this.quest);
    if (this.achievement) this.saveSystem.restoreAchievementsTo(this.achievement);
    const pos = this.saveSystem.restorePlayerPosition(SCENE_KEYS.FARM);
    restoreWalkablePosition(this, pos, {
      x: FARM_WORLD.spawn.x * TILE_SIZE + TILE_SIZE / 2,
      y: FARM_WORLD.spawn.y * TILE_SIZE + TILE_SIZE
    });
    this._refreshHUD();
  }

  _autoStartQuests() {
    if (!this.quest) return;
    for (const def of Object.values(questData)) {
      if (!def || !def.id || !def.autoStart) continue;
      if (this.quest.isActive(def.id) || this.quest.isCompleted(def.id)) continue;
      this.quest.startQuest(def.id);
    }
  }

  _setupAutoSave() {
    this._unsubscribers = [];

    this.farming.onChange = (action, plot) => {
      this._scheduleAutoSave(action === 'harvest' ? 500 : 1500);
      if (action === 'harvest' && plot?.cropId) {
        const targetName = plot.cropId.replace('harvest_', '');
        const completed = this.quest.reportProgress('harvest', targetName, 1);
        this._notifyQuestComplete(completed);
        const unlocked = this.achievement.reportProgress('harvest', targetName, 1);
        this._processAchievementUnlocks(unlocked);
      }
    };

    if (this.decoration) {
      const offDec = this.decoration.onChange((event) => {
        if (event !== 'place') return;
        const completed = this.quest.reportProgress('place_decoration', null, 1);
        this._notifyQuestComplete(completed);
        const unlocked = this.achievement.reportProgress('place_decoration', null, 1);
        this._processAchievementUnlocks(unlocked);
        this._scheduleAutoSave(0);
      });
      this._unsubscribers.push(offDec);
    }

    if (this.economy) {
      const offEcon = this.economy.onChange((event, data) => {
        if (event !== 'earn') return;
        if (data && typeof data.reason === 'string') {
          if (data.reason.startsWith('quest:')) return;
          if (data.reason.startsWith('achievement:')) return;
        }
        if (!data || !Number.isFinite(data.amount) || data.amount <= 0) return;
        const completed = this.quest.reportProgress('earn_gold', null, data.amount);
        this._notifyQuestComplete(completed);
        const unlocked = this.achievement.reportProgress('earn_gold', null, data.amount);
        this._processAchievementUnlocks(unlocked);
        this._scheduleAutoSave(0);
      });
      this._unsubscribers.push(offEcon);
    }

    if (this.quest) {
      const offQuest = this.quest.onChange((event, quest) => {
        if (event !== 'complete') return;
        if (!quest || !quest.id) return;
        const unlocked = this.achievement.reportProgress('complete_quest', quest.id, 1);
        this._processAchievementUnlocks(unlocked);
        this._scheduleAutoSave(0);
      });
      this._unsubscribers.push(offQuest);
    }

    this.events.once('shutdown', () => {
      this.scale.off('resize', this._layoutHandler);
      this.questUI?.destroy();
      this.achievementUI?.destroy();
      this.npc?.closeDialog();
      this.npc?.despawnAll();
      for (const off of this._unsubscribers) {
        try { off(); } catch (e) { /* noop */ }
      }
      this._unsubscribers = [];
      if (this.toastUI && this.toastUI.destroy) this.toastUI.destroy();
      if (this.achievementPopup && this.achievementPopup.destroy) this.achievementPopup.destroy();
      if (this.touchButtons && this.touchButtons.destroy) this.touchButtons.destroy();
      if (this.actionButtons && this.actionButtons.destroy) this.actionButtons.destroy();
      if (this.virtualPad && this.virtualPad.destroy) this.virtualPad.destroy();
      if (this._goldTween) { this._goldTween.remove(); this._goldTween = null; }
      this._captureAndSave();
      this.saveSystem.setLastScene(SCENE_KEYS.FARM);
    });

    this.autoSaveTimer = null;
  }

  _scheduleAutoSave(delayMs = 1000) {
    if (this.autoSaveTimer) this.autoSaveTimer.remove();
    this.autoSaveTimer = this.time.delayedCall(delayMs, () => {
      this._captureAndSave();
    });
  }

  _savePosition(sceneKey) {
    if (!this.player) return;
    this.saveSystem.setPlayerPosition(sceneKey, this.player.x, this.player.y);
  }

  _captureAndSave() {
    if (!this.saveSystem) return;
    this.saveSystem.setInventorySnapshot(this.inventory.slots, this.inventory.activeSlot);
    this.saveSystem.setFarmingSnapshot(this.farming.plots);
    if (this.timeSystem) {
      this.saveSystem.setTimeSnapshot(this.timeSystem);
    }
    if (this.economy) {
      this.saveSystem.setEconomySnapshot(this.economy);
    }
    if (this.decoration) {
      this.saveSystem.setDecorationSnapshot(this.decoration);
    }
    if (this.npc) {
      this.saveSystem.setNpcSnapshot(this.npc);
    }
    if (this.quest) {
      this.saveSystem.setQuestSnapshot(this.quest);
    }
    if (this.achievement) {
      this.saveSystem.setAchievementSnapshot(this.achievement);
    }
    this._savePosition(SCENE_KEYS.FARM);
    this.saveSystem.saveGame();
  }

  _getSharedInventory() {
    if (!this.game.registry.has(SHARED_INVENTORY_KEY)) {
      const items = new ItemSystem();
      const inv = new InventorySystem(items);
      this.game.registry.set(SHARED_INVENTORY_KEY, inv);
    }
    return this.game.registry.get(SHARED_INVENTORY_KEY);
  }

  _seedStartingInventoryIfEmpty() {
    if (this.inventory.countItem('seed_carrot') > 0) return;
    for (const s of STARTING_SEEDS) {
      this.inventory.addItem(s.id, s.quantity);
    }
  }

  buildMap() {
    const { width, height } = FARM_WORLD;

    this.tileMap = [];
    this.groundLayer = this.add.container(0, 0);
    this.groundLayer.setDepth(0);

    for (let ty = 0; ty < height; ty++) {
      this.tileMap[ty] = [];
      for (let tx = 0; tx < width; tx++) {
        let tile = TILE_GRASS;
        const isWater = this.isInWaterArea(tx, ty);
        if (isWater) tile = TILE_WATER;
        this.tileMap[ty][tx] = tile;

        const px = tx * TILE_SIZE;
        const py = ty * TILE_SIZE;
        const spriteKey = this.getTileSpriteKey(tile);
        const img = this.add.image(px, py, spriteKey, groundFrame(tile, tx, ty)).setOrigin(0, 0);
        img.setDisplaySize(TILE_SIZE, TILE_SIZE);
        this.groundLayer.add(img);
      }
    }
  }

  getTileSpriteKey(tile) {
    if (tile === TILE_WATER) return 'tileset_water';
    if (tile === TILE_DIRT) return 'tileset_dirt';
    return 'tileset_grass';
  }

  isInWaterArea(tx, ty) {
    if (tx < 2 && ty > 14) return true;
    if (tx === 2 && ty > 15) return true;
    return false;
  }

  buildBoundaries() {
    const { width, height } = FARM_WORLD;
    this.solids = this.physics.add.staticGroup();

    for (let tx = 0; tx < width; tx++) {
      this.addSolidAt(tx, 0);
      this.addSolidAt(tx, height - 1);
    }
    for (let ty = 0; ty < height; ty++) {
      this.addSolidAt(0, ty);
      this.addSolidAt(width - 1, ty);
    }

    for (let ty = 0; ty < FARM_WORLD.height; ty++) {
      if (!this.tileMap[ty]) continue;
      for (let tx = 0; tx < FARM_WORLD.width; tx++) {
        if (COLLISION_TILES.has(this.tileMap[ty][tx])) {
          this.addSolidAt(tx, ty);
        }
      }
    }
  }

  addSolidAt(tx, ty) {
    const px = tx * TILE_SIZE + TILE_SIZE / 2;
    const py = ty * TILE_SIZE + TILE_SIZE / 2;
    staticRectangle(this, px, py, TILE_SIZE, TILE_SIZE, this.solids);
  }

  spawnPlayer() {
    const spawnX = FARM_WORLD.spawn.x * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = FARM_WORLD.spawn.y * TILE_SIZE + TILE_SIZE;
    this.player = new Player(this, spawnX, spawnY);
    this.player.setDepth(10);

    this.physics.add.collider(this.player, this.solids);
  }

  spawnNPCs() {
    if (!this.npc) return;
    this.npc.spawnAll();
  }

  setupCamera() {
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setDeadzone(40, 30);
    this.cameras.main.roundPixels = true;
    this._layoutHandler = () => layoutSceneUI(this);
    this.scale.on('resize', this._layoutHandler);
  }

  placeDecorations() {
    const houseX = 3 * TILE_SIZE;
    const houseY = 3 * TILE_SIZE;
    this.house = this.add.container(houseX, houseY).setDepth(5);
    for (const layer of HOUSE_LAYERS) {
      layer.rows.forEach((row, y) => row.forEach((frame, x) => {
        this.house.add(this.add.image(x * TILE_SIZE, (y + layer.y) * TILE_SIZE,
          'object_house', frame).setOrigin(0));
      }));
    }
    this.houseBody = staticRectangle(this,
      houseX + TILE_SIZE * 3.5, houseY + TILE_SIZE * 2.5,
      TILE_SIZE * 7, TILE_SIZE * 5, this.solids);

    const fence = this.add.graphics().setDepth(6);
    fence.lineStyle(1, 0x6b4f2a, 1);
    const area = FARMING.plotsArea;
    const fx = area.x0 * TILE_SIZE;
    const fy = area.y0 * TILE_SIZE;
    const fw = (area.x1 - area.x0 + 1) * TILE_SIZE;
    const fh = (area.y1 - area.y0 + 1) * TILE_SIZE;
    fence.strokeRect(fx - 2, fy - 2, fw + 4, fh + 4);

    const portalTx = 27;
    const portalTy = 5;
    const px = portalTx * TILE_SIZE;
    const py = portalTy * TILE_SIZE;
    const portal = this.add.rectangle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 0x4fc3f7, 0.85);
    portal.setStrokeStyle(2, 0x9bd0f0, 1);
    portal.setDepth(3);
    const portalLabel = this.add.text(px + TILE_SIZE / 2, py - 4, '→ Lake', {
      fontSize: '8px',
      color: '#0d2840',
      fontFamily: 'monospace',
      stroke: '#ffffff',
      strokeThickness: 2
    }).setOrigin(0.5, 1);
    portalLabel.setDepth(4);

    this.portalTrigger = staticRectangle(this, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);

    this.physics.add.overlap(this.player, this.portalTrigger, () => {
      if (isModalOpen(this) || this.actionCooldown > this.time.now) return;
      this.actionCooldown = this.time.now + 800;
      this._captureAndSave();
      this.saveSystem.setLastScene(SCENE_KEYS.LAKE);
      this.scene.start(SCENE_KEYS.LAKE);
    });
  }

  createHUD() {
    const pad = 8;
    this.hud = this.add.container(pad, pad).setDepth(100).setScrollFactor(0);
    this.hud.add(this.add.rectangle(-4, -4, 194, 38, 0x342e22, 0.75).setOrigin(0));

    this.toolText = this.add.text(0, 0, '', {
      fontSize: '11px',
      color: '#fff3d8',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.seedText = this.add.text(0, 14, '', {
      fontSize: '10px',
      color: '#9bd07a',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.helpText = this.add.text(0, 28, '', {
      fontSize: '9px',
      color: '#cccccc',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    });

    this.hud.add([this.toolText, this.seedText, this.helpText]);

    const cam = this.cameras.main;
    this.timeHud = this.add.text(cam.width - pad, pad, '', {
      fontSize: '10px',
      color: '#ffeebb',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'right'
    }).setOrigin(1, 0).setDepth(100).setScrollFactor(0);

    this.helpText.setVisible(false);
    this._refreshHUD();
    layoutSceneUI(this);
  }

  _refreshTimeHUD() {
    if (!this.timeHud || !this.timeSystem) return;
    this.timeHud.setText(`Day ${this.timeSystem.currentDay}  ${this.timeSystem.getFormattedTime()}`);
  }

  _refreshHUD() {
    const toolNames = { hoe: 'Hoe', watering_can: 'Water', hand: 'Harvest' };
    const toolLabel = toolNames[this.selectedTool] || 'Garden';
    const gold = this.economy ? this.economy.getGold() : 0;
    this._animateGold(gold);
    this.toolText.setText(`${this._goldDisplayed}g  |  ${toolLabel}`);
    const seeds = this.inventory.countItem(`seed_${this.selectedSeed}`);
    this.seedText.setText(this.buildMode
      ? `Build: ${this.items.getName(this.buildItem) || 'Remove'}`
      : `Seed: ${this.selectedSeed} (${seeds})`);
    if (this.touchButtons && typeof this.touchButtons.setBuildHighlight === 'function') {
      this.touchButtons.setBuildHighlight(!!this.buildMode);
    }
  }

  _animateGold(target) {
    if (this._goldDisplayed == null) {
      this._goldDisplayed = target;
      return;
    }
    if (this._goldDisplayed === target) return;
    const from = this._goldDisplayed;
    const to = target;
    if (this._goldTween) {
      this._goldTween.remove();
      this._goldTween = null;
    }
    this._goldTween = this.tweens.addCounter({
      from: from,
      to: to,
      duration: 400,
      ease: 'Sine.easeOut',
      onUpdate: (tween) => {
        this._goldDisplayed = Math.round(tween.getValue());
        if (this.toolText) {
          this.toolText.setText(`${this._goldDisplayed}g  |  ${{ hoe: 'Hoe', watering_can: 'Water', hand: 'Harvest' }[this.selectedTool] || 'Garden'}`);
        }
      },
      onComplete: () => { this._goldTween = null; }
    });
  }

  _onTouchButton(id) {
    if (this.npc?.isDialogActive()) return;
    const panel = { quest: this.questUI, achievement: this.achievementUI,
      inventory: this.inventoryUI, shop: this.shopUI }[id];
    if (isModalOpen(this) && !panel?.isVisible()) return;
    if (id === 'quest') {
      if (this.shopUI.isVisible() || this.inventoryUI.isVisible() || this.achievementUI.isVisible()) return;
      if (this.achievementUI && this.achievementUI.isVisible()) this.achievementUI.hide();
      this.questUI.toggle();
      this._refreshHUD();
      return;
    }
    if (id === 'achievement') {
      if (this.shopUI.isVisible() || this.inventoryUI.isVisible() || this.questUI.isVisible()) return;
      if (this.questUI && this.questUI.isVisible()) this.questUI.hide();
      this.achievementUI.toggle();
      this._refreshHUD();
      return;
    }
    if (id === 'inventory') {
      this.inventoryUI.toggle();
      this._refreshHUD();
      return;
    }
    if (id === 'build') {
      if (this.shopUI.isVisible() || this.inventoryUI.isVisible() || this.questUI.isVisible() || this.achievementUI.isVisible()) return;
      this.buildMode = !this.buildMode;
      this._setBuildItem(this.buildMode ? (this.buildItem || 'decoration_wood_fence') : null);
      if (this.buildCursor) this.buildCursor.setVisible(this.buildMode);
      this._refreshHUD();
      return;
    }
    if (id === 'shop') {
      this.shopUI.toggle();
      this._refreshHUD();
      return;
    }
    if (id === 'seed_cycle') {
      this._cycleSeed();
      this._refreshHUD();
      return;
    }
    if (id === 'build_cycle') {
      this._cycleBuildItem();
      this._refreshHUD();
      return;
    }
    if (this._handleFarmingAction(id)) { this._refreshHUD(); return; }
    this._refreshHUD();
  }

  _cycleSeed() {
    const list = ['carrot', 'tomato', 'strawberry'];
    const idx = list.indexOf(this.selectedSeed);
    this.selectedSeed = list[(idx + 1) % list.length];
  }

  _cycleBuildItem() {
    const list = [
      'decoration_wood_fence',
      'decoration_wooden_chair',
      'decoration_flower_pot',
      'decoration_lamp',
      'decoration_stone_path'
    ];
    const idx = list.indexOf(this.buildItem);
    const next = list[(idx + 1) % list.length];
    this._setBuildItem(next);
  }

  _handleFarmingAction(id) {
    if (!this.player || !this.farming) return false;
    if (this.shopUI.isVisible() || this.inventoryUI.isVisible() || this.questUI.isVisible() || this.achievementUI.isVisible()) return false;
    const playerTx = Math.floor(this.player.x / TILE_SIZE);
    const playerTy = Math.floor((this.player.y - 1) / TILE_SIZE);
    let tool = null;
    let action = null;
    if (id === 'hoe') { tool = 'hoe'; action = 'till'; }
    else if (id === 'water') { tool = 'watering_can'; action = 'water'; }
    else if (id === 'harvest') { tool = 'hand'; action = 'harvest'; }
    else if (id === 'interact') {
      if (this._tryInteractNPC()) return true;
      action = 'plant';
      tool = null;
    }
    if (!action) return false;
    if (tool) this.selectedTool = tool;
    this.farming.performAction(playerTx, playerTy, action, this.selectedSeed);
    this._scheduleAutoSave(action === 'harvest' ? 500 : 1500);
    if (action === 'harvest') {
      const plot = this.farming.getPlotAtTile(playerTx, playerTy);
      if (plot?.cropId) {
        const targetName = plot.cropId.replace('harvest_', '');
        const completed = this.quest.reportProgress('harvest', targetName, 1);
        this._notifyQuestComplete(completed);
        const unlocked = this.achievement.reportProgress('harvest', targetName, 1);
        this._processAchievementUnlocks(unlocked);
      }
    }
    return true;
  }

  setupInputs() {
    this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyWater = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyI = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyTab = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.keyP = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyUp = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keyDown = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.keyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.key4 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
    this.key5 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
    this.key6 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX);
    this.key7 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SEVEN);
    this.key8 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.EIGHT);
    this.key9 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NINE);
    this.keyLeft = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyRight = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.keyL = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.keyH = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);

    this.buildCursor = this.add.image(0, 0, 'ui_emoji_sheet', 0)
      .setOrigin(0.5, 1)
      .setDisplaySize(32, 32)
      .setAlpha(0.55)
      .setDepth(20)
      .setVisible(false);

    this.input.on('pointerdown', (pointer) => this._onPointerDown(pointer));
  }

  _onPointerDown(pointer) {
    if (isModalOpen(this) || !this.buildMode || !this.decoration) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const worldX = world.x;
    const worldY = world.y;
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
    if (this.buildItem === null) {
      const tile = this.decoration.snapToGrid(worldX, worldY);
      const r = this.decoration.remove(tile.x, tile.y);
      if (r.ok) {
        this._refreshHUD();
        this._scheduleAutoSave(0);
      }
      return;
    }
    const tile = this.decoration.snapToGrid(worldX, worldY);
    const r = this.decoration.place(this.buildItem, tile.x, tile.y);
    if (r.ok) {
      this._refreshHUD();
      this._scheduleAutoSave(0);
    }
  }

  update(time, delta) {
    const enabled = !isModalOpen(this);
    this.virtualPad?.setEnabled(enabled);
    this.actionButtons?.setEnabled(enabled);
    if (this.player) this.player.update(time, delta, enabled);
    if (this.farming) this.farming.update(time, delta);
    if (this.timeSystem) {
      this.timeSystem.update(delta);
      this._refreshTimeHUD();
    }
    if (this.inventoryUI && this.inventoryUI.isVisible()) {
      this.inventoryUI.refresh();
    }
    this._updateBuildCursor();
    this._handleFarmingInput(time);
  }

  _updateBuildCursor() {
    if (!this.buildCursor) return;
    if (!this.buildMode) {
      this.buildCursor.setVisible(false);
      return;
    }
    if (this.buildItem === null) {
      this.buildCursor.setVisible(false);
      return;
    }
    this.buildCursor.setVisible(true);
    const snapped = this.decoration
      ? this.decoration.snapToGrid(this.player.x, this.player.y)
      : {
          x: Math.floor(this.player.x / 16) * 16,
          y: Math.floor(this.player.y / 16) * 16
        };
    this.buildCursor.setPosition(snapped.x + 16, snapped.y + 16);
  }

  _handleFarmingInput(time) {
    const iDown = Phaser.Input.Keyboard.JustDown(this.keyI);
    const tabDown = Phaser.Input.Keyboard.JustDown(this.keyTab);
    const pDown = Phaser.Input.Keyboard.JustDown(this.keyP);
    const leftDown = Phaser.Input.Keyboard.JustDown(this.keyLeft);
    const rightDown = Phaser.Input.Keyboard.JustDown(this.keyRight);
    const escDown = Phaser.Input.Keyboard.JustDown(this.keyEsc);
    const upDown = Phaser.Input.Keyboard.JustDown(this.keyUp);
    const downDown = Phaser.Input.Keyboard.JustDown(this.keyDown);
    const enterDown = Phaser.Input.Keyboard.JustDown(this.keyEnter);
    const bDown = Phaser.Input.Keyboard.JustDown(this.keyB);
    const sDown = Phaser.Input.Keyboard.JustDown(this.keyS);
    const rDown = Phaser.Input.Keyboard.JustDown(this.keyR);
    const lDown = Phaser.Input.Keyboard.JustDown(this.keyL);
    const hDown = Phaser.Input.Keyboard.JustDown(this.keyH);
    const k1 = Phaser.Input.Keyboard.JustDown(this.key1);
    const k2 = Phaser.Input.Keyboard.JustDown(this.key2);
    const k3 = Phaser.Input.Keyboard.JustDown(this.key3);
    const k4 = Phaser.Input.Keyboard.JustDown(this.key4);
    const k5 = Phaser.Input.Keyboard.JustDown(this.key5);
    const k6 = Phaser.Input.Keyboard.JustDown(this.key6);
    const k7 = Phaser.Input.Keyboard.JustDown(this.key7);
    const k8 = Phaser.Input.Keyboard.JustDown(this.key8);
    const k9 = Phaser.Input.Keyboard.JustDown(this.key9);

    if (escDown) {
      if (this.npc && this.npc.isDialogActive()) {
        this.npc.closeDialog();
        this._hideDialog();
        this._refreshHUD();
        return;
      }
      if (this.buildMode) {
        this.buildMode = false;
        this.buildItem = null;
        if (this.buildCursor) this.buildCursor.setVisible(false);
        this._refreshHUD();
        return;
      }
      if (this.questUI.isVisible()) { this.questUI.hide(); this._refreshHUD(); return; }
      if (this.achievementUI.isVisible()) { this.achievementUI.hide(); this._refreshHUD(); return; }
      if (this.shopUI.isVisible()) this.shopUI.hide();
      if (this.inventoryUI.isVisible()) this.inventoryUI.hide();
      this._refreshHUD();
      return;
    }

    if (this.npc && this.npc.isDialogActive()) {
      if (enterDown) {
        const r = this.npc.advanceDialog();
        if (r.closed) {
          this._hideDialog();
        } else {
          this._showDialog();
        }
        this._refreshHUD();
        return;
      }
      for (let i = 0; i < 9; i++) {
        const keyVar = [k1, k2, k3, k4, k5, k6, k7, k8, k9][i];
        if (keyVar && this.npc.currentDialog().choices.length > i) {
          this.npc.chooseDialog(i);
          this._showDialog();
          this._refreshHUD();
          return;
        }
      }
      return;
    }

    if (lDown) {
      if (this.shopUI.isVisible() || this.inventoryUI.isVisible()) return;
      if (this.achievementUI.isVisible()) this.achievementUI.hide();
      this.questUI.toggle();
      this._refreshHUD();
      return;
    }

    if (hDown) {
      if (this.shopUI.isVisible() || this.inventoryUI.isVisible()) return;
      if (this.questUI.isVisible()) this.questUI.hide();
      this.achievementUI.toggle();
      this._refreshHUD();
      return;
    }

    if (pDown) {
      this.shopUI.toggle();
      this._refreshHUD();
      return;
    }

    if (this.shopUI.isVisible()) {
      if (bDown) { this.shopUI.setMode('buy'); }
      else if (sDown) { this.shopUI.setMode('sell'); }
      if (upDown) this.shopUI.moveSelection(-1);
      else if (downDown) this.shopUI.moveSelection(1);
      else if (enterDown) {
        const r = this.shopUI.confirmAction();
        if (r && !r.ok && r.reason) {
          this._showShopMessage(this._shopMessageFor(r.reason));
        }
      }
      this._refreshHUD();
      return;
    }

    if (this.buildMode) {
      if (rDown) {
        this._setBuildItem(null, true);
        this._refreshHUD();
        return;
      }
      if (k1) { this._setBuildItem('decoration_wood_fence'); return; }
      if (k2) { this._setBuildItem('decoration_wooden_chair'); return; }
      if (k3) { this._setBuildItem('decoration_flower_pot'); return; }
      if (k4) { this._setBuildItem('decoration_lamp'); return; }
      if (k5) { this._setBuildItem('decoration_stone_path'); return; }
      if (bDown) {
        this.buildMode = false;
        this.buildItem = null;
        if (this.buildCursor) this.buildCursor.setVisible(false);
        this._refreshHUD();
        return;
      }
      return;
    }

    if (bDown && !this.shopUI.isVisible() && !this.inventoryUI.isVisible() && !this.questUI.isVisible() && !this.achievementUI.isVisible()) {
      this.buildMode = true;
      this._setBuildItem(this.buildItem || 'decoration_wood_fence');
      this._refreshHUD();
      return;
    }

    if (this.questUI.isVisible()) {
      if (upDown) this.questUI.moveSelection(-1);
      else if (downDown) this.questUI.moveSelection(1);
      this._refreshHUD();
      return;
    }

    if (this.achievementUI.isVisible()) {
      if (upDown) this.achievementUI.moveSelection(-1);
      else if (downDown) this.achievementUI.moveSelection(1);
      this._refreshHUD();
      return;
    }

    if (iDown || tabDown) {
      this.inventoryUI.toggle();
      this._refreshHUD();
      return;
    }

    if (this.inventoryUI.isVisible()) {
      if (leftDown) {
        this.inventory.cycleActiveSlot(-1);
        this.inventoryUI.refresh();
        this._refreshHUD();
      } else if (rightDown) {
        this.inventory.cycleActiveSlot(1);
        this.inventoryUI.refresh();
        this._refreshHUD();
      }
      return;
    }

    if (this.actionCooldown > time) return;

    const eDown = Phaser.Input.Keyboard.JustDown(this.keyE);
    const qDown = Phaser.Input.Keyboard.JustDown(this.keyQ);
    const wDown = Phaser.Input.Keyboard.JustDown(this.keyWater);
    const spaceDown = Phaser.Input.Keyboard.JustDown(this.keySpace);

    if (k1) { this.selectedSeed = 'carrot'; this._refreshHUD(); }
    if (k2) { this.selectedSeed = 'tomato'; this._refreshHUD(); }
    if (k3) { this.selectedSeed = 'strawberry'; this._refreshHUD(); }
    if (k6) { this._refreshHUD(); }
    if (k7) { this._refreshHUD(); }
    if (k8) { this._refreshHUD(); }
    if (k9) { this._refreshHUD(); }

    const playerTx = Math.floor(this.player.x / TILE_SIZE);
    const playerTy = Math.floor((this.player.y - 1) / TILE_SIZE);

    if (eDown) {
      if (this._tryInteractNPC()) {
        this.actionCooldown = time + 250;
        return;
      }
      this.farming.performAction(playerTx, playerTy, 'plant', this.selectedSeed);
      this.actionCooldown = time + 250;
      return;
    }

    if (qDown) {
      this.selectedTool = 'hoe';
      this._refreshHUD();
      this.farming.performAction(playerTx, playerTy, 'till');
      this.actionCooldown = time + 250;
    } else if (wDown) {
      this.selectedTool = 'watering_can';
      this._refreshHUD();
      this.farming.performAction(playerTx, playerTy, 'water');
      this.actionCooldown = time + 250;
    } else if (spaceDown) {
      this.selectedTool = 'hand';
      this._refreshHUD();
      this.farming.performAction(playerTx, playerTy, 'harvest');
      this.actionCooldown = time + 250;
    }
  }

  _tryInteractNPC() {
    if (!this.npc) return false;
    if (this.npc.isDialogActive()) return false;
    const target = this.npc.getAt(this.player.x, this.player.y, 1.5);
    if (!target) return false;
    const r = this.npc.openDialog(target.id);
    if (r.ok) {
      const def = this.npc.npcs[target.id];
      this._showDialog();
      this._refreshHUD();
    } else if (r.reason === 'not_available') {
      this._showShopMessage(`${target.name} is not available right now.`);
    }
    return r.ok;
  }

  _setBuildItem(itemId, removeMode = false) {
    this.buildItem = itemId;
    if (this.buildCursor) {
      if (removeMode) {
        this.buildCursor.setVisible(false);
      } else if (itemId && this.items) {
        const icon = this.items.getIcon(itemId);
        if (icon) {
          this.buildCursor.setTexture(icon.sheet, icon.frame);
          this.buildCursor.setDisplaySize(32, 32);
          this.buildCursor.setVisible(true);
        }
      }
    }
    this._refreshHUD();
  }

  _shopMessageFor(reason) {
    const map = {
      insufficient_funds: 'Not enough gold!',
      insufficient_stock: 'You don\'t have any to sell.',
      no_price: 'This item has no price.',
      not_sellable: 'Cannot be sold.',
      not_purchasable: 'Cannot be purchased.',
      inventory_full: 'Inventory full!',
      invalid_input: 'Invalid action.',
      invalid_quantity: 'Invalid quantity.',
      no_item_system: 'Shop unavailable.',
      unknown_item: 'Unknown item.'
    };
    return map[reason] || `Action failed (${reason})`;
  }

  _showShopMessage(text) {
    if (this._shopMsg && this._shopMsg.destroy) this._shopMsg.destroy();
    const cam = this.cameras.main;
    this._shopMsg = this.add.text(cam.width / 2, cam.height - 30, text, {
      fontSize: '10px',
      color: '#ff8866',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5).setDepth(150).setScrollFactor(0);
    this.time.delayedCall(1500, () => {
      if (this._shopMsg && this._shopMsg.destroy) this._shopMsg.destroy();
      this._shopMsg = null;
    });
  }

  _showDialog() {
    showDialogPanel(this);
  }

  _hideDialog() {
    if (this._dialogBg && this._dialogBg.destroy) this._dialogBg.destroy();
    if (this._dialogName && this._dialogName.destroy) this._dialogName.destroy();
    if (this._dialogText && this._dialogText.destroy) this._dialogText.destroy();
    if (this._dialogHint && this._dialogHint.destroy) this._dialogHint.destroy();
    if (this._dialogChoices) {
      for (const ch of this._dialogChoices) {
        if (ch && ch.destroy) ch.destroy();
      }
    }
    this._dialogBg = null;
    this._dialogName = null;
    this._dialogText = null;
    this._dialogHint = null;
    this._dialogChoices = null;
  }
}