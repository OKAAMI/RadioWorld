import * as THREE from 'three/webgpu';

// Converts geographic coordinates to a point on the unit sphere surface.
// The formula matches Three.js's SphereGeometry UV layout so pins land on
// the correct country on the NASA Blue Marble texture.
export function latLonToVector3(lat, lon, radius = 1.01) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta),
  );
}

// Shared geometries — allocated once, reused across all pins.
const DOT_GEO  = new THREE.SphereGeometry(0.007, 8, 8);
const GLOW_GEO = new THREE.SphereGeometry(0.018, 8, 8);
const RING_GEO = new THREE.RingGeometry(0.022, 0.032, 40);
const HIT_GEO  = new THREE.SphereGeometry(0.04, 6, 6);

const DOT_MAT = new THREE.MeshBasicMaterial({ color: 0xff4466 });
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

const RING_Z = new THREE.Vector3(0, 0, 1); // RingGeometry default normal

const raycaster = new THREE.Raycaster();

export function buildPins(scene, stations) {
  const pins = [];

  for (const station of stations) {
    const coords = station.location?.coordinates;
    if (!coords) continue;
    const lat = parseFloat(coords.latitude);
    const lon = parseFloat(coords.longitude);
    if (!isFinite(lat) || !isFinite(lon)) continue;

    const pos    = latLonToVector3(lat, lon);
    const normal = pos.clone().normalize();
    const ringQuat = new THREE.Quaternion().setFromUnitVectors(RING_Z, normal);

    const hitbox = new THREE.Mesh(HIT_GEO, HIT_MAT);

    const dot = new THREE.Mesh(DOT_GEO, DOT_MAT);

    const glow = new THREE.Mesh(GLOW_GEO, new THREE.MeshBasicMaterial({
      color: 0xff5577,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }));

    // Three expanding ring waves — oriented flat on globe surface, only shown when playing
    const rings = [0, 1, 2].map(() => {
      const ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({
        color: 0xff4466,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }));
      ring.quaternion.copy(ringQuat);
      ring.visible = false;
      return ring;
    });

    const group = new THREE.Group();
    group.add(hitbox, dot, glow, ...rings); // indices: 0=hitbox 1=dot 2=glow 3/4/5=rings
    group.position.copy(pos);
    group.userData.station = station;

    scene.add(group);
    pins.push(group);
  }

  return pins;
}

export function animatePins(pins, t, playingStation, cameraDistance) {
  // Scale pins down as the camera zooms in so they don't overlap.
  // Reference distance 2.5 = default camera position → scale 1.0.
  const pinScale = Math.max(0.2, Math.min(1.5, cameraDistance / 2.5));

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    pin.scale.setScalar(pinScale);
    const isPlaying = !!playingStation && pin.userData.station === playingStation;

    // Subtle glow breathe on every pin
    pin.children[2].material.opacity = 0.14 + 0.08 * Math.sin(t * 1.4 + i * 0.9);

    // Radio wave rings — playing pin only
    for (let r = 0; r < 3; r++) {
      const ring = pin.children[3 + r];
      if (isPlaying) {
        const phase = (t * 0.45 + r / 3) % 1.0; // ~2.2 s cycle, 3 evenly-spaced rings
        ring.visible = true;
        ring.scale.setScalar(0.5 + phase * 2.25); // expands outward
        ring.material.opacity = 0.65 * (1 - phase);
      } else {
        ring.visible = false;
      }
    }
  }
}

export function clearPins(scene, pins) {
  for (const group of pins) {
    scene.remove(group);
    // Dispose per-pin cloned materials (glow + 3 rings)
    for (let i = 2; i <= 5; i++) {
      group.children[i]?.material?.dispose();
    }
  }
  return [];
}

export function stationAtMouse(pins, mouse, camera) {
  raycaster.setFromCamera(mouse, camera);
  const hitboxes = pins.map(g => g.children[0]);
  const hits = raycaster.intersectObjects(hitboxes);
  return hits.length > 0 ? hits[0].object.parent.userData.station : null;
}
