export function isModalOpen(scene) {
  return !!(scene.inventoryUI?.isVisible() || scene.shopUI?.isVisible() ||
    scene.questUI?.isVisible() || scene.achievementUI?.isVisible() || scene.npc?.isDialogActive());
}

export function layoutSceneUI(scene) {
  const { width, height } = scene.scale;
  scene.cameras.main.setSize(width, height);
  scene.timeHud?.setPosition(width - 10, 10);
  scene.timePanel?.setPosition(width - 8, 6);
  for (const name of ['inventoryUI', 'shopUI', 'questUI', 'achievementUI', 'achievementPopup']) {
    const ui = scene[name];
    if (!ui?.container) continue;
    const panelHeight = ui.panelHeight || (name === 'achievementPopup' ? 64 : 220);
    ui.container.setPosition(width / 2, height / 2);
    ui.container.setScale(Math.min(1, (height - 16) / panelHeight));
  }
  if (scene.npc?.isDialogActive()) scene._showDialog();
}

export function addCloseButton(scene, container, width, height, onClose) {
  const x = width / 2 - 18;
  const y = -height / 2 + 18;
  const hit = scene.add.rectangle(x, y, 32, 32, 0x6f5840, 0.9)
    .setScrollFactor(0).setInteractive();
  const label = scene.add.text(x, y, 'X', { fontSize: '12px', color: '#fff3d8', fontFamily: 'sans-serif' }).setOrigin(0.5);
  hit.on('pointerdown', (pointer, localX, localY, event) => {
    event?.stopPropagation();
    onClose();
  });
  container.add([hit, label]);
}
