import { SCENE_KEYS } from '../config/constants.js';
import { PLAYER_SPEED, PLAYER_BODY, SHEETS, playerAnimationDefinitions } from '../config/assetFrames.js';
import { normalizeDirection, movementVelocity, facingDirection } from '../utils/playerMovement.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, texture = 'player') {
    super(scene, x, y, texture, 12);
    this.direction = 'down';
    this.isMoving = false;
    this._touchDir = { x: 0, y: 0 };
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDisplaySize(Player.FRAME_SIZE * 2, Player.FRAME_SIZE * 2);
    this.setCollideWorldBounds(true);
    this.body.setSize(PLAYER_BODY.width, PLAYER_BODY.height);
    this.body.setOffset(PLAYER_BODY.offsetX, PLAYER_BODY.offsetY);
    this.body.setAllowGravity(false);

    for (const definition of playerAnimationDefinitions(texture)) this.anims.create(definition);
    this.play('player_idle_down');
    const keyboard = scene.input.keyboard;
    this.cursors = keyboard.createCursorKeys();
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this._resetInput = () => {
      this.setTouchDirection(null);
      this.setVelocity(0, 0);
      keyboard.resetKeys();
    };
    scene.game.events.on('blur', this._resetInput);
    scene.events.on('pause', this._resetInput);
    scene.events.once('shutdown', () => {
      scene.game.events.off('blur', this._resetInput);
      scene.events.off('pause', this._resetInput);
    });
  }

  update(time, delta, enabled = true) {
    if (!this.body) return;
    const keys = {
      left: this.cursors.left.isDown || this.keyA.isDown,
      right: this.cursors.right.isDown || this.keyD.isDown,
      up: this.cursors.up.isDown || this.keyW.isDown,
      down: this.cursors.down.isDown || this.keyS.isDown
    };
    const velocity = movementVelocity(keys, this._touchDir, PLAYER_SPEED, enabled);
    this.body.setVelocity(velocity.x, velocity.y);
    this.isMoving = velocity.x !== 0 || velocity.y !== 0;
    this.direction = facingDirection(velocity, this.direction);
    this.play(`player_${this.isMoving ? 'walk' : 'idle'}_${this.direction}`, true);
  }

  setTouchDirection(direction) {
    this._touchDir = normalizeDirection(direction);
  }

  static get FRAME_SIZE() {
    return SHEETS.player.frameWidth;
  }
}

Player.SCENE_KEYS = SCENE_KEYS;
