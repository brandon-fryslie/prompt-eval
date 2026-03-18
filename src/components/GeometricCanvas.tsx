import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  type: 'triangle' | 'hexagon' | 'square' | 'star';
  rotation: number;
  rotationSpeed: number;
  color: string;
  pulsePhase: number;
}

interface Flash {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  startTime: number;
  duration: number;
  maxOpacity: number;
}

const PARTICLE_COLORS = [
  'rgba(121, 80, 242, OPACITY)',
  'rgba(147, 51, 234, OPACITY)',
  'rgba(168, 85, 247, OPACITY)',
  'rgba(139, 92, 246, OPACITY)',
  'rgba(99, 102, 241, OPACITY)',
  'rgba(79, 70, 229, OPACITY)',
];

// Rich, saturated tones for flashes — subtle but striking
const FLASH_COLORS: [number, number, number][] = [
  [255, 130, 0],   // deep amber
  [0, 195, 175],   // jewel teal
  [195, 30, 75],   // ruby crimson
  [20, 140, 255],  // electric sapphire
  [210, 170, 0],   // burnished gold
  [160, 0, 200],   // deep violet-magenta
  [0, 210, 95],    // emerald
  [255, 80, 120],  // coral rose
];

function makeColor(template: string, opacity: number): string {
  return template.replace('OPACITY', String(opacity));
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, radius: number, sides: number, rotation: number
) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 + rotation;
    if (i === 0) ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    else ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, outerR: number, innerR: number, points: number, rotation: number
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 + rotation;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    else ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.closePath();
}

export function GeometricCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const flashesRef = useRef<Flash[]>([]);
  const nextFlashRef = useRef<number>(0);
  const noisePatternRef = useRef<CanvasPattern | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buildNoise = () => {
      const size = 256;
      const nc = document.createElement('canvas');
      nc.width = size; nc.height = size;
      const nctx = nc.getContext('2d')!;
      const img = nctx.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255 | 0;
        img.data[i] = v; img.data[i+1] = v; img.data[i+2] = v;
        img.data[i+3] = 255;
      }
      nctx.putImageData(img, 0, 0);
      noisePatternRef.current = ctx.createPattern(nc, 'repeat');
    };

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    const createParticle = (): Particle => {
      const types: Particle['type'][] = ['triangle', 'hexagon', 'square', 'star'];
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        size: Math.random() * 42 + 10,
        opacity: Math.random() * 0.14 + 0.03,
        type: types[Math.floor(Math.random() * types.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.005,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        pulsePhase: Math.random() * Math.PI * 2,
      };
    };

    const spawnFlash = (timestamp: number) => {
      const [r, g, b] = FLASH_COLORS[Math.floor(Math.random() * FLASH_COLORS.length)];
      flashesRef.current.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: 150 + Math.random() * 280,
        r, g, b,
        startTime: timestamp,
        duration: 3500 + Math.random() * 3000,
        maxOpacity: 0.055 + Math.random() * 0.045,
      });
      // Next flash in 5–14 seconds
      nextFlashRef.current = timestamp + 5000 + Math.random() * 9000;
    };

    const initParticles = () => {
      particlesRef.current = Array.from({ length: 35 }, createParticle);
    };

    const drawGrid = (time: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const gridSize = 80;

      ctx.strokeStyle = 'rgba(121, 80, 242, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Sweeping diagonal beam — fade in/out at edges to avoid hard wrap snap
      const period = w + h + 600;
      const rawPos = (time * 0.18) % period;
      const beamX = rawPos - h;
      const edgeFade = Math.min(1, rawPos / 350, (period - rawPos) / 350);
      const beamPeak = 0.028 * edgeFade;
      if (beamPeak > 0.001) {
        const grad = ctx.createLinearGradient(beamX, 0, beamX + 220, 220);
        grad.addColorStop(0, 'rgba(121, 80, 242, 0)');
        grad.addColorStop(0.5, `rgba(121, 80, 242, ${beamPeak})`);
        grad.addColorStop(1, 'rgba(121, 80, 242, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
    };

    const drawFlashes = (timestamp: number) => {
      flashesRef.current = flashesRef.current.filter((f) => {
        const t = (timestamp - f.startTime) / f.duration;
        if (t >= 1) return false;
        // Bell-curve opacity: peaks at t=0.3, smooth fade
        const opacity = Math.sin(t * Math.PI) * f.maxOpacity;
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
        grad.addColorStop(0, `rgba(${f.r},${f.g},${f.b},${opacity})`);
        grad.addColorStop(0.4, `rgba(${f.r},${f.g},${f.b},${opacity * 0.4})`);
        grad.addColorStop(1, `rgba(${f.r},${f.g},${f.b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return true;
      });
    };

    const drawConnections = () => {
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 175) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(121, 80, 242, ${(1 - dist / 175) * 0.07})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    };

    const drawParticle = (p: Particle, time: number) => {
      const pulse = Math.sin(time * 0.001 + p.pulsePhase) * 0.3 + 0.7;
      const eff = p.opacity * pulse;
      ctx.save();
      ctx.globalAlpha = eff;
      ctx.strokeStyle = makeColor(p.color, 1);
      ctx.lineWidth = 1;
      ctx.fillStyle = makeColor(p.color, 0.05);

      switch (p.type) {
        case 'triangle':
          drawPolygon(ctx, p.x, p.y, p.size, 3, p.rotation);
          ctx.fill(); ctx.stroke();
          ctx.globalAlpha = eff * 0.35;
          drawPolygon(ctx, p.x, p.y, p.size * 0.5, 3, p.rotation + Math.PI);
          ctx.stroke();
          break;
        case 'hexagon':
          drawPolygon(ctx, p.x, p.y, p.size, 6, p.rotation);
          ctx.fill(); ctx.stroke();
          ctx.globalAlpha = eff * 0.28;
          drawPolygon(ctx, p.x, p.y, p.size * 0.58, 6, p.rotation + Math.PI / 6);
          ctx.stroke();
          break;
        case 'square':
          drawPolygon(ctx, p.x, p.y, p.size, 4, p.rotation);
          ctx.fill(); ctx.stroke();
          ctx.globalAlpha = eff * 0.28;
          drawPolygon(ctx, p.x, p.y, p.size * 0.55, 4, p.rotation + Math.PI / 4);
          ctx.stroke();
          break;
        case 'star':
          drawStar(ctx, p.x, p.y, p.size, p.size * 0.48, 6, p.rotation);
          ctx.fill(); ctx.stroke();
          break;
      }
      ctx.restore();
    };

    const animate = (timestamp: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawGrid(timestamp);

      // Spawn new flashes on schedule
      if (timestamp >= nextFlashRef.current) {
        spawnFlash(timestamp);
      }
      drawFlashes(timestamp);

      // Soft central glow (violet)
      const cx = canvas.width / 2;
      const cy = canvas.height * 0.38;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(canvas.width, canvas.height) * 0.55);
      glow.addColorStop(0, 'rgba(121, 80, 242, 0.035)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Dither — two passes with different blend modes to hit both shadows and highlights
      if (noisePatternRef.current) {
        ctx.save();
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = 0.07;
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 0.04;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      drawConnections();

      particlesRef.current.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.rotation += p.rotationSpeed;
        if (p.x < -p.size) p.x = canvas.width + p.size;
        if (p.x > canvas.width + p.size) p.x = -p.size;
        if (p.y < -p.size) p.y = canvas.height + p.size;
        if (p.y > canvas.height + p.size) p.y = -p.size;
        drawParticle(p, timestamp);
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    resize();
    buildNoise();
    initParticles();
    nextFlashRef.current = 2000; // first flash after 2s
    rafRef.current = requestAnimationFrame(animate);

    const observer = new ResizeObserver(() => { resize(); initParticles(); });
    observer.observe(canvas);
    return () => { cancelAnimationFrame(rafRef.current); observer.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: -1,
      }}
    />
  );
}
