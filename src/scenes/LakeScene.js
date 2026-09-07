import { showDialogPanel } from '../ui/dialogLayout.js';
import {
  SCENE_KEYS,
  COLORS,
  LAKE_WORLD,
  SHARED_INVENTORY_KEY,
  SHARED_ACHIEVEMENT_KEY,
  STARTING_SEEDS,
  TILE_SIZE,
  TILE_GRASS,
  TILE_WATER
} from '../config/constants.js';
import { Player } from '../entities/Player.js';
import { groundFrame, HOUSE_LAYERS } from '../config/assetFrames.js';
import { staticRectangle, restoreWalkablePosition } from '../utils/worldPhysics.js';
import { layoutSceneUI, isModalOpen } from '../ui/sceneLayout.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { ItemSystem } from '../systems/ItemSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { TimeSystem } from '../systems/TimeSystem.js';
import { EconomySystem } from '../systems/EconomySystem.js';
import { NPCSystem } from '../systems/NPCSystem.js';
import { QuestSystem } from '../systems/QuestSystem.js';
import { AchievementSystem } from '../systems/AchievementSystem.js';
import { InventoryUI } from '../ui/InventoryUI.js';
import { ToastUI } from '../ui/ToastUI.js';
import { QuestUI } from '../ui/QuestUI.js';
import { AchievementUI } from '../ui/AchievementUI.js';
import { AchievementPopup } from '../ui/AchievementPopup.js';
import { TouchButtons, TOUCH_BUTTON_DEFS } from '../ui/TouchButtons.js';
import { ActionButtons, LAKE_ACTION_DEFS } from '../ui/ActionButtons.js';
import { VirtualPad } from '../ui/VirtualPad.js';
import { FishingSystem, FISH_STATE } from '../systems/FishingSystem.js';
import fishData from '../data/fish.json' with { type: 'json' };
import questData from '../data/quests.json' with { type: 'json' };

export class LakeScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.LAKE });
  }

  init() {
    this.selectedSeed = 'carrot';
    this.actionCooldown = 0;
  }

create() {
      const w = LAKE_WORLD.width * TILE_SIZE;
      const h = LAKE_WORLD.height * TILE_SIZE;
      this.cameras.main.setBackgroundColor(COLORS.background);
      this.cameras.main.setBounds(0, 0, w, h);
      this.physics.world.setBounds(0, 0, w, h);

      this._setupSharedSystems();
      this.buildMap();
      this.fishing.tileMap = this.tileMap;
      this.buildBoundaries();
      this.spawnPlayer();
      this.spawnNPCs();
      this.setupCamera();
      this.placePortals();
      this.createHUD();
      this.setupInputs();

      this._restorePlayerPosition();
      this._autoStartQuests();
      this._setupAutoSave();
    }

    spawnNPCs() {
      if (this.npc) this.npc.spawnAll();
    }

    _autoStartQuests() {
      if (!this.quest) return;
      for (const def of Object.values(questData)) {
        if (!def || !def.id || !def.autoStart) continue;
        if (this.quest.isActive(def.id) || this.quest.isCompleted(def.id)) continue;
        this.quest.startQuest(def.id);
      }
    }

    _restorePlayerPosition() {
      if (!this.saveSystem || !this.player) return;
      const pos = this.saveSystem.restorePlayerPosition(SCENE_KEYS.LAKE);
      restoreWalkablePosition(this, pos, {
        x: LAKE_WORLD.spawn.x * TILE_SIZE + TILE_SIZE / 2,
        y: LAKE_WORLD.spawn.y * TILE_SIZE + TILE_SIZE
      });
    }

  _setupSharedSystems() {
    if (!this.game.registry.has('__sproutValleySave')) {
      this.game.registry.set('__sproutValleySave', new SaveSystem());
    }
    this.saveSystem = this.game.registry.get('__sproutValleySave');

    if (!this.game.registry.has('__sproutValleyTime')) {
      this.game.registry.set('__sproutValleyTime', new TimeSystem());
    }
    this.timeSystem = this.game.registry.get('__sproutValleyTime');

    if (!this.game.registry.has('__sproutValleyEconomy')) {
      this.game.registry.set('__sproutValleyEconomy', new EconomySystem());
    }
    this.economy = this.game.registry.get('__sproutValleyEconomy');
    if (this.items) this.economy.setItemSystem(this.items);

    if (!this.game.registry.has('__sproutValleyNpc')) {
      this.game.registry.set('__sproutValleyNpc', new NPCSystem(this, this.timeSystem));
    }
    this.npc = this.game.registry.get('__sproutValleyNpc');
    this.npc.scene = this;
    if (this.timeSystem) this.npc.setTimeSystem(this.timeSystem);

    if (!this.game.registry.has('__sproutValleyQuest')) {
      this.game.registry.set('__sproutValleyQuest', new QuestSystem());
    }
    this.quest = this.game.registry.get('__sproutValleyQuest');
    this.npc.setQuestHandlers({
      onStart: (questId) => this.quest.startQuest(questId),
      onComplete: (questId) => this.quest.applyReward(questId, this.economy, this.inventory)
    });

    if (!this.game.registry.has(SHARED_ACHIEVEMENT_KEY)) {
      this.game.registry.set(SHARED_ACHIEVEMENT_KEY, new AchievementSystem());
    }
    this.achievement = this.game.registry.get(SHARED_ACHIEVEMENT_KEY);

    if (!this.game.registry.has(SHARED_INVENTORY_KEY)) {
      const items = new ItemSystem();
      const inv = new InventorySystem(items);
      for (const s of STARTING_SEEDS) {
        inv.addItem(s.id, s.quantity);
      }
      this.game.registry.set(SHARED_INVENTORY_KEY, inv);
    }
    this.inventory = this.game.registry.get(SHARED_INVENTORY_KEY);
    this.items = this.inventory.itemSystem || new ItemSystem();
    this.inventory.itemSystem = this.items;
    this.saveSystem.loadGame();
    this.saveSystem.restoreInventoryTo(this.inventory);
    this.saveSystem.restoreTimeTo(this.timeSystem);
    if (this.economy) this.saveSystem.restoreEconomyTo(this.economy);
    if (this.npc) this.saveSystem.restoreNpcsTo(this.npc);
    if (this.quest) this.saveSystem.restoreQuestsTo(this.quest);
    if (this.achievement) this.saveSystem.restoreAchievementsTo(this.achievement);

    this.inventoryUI = new InventoryUI(this, this.inventory, this.items);
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
      defs: TOUCH_BUTTON_DEFS.filter(def => def.id !== 'build'),
      top: true,
      onPress: (id) => this._onTouchButton(id)
    });
    this.actionButtons = new ActionButtons(this, {
      defs: LAKE_ACTION_DEFS,
      onPress: (id) => this._onTouchButton(id)
    });
    this.fishing = new FishingSystem(this, this.tileMap, this.inventory, fishData);
    this.fishing.setTimeSystem(this.timeSystem);

    this.fishing.onCatch = (fish) => {
      const completed = this.quest.reportProgress('catch_fish', fish.id, 1);
      this._notifyQuestComplete(completed);
      const unlocked = this.achievement.reportProgress('catch_fish', fish.id, 1);
      this._processAchievementUnlocks(unlocked);
      this._scheduleAutoSave(500);
    };
  }

  _scheduleAutoSave(delayMs = 1000) {
    if (this.autoSaveTimer) this.autoSaveTimer.remove();
    this.autoSaveTimer = this.time.delayedCall(delayMs, () => {
      this._captureAndSave();
    });
  }

  _setupAutoSave() {
    this.events.once('shutdown', () => {
      this.scale.off('resize', this._layoutHandler);
      this.questUI?.destroy();
      this.achievementUI?.destroy();
      this.npc?.closeDialog();
      this.npc?.despawnAll();
      if (this.toastUI && this.toastUI.destroy) this.toastUI.destroy();
      if (this.achievementPopup && this.achievementPopup.destroy) this.achievementPopup.destroy();
      if (this.touchButtons && this.touchButtons.destroy) this.touchButtons.destroy();
      if (this.actionButtons && this.actionButtons.destroy) this.actionButtons.destroy();
      if (this.virtualPad && this.virtualPad.destroy) this.virtualPad.destroy();
      this._captureAndSave();
      this.saveSystem.setLastScene(SCENE_KEYS.LAKE);
    });
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

  _captureAndSave() {
    if (!this.saveSystem || !this.player || !this.inventory) return;
    this.saveSystem.setInventorySnapshot(this.inventory.slots, this.inventory.activeSlot);
    this.saveSystem.setPlayerPosition(SCENE_KEYS.LAKE, this.player.x, this.player.y);
    if (this.timeSystem) this.saveSystem.setTimeSnapshot(this.timeSystem);
    if (this.economy) this.saveSystem.setEconomySnapshot(this.economy);
    if (this.npc) this.saveSystem.setNpcSnapshot(this.npc);
    if (this.quest) this.saveSystem.setQuestSnapshot(this.quest);
    if (this.achievement) this.saveSystem.setAchievementSnapshot(this.achievement);
    this.saveSystem.saveGame();
  }

  buildMap() {
    const { width, height } = LAKE_WORLD;
    this.tileMap = [];
    this.groundLayer = this.add.container(0, 0).setDepth(0);

    const water = LAKE_WORLD.waterArea;
    for (let ty = 0; ty < height; ty++) {
      this.tileMap[ty] = [];
      for (let tx = 0; tx < width; tx++) {
        let tile = TILE_GRASS;
        if (tx >= water.x0 && tx <= water.x1 && ty >= water.y0 && ty <= water.y1) {
          tile = TILE_WATER;
        }
        this.tileMap[ty][tx] = tile;
        const key = tile === TILE_WATER ? 'tileset_water' : 'tileset_grass';
        const img = this.add.image(tx * TILE_SIZE, ty * TILE_SIZE, key, groundFrame(tile, tx, ty)).setOrigin(0, 0);
        img.setDisplaySize(TILE_SIZE, TILE_SIZE);
        this.groundLayer.add(img);
      }
    }
  }

  buildBoundaries() {
    const { width, height } = LAKE_WORLD;
    this.solids = this.physics.add.staticGroup();
    for (let tx = 0; tx < width; tx++) {
      this.addSolidAt(tx, 0);
      this.addSolidAt(tx, height - 1);
    }
    for (let ty = 0; ty < height; ty++) {
      this.addSolidAt(0, ty);
      this.addSolidAt(width - 1, ty);
    }
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        if (this.tileMap[ty][tx] === TILE_WATER) {
          this.addSolidAt(tx, ty);
        }
      }
    }
  }

  addSolidAt(tx, ty) {
    staticRectangle(this, tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, this.solids);
  }

  spawnPlayer() {
    const px = LAKE_WORLD.spawn.x * TILE_SIZE + TILE_SIZE / 2;
    const py = LAKE_WORLD.spawn.y * TILE_SIZE + TILE_SIZE;
    this.player = new Player(this, px, py);
    this.player.setDepth(10);
    this.physics.add.collider(this.player, this.solids);

    this.rodSprite = this.add.image(0, 0, 'fishing_rod').setVisible(false).setDepth(11);
  }

  setupCamera() {
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setDeadzone(40, 30);
    this.cameras.main.roundPixels = true;
    this._layoutHandler = () => layoutSceneUI(this);
    this.scale.on('resize', this._layoutHandler);
  }

  placePortals() {
    const t = LAKE_WORLD.portalTile;
    const px = t.tx * TILE_SIZE;
    const py = t.ty * TILE_SIZE;
    const portal = this.add.rectangle(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 0xffd54a, 0.85);
    portal.setStrokeStyle(2, 0xffe066, 1);
    portal.setDepth(3);
    this.portal = { tx: t.tx, ty: t.ty, target: t.target };

    const label = this.add.text(px + TILE_SIZE / 2, py - 4, '→ Farm', {
      fontSize: '8px',
      color: '#3a2a10',
      fontFamily: 'monospace',
      stroke: '#ffffff',
      strokeThickness: 2
    }).setOrigin(0.5, 1);
    label.setDepth(4);

    this.portalTrigger = staticRectangle(this, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);

    this.physics.add.overlap(this.player, this.portalTrigger, () => {
      if (isModalOpen(this) || this.actionCooldown > this.time.now) return;
      this.actionCooldown = this.time.now + 800;
      this._captureAndSave();
      this.saveSystem.setLastScene(SCENE_KEYS.FARM);
      this.scene.start(this.portal.target);
    });
  }

  createHUD() {
    const pad = 8;
    this.hud = this.add.container(pad, pad).setDepth(100).setScrollFactor(0);
    this.hud.add(this.add.rectangle(-4, -4, 194, 38, 0x342e22, 0.75).setOrigin(0));
    this.toolText = this.add.text(0, 0, '', {
      fontSize: '10px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2
    });
    this.helpText = this.add.text(0, 14, '', {
      fontSize: '9px', color: '#cccccc', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2
    });
    this.hud.add([this.toolText, this.helpText]);

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
    const state = this.fishing.getState();
    let stateLabel = 'free';
    if (state === FISH_STATE.CASTING) stateLabel = 'Casting...';
    else if (state === FISH_STATE.WAITING) stateLabel = 'Waiting...';
    else if (state === FISH_STATE.BITE) stateLabel = '! BITE !';
    else if (state === FISH_STATE.REELING) stateLabel = 'Reeling...';
    this.toolText.setText(`Fishing: ${stateLabel}`);
    this.helpText.setText('');
  }

  setupInputs() {
    this.keyUp = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keyDown = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keyF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyI = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyTab = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.keyLeft = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyRight = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.keyL = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.keyH = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
  }

  update(time, delta) {
    const enabled = !isModalOpen(this);
    this.virtualPad?.setEnabled(enabled);
    this.actionButtons?.setEnabled(enabled);
    if (this.player) this.player.update(time, delta, enabled);
    if (this.fishing) this.fishing.update(time, delta);
    if (this.timeSystem) {
      this.timeSystem.update(delta);
      this._refreshTimeHUD();
    }
    if (this.inventoryUI && this.inventoryUI.isVisible()) {
      this.inventoryUI.refresh();
    }
    this._handleFishingInput(time);
    this._updateRodVisual();
    this._refreshHUD();
  }

  _updateRodVisual() {
    if (!this.rodSprite) return;
    if (this.fishing.getState() === FISH_STATE.IDLE) {
      this.rodSprite.setVisible(false);
      return;
    }
    this.rodSprite.setVisible(true);
    this.rodSprite.setPosition(
      this.player.x + 8,
      this.player.y - 8
    );
    this.rodSprite.setDisplaySize(16, 16);
  }

  _handleFishingInput(time) {
    const iDown = Phaser.Input.Keyboard.JustDown(this.keyI);
    const tabDown = Phaser.Input.Keyboard.JustDown(this.keyTab);
    const escDown = Phaser.Input.Keyboard.JustDown(this.keyEsc);
    const enterDown = Phaser.Input.Keyboard.JustDown(this.keyEnter);
    const eDown = Phaser.Input.Keyboard.JustDown(this.keyE);
    const upDown = Phaser.Input.Keyboard.JustDown(this.keyUp);
    const downDown = Phaser.Input.Keyboard.JustDown(this.keyDown);
    const lDown = Phaser.Input.Keyboard.JustDown(this.keyL);
    const hDown = Phaser.Input.Keyboard.JustDown(this.keyH);
    const k1 = Phaser.Input.Keyboard.JustDown(this.key1);
    const k2 = Phaser.Input.Keyboard.JustDown(this.key2);
    const k3 = Phaser.Input.Keyboard.JustDown(this.key3);

    if (escDown) {
      if (this.inventoryUI.isVisible()) { this.inventoryUI.hide(); return; }
      if (this.npc && this.npc.isDialogActive()) {
        this.npc.closeDialog();
        this._hideDialog();
        this._refreshHUD();
        return;
      }
      if (this.questUI.isVisible()) { this.questUI.hide(); this._refreshHUD(); return; }
      if (this.achievementUI.isVisible()) { this.achievementUI.hide(); this._refreshHUD(); return; }
    }

    if (this.npc && this.npc.isDialogActive()) {
      if (enterDown) {
        const r = this.npc.advanceDialog();
        if (r.closed) this._hideDialog();
        else this._showDialog();
        this._refreshHUD();
        return;
      }
      if (k1 && this.npc.currentDialog().choices.length > 0) { this.npc.chooseDialog(0); this._showDialog(); this._refreshHUD(); return; }
      if (k2 && this.npc.currentDialog().choices.length > 1) { this.npc.chooseDialog(1); this._showDialog(); this._refreshHUD(); return; }
      if (k3 && this.npc.currentDialog().choices.length > 2) { this.npc.chooseDialog(2); this._showDialog(); this._refreshHUD(); return; }
      return;
    }

    if (lDown) {
      if (this.inventoryUI.isVisible()) return;
      if (this.achievementUI.isVisible()) this.achievementUI.hide();
      this.questUI.toggle();
      this._refreshHUD();
      return;
    }

    if (hDown) {
      if (this.inventoryUI.isVisible()) return;
      if (this.questUI.isVisible()) this.questUI.hide();
      this.achievementUI.toggle();
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
      const leftDown = Phaser.Input.Keyboard.JustDown(this.keyLeft);
      const rightDown = Phaser.Input.Keyboard.JustDown(this.keyRight);
      if (leftDown) { this.inventory.cycleActiveSlot(-1); this.inventoryUI.refresh(); }
      if (rightDown) { this.inventory.cycleActiveSlot(1); this.inventoryUI.refresh(); }
      return;
    }

    if (this.actionCooldown > time) return;

    const fDown = Phaser.Input.Keyboard.JustDown(this.keyF);
    const spaceDown = Phaser.Input.Keyboard.JustDown(this.keySpace);

    if (eDown) {
      if (this._tryInteractNPC()) {
        this.actionCooldown = time + 250;
        this._refreshHUD();
      }
      return;
    }

    if (fDown) {
      this.fishing.startFishing(this.player);
      this.actionCooldown = time + 200;
      this._refreshHUD();
    } else if (spaceDown) {
      const r = this.fishing.tryCatch(this.player);
      this.actionCooldown = time + 200;
      this._refreshHUD();
      if (r.ok && r.fish) {
        this._showResultBanner(r.fish);
      }
    }
  }

  _tryInteractNPC() {
    if (!this.npc) return false;
    if (this.npc.isDialogActive()) return false;
    const target = this.npc.getAt(this.player.x, this.player.y, 1.5);
    if (!target) return false;
    const r = this.npc.openDialog(target.id);
    if (r.ok) {
      this._showDialog();
      this._refreshHUD();
    } else if (r.reason === 'not_available') {
      this._showShopMessage(`${target.name} is not available right now.`);
    }
    return r.ok;
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

  _showShopMessage(text) {
    if (this._shopMsg && this._shopMsg.destroy) this._shopMsg.destroy();
    const cam = this.cameras.main;
    this._shopMsg = this.add.text(cam.width / 2, cam.height - 80, text, {
      fontSize: '10px', color: '#ff8866', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(150).setScrollFactor(0);
    this.time.delayedCall(1500, () => {
      if (this._shopMsg && this._shopMsg.destroy) this._shopMsg.destroy();
      this._shopMsg = null;
    });
  }

  _onTouchButton(id) {
    if (this.npc?.isDialogActive()) return;
    const panel = { quest: this.questUI, achievement: this.achievementUI, inventory: this.inventoryUI }[id];
    if (isModalOpen(this) && !panel?.isVisible()) return;
    if (id === 'quest') {
      if (this.inventoryUI.isVisible() || this.achievementUI.isVisible()) return;
      if (this.achievementUI && this.achievementUI.isVisible()) this.achievementUI.hide();
      this.questUI.toggle();
      this._refreshHUD();
      return;
    }
    if (id === 'achievement') {
      if (this.inventoryUI.isVisible() || this.questUI.isVisible()) return;
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
      return;
    }
    if (id === 'cast') {
      if (!this.fishing || !this.player) return;
      if (this.inventoryUI.isVisible() || this.questUI.isVisible() || this.achievementUI.isVisible()) return;
      const r = this.fishing.startFishing(this.player);
      this._refreshHUD();
      return;
    }
    if (id === 'catch') {
      if (!this.fishing || !this.player) return;
      if (this.inventoryUI.isVisible() || this.questUI.isVisible() || this.achievementUI.isVisible()) return;
      const r = this.fishing.tryCatch(this.player);
      this._refreshHUD();
      if (r && r.ok && r.fish) {
        this._showResultBanner(r.fish);
      }
      return;
    }
    if (id === 'interact') {
      if (!this.player) return;
      if (this.inventoryUI.isVisible() || this.questUI.isVisible() || this.achievementUI.isVisible()) return;
      this._tryInteractNPC();
      this._refreshHUD();
      return;
    }
  }

  _showResultBanner(fish) {
    const cam = this.cameras.main;
    const banner = this.add.container(cam.width / 2, 60).setDepth(150).setScrollFactor(0);
    const bg = this.add.rectangle(0, 0, 220, 50, 0x000000, 0.7);
    bg.setStrokeStyle(2, 0xffd700, 1);
    banner.add(bg);
    const title = this.add.text(0, -12, 'YOU CAUGHT', {
      fontSize: '10px', color: '#ffd700', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5);
    const name = this.add.text(0, 4, fish.name, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5);
    const rarity = this.add.text(0, 18, `[${fish.rarity || 'common'}]`, {
      fontSize: '8px', color: '#cccccc', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5);
    banner.add([title, name, rarity]);
    this.tweens.add({
      targets: banner,
      alpha: 0,
      y: 30,
      duration: 1500,
      delay: 600,
      onComplete: () => banner.destroy()
    });
  }
}