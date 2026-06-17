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

// Shared geometries / materials — allocated once, reused per pin.
const DOT_GEO  = new THREE.SphereGeometry(0.012, 8, 8);
const DOT_MAT  = new THREE.MeshBasicMaterial({ color: 0xff4466 });
const HALO_GEO = new THREE.SphereGeometry(0.028, 8, 8);
const HALO_MAT = new THREE.MeshBasicMaterial({ color: 0xff4466, transparent: true, opacity: 0.25 });

// Invisible, larger hit sphere for easier clicking on small pins.
const HIT_GEO = new THREE.SphereGeometry(0.04, 6, 6);
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

const raycaster = new THREE.Raycaster();

export function buildPins(scene, stations) {
  const pins = [];

  for (const station of stations) {
    const coords = station.location?.coordinates;
    if (!coords) continue;
    const lat = parseFloat(coords.latitude);
    const lon = parseFloat(coords.longitude);
    if (!isFinite(lat) || !isFinite(lon)) continue;

    const hitbox = new THREE.Mesh(HIT_GEO, HIT_MAT);
    const dot    = new THREE.Mesh(DOT_GEO, DOT_MAT);
    const halo   = new THREE.Mesh(HALO_GEO, HALO_MAT.clone()); // cloned for per-pin opacity anim

    const group = new THREE.Group();
    group.add(hitbox, dot, halo);           // 0=hitbox, 1=dot, 2=halo
    group.position.copy(latLonToVector3(lat, lon));
    group.userData.station = station;

    scene.add(group);
    pins.push(group);
  }

  return pins;
}

export function animatePins(pins, t) {
  for (let i = 0; i < pins.length; i++) {
    const scale = 1 + 0.5 * Math.sin(t * 2 + i * 1.3);
    pins[i].children[2].scale.setScalar(scale);                // pulse halo
    pins[i].children[2].material.opacity = 0.15 + 0.15 * scale;
  }
}

export function clearPins(scene, pins) {
  for (const group of pins) {
    scene.remove(group);
    group.children[2]?.material?.dispose(); // only halo mat is cloned per-pin
  }
  return [];
}

export function stationAtMouse(pins, mouse, camera) {
  raycaster.setFromCamera(mouse, camera);
  const hitboxes = pins.map(g => g.children[0]);
  const hits = raycaster.intersectObjects(hitboxes);
  return hits.length > 0 ? hits[0].object.parent.userData.station : null;
}
