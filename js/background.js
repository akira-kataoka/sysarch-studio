// Ambient "constellation" background powered by Three.js.
// Fails silently (leaving the CSS gradient) if three cannot be loaded.
export async function initBackground() {
  let THREE;
  try {
    THREE = await import('three');
  } catch (e) {
    console.warn('[bg] three.js unavailable — using static gradient.', e);
    return { setTheme() {} };
  }

  const canvas = document.getElementById('bg-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  camera.position.z = 26;

  const COUNT = Math.min(140, Math.floor(innerWidth / 11));
  const SPREAD = 46;
  const positions = new Float32Array(COUNT * 3);
  const velocities = [];
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * SPREAD;
    positions[i * 3 + 1] = (Math.random() - 0.5) * SPREAD * 0.62;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
    velocities.push(new THREE.Vector3(
      (Math.random() - 0.5) * 0.012,
      (Math.random() - 0.5) * 0.012,
      (Math.random() - 0.5) * 0.008
    ));
  }

  // points
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sprite = makeGlowTexture(THREE);
  const ptsMat = new THREE.PointsMaterial({
    size: 0.9, map: sprite, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: new THREE.Color('#8b6dff'), opacity: 0.9,
  });
  const points = new THREE.Points(ptsGeo, ptsMat);
  scene.add(points);

  // connecting lines
  const MAX_LINKS = COUNT * 6;
  const linkPos = new Float32Array(MAX_LINKS * 2 * 3);
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3).setUsage(THREE.DynamicDrawUsage));
  const linkMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#4dd0e1'), transparent: true, opacity: 0.16 });
  const lines = new THREE.LineSegments(linkGeo, linkMat);
  scene.add(lines);

  const mouse = new THREE.Vector2(0, 0);
  addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / innerWidth - 0.5);
    mouse.y = (e.clientY / innerHeight - 0.5);
  });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const LINK_DIST = 8.2;
  let running = true;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const p = ptsGeo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      const v = velocities[i];
      p[i * 3] += v.x; p[i * 3 + 1] += v.y; p[i * 3 + 2] += v.z;
      // gentle bounds — bounce off the soft box
      if (Math.abs(p[i * 3]) > SPREAD / 2) v.x *= -1;
      if (Math.abs(p[i * 3 + 1]) > SPREAD * 0.31) v.y *= -1;
      if (Math.abs(p[i * 3 + 2]) > 8) v.z *= -1;
    }
    ptsGeo.attributes.position.needsUpdate = true;

    // rebuild links
    let n = 0;
    for (let i = 0; i < COUNT && n < MAX_LINKS; i++) {
      for (let j = i + 1; j < COUNT && n < MAX_LINKS; j++) {
        const dx = p[i * 3] - p[j * 3], dy = p[i * 3 + 1] - p[j * 3 + 1], dz = p[i * 3 + 2] - p[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < LINK_DIST * LINK_DIST) {
          linkPos[n * 6] = p[i * 3]; linkPos[n * 6 + 1] = p[i * 3 + 1]; linkPos[n * 6 + 2] = p[i * 3 + 2];
          linkPos[n * 6 + 3] = p[j * 3]; linkPos[n * 6 + 4] = p[j * 3 + 1]; linkPos[n * 6 + 5] = p[j * 3 + 2];
          n++;
        }
      }
    }
    linkGeo.setDrawRange(0, n * 2);
    linkGeo.attributes.position.needsUpdate = true;

    // parallax
    camera.position.x += (mouse.x * 6 - camera.position.x) * 0.03;
    camera.position.y += (-mouse.y * 4 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
    points.rotation.z += 0.0004;
    lines.rotation.z = points.rotation.z;

    renderer.render(scene, camera);
  }
  frame();

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) frame();
  });

  return {
    setTheme(theme) {
      if (theme === 'light') {
        ptsMat.color.set('#2f6fe0'); ptsMat.opacity = 0.55;
        linkMat.color.set('#12a3bb'); linkMat.opacity = 0.10;
      } else {
        ptsMat.color.set('#4d8dff'); ptsMat.opacity = 0.9;
        linkMat.color.set('#38d5c0'); linkMat.opacity = 0.16;
      }
    },
  };
}

function makeGlowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}
