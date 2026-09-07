// Rendering only: dialog content and quest effects still belong to NPCSystem.
export function showDialogPanel(scene) {
  const dialog = scene.npc?.currentDialog();
  scene._hideDialog();
  if (!dialog) return;
  const { width, height } = scene.scale;
  const choices = dialog.choices || [];
  const text = scene.add.text(16, 0, (dialog.text || []).join(' '), {
    fontSize: '10px', color: '#fff3d8', fontFamily: 'sans-serif',
    wordWrap: { width: width - 40 }
  }).setDepth(221).setScrollFactor(0);
  const panelHeight = Math.min(height - 12, 48 + text.height + Math.max(1, choices.length) * 32);
  const top = height - panelHeight - 6;
  scene._dialogBg = scene.add.rectangle(8, top, width - 16, panelHeight, 0x342e22, 0.97)
    .setOrigin(0).setStrokeStyle(2, 0xe8d0a4).setDepth(220).setScrollFactor(0);
  scene._dialogName = scene.add.text(16, top + 8, scene.npc.npcs[dialog.npcId]?.name || '', {
    fontSize: '12px', color: '#f1d38a', fontFamily: 'sans-serif', fontStyle: 'bold'
  }).setDepth(221).setScrollFactor(0);
  scene._dialogText = text.setY(top + 30);
  scene._dialogChoices = [];
  const button = (x, y, w, label, callback) => {
    const bg = scene.add.rectangle(x, y, w, 28, 0x6f5840, 1)
      .setInteractive().setDepth(222).setScrollFactor(0);
    const caption = scene.add.text(x, y, label, { fontSize: '10px', color: '#fff3d8', fontFamily: 'sans-serif' })
      .setOrigin(0.5).setDepth(223).setScrollFactor(0);
    bg.on('pointerdown', (pointer, localX, localY, event) => { event?.stopPropagation(); callback(); });
    scene._dialogChoices.push(bg, caption);
  };
  button(width - 28, top + 17, 32, 'X', () => { scene.npc.closeDialog(); scene._hideDialog(); });
  const choose = index => {
    const result = index === null ? scene.npc.advanceDialog() : scene.npc.chooseDialog(index);
    if (result.closed) scene._hideDialog(); else scene._showDialog();
    scene._refreshHUD();
  };
  if (choices.length) {
    choices.forEach((choice, index) => button(width / 2, height - 24 - (choices.length - 1 - index) * 32,
      width - 40, choice.label, () => choose(index)));
  } else button(width / 2, height - 24, 100, 'Continue', () => choose(null));
}
