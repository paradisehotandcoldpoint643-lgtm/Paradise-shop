import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js';
import { HandTrackingController } from './handTracking.js';
import { VoxelEditor } from './voxelEditor.js';

const canvas = document.getElementById('threeCanvas');
const video = document.getElementById('cameraView');
const fpsEl = document.getElementById('fps');
const trackingEl = document.getElementById('trackingStatus');
const voxelCountEl = document.getElementById('voxelCount');
const colorPicker = document.getElementById('colorPicker');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090d1f);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(12, 12, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(9, 14, 6);
scene.add(dir);

const editor = new VoxelEditor(scene, 4000);
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let trackedState = { tracked: false };
let lastGestureTime = 0;
const gestureCooldownMs = 140;

const handTracking = new HandTrackingController(video, (state) => {
  trackedState = state;
});

await handTracking.init();

function handToNDC(indexTip) {
  return new THREE.Vector2(indexTip.x * 2 - 1, -(indexTip.y * 2 - 1));
}

function projectFingerToWorld(indexTip) {
  const ndc = handToNDC(indexTip);
  raycaster.setFromCamera(ndc, camera);

  const hitPoint = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
    return editor.snapToGrid(hitPoint);
  }
  return null;
}

function updateInteraction() {
  if (!trackedState.tracked) {
    trackingEl.textContent = 'Tracking: No hand detected';
    editor.setHighlight(null);
    return;
  }

  trackingEl.textContent = `Tracking: Active ${trackedState.pinch ? '(Pinch)' : trackedState.openPalm ? '(Open)' : ''}`;

  const target = projectFingerToWorld(trackedState.indexTip);
  if (!target) return;

  editor.setCursor(target.clone().add(new THREE.Vector3(0, 0.7, 0)));
  editor.setHighlight(target);

  const now = performance.now();
  if (now - lastGestureTime < gestureCooldownMs) return;

  if (trackedState.pinch) {
    const above = target.clone().add(new THREE.Vector3(0, 1, 0));
    if (editor.addVoxel(above, colorPicker.value)) {
      lastGestureTime = now;
    }
  } else if (trackedState.openPalm) {
    if (editor.removeVoxel(target)) {
      lastGestureTime = now;
    }
  }
}

let frameCount = 0;
let lastFpsTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  handTracking.update();
  updateInteraction();
  controls.update();
  renderer.render(scene, camera);

  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime > 500) {
    const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    fpsEl.textContent = `FPS: ${fps}`;
    voxelCountEl.textContent = `Voxels: ${editor.getVoxelCount()}`;
    frameCount = 0;
    lastFpsTime = now;
  }
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('toggleCamera').addEventListener('click', () => {
  video.classList.toggle('visible');
});

document.getElementById('undoBtn').addEventListener('click', () => editor.undo());
document.getElementById('redoBtn').addEventListener('click', () => editor.redo());

document.getElementById('saveModel').addEventListener('click', () => {
  const blob = new Blob([editor.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'voxel-model.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('loadModel').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  editor.importJSON(await file.text());
});
