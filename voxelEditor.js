import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

export class VoxelEditor {
  constructor(scene, maxVoxels = 5000) {
    this.scene = scene;
    this.maxVoxels = maxVoxels;
    this.voxels = new Map();
    this.undoStack = [];
    this.redoStack = [];

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
    this.instancedMesh = new THREE.InstancedMesh(geo, mat, maxVoxels);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.count = 0;
    this.scene.add(this.instancedMesh);

    this.colors = Array.from({ length: maxVoxels }, () => new THREE.Color('#ffffff'));
    this.gridSize = 32;

    this.highlightMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 1.05, 1.05),
      new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
    );
    this.highlightMesh.visible = false;
    this.scene.add(this.highlightMesh);

    this.cursorMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    this.scene.add(this.cursorMesh);

    const grid = new THREE.GridHelper(this.gridSize, this.gridSize, 0x355, 0x244);
    this.scene.add(grid);
  }

  keyFromPos(pos) {
    return `${pos.x},${pos.y},${pos.z}`;
  }

  snapToGrid(vec3) {
    return new THREE.Vector3(
      Math.round(vec3.x),
      Math.round(vec3.y),
      Math.round(vec3.z)
    );
  }

  setCursor(pos) {
    this.cursorMesh.position.copy(pos);
  }

  setHighlight(pos) {
    if (!pos) {
      this.highlightMesh.visible = false;
      return;
    }
    this.highlightMesh.visible = true;
    this.highlightMesh.position.copy(pos);
  }

  addVoxel(pos, color, record = true) {
    const snapped = this.snapToGrid(pos);
    const key = this.keyFromPos(snapped);
    if (this.voxels.has(key) || this.voxels.size >= this.maxVoxels) return false;

    this.voxels.set(key, { pos: snapped.clone(), color });
    if (record) this.recordAction({ type: 'add', voxel: { pos: snapped.clone(), color } });
    this.rebuildInstances();
    return true;
  }

  removeVoxel(pos, record = true) {
    const snapped = this.snapToGrid(pos);
    const key = this.keyFromPos(snapped);
    const existing = this.voxels.get(key);
    if (!existing) return false;

    this.voxels.delete(key);
    if (record) this.recordAction({ type: 'remove', voxel: existing });
    this.rebuildInstances();
    return true;
  }

  rebuildInstances() {
    let i = 0;
    const matrix = new THREE.Matrix4();
    for (const voxel of this.voxels.values()) {
      matrix.makeTranslation(voxel.pos.x, voxel.pos.y, voxel.pos.z);
      this.instancedMesh.setMatrixAt(i, matrix);
      this.colors[i].set(voxel.color);
      this.instancedMesh.setColorAt(i, this.colors[i]);
      i++;
    }
    this.instancedMesh.count = i;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
  }

  recordAction(action) {
    this.undoStack.push(action);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    const action = this.undoStack.pop();
    if (!action) return;
    if (action.type === 'add') this.removeVoxel(action.voxel.pos, false);
    if (action.type === 'remove') this.addVoxel(action.voxel.pos, action.voxel.color, false);
    this.redoStack.push(action);
  }

  redo() {
    const action = this.redoStack.pop();
    if (!action) return;
    if (action.type === 'add') this.addVoxel(action.voxel.pos, action.voxel.color, false);
    if (action.type === 'remove') this.removeVoxel(action.voxel.pos, false);
    this.undoStack.push(action);
  }

  exportJSON() {
    return JSON.stringify({
      voxels: [...this.voxels.values()].map((v) => ({ pos: v.pos, color: v.color }))
    }, null, 2);
  }

  importJSON(json) {
    const parsed = JSON.parse(json);
    this.voxels.clear();
    for (const v of parsed.voxels || []) {
      this.addVoxel(new THREE.Vector3(v.pos.x, v.pos.y, v.pos.z), v.color, false);
    }
    this.undoStack = [];
    this.redoStack = [];
    this.rebuildInstances();
  }

  getVoxelCount() {
    return this.voxels.size;
  }
}
