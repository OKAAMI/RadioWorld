import * as THREE from 'three/webgpu';

const CDN     = 'https://unpkg.com/three-globe@2.45.2/example/img';
const loader  = new THREE.TextureLoader();

export function createGlobe() {
  const geometry = new THREE.SphereGeometry(1, 64, 64);

  const colorMap = loader.load(`${CDN}/earth-blue-marble.jpg`);
  colorMap.colorSpace = THREE.SRGBColorSpace;

  // Topology map adds visible terrain relief (mountains, valleys)
  const bumpMap = loader.load(`${CDN}/earth-topology.png`);

  const material = new THREE.MeshStandardMaterial({
    map:       colorMap,
    bumpMap,
    bumpScale: 0.05,
    roughness: 0.8,
    metalness: 0.05,
  });

  return new THREE.Mesh(geometry, material);
}
