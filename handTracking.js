import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

export class HandTrackingController {
  constructor(videoEl, onUpdate) {
    this.videoEl = videoEl;
    this.onUpdate = onUpdate;
    this.handLandmarker = null;
    this.lastVideoTime = -1;
    this.enabled = false;
  }

  async init() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 960, height: 540, facingMode: 'user' },
      audio: false
    });
    this.videoEl.srcObject = stream;
    await this.videoEl.play();

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    this.enabled = true;
  }

  update() {
    if (!this.enabled || !this.handLandmarker) return;
    const nowInMs = performance.now();
    if (this.videoEl.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.videoEl.currentTime;

    const result = this.handLandmarker.detectForVideo(this.videoEl, nowInMs);
    if (!result.landmarks || !result.landmarks.length) {
      this.onUpdate({ tracked: false });
      return;
    }

    const lm = result.landmarks[0];
    const indexTip = lm[8];
    const thumbTip = lm[4];
    const middleTip = lm[12];
    const wrist = lm[0];

    const pinchDistance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y, indexTip.z - thumbTip.z);
    const palmOpen = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);

    this.onUpdate({
      tracked: true,
      indexTip,
      pinch: pinchDistance < 0.055,
      openPalm: palmOpen > 0.22,
      raw: lm
    });
  }
}
