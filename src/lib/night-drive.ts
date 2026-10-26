type DriveOptions = {
  onDistance: (kilometers: number) => void;
};

// A little projected world, painted only while the hidden drive is open.
export class NightDriveScene {
  private context: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private frame = 0;
  private previousTime = 0;
  private travel = 0;
  private seconds = 0;
  private steering = 0;
  private targetSteering = 0;
  private direction = 0;
  private paused = true;
  private distanceUpdate = 0;
  private resizeObserver: ResizeObserver;
  private canvas: HTMLCanvasElement;
  private options: DriveOptions;

  constructor(canvas: HTMLCanvasElement, options: DriveOptions) {
    this.canvas = canvas;
    this.options = options;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is unavailable");
    this.context = context;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resize();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.stopFrame();
    if (!paused && !document.hidden) this.frame = requestAnimationFrame(this.animate);
    else this.paint();
  }

  setDirection(direction: number) {
    this.direction = direction;
    if (this.paused && direction) this.nudge(direction);
  }

  nudge(direction: number) {
    this.targetSteering = Math.max(-1, Math.min(1, this.targetSteering + direction * 0.12));
    if (this.paused) {
      this.steering = this.targetSteering;
      this.paint();
    }
  }

  pointTo(position: number) {
    this.targetSteering = Math.max(-1, Math.min(1, position));
    if (this.paused) {
      this.steering = this.targetSteering;
      this.paint();
    }
  }

  destroy() {
    this.stopFrame();
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  private stopFrame() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.previousTime = 0;
  }

  private onVisibility = () => {
    this.stopFrame();
    this.direction = 0;
    if (!this.paused && !document.hidden) this.frame = requestAnimationFrame(this.animate);
  };

  private resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.paint();
  }

  private animate = (time: number) => {
    const delta = this.previousTime ? Math.min((time - this.previousTime) / 1000, 0.05) : 0;
    this.previousTime = time;
    this.seconds += delta;
    this.travel += delta * 170;
    this.targetSteering = Math.max(-1, Math.min(1, this.targetSteering + this.direction * delta * 0.85));
    this.steering += (this.targetSteering - this.steering) * (1 - Math.exp(-delta * 6));
    if (this.seconds - this.distanceUpdate > 0.5) {
      this.distanceUpdate = this.seconds;
      this.options.onDistance(this.seconds * 42 / 3600);
    }
    this.paint();
    this.frame = requestAnimationFrame(this.animate);
  };

  private roadCenter(scale: number) {
    return this.width * (0.5 + Math.sin(this.travel * 0.00045 + (1 - scale) * 2.4) * 0.17 * (1 - scale) ** 2);
  }

  private project(z: number, side: number) {
    const scale = 240 / (z + 240);
    return {
      x: this.roadCenter(scale) + side * this.width * 0.76 * scale,
      y: this.height * 0.39 + this.height * 0.68 * scale,
      scale,
    };
  }

  private polygon(points: number[][], fill: string | CanvasGradient) {
    const c = this.context;
    c.beginPath();
    points.forEach(([x, y], index) => index ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  private glow(x: number, y: number, radius: number, color: string) {
    if (radius <= 0) return;
    const c = this.context;
    const glow = c.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "transparent");
    c.fillStyle = glow;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  private paint() {
    const c = this.context;
    const w = this.width;
    const h = this.height;
    if (!w || !h) return;
    const horizon = h * 0.39;
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#080f1b");
    sky.addColorStop(0.35, "#1c283c");
    sky.addColorStop(0.48, "#363340");
    sky.addColorStop(0.58, "#171e26");
    sky.addColorStop(1, "#080c11");
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    this.glow(w * 0.54, horizon, w * 0.46, "#826b6826");

    // Fixed stars keep the sky calm while the world moves underneath it.
    for (let i = 0; i < 92; i++) {
      const x = ((Math.sin(i * 127.1 + 4) * 43758.5453) % 1 + 1) % 1;
      const y = ((Math.sin(i * 311.7 + 8) * 28462.723) % 1 + 1) % 1;
      c.fillStyle = `rgba(222,229,239,${0.18 + (i % 4) * 0.1})`;
      c.beginPath();
      c.arc(x * w, y * horizon * 0.85, i % 13 === 0 ? 1.1 : 0.65, 0, Math.PI * 2);
      c.fill();
    }
    const moonX = w * 0.79;
    const moonY = h * 0.2;
    const moonRadius = Math.min(w, h) * 0.023;
    this.glow(moonX, moonY, moonRadius * 5, "#dedbc319");
    c.fillStyle = "#dddcc8";
    c.beginPath();
    c.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c6c7b71f";
    c.beginPath();
    c.arc(moonX - moonRadius * 0.2, moonY + moonRadius * 0.25, moonRadius * 0.45, 0, Math.PI * 2);
    c.fill();

    // Layered hills and a few distant windows, rather than a busy skyline.
    for (let layer = 0; layer < 3; layer++) {
      const points = [[0, h]];
      for (let x = 0; x <= w + 10; x += 10) {
        const y = horizon + layer * h * 0.035
          - Math.sin(x / w * 8 + layer * 2.1) * h * 0.034
          - Math.cos(x / w * 17 + layer) * h * 0.013;
        points.push([x, y]);
      }
      points.push([w, h]);
      this.polygon(points, ["#1c2631", "#151e27", "#10191e"][layer]);
    }
    for (let i = 0; i < 23; i++) {
      const x = w * (0.06 + i * 0.039);
      const y = horizon + h * 0.044 + Math.sin(i * 2) * 3;
      c.fillStyle = i % 3 ? "#aa927657" : "#d8bc9070";
      c.fillRect(x, y, 1.5, 1);
    }

    // Project thin road strips from the horizon towards the viewer.
    const strips = 100;
    for (let i = 0; i < strips; i++) {
      const a = i / strips;
      const b = (i + 1) / strips;
      const topY = horizon + h * 0.68 * a;
      const bottomY = horizon + h * 0.68 * b + 1;
      const topCenter = this.roadCenter(a);
      const bottomCenter = this.roadCenter(b);
      const topWidth = w * 0.76 * a;
      const bottomWidth = w * 0.76 * b;
      const tone = Math.round(24 - a * 10);
      this.polygon([
        [topCenter - topWidth * 1.045, topY], [topCenter + topWidth * 1.045, topY],
        [bottomCenter + bottomWidth * 1.045, bottomY], [bottomCenter - bottomWidth * 1.045, bottomY],
      ], "#4c4c452c");
      this.polygon([
        [topCenter - topWidth, topY], [topCenter + topWidth, topY],
        [bottomCenter + bottomWidth, bottomY], [bottomCenter - bottomWidth, bottomY],
      ], `rgb(${tone},${tone + 5},${tone + 11})`);
      for (const side of [-1, 1]) {
        this.polygon([
          [topCenter + side * topWidth * 0.94, topY],
          [topCenter + side * topWidth * 0.95, topY],
          [bottomCenter + side * bottomWidth * 0.95, bottomY],
          [bottomCenter + side * bottomWidth * 0.94, bottomY],
        ], "#c8c6ac55");
      }
    }

    // Dashed amber lane markings and low roadside reflectors flow past.
    for (let i = 35; i >= 0; i--) {
      const z = ((i * 125 - this.travel) % 4500 + 4500) % 4500;
      const near = this.project(z, 0);
      const far = this.project(z + 48, 0);
      const lineWidth = Math.max(0.3, w * 0.003 * near.scale);
      this.polygon([
        [near.x - lineWidth, near.y], [near.x + lineWidth, near.y],
        [far.x + lineWidth * 0.7, far.y], [far.x - lineWidth * 0.7, far.y],
      ], "#d4b97a85");
      for (const side of [-1, 1]) {
        const marker = this.project(z, side * 1.04);
        c.fillStyle = "#c9b78e99";
        c.fillRect(marker.x, marker.y - 10 * marker.scale, Math.max(1, 2 * marker.scale), 5 * marker.scale);
      }
    }

    // Warm pools of lamplight frame the road. Distant lights are drawn first.
    const lamps = Array.from({ length: 15 }, (_, i) => ({
      z: ((i * 320 + 90 - this.travel) % 4800 + 4800) % 4800,
      side: i % 2 ? -1 : 1,
    })).sort((a, b) => b.z - a.z);
    for (const lamp of lamps) {
      const point = this.project(lamp.z, lamp.side * 1.13);
      const poleHeight = h * 0.49 * point.scale;
      const lampX = point.x - lamp.side * w * 0.038 * point.scale;
      const lampY = point.y - poleHeight;
      this.glow(lampX, point.y, w * 0.16 * point.scale, "#e6bd7120");
      const beam = c.createLinearGradient(lampX, lampY, lampX, point.y);
      beam.addColorStop(0, "#f5cc8520");
      beam.addColorStop(1, "#f5cc8500");
      this.polygon([[lampX, lampY], [lampX - w * 0.1 * point.scale, point.y], [lampX + w * 0.1 * point.scale, point.y]], beam);
      c.strokeStyle = "#697178";
      c.lineWidth = Math.max(0.5, 2.4 * point.scale);
      c.beginPath();
      c.moveTo(point.x, point.y);
      c.lineTo(point.x, lampY + 8 * point.scale);
      c.quadraticCurveTo(point.x, lampY, lampX, lampY);
      c.stroke();
      this.glow(lampX, lampY, 32 * point.scale, "#ffd99d55");
      c.fillStyle = "#ffe2aa";
      c.beginPath();
      c.ellipse(lampX, lampY, Math.max(1, 6 * point.scale), Math.max(0.7, 2 * point.scale), 0, 0, Math.PI * 2);
      c.fill();
    }

    const carY = h * (w < 600 ? 0.72 : 0.76);
    const carScale = (carY - horizon) / (h * 0.68);
    const carWidth = Math.min(92, Math.max(62, w * 0.075));
    const roadWidth = w * 0.76 * carScale;
    const shoulder = Math.max(0, roadWidth * 0.92 - carWidth * 0.55);
    const offset = Math.max(-shoulder, Math.min(shoulder, (0.3 + this.steering * 0.6) * roadWidth));
    this.paintCar(this.roadCenter(carScale) + offset, carY, carWidth);

    const vignette = c.createRadialGradient(w / 2, h * 0.52, h * 0.1, w / 2, h * 0.52, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, "transparent");
    vignette.addColorStop(1, "#03070cb3");
    c.fillStyle = vignette;
    c.fillRect(0, 0, w, h);
  }

  private paintCar(x: number, y: number, width: number) {
    const c = this.context;
    // A soft headlight wash points down the road, without adding any audio.
    const farY = Math.max(this.height * 0.39 + 12, y - width * 3.1);
    const farScale = (farY - this.height * 0.39) / (this.height * 0.68);
    const farX = this.roadCenter(farScale) + (0.3 + this.steering * 0.6) * this.width * 0.76 * farScale;
    const farWidth = Math.min(width * 0.8, this.width * 0.76 * farScale * 0.7);
    const light = c.createLinearGradient(x, y - width * 0.45, farX, farY);
    light.addColorStop(0, "#dee6da22");
    light.addColorStop(1, "#dee6da00");
    this.polygon([[x - width * 0.4, y - width * 0.3], [x + width * 0.4, y - width * 0.3],
      [farX + farWidth, farY], [farX - farWidth, farY]], light);
    this.glow(x, y + width * 0.35, width * 0.7, "#ed463218");
    c.save();
    c.translate(x, y + Math.sin(this.seconds * 8) * 0.35);
    c.rotate((this.targetSteering - this.steering) * 0.1);
    c.scale(width / 100, width / 100);
    c.fillStyle = "#04070bd1";
    c.beginPath();
    c.ellipse(0, 25, 58, 25, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#06090c";
    c.fillRect(-47, -12, 12, 54);
    c.fillRect(35, -12, 12, 54);
    const metal = c.createLinearGradient(-48, -60, 50, 42);
    metal.addColorStop(0, "#697780");
    metal.addColorStop(0.28, "#bcc2c0");
    metal.addColorStop(0.5, "#7f8c95");
    metal.addColorStop(0.75, "#3e4a55");
    metal.addColorStop(1, "#232f3b");
    c.fillStyle = metal;
    c.beginPath();
    c.moveTo(-31, -67);
    c.quadraticCurveTo(0, -75, 31, -67);
    c.lineTo(44, -20);
    c.quadraticCurveTo(52, 7, 47, 37);
    c.quadraticCurveTo(0, 50, -47, 37);
    c.quadraticCurveTo(-52, 7, -44, -20);
    c.closePath();
    c.fill();
    c.strokeStyle = "#c3ccd14a";
    c.lineWidth = 1;
    c.stroke();
    // Rear glass, roof seam, a slim light bar, and a tiny 22 plate.
    const glass = c.createLinearGradient(0, -55, 0, 3);
    glass.addColorStop(0, "#152334");
    glass.addColorStop(1, "#354555");
    this.polygon([[-28, -52], [28, -52], [37, -7], [-37, -7]], glass);
    c.strokeStyle = "#c5ccce60";
    c.beginPath();
    c.moveTo(-26, -59); c.quadraticCurveTo(0, -65, 26, -59);
    c.moveTo(-42, 5); c.quadraticCurveTo(0, 12, 42, 5);
    c.stroke();
    c.shadowColor = "#ff5145";
    c.shadowBlur = 13;
    c.strokeStyle = "#ff6a56";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-42, 19); c.lineTo(-24, 21);
    c.moveTo(24, 21); c.lineTo(42, 19);
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = "#17202a";
    c.fillRect(-12, 24, 24, 11);
    c.fillStyle = "#d2d5cb";
    c.font = "8px ui-monospace, monospace";
    c.textAlign = "center";
    c.fillText("22", 0, 32);
    c.strokeStyle = "#c6cbd22a";
    c.beginPath();
    c.moveTo(-39, 37); c.quadraticCurveTo(0, 45, 39, 37);
    c.stroke();
    c.restore();
  }
}
