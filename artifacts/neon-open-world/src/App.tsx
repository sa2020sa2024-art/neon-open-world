import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CarFront,
  ChevronRight,
  CloudSnow,
  Gauge,
  Info,
  Leaf,
  LocateFixed,
  Map as MapIcon,
  Navigation,
  Pause,
  RotateCcw,
  Sun,
  Thermometer,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

type SeasonId = 'summer' | 'autumn' | 'snow';
type CarId = 'sprinter' | 'grandTourer' | 'velocity';

type Telemetry = { speed: number; heading: number; distance: number; x: number; z: number; boost: number; inVehicle: boolean; nearVehicle: boolean };
type Controls = { forward: boolean; reverse: boolean; left: boolean; right: boolean; drift: boolean; boost: boolean };
type FallbackMotion = { x: number; z: number; heading: number; velocity: number; distance: number };
type PositionState = { x: number; z: number; heading: number };

type SeasonProfile = {
  id: SeasonId;
  label: string;
  short: string;
  sky: number;
  fog: number;
  ground: number;
  road: number;
  water: number;
  tree: number;
  accent: number;
  icon: typeof Sun;
};

type CarProfile = {
  id: CarId;
  name: string;
  label: string;
  maxKmh: number;
  accel: number;
  handling: number;
  color: number;
  engineTone: number;
  engineBass: number;
};

const queryClient = new QueryClient();
const INITIAL_CONTROLS: Controls = { forward: false, reverse: false, left: false, right: false, drift: false, boost: false };
const initialTelemetry: Telemetry = { speed: 0, heading: 0, distance: 0, x: 0, z: 0, boost: 100, inVehicle: true, nearVehicle: true };

const SEASONS: SeasonProfile[] = [
  { id: 'summer', label: 'Summer', short: 'SUN', sky: 0x102e4a, fog: 0x183d4b, ground: 0x1b4a43, road: 0x202c3a, water: 0x0a4961, tree: 0x267566, accent: 0x55f5dc, icon: Sun },
  { id: 'autumn', label: 'Autumn', short: 'FALL', sky: 0x402c39, fog: 0x633f3c, ground: 0x614c37, road: 0x3b3030, water: 0x244b51, tree: 0xa9633f, accent: 0xffb36b, icon: Leaf },
  { id: 'snow', label: 'Snow', short: 'SNOW', sky: 0x607b91, fog: 0x8aa1ae, ground: 0x9aaab0, road: 0x384451, water: 0x3e7087, tree: 0x577d82, accent: 0xbdefff, icon: CloudSnow },
];

const CAR_PROFILES: CarProfile[] = [
  { id: 'sprinter', name: 'Aster Sprinter', label: 'street / agile', maxKmh: 228, accel: 34, handling: 1.12, color: 0x19bdb0, engineTone: 1.08, engineBass: 0.86 },
  { id: 'grandTourer', name: 'Vanta GT', label: 'grand tourer', maxKmh: 286, accel: 43, handling: 0.96, color: 0xd87a59, engineTone: 0.94, engineBass: 1.12 },
  { id: 'velocity', name: 'Velocity R', label: 'track / high speed', maxKmh: 342, accel: 56, handling: 0.88, color: 0xc9e6ef, engineTone: 1.28, engineBass: 0.72 },
];

function makeGlowMaterial(color: number, emissiveIntensity = 1.3) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity, roughness: 0.38, metalness: 0.35 });
}

function applyMaterialColor(object: THREE.Object3D | undefined, color: number) {
  if (!object) return;
  const material = (object as THREE.Mesh).material;
  if (material && !Array.isArray(material) && 'color' in material) (material as THREE.MeshStandardMaterial).color.setHex(color);
}

function createWorld(scene: THREE.Scene, initialSeason: SeasonId) {
  const world = new THREE.Group();
  world.name = 'neon-world';
  const season = SEASONS.find((item) => item.id === initialSeason) ?? SEASONS[0];

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(640, 640, 32, 32), new THREE.MeshStandardMaterial({ color: season.ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.24;
  ground.name = 'season-ground';
  world.add(ground);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(210, 320, 16, 16),
    new THREE.MeshStandardMaterial({ color: season.water, emissive: 0x06243b, emissiveIntensity: 0.45, metalness: 0.82, roughness: 0.12, transparent: true, opacity: 0.9 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(180, -0.04, 28);
  water.name = 'season-water';
  world.add(water);

  const roadMaterial = new THREE.MeshStandardMaterial({ color: season.road, roughness: 0.78, metalness: 0.12 });
  const roads: Array<[number, number, number, number]> = [[0, 0, 12, 520], [0, -72, 380, 11], [-118, 88, 250, 11], [118, 146, 230, 11], [-160, -150, 9, 190], [72, -188, 10, 170]];
  roads.forEach(([x, z, width, depth], index) => {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.01, z);
    road.name = `road-${index}`;
    world.add(road);
    const horizontal = width > depth;
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? width : 0.18, horizontal ? 0.19 : depth), makeGlowMaterial(season.accent, 0.42));
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, 0.026, z);
    world.add(edge);
    const dashCount = Math.floor((horizontal ? width : depth) / 12);
    for (let dash = 0; dash < dashCount; dash += 1) {
      const marker = new THREE.Mesh(new THREE.PlaneGeometry(horizontal ? 5.4 : 0.18, horizontal ? 0.18 : 5.4), new THREE.MeshStandardMaterial({ color: 0xb9dbd7, emissive: season.accent, emissiveIntensity: 0.14, roughness: 0.5 }));
      marker.rotation.x = -Math.PI / 2;
      if (horizontal) marker.position.set(x - width / 2 + 7 + dash * 12, 0.032, z);
      else marker.position.set(x, 0.032, z - depth / 2 + 7 + dash * 12);
      world.add(marker);
    }
  });

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(155, 0.9, 16), new THREE.MeshStandardMaterial({ color: 0x334955, roughness: 0.57, metalness: 0.5 }));
  bridge.position.set(180, 1.5, 118);
  world.add(bridge);
  for (let i = -4; i <= 4; i += 1) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.4, 1.1), makeGlowMaterial(season.accent, 0.66));
    beam.position.set(180 + i * 17, 3.3, 109);
    world.add(beam);
    world.add(beam.clone().translateZ(18));
  }

  const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x345b5a, roughness: 1 });
  [[-225, -215, 70], [-208, 182, 58], [68, -242, 46], [-28, 222, 62], [112, 38, 35]].forEach(([x, z, radius], index) => {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * (0.45 + (index % 3) * 0.16), 9), hillMaterial);
    hill.position.set(x, radius * 0.18, z);
    hill.rotation.y = index * 0.7;
    world.add(hill);
  });

  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.64, 4.4, 6), new THREE.MeshStandardMaterial({ color: 0x51413e, roughness: 1 }), 110);
  const topMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(2.8, 8, 8), new THREE.MeshStandardMaterial({ color: season.tree, emissive: 0x092f3b, emissiveIntensity: 0.22, roughness: 0.92 }), 110);
  const treeMatrix = new THREE.Matrix4();
  for (let i = 0; i < 110; i += 1) {
    const angle = i * 2.399;
    const radius = 58 + ((i * 47) % 210);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    if (Math.abs(x) < 18 || Math.abs(z + 72) < 13 || x > 120) continue;
    const scale = 0.7 + ((i * 17) % 50) / 100;
    treeMatrix.makeTranslation(x, 2.1, z);
    treeMatrix.scale(new THREE.Vector3(scale, scale, scale));
    trunkMesh.setMatrixAt(i, treeMatrix);
    treeMatrix.makeTranslation(x, 7.4 * scale, z);
    treeMatrix.scale(new THREE.Vector3(scale, scale, scale));
    topMesh.setMatrixAt(i, treeMatrix);
  }
  world.add(trunkMesh, topMesh);

  const buildingGroup = new THREE.Group();
  buildingGroup.name = 'city-buildings';
  const buildingMats = [0x2d425c, 0x4b3c52, 0x27535c].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.34 }));
  for (let i = 0; i < 31; i += 1) {
    const angle = i * 2.18;
    const x = -146 + (i % 6) * 18 + Math.sin(i) * 4;
    const z = -42 + Math.floor(i / 6) * 19 + Math.cos(angle) * 4;
    const width = 9 + (i % 3) * 3;
    const height = 9 + ((i * 13) % 32);
    const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, 10 + (i % 4) * 2), buildingMats[i % buildingMats.length]);
    building.position.set(x, height / 2, z);
    buildingGroup.add(building);
    for (let row = 0; row < Math.min(5, Math.floor(height / 7)); row += 1) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(width * 0.64, 0.28, 0.08), makeGlowMaterial(i % 2 ? 0x78d7e3 : 0xffbd69, 0.55));
      window.position.set(x, 3.5 + row * 6, z - 5.05);
      buildingGroup.add(window);
    }
  }
  world.add(buildingGroup);

  const tower = new THREE.Group();
  tower.name = 'lookout-landmark';
  const towerDeck = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1.2, 16), makeGlowMaterial(0x3de9da, 0.75));
  towerDeck.position.y = 20;
  tower.add(towerDeck);
  for (let i = 0; i < 4; i += 1) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 20, 6), new THREE.MeshStandardMaterial({ color: 0x60798b, metalness: 0.72, roughness: 0.3 }));
    leg.position.set(Math.cos(i * Math.PI / 2) * 5.2, 10, Math.sin(i * Math.PI / 2) * 5.2);
    tower.add(leg);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 16), makeGlowMaterial(0xff6cbd, 2.4));
  beacon.position.y = 27;
  tower.add(beacon, new THREE.PointLight(0xff6cbd, 25, 70));
  tower.position.set(-42, 0, -172);
  world.add(tower);

  const arch = new THREE.Group();
  const archColor = makeGlowMaterial(0xff6cbd, 1.1);
  const archL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 18, 1.8), archColor);
  archL.position.set(-5.7, 9, 0);
  const archR = archL.clone();
  archR.position.x = 5.7;
  const archTop = new THREE.Mesh(new THREE.BoxGeometry(13.2, 1.8, 1.8), archColor);
  archTop.position.y = 18;
  arch.add(archL, archR, archTop);
  arch.position.set(0, 0, -72);
  world.add(arch);

  const streetLights = new THREE.Group();
  for (let i = -6; i <= 6; i += 1) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6, 5), new THREE.MeshStandardMaterial({ color: 0x5b6e7c, metalness: 0.72 }));
    pole.position.set(i * 28, 3, -65);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), makeGlowMaterial(0xffd166, 1.45));
    lamp.position.set(i * 28, 6, -65);
    streetLights.add(pole, lamp);
  }
  world.add(streetLights);

  const particlePositions = new Float32Array(240 * 3);
  for (let i = 0; i < 240; i += 1) {
    particlePositions[i * 3] = ((i * 73) % 560) - 280;
    particlePositions[i * 3 + 1] = ((i * 37) % 38) + 2;
    particlePositions[i * 3 + 2] = ((i * 113) % 560) - 280;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: season.accent, size: 0.16, transparent: true, opacity: 0.18, depthWrite: false }));
  particles.name = 'season-particles';
  world.add(particles);

  world.userData.applySeason = (nextId: SeasonId) => {
    const next = SEASONS.find((item) => item.id === nextId) ?? SEASONS[0];
    applyMaterialColor(ground, next.ground);
    applyMaterialColor(water, next.water);
    applyMaterialColor(trunkMesh, next.id === 'snow' ? 0x687a7b : next.id === 'autumn' ? 0x563b35 : 0x51413e);
    applyMaterialColor(topMesh, next.tree);
    const particleMaterial = particles.material as THREE.PointsMaterial;
    particleMaterial.color.setHex(next.accent);
    particleMaterial.opacity = next.id === 'summer' ? 0.08 : next.id === 'autumn' ? 0.5 : 0.74;
    particleMaterial.size = next.id === 'snow' ? 0.32 : next.id === 'autumn' ? 0.22 : 0.12;
    roadMaterial.color.setHex(next.road);
    scene.background = new THREE.Color(next.sky);
    scene.fog = new THREE.Fog(next.fog, next.id === 'snow' ? 74 : 115, next.id === 'snow' ? 285 : 380);
  };
  world.userData.applySeason(initialSeason);
  scene.add(world);
  return world;
}

function createVehicle(scene: THREE.Scene, profile: CarProfile) {
  const vehicle = new THREE.Group();
  vehicle.name = 'player-vehicle';
  vehicle.userData.profile = profile.id;

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-1.8, 0.34);
  bodyShape.quadraticCurveTo(-1.95, 0.78, -1.6, 1.08);
  bodyShape.lineTo(-1.16, 1.22);
  bodyShape.quadraticCurveTo(-0.52, 1.52, 0, 1.48);
  bodyShape.quadraticCurveTo(0.52, 1.52, 1.16, 1.22);
  bodyShape.lineTo(1.6, 1.08);
  bodyShape.quadraticCurveTo(1.95, 0.78, 1.8, 0.34);
  bodyShape.lineTo(1.52, 0);
  bodyShape.lineTo(-1.52, 0);
  bodyShape.closePath();
  const bodyGeometry = new THREE.ExtrudeGeometry(bodyShape, { depth: 7.2, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.13, bevelThickness: 0.1 });
  bodyGeometry.translate(0, 0.48, -3.6);
  const body = new THREE.Mesh(bodyGeometry, new THREE.MeshStandardMaterial({ color: profile.color, emissive: 0x082e35, emissiveIntensity: 0.7, metalness: 0.86, roughness: 0.2 }));
  body.name = 'car-body';
  body.position.y = 0.42;
  vehicle.add(body);

  const hood = new THREE.Mesh(new THREE.CapsuleGeometry(1.52, 2.1, 4, 12), new THREE.MeshStandardMaterial({ color: profile.color, metalness: 0.9, roughness: 0.18 }));
  hood.name = 'car-hood';
  hood.rotation.x = Math.PI / 2;
  hood.scale.set(1, 0.22, 1);
  hood.position.set(0, 1.63, -2.0);
  vehicle.add(hood);

  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.3, 0);
  cabinShape.quadraticCurveTo(-1.1, 1.2, -0.55, 1.55);
  cabinShape.lineTo(0.48, 1.55);
  cabinShape.quadraticCurveTo(1.14, 1.18, 1.3, 0);
  cabinShape.closePath();
  const cabinGeometry = new THREE.ExtrudeGeometry(cabinShape, { depth: 2.75, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.08, bevelThickness: 0.08 });
  cabinGeometry.translate(0, 0, -1.1);
  const cabin = new THREE.Mesh(cabinGeometry, new THREE.MeshStandardMaterial({ color: 0x101d2d, emissive: 0x071622, emissiveIntensity: 0.72, metalness: 0.76, roughness: 0.13, transparent: true, opacity: 0.92 }));
  cabin.name = 'car-cabin';
  cabin.position.y = 1.68;
  vehicle.add(cabin);

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(2.18, 0.96), new THREE.MeshStandardMaterial({ color: 0x8bd5e0, emissive: 0x245a69, emissiveIntensity: 0.65, transparent: true, opacity: 0.58, metalness: 0.56, roughness: 0.08 }));
  windshield.name = 'car-windshield';
  windshield.position.set(0, 2.3, -1.14);
  windshield.rotation.x = -0.14;
  vehicle.add(windshield);

  const highlight = makeGlowMaterial(0x8fffee, 0.85);
  [-1, 1].forEach((side) => {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 5.7), highlight);
    sill.position.set(side * 1.78, 0.94, 0.05);
    vehicle.add(sill);
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: profile.color, metalness: 0.75, roughness: 0.18 }));
    mirror.scale.set(0.8, 0.45, 1.35);
    mirror.position.set(side * 1.57, 1.92, -0.72);
    vehicle.add(mirror);
  });

  const tireGeometry = new THREE.TorusGeometry(0.73, 0.23, 12, 20);
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x080d13, roughness: 0.86, metalness: 0.35 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xa3d8db, roughness: 0.21, metalness: 0.86 });
  [[-1.72, 0.75, -2.26], [1.72, 0.75, -2.26], [-1.72, 0.75, 2.25], [1.72, 0.75, 2.25]].forEach(([x, y, z], index) => {
    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
    tire.rotation.y = Math.PI / 2;
    tire.position.set(x, y, z);
    tire.name = `tire-${index}`;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.22, 16), rimMaterial);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x + (x > 0 ? 0.11 : -0.11), y, z);
    vehicle.add(tire, rim);
    for (let spoke = 0; spoke < 5; spoke += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.08), rimMaterial);
      bar.position.set(x + (x > 0 ? 0.13 : -0.13), y, z);
      bar.rotation.set(0, spoke * (Math.PI / 5), 0);
      vehicle.add(bar);
    }
  });

  const headlightMaterial = makeGlowMaterial(0xd9ffff, 2.4);
  const rearLightMaterial = makeGlowMaterial(0xff365d, 2.2);
  [-1.1, 1.1].forEach((x) => {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.24, 0.12), headlightMaterial);
    headlight.position.set(x, 1.16, -3.66);
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.2, 0.12), rearLightMaterial);
    taillight.position.set(x, 1.19, 3.66);
    vehicle.add(headlight, taillight);
  });
  const headlight = new THREE.SpotLight(0xe7ffff, 16, 44, Math.PI / 7, 0.46, 1.25);
  headlight.position.set(0, 1.2, -3.1);
  headlight.target.position.set(0, 0, -26);
  vehicle.add(headlight, headlight.target);

  const spoiler = new THREE.Group();
  const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.16, 0.52), makeGlowMaterial(0xff6cbd, 1.05));
  spoilerWing.position.y = 2.08;
  [-1.1, 1.1].forEach((x) => {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.72, 0.13), new THREE.MeshStandardMaterial({ color: 0x6f8493, metalness: 0.8 }));
    support.position.set(x, 1.72, 3.05);
    spoiler.add(support);
  });
  spoiler.add(spoilerWing);
  vehicle.add(spoiler);

  const underglow = new THREE.PointLight(0x55f5dc, 5, 15);
  underglow.position.y = 0.14;
  vehicle.add(underglow);
  const underStrip = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.035, 5.4), makeGlowMaterial(0x55f5dc, 0.7));
  underStrip.position.y = 0.14;
  vehicle.add(underStrip);

  vehicle.userData.applyProfile = (next: CarProfile) => {
    vehicle.userData.profile = next.id;
    applyMaterialColor(body, next.color);
    applyMaterialColor(hood, next.color);
    applyMaterialColor(cabin, 0x101d2d);
  };
  vehicle.userData.applyProfile(profile);
  scene.add(vehicle);
  return vehicle;
}

function createOnFootAvatar(scene: THREE.Scene) {
  const avatar = new THREE.Group();
  avatar.name = 'on-foot-avatar';
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.82, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0xff6cbd, emissive: 0x5c183f, emissiveIntensity: 0.7, roughness: 0.46, metalness: 0.18 }),
  );
  body.position.y = 0.8;
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x9cf8ef, emissive: 0x1a6663, emissiveIntensity: 0.8, roughness: 0.18, metalness: 0.55 }),
  );
  helmet.position.y = 1.62;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.7, 24),
    new THREE.MeshBasicMaterial({ color: 0x55f5dc, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  avatar.add(body, helmet, ring);
  avatar.visible = false;
  scene.add(avatar);
  return avatar;
}

class ProceduralAudio {
  private context: AudioContext | null = null;
  private engine: OscillatorNode | null = null;
  private engineHarmonic: OscillatorNode | null = null;
  private boostOscillator: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private harmonicGain: GainNode | null = null;
  private boostGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private muted = false;
  private started = false;

  start() {
    if (this.started) return true;
    try {
      const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return false;
      this.context = new AudioCtor();
      const ctx = this.context;
      this.engine = ctx.createOscillator();
      this.engine.type = 'sawtooth';
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0.0001;
      this.engine.connect(this.engineGain).connect(ctx.destination);
      this.engine.start();
      this.engineHarmonic = ctx.createOscillator();
      this.engineHarmonic.type = 'triangle';
      this.harmonicGain = ctx.createGain();
      this.harmonicGain.gain.value = 0.0001;
      this.engineHarmonic.connect(this.harmonicGain).connect(ctx.destination);
      this.engineHarmonic.start();
      this.boostOscillator = ctx.createOscillator();
      this.boostOscillator.type = 'sine';
      this.boostGain = ctx.createGain();
      this.boostGain.gain.value = 0.0001;
      this.boostOscillator.connect(this.boostGain).connect(ctx.destination);
      this.boostOscillator.start();

      const wind = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.35;
      wind.buffer = buffer;
      wind.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 840;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0.0001;
      wind.connect(filter).connect(this.windGain).connect(ctx.destination);
      wind.start();

      const ambience = ctx.createOscillator();
      ambience.type = 'sine';
      ambience.frequency.value = 184;
      this.ambienceGain = ctx.createGain();
      this.ambienceGain.gain.value = 0.0001;
      ambience.connect(this.ambienceGain).connect(ctx.destination);
      ambience.start();
      this.started = true;
      void ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.context) {
      const now = this.context.currentTime;
      [this.engineGain, this.harmonicGain, this.boostGain, this.windGain, this.ambienceGain].forEach((gain) => gain?.gain.setTargetAtTime(muted ? 0.0001 : 0.18, now, 0.04));
    }
  }

  update(speedKmh: number, throttle: number, season: SeasonId, profile: CarProfile, boosting = false) {
    if (!this.started || !this.context || !this.engine || this.muted) return;
    const now = this.context.currentTime;
    const normalized = Math.min(1, speedKmh / profile.maxKmh);
    const rpm = (58 + normalized * 286 + Math.abs(throttle) * 42) * profile.engineTone;
    this.engine.frequency.setTargetAtTime(rpm, now, 0.035);
    this.engineHarmonic?.frequency.setTargetAtTime(rpm * 1.98, now, 0.035);
    this.boostOscillator?.frequency.setTargetAtTime(110 + normalized * 180, now, 0.04);
    this.engineGain?.gain.setTargetAtTime(0.035 + normalized * 0.14 + Math.abs(throttle) * 0.075, now, 0.05);
    this.harmonicGain?.gain.setTargetAtTime(0.012 + normalized * 0.052 * profile.engineBass, now, 0.05);
    this.boostGain?.gain.setTargetAtTime(boosting ? 0.08 + normalized * 0.08 : 0.0001, now, 0.04);
    this.windGain?.gain.setTargetAtTime(normalized * 0.14, now, 0.12);
    this.ambienceGain?.gain.setTargetAtTime(season === 'summer' ? 0.027 : season === 'autumn' ? 0.018 : 0.01, now, 0.25);
  }

  dispose() {
    try { this.engine?.stop(); } catch { /* oscillator may already be stopped */ }
    try { this.engineHarmonic?.stop(); } catch { /* oscillator may already be stopped */ }
    try { this.boostOscillator?.stop(); } catch { /* oscillator may already be stopped */ }
    void this.context?.close();
    this.context = null;
    this.started = false;
  }
}

function formatHeading(heading: number) {
  const value = Math.round((heading * 180) / Math.PI);
  return String((value + 360) % 360).padStart(3, '0');
}

function drawFallbackWorld(ctx: CanvasRenderingContext2D, width: number, height: number, motion: FallbackMotion, focus: PositionState, paused: boolean, missionDone: boolean, seasonId: SeasonId, inVehicle: boolean) {
  const profile = SEASONS.find((item) => item.id === seasonId) ?? SEASONS[0];
  const palette = seasonId === 'snow'
    ? { top: '#506c82', middle: '#8ba0ad', bottom: '#405363', ground: '#aab9bc', road: '#34414d', tree: '#577d82' }
    : seasonId === 'autumn'
      ? { top: '#3c2736', middle: '#68423c', bottom: '#2b272e', ground: '#674b39', road: '#3a3031', tree: '#b16640' }
      : { top: '#071824', middle: '#102d37', bottom: '#07121e', ground: '#174c47', road: '#192a3a', tree: '#3c8c7e' };
  const zoom = Math.min(width, height) / 620;
  const centerX = width / 2;
  const centerY = height / 2 + 18;
  const point = (x: number, z: number) => ({ x: centerX + (x - focus.x) * zoom, y: centerY + (z - focus.z) * zoom });
  const rect = (x: number, z: number, w: number, d: number, fill: string, stroke?: string) => {
    const topLeft = point(x - w / 2, z - d / 2);
    ctx.fillStyle = fill;
    ctx.fillRect(topLeft.x, topLeft.y, w * zoom, d * zoom);
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, zoom * 1.5); ctx.strokeRect(topLeft.x, topLeft.y, w * zoom, d * zoom); }
  };
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, palette.top); gradient.addColorStop(0.55, palette.middle); gradient.addColorStop(1, palette.bottom);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.14; ctx.strokeStyle = profile.accent === 0xbdefff ? '#dffaff' : '#72e9e0'; ctx.lineWidth = 1;
  for (let x = -300; x <= 300; x += 24) { const a = point(x, -300); const b = point(x, 300); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (let z = -300; z <= 300; z += 24) { const a = point(-300, z); const b = point(300, z); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.globalAlpha = 1;
  rect(188, 28, 210, 330, seasonId === 'snow' ? '#345e70' : '#082a45', '#3d9daf');
  rect(0, 0, 12, 520, palette.road, '#3abcb5'); rect(0, -72, 380, 11, palette.road, '#3abcb5'); rect(-118, 88, 250, 11, palette.road, '#3abcb5'); rect(118, 146, 230, 11, palette.road, '#3abcb5'); rect(-160, -150, 9, 190, palette.road, '#3abcb5'); rect(72, -188, 10, 170, palette.road, '#3abcb5');
  [[-225, -215, 70], [-208, 182, 58], [68, -242, 46], [-28, 222, 62], [112, 38, 35]].forEach(([x, z, radius]) => { const p = point(x, z); ctx.fillStyle = '#315a5e'; ctx.beginPath(); ctx.arc(p.x, p.y, radius * zoom, 0, Math.PI * 2); ctx.fill(); });
  for (let i = 0; i < 27; i += 1) { const p = point(-146 + (i % 6) * 18, -42 + Math.floor(i / 6) * 19); const size = (9 + (i % 3) * 3) * zoom; ctx.fillStyle = i % 3 === 0 ? '#3f506d' : '#2a3d59'; ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size); ctx.fillStyle = i % 2 === 0 ? '#ffc36e' : '#55dce4'; ctx.globalAlpha = 0.7; ctx.fillRect(p.x - size * 0.25, p.y - size * 0.32, size * 0.5, Math.max(1, zoom * 1.2)); ctx.globalAlpha = 1; }
  for (let i = 0; i < 72; i += 1) { const angle = i * 2.399; const radius = 58 + ((i * 47) % 210); const x = Math.sin(angle) * radius; const z = Math.cos(angle) * radius; if (Math.abs(x) < 18 || Math.abs(z + 72) < 13 || x > 120) continue; const p = point(x, z); const treeSize = Math.max(2, (2.8 - (i % 3) * 0.3) * zoom); ctx.fillStyle = palette.tree; ctx.beginPath(); ctx.moveTo(p.x, p.y - treeSize * 2.3); ctx.lineTo(p.x - treeSize, p.y + treeSize); ctx.lineTo(p.x + treeSize, p.y + treeSize); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#684b53'; ctx.fillRect(p.x - zoom * 0.45, p.y + treeSize * 0.35, zoom * 0.9, treeSize); }
  const lookout = point(-42, -172); ctx.save(); ctx.shadowColor = '#ff6cbd'; ctx.shadowBlur = 22; ctx.fillStyle = missionDone ? '#55f5dc' : '#ff6cbd'; ctx.beginPath(); ctx.arc(lookout.x, lookout.y, Math.max(4, zoom * 6), 0, Math.PI * 2); ctx.fill(); ctx.restore();
   const vehiclePoint = point(motion.x, motion.z);
   ctx.save(); ctx.translate(vehiclePoint.x, vehiclePoint.y); ctx.rotate(motion.heading); ctx.shadowColor = '#55f5dc'; ctx.shadowBlur = 20; ctx.fillStyle = '#55f5dc'; ctx.beginPath(); ctx.moveTo(0, -13 * zoom); ctx.lineTo(9 * zoom, 12 * zoom); ctx.lineTo(0, 7 * zoom); ctx.lineTo(-9 * zoom, 12 * zoom); ctx.closePath(); ctx.fill(); ctx.restore();
   if (!inVehicle) {
     const playerPoint = point(focus.x, focus.z);
     ctx.save(); ctx.translate(playerPoint.x, playerPoint.y); ctx.fillStyle = '#ff6cbd'; ctx.shadowColor = '#ff6cbd'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(0, 0, Math.max(4, zoom * 4), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fff2fb'; ctx.stroke(); ctx.restore();
   }
  if (seasonId !== 'summer') { ctx.fillStyle = seasonId === 'snow' ? 'rgba(234,249,255,.8)' : 'rgba(246,166,106,.55)'; for (let i = 0; i < 36; i += 1) { const x = (i * 83 + performance.now() * (seasonId === 'snow' ? 0.03 : 0.01)) % width; const y = (i * 47 + performance.now() * 0.018) % height; ctx.fillRect(x, y, seasonId === 'snow' ? 2 : 3, seasonId === 'snow' ? 2 : 1); } }
  ctx.fillStyle = 'rgba(4, 11, 19, .72)'; ctx.fillRect(0, 0, width, 42); ctx.fillStyle = '#8cece4'; ctx.font = '600 11px "Chakra Petch", sans-serif'; ctx.fillText('COMPATIBILITY DRIVE VIEW  /  WORLD STREAM LIVE', 18, 26); if (paused) { ctx.fillStyle = 'rgba(4, 11, 19, .26)'; ctx.fillRect(0, 0, width, height); }
}

function MiniMap({ telemetry, open, onToggle }: { telemetry: Telemetry; open: boolean; onToggle: () => void }) {
  const left = 50 + telemetry.x * 0.72 * 0.17;
  const top = 50 + telemetry.z * 0.72 * 0.17;
  return (
    <div className={`pointer-events-auto absolute right-4 top-4 z-30 transition-all duration-300 sm:right-7 sm:top-6 ${open ? 'w-[min(360px,calc(100vw-2rem))]' : 'w-[174px]'}`}>
      <div className="hud-panel overflow-hidden rounded-sm">
        <div className="flex items-center justify-between border-b border-cyan-200/10 px-3 py-2"><div className="flex items-center gap-2"><MapIcon size={14} className="text-[#55f5dc]" /><span className="hud-label">atlas / sector 07</span></div><button type="button" onClick={onToggle} className="hud-button h-7 rounded-sm px-2" data-testid="button-toggle-map" aria-label={open ? 'Close map' : 'Open map'}>{open ? <><X size={13} /><span className="ml-1 text-[9px] uppercase tracking-[.12em]">close</span></> : <LocateFixed size={13} />}</button></div>
        <div className={`map-grid relative overflow-hidden ${open ? 'h-[220px]' : 'h-[132px]'}`} data-testid="map-world">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-70"><path d="M14 0C32 22 25 37 42 50s21 26 8 50" stroke="#244f62" strokeWidth="15" fill="none" /><path d="M0 45C24 42 38 49 100 39" stroke="#4cd9ca" strokeOpacity=".75" strokeWidth="1.5" fill="none" /><path d="M20 70C40 60 55 72 98 65" stroke="#4cd9ca" strokeOpacity=".5" strokeWidth="1.2" fill="none" /><path d="M71 0L61 100" stroke="#4cd9ca" strokeOpacity=".45" strokeWidth="1" fill="none" /><path d="M5 83L92 12" stroke="#d16ca6" strokeOpacity=".42" strokeWidth="1" fill="none" /><circle cx="36" cy="78" r="3" fill="#ff6cbd" /><circle cx="36" cy="78" r="7" fill="none" stroke="#ff6cbd" strokeOpacity=".45" /><rect x="69" y="18" width="12" height="13" fill="#427082" fillOpacity=".5" /></svg>
          <div className="absolute h-2.5 w-2.5 rounded-full border border-[#081019] bg-[#55f5dc] shadow-[0_0_13px_#55f5dc] transition-transform duration-75" style={{ left: `${Math.min(96, Math.max(4, left))}%`, top: `${Math.min(96, Math.max(4, top))}%`, transform: 'translate(-50%, -50%)' }} data-testid="map-player-marker" />
          <div className="absolute bottom-2 left-2 hud-label rounded-sm bg-[#07131d]/70 px-1.5 py-1">north / live</div>
        </div>
      </div>
    </div>
  );
}

function TouchControls({ setControl, toggleVehicle }: { setControl: (control: keyof Controls, active: boolean) => void; toggleVehicle: () => void }) {
  const button = (control: keyof Controls, label: string, className: string) => <button type="button" className={`touch-button hud-panel flex h-14 w-14 items-center justify-center rounded-full text-xs font-semibold text-cyan-50/75 ${className}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setControl(control, true); }} onPointerUp={() => setControl(control, false)} onPointerCancel={() => setControl(control, false)} onPointerLeave={() => setControl(control, false)} data-testid={`touch-${control}`} aria-label={label}>{label}</button>;
  return <div className="pointer-events-auto absolute bottom-5 left-4 z-30 flex w-[calc(100%-2rem)] items-end justify-between sm:hidden"><div className="grid grid-cols-3 gap-2"><div />{button('forward', 'GO', 'text-[#55f5dc]')}<div />{button('left', 'LEFT', '')}{button('reverse', 'BACK', 'text-[#ffb9d8]')}{button('right', 'RIGHT', '')}</div><div className="flex flex-col items-center gap-2">{button('boost', 'BOOST', 'h-12 w-12 text-[#ffd166]')}<button type="button" className="touch-button hud-panel flex h-10 w-20 items-center justify-center rounded-full text-[10px] font-semibold text-[#ff9dcf]" onClick={toggleVehicle} data-testid="touch-enter-exit">E / ENTER</button><span className="hud-label text-[8px]">touch drive</span></div></div>;
}

function GameScreen() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<Controls>({ ...INITIAL_CONTROLS });
  const vehicleRef = useRef<THREE.Group | null>(null);
  const playerRef = useRef<THREE.Group | null>(null);
  const worldRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const fallbackMotionRef = useRef<FallbackMotion>({ x: 0, z: 0, heading: 0, velocity: 0, distance: 0 });
  const fallbackPlayerRef = useRef<PositionState>({ x: 3, z: 0, heading: 0 });
  const frameRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const inVehicleRef = useRef(true);
  const boostRef = useRef(100);
  const telemetryRef = useRef<Telemetry>(initialTelemetry);
  const seasonRef = useRef<SeasonId>('summer');
  const profileRef = useRef<CarProfile>(CAR_PROFILES[1]);
  const audioRef = useRef<ProceduralAudio | null>(null);
  const missionDoneRef = useRef(false);
  const [telemetry, setTelemetry] = useState<Telemetry>(initialTelemetry);
  const [paused, setPaused] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [missionDone, setMissionDone] = useState(false);
  const [season, setSeason] = useState<SeasonId>('summer');
  const [carId, setCarId] = useState<CarId>('grandTourer');
  const [muted, setMuted] = useState(false);
  const [inVehicle, setInVehicle] = useState(true);
  const [boost, setBoost] = useState(100);
  const [vehicleStatus, setVehicleStatus] = useState('DRIVE');
  const [garageOpen, setGarageOpen] = useState(true);

  const setPausedState = useCallback((value: boolean) => { pausedRef.current = value; setPaused(value); }, []);
  const startAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new ProceduralAudio();
    audioRef.current.start();
  }, []);
  const setControl = useCallback((control: keyof Controls, active: boolean) => { if (active) startAudio(); controlsRef.current[control] = active; }, [startAudio]);
  const resetVehicle = useCallback(() => {
    vehicleRef.current?.position.set(0, 0, 0);
    if (vehicleRef.current) vehicleRef.current.rotation.y = 0;
    if (playerRef.current) {
      playerRef.current.position.set(3, 0, 0);
      playerRef.current.rotation.y = 0;
      playerRef.current.visible = false;
    }
    fallbackMotionRef.current = { x: 0, z: 0, heading: 0, velocity: 0, distance: 0 };
    fallbackPlayerRef.current = { x: 3, z: 0, heading: 0 };
    inVehicleRef.current = true;
    boostRef.current = 100;
    setInVehicle(true);
    setBoost(100);
    setVehicleStatus('DRIVE');
    telemetryRef.current = initialTelemetry; setTelemetry(initialTelemetry); missionDoneRef.current = false; setMissionDone(false);
  }, []);
  const cycleSeason = useCallback(() => { startAudio(); setSeason((current) => SEASONS[(SEASONS.findIndex((item) => item.id === current) + 1) % SEASONS.length].id); }, [startAudio]);
  const selectCar = useCallback((id: CarId) => { startAudio(); const profile = CAR_PROFILES.find((item) => item.id === id) ?? CAR_PROFILES[0]; profileRef.current = profile; setCarId(id); vehicleRef.current?.userData.applyProfile?.(profile); }, [startAudio]);
  const toggleMute = useCallback(() => { startAudio(); setMuted((value) => { const next = !value; audioRef.current?.setMuted(next); return next; }); }, [startAudio]);
  const toggleVehicle = useCallback(() => {
    startAudio();
    const vehicle = vehicleRef.current;
    const player = playerRef.current;
    const fallbackVehicle = fallbackMotionRef.current;
    const fallbackPlayer = fallbackPlayerRef.current;
    if (inVehicleRef.current) {
      if (vehicle && player) {
        fallbackPlayer.x = vehicle.position.x + 2.8;
        fallbackPlayer.z = vehicle.position.z + 1.4;
        fallbackPlayer.heading = vehicle.rotation.y;
        player.position.set(fallbackPlayer.x, 0, fallbackPlayer.z);
        player.rotation.y = fallbackPlayer.heading;
        player.visible = true;
      } else {
        fallbackPlayer.x = fallbackVehicle.x + 2.8;
        fallbackPlayer.z = fallbackVehicle.z + 1.4;
        fallbackPlayer.heading = fallbackVehicle.heading;
      }
      inVehicleRef.current = false;
      controlsRef.current = { ...INITIAL_CONTROLS };
      setInVehicle(false);
      setVehicleStatus('ON FOOT');
      return;
    }
    const distance = vehicle ? vehicle.position.distanceTo(player?.position ?? vehicle.position) : Math.hypot(fallbackPlayer.x - fallbackVehicle.x, fallbackPlayer.z - fallbackVehicle.z);
    if (distance > 7) {
      setVehicleStatus('MOVE CLOSER TO CAR');
      return;
    }
    inVehicleRef.current = true;
    if (player) player.visible = false;
    controlsRef.current = { ...INITIAL_CONTROLS };
    setInVehicle(true);
    setVehicleStatus('DRIVE');
  }, [startAudio]);

  useEffect(() => {
    seasonRef.current = season;
    worldRef.current?.userData.applySeason?.(season);
    sceneRef.current?.userData.applyLighting?.(season);
  }, [season]);

  useEffect(() => {
    audioRef.current = new ProceduralAudio();
    return () => { audioRef.current?.dispose(); audioRef.current = null; };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      const probe = document.createElement('canvas');
      const canUseWebGL = Boolean(probe.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) || probe.getContext('webgl', { failIfMajorPerformanceCaveat: true }));
      if (!canUseWebGL) throw new Error('WebGL unavailable');
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      const canvas = document.createElement('canvas');
      canvas.className = 'fallback-world';
      const context = canvas.getContext('2d');
      if (!context) return undefined;
      mount.appendChild(canvas);
      const motion = fallbackMotionRef.current;
      let lastTime = performance.now(); let totalDistance = 0; let lastHudUpdate = 0;
      const resize = () => { const pixelRatio = Math.min(window.devicePixelRatio, 2); canvas.width = Math.floor(mount.clientWidth * pixelRatio); canvas.height = Math.floor(mount.clientHeight * pixelRatio); canvas.style.width = `${mount.clientWidth}px`; canvas.style.height = `${mount.clientHeight}px`; context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); };
      const tick = (now: number) => {
        const dt = Math.min(0.04, (now - lastTime) / 1000); lastTime = now; const input = controlsRef.current; const profile = profileRef.current;
        if (!pausedRef.current) {
          if (inVehicleRef.current) {
            const boosting = input.boost && boostRef.current > 0;
            const throttle = input.forward ? 1 : input.reverse ? -0.72 : 0;
            const drag = input.drift ? 0.78 : 0.91;
            motion.velocity += throttle * profile.accel * (boosting ? 1.85 : 1) * dt;
            motion.velocity *= Math.pow(drag, dt * 20);
            if (!input.forward && !input.reverse) motion.velocity *= Math.pow(0.86, dt * 20);
            if (boosting) boostRef.current = Math.max(0, boostRef.current - 30 * dt);
            else boostRef.current = Math.min(100, boostRef.current + 12 * dt);
            const speedLimit = profile.maxKmh / 3.6 * (boosting ? 1.24 : 1);
            motion.velocity = Math.max(-profile.maxKmh / 3.6 * 0.34, Math.min(speedLimit, motion.velocity));
            const steering = (input.left ? 1 : 0) - (input.right ? 1 : 0);
            motion.heading += steering * (0.35 + Math.min(Math.abs(motion.velocity) / 35, 1) * profile.handling) * (input.drift ? 1.55 : 1) * dt * (motion.velocity >= 0 ? 1 : -1);
            const dx = -Math.sin(motion.heading) * motion.velocity * dt; const dz = -Math.cos(motion.heading) * motion.velocity * dt;
            motion.x = Math.max(-290, Math.min(290, motion.x + dx)); motion.z = Math.max(-290, Math.min(290, motion.z + dz)); totalDistance += Math.hypot(dx, dz); motion.distance = totalDistance;
          } else {
            boostRef.current = Math.min(100, boostRef.current + 12 * dt);
            const steering = (input.left ? 1 : 0) - (input.right ? 1 : 0);
            fallbackPlayerRef.current.heading += steering * 2.2 * dt;
            const walking = input.forward ? 1 : input.reverse ? -1 : 0;
            fallbackPlayerRef.current.x = Math.max(-290, Math.min(290, fallbackPlayerRef.current.x - Math.sin(fallbackPlayerRef.current.heading) * walking * 8 * dt));
            fallbackPlayerRef.current.z = Math.max(-290, Math.min(290, fallbackPlayerRef.current.z - Math.cos(fallbackPlayerRef.current.heading) * walking * 8 * dt));
          }
        }
        const focus = inVehicleRef.current ? motion : fallbackPlayerRef.current;
        audioRef.current?.update(inVehicleRef.current ? Math.abs(motion.velocity) * 3.6 : 0, input.forward ? 1 : input.reverse ? -1 : 0, seasonRef.current, profile, input.boost && inVehicleRef.current);
        if (now - lastHudUpdate > 80) {
          lastHudUpdate = now;
          const nearVehicle = Math.hypot(fallbackPlayerRef.current.x - motion.x, fallbackPlayerRef.current.z - motion.z) < 7;
          const next = { speed: inVehicleRef.current ? Math.round(Math.abs(motion.velocity) * 3.6) : 0, heading: focus.heading, distance: motion.distance, x: focus.x, z: focus.z, boost: boostRef.current, inVehicle: inVehicleRef.current, nearVehicle };
          telemetryRef.current = next; setTelemetry(next); setBoost(Math.round(boostRef.current));
          if (Math.hypot(motion.x + 42, motion.z + 172) < 15 && !missionDoneRef.current) { missionDoneRef.current = true; setMissionDone(true); }
        }
        drawFallbackWorld(context, mount.clientWidth, mount.clientHeight, motion, focus, pausedRef.current, missionDoneRef.current, seasonRef.current, inVehicleRef.current); frameRef.current = requestAnimationFrame(tick);
      };
      const handleKey = (event: KeyboardEvent, active: boolean) => { const key = event.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'e', 'r', 'm', 'escape', 'h', 't', 'v'].includes(key)) event.preventDefault(); if (key === 'w' || key === 'arrowup') setControl('forward', active); if (key === 's' || key === 'arrowdown') setControl('reverse', active); if (key === 'a' || key === 'arrowleft') setControl('left', active); if (key === 'd' || key === 'arrowright') setControl('right', active); if (key === ' ') setControl('drift', active); if (key === 'shift') setControl('boost', active); if (active && key === 'e') toggleVehicle(); if (active && key === 'r') resetVehicle(); if (active && key === 'm') setMapOpen((value) => !value); if (active && key === 't') cycleSeason(); if (active && key === 'v') toggleMute(); if (active && (key === 'escape' || key === 'h')) setPausedState(!pausedRef.current); };
      const keyDown = (event: KeyboardEvent) => handleKey(event, true); const keyUp = (event: KeyboardEvent) => handleKey(event, false);
      resize(); frameRef.current = requestAnimationFrame(tick); window.addEventListener('resize', resize); window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
      return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); window.removeEventListener('resize', resize); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); mount.removeChild(canvas); };
    }

    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(61, mount.clientWidth / mount.clientHeight, 0.1, 700);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6)); renderer.setSize(mount.clientWidth, mount.clientHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; mount.appendChild(renderer.domElement);
    const hemi = new THREE.HemisphereLight(0x8fdce2, 0x101521, 1.8); const sun = new THREE.DirectionalLight(0xffd7aa, 2.5); sun.position.set(-90, 140, 50); sun.castShadow = true; scene.add(hemi, sun);
    sceneRef.current = scene;
    scene.userData.applyLighting = (nextId: SeasonId) => {
      const next = SEASONS.find((item) => item.id === nextId) ?? SEASONS[0];
      if (next.id === 'summer') {
        hemi.color.setHex(0x8fdce2); hemi.groundColor.setHex(0x101521); sun.color.setHex(0xffd7aa); sun.intensity = 2.5;
      } else if (next.id === 'autumn') {
        hemi.color.setHex(0xd09a84); hemi.groundColor.setHex(0x251b22); sun.color.setHex(0xffa66e); sun.intensity = 2.1;
      } else {
        hemi.color.setHex(0xc9edff); hemi.groundColor.setHex(0x405363); sun.color.setHex(0xd7eeff); sun.intensity = 2.7;
      }
    };
    scene.userData.applyLighting(seasonRef.current);
    const world = createWorld(scene, seasonRef.current); worldRef.current = world; const vehicle = createVehicle(scene, profileRef.current); vehicleRef.current = vehicle; const player = createOnFootAvatar(scene); playerRef.current = player;
    let totalDistance = 0; let lastHudUpdate = 0; let lastTime = performance.now(); const lastPosition = new THREE.Vector3(); const velocity = { current: 0 };
    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - lastTime) / 1000); lastTime = now; const input = controlsRef.current; const profile = profileRef.current;
      if (!pausedRef.current) {
        if (inVehicleRef.current) {
          const boosting = input.boost && boostRef.current > 0;
          const throttle = input.forward ? 1 : input.reverse ? -0.72 : 0;
          const drag = input.drift ? 0.78 : 0.91;
          velocity.current += throttle * profile.accel * (boosting ? 1.85 : 1) * dt;
          velocity.current *= Math.pow(drag, dt * 20);
          if (!input.forward && !input.reverse) velocity.current *= Math.pow(0.86, dt * 20);
          if (boosting) boostRef.current = Math.max(0, boostRef.current - 30 * dt);
          else boostRef.current = Math.min(100, boostRef.current + 12 * dt);
          const speedLimit = profile.maxKmh / 3.6 * (boosting ? 1.24 : 1);
          velocity.current = THREE.MathUtils.clamp(velocity.current, -profile.maxKmh / 3.6 * 0.34, speedLimit);
          const steering = (input.left ? 1 : 0) - (input.right ? 1 : 0);
          vehicle.rotation.y += steering * (0.35 + Math.min(Math.abs(velocity.current) / 35, 1) * profile.handling) * (input.drift ? 1.55 : 1) * dt * (velocity.current >= 0 ? 1 : -1);
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicle.quaternion);
          vehicle.position.addScaledVector(forward, velocity.current * dt);
          vehicle.position.x = THREE.MathUtils.clamp(vehicle.position.x, -290, 290);
          vehicle.position.z = THREE.MathUtils.clamp(vehicle.position.z, -290, 290);
          vehicle.position.y = Math.sin(now * 0.006) * Math.min(Math.abs(velocity.current) / 60, 0.06);
          const traveled = vehicle.position.distanceTo(lastPosition); if (traveled > 0.001) totalDistance += traveled; lastPosition.copy(vehicle.position);
          vehicle.rotation.z = THREE.MathUtils.lerp(vehicle.rotation.z, -steering * Math.min(Math.abs(velocity.current) / 28, 1) * 0.08, 0.14);
        } else {
          boostRef.current = Math.min(100, boostRef.current + 12 * dt);
          velocity.current *= Math.pow(0.08, dt * 10);
          const steering = (input.left ? 1 : 0) - (input.right ? 1 : 0);
          player.rotation.y += steering * 2.2 * dt;
          const walking = input.forward ? 1 : input.reverse ? -1 : 0;
          player.position.x = THREE.MathUtils.clamp(player.position.x - Math.sin(player.rotation.y) * walking * 8 * dt, -290, 290);
          player.position.z = THREE.MathUtils.clamp(player.position.z - Math.cos(player.rotation.y) * walking * 8 * dt, -290, 290);
          player.position.y = Math.abs(Math.sin(now * 0.012)) * (walking ? 0.05 : 0);
          vehicle.rotation.z = THREE.MathUtils.lerp(vehicle.rotation.z, 0, 0.12);
        }
      }
      audioRef.current?.update(inVehicleRef.current ? Math.abs(velocity.current) * 3.6 : 0, input.forward ? 1 : input.reverse ? -1 : 0, seasonRef.current, profile, input.boost && inVehicleRef.current);
      const focus = inVehicleRef.current ? vehicle : player;
      const shake = inVehicleRef.current ? Math.min(Math.abs(velocity.current) / 120, 0.18) * (input.boost ? 1.8 : input.drift ? 1.4 : 0.35) : 0;
      const followOffset = new THREE.Vector3(0, inVehicleRef.current ? 5.4 + shake : 3.4, inVehicleRef.current ? 11.8 : 6.8).applyQuaternion(focus.quaternion);
      const desiredCamera = focus.position.clone().add(followOffset); desiredCamera.x += Math.sin(now * 0.04) * shake; desiredCamera.y += Math.cos(now * 0.047) * shake * 0.6;
      camera.position.lerp(desiredCamera, 1 - Math.pow(0.001, dt));
      const lookTarget = focus.position.clone().add(new THREE.Vector3(0, inVehicleRef.current ? 1.15 : 1.1, inVehicleRef.current ? -5.3 : -2.8).applyQuaternion(focus.quaternion)); camera.lookAt(lookTarget);
      const beacon = scene.getObjectByName('lookout-landmark'); if (beacon) beacon.rotation.y += dt * 0.08; const particles = scene.getObjectByName('season-particles'); if (particles) particles.rotation.y += dt * (seasonRef.current === 'snow' ? 0.04 : 0.012);
      const nearVehicle = player.position.distanceTo(vehicle.position) < 7;
      const next: Telemetry = { speed: inVehicleRef.current ? Math.round(Math.abs(velocity.current) * 3.6) : 0, heading: focus.rotation.y, distance: totalDistance, x: focus.position.x, z: focus.position.z, boost: boostRef.current, inVehicle: inVehicleRef.current, nearVehicle };
      if (now - lastHudUpdate > 80) { lastHudUpdate = now; telemetryRef.current = next; setTelemetry(next); setBoost(Math.round(boostRef.current)); if (vehicle.position.distanceTo(new THREE.Vector3(-42, 0, -172)) < 15 && !missionDoneRef.current) { missionDoneRef.current = true; setMissionDone(true); } }
      renderer.render(scene, camera); frameRef.current = requestAnimationFrame(tick);
    };
    const resize = () => { camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth, mount.clientHeight); };
    const handleKey = (event: KeyboardEvent, active: boolean) => { const key = event.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'e', 'r', 'm', 'escape', 'h', 't', 'v'].includes(key)) event.preventDefault(); if (key === 'w' || key === 'arrowup') setControl('forward', active); if (key === 's' || key === 'arrowdown') setControl('reverse', active); if (key === 'a' || key === 'arrowleft') setControl('left', active); if (key === 'd' || key === 'arrowright') setControl('right', active); if (key === ' ') setControl('drift', active); if (key === 'shift') setControl('boost', active); if (active && key === 'e') toggleVehicle(); if (active && key === 'r') resetVehicle(); if (active && key === 'm') setMapOpen((value) => !value); if (active && key === 't') cycleSeason(); if (active && key === 'v') toggleMute(); if (active && (key === 'escape' || key === 'h')) setPausedState(!pausedRef.current); };
    const keyDown = (event: KeyboardEvent) => handleKey(event, true); const keyUp = (event: KeyboardEvent) => handleKey(event, false);
    resize(); frameRef.current = requestAnimationFrame(tick); window.addEventListener('resize', resize); window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); window.removeEventListener('resize', resize); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); renderer.dispose(); world.clear(); vehicle.clear(); player.clear(); worldRef.current = null; vehicleRef.current = null; playerRef.current = null; sceneRef.current = null; mount.removeChild(renderer.domElement); };
  }, [cycleSeason, resetVehicle, setControl, setPausedState, toggleMute, toggleVehicle]);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const distanceLabel = telemetry.distance > 1000 ? `${(telemetry.distance / 1000).toFixed(2)} km` : `${Math.round(telemetry.distance)} m`;
  const profile = profileRef.current;
  const activeSeason = SEASONS.find((item) => item.id === season) ?? SEASONS[0];
  const SeasonIcon = activeSeason.icon;

  return (
    <main className="game-shell text-[#dff8f7]">
      <div ref={mountRef} className="scene-layer" data-testid="three-world" /><div className="hud-vignette" /><div className="scanline" />
      <header className="pointer-events-none absolute left-4 top-4 z-30 sm:left-7 sm:top-6"><div className="flex items-start gap-3"><div className="mt-1 flex h-10 w-10 items-center justify-center border border-[#55f5dc]/70 bg-[#081019]/70 text-[#55f5dc] shadow-[0_0_24px_rgba(85,245,220,.16)]"><Navigation size={18} strokeWidth={1.5} /></div><div><div className="hud-label text-[#55f5dc]">free-roam driving playground</div><h1 className="hud-title mt-1 text-xl font-semibold leading-none tracking-[.16em] text-white sm:text-2xl">Neon Open World</h1><div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-cyan-100/45"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#55f5dc]" />world stream / live</div></div></div></header>
      <MiniMap telemetry={telemetry} open={mapOpen} onToggle={() => setMapOpen((value) => !value)} />

      <section className="pointer-events-auto absolute left-4 top-[138px] z-30 w-[min(270px,calc(100vw-2rem))] sm:left-7 sm:top-[154px]" aria-label="World weather and vehicle selection">
        <div className="hud-panel rounded-sm p-3">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><SeasonIcon size={14} className="text-[#ffd166]" /><span className="hud-label">atmosphere / {activeSeason.label}</span></div><button type="button" className="hud-button h-7 w-7 rounded-sm" onClick={cycleSeason} aria-label="Cycle weather" data-testid="button-cycle-season"><ChevronRight size={14} /></button></div>
          <div className="mt-2 grid grid-cols-3 gap-1">{SEASONS.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className="season-button flex flex-col items-center gap-1 rounded-sm px-1 py-2 text-[9px] uppercase tracking-[.12em]" data-active={season === item.id} onClick={() => setSeason(item.id)} data-testid={`button-season-${item.id}`}><Icon size={13} /><span>{item.short}</span></button>; })}</div>
          <div className="mt-3 border-t border-cyan-100/10 pt-3"><div className="flex items-center justify-between"><button type="button" onClick={() => setGarageOpen((value) => !value)} className="hud-button rounded-sm px-2 py-1 text-[9px] uppercase tracking-[.12em]" data-testid="button-toggle-garage" aria-expanded={garageOpen}><CarFront size={12} className="mr-1 text-[#55f5dc]" />{garageOpen ? 'hide fleet' : 'open fleet'}</button><span className="hud-mono text-[10px] text-[#ffd166]">{profile.maxKmh} km/h max</span></div>{garageOpen && <><div className="mt-2 grid grid-cols-3 gap-1">{CAR_PROFILES.map((item) => <button key={item.id} type="button" className="car-class-button rounded-sm px-1 py-2 text-left" data-active={carId === item.id} onClick={() => selectCar(item.id)} data-testid={`button-car-${item.id}`}><div className="flex items-center justify-between px-1"><CarFront size={12} className="text-[#55f5dc]" /><span className="hud-mono text-[9px] text-white/70">{item.maxKmh}</span></div><div className="mt-1 truncate px-1 text-[9px] uppercase tracking-[.09em] text-white/80">{item.id === 'grandTourer' ? 'GT' : item.id === 'velocity' ? 'R' : 'S'}</div></button>)}</div><div className="mt-2 text-[9px] uppercase tracking-[.1em] text-cyan-100/40">3 drive profiles / live engine tone</div></>}</div>
        </div>
      </section>

      <div className="pointer-events-auto absolute right-4 top-[176px] z-30 flex flex-col gap-2 sm:right-7 sm:top-[190px]"><button type="button" className="hud-button hud-panel h-9 w-9 rounded-sm" onClick={() => setPausedState(!paused)} data-testid="button-pause" aria-label="Pause game"><Pause size={15} /></button><button type="button" className="hud-button hud-panel h-9 w-9 rounded-sm" onClick={resetVehicle} data-testid="button-reset" aria-label="Reset vehicle"><RotateCcw size={15} /></button><button type="button" className="hud-button hud-panel h-9 w-9 rounded-sm" onClick={toggleMute} data-testid="button-audio" aria-label={muted ? 'Unmute procedural audio' : 'Mute procedural audio'}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button><button type="button" className="hud-button hud-panel h-9 w-9 rounded-sm" onClick={() => setHelpOpen(true)} data-testid="button-help" aria-label="Open help"><Info size={15} /></button><button type="button" className="hud-button hud-panel h-9 rounded-sm px-2 text-[9px] uppercase tracking-[.1em] text-[#ff9dcf]" onClick={toggleVehicle} data-testid="button-enter-exit" aria-label={inVehicle ? 'Exit vehicle' : 'Enter vehicle'}>{inVehicle ? 'exit' : telemetry.nearVehicle ? 'enter' : 'car'}</button></div>

      <section className="pointer-events-none absolute bottom-5 left-4 z-30 sm:bottom-7 sm:left-7" aria-label="Vehicle telemetry"><div className="hud-panel w-[220px] rounded-sm px-4 py-4 sm:w-[278px] sm:px-5 sm:py-5"><div className="flex items-center justify-between"><span className="hud-label">{inVehicle ? `velocity / ${profile.label}` : 'explorer / on foot'}</span><Gauge size={14} className="text-[#55f5dc]" /></div><div className="mt-4 flex items-end gap-2"><strong className="speed-value text-[#e8fffb]" data-testid="text-speed">{telemetry.speed}</strong><span className="mb-1 font-mono text-xs uppercase tracking-[.18em] text-cyan-100/55">km/h</span></div><div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-[.14em] text-cyan-100/42"><span>{vehicleStatus} / {inVehicle ? `max ${profile.maxKmh}` : telemetry.nearVehicle ? 'car nearby' : 'find your car'}</span><span className="flex items-center gap-1 text-[#ffd166]"><Zap size={11} />{boost > 1 ? 'boost ready' : 'recharging'}</span></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#ffd166] to-[#ff6cbd] transition-all duration-150" style={{ width: `${boost}%` }} /><div className="sr-only">Nitro {boost}%</div></div><div className="mt-1 flex justify-between text-[8px] uppercase tracking-[.12em] text-cyan-100/40"><span>NITRO / BOOST</span><span data-testid="text-boost">{Math.round(boost)}%</span></div><div className="neon-line mt-3" /><div className="mt-3 grid grid-cols-3 gap-3"><div><div className="hud-label">heading</div><div className="hud-mono mt-1 text-sm text-[#ffd166]" data-testid="text-heading">{formatHeading(telemetry.heading)}°</div></div><div><div className="hud-label">range</div><div className="hud-mono mt-1 text-sm text-[#55b7ff]" data-testid="text-distance">{distanceLabel}</div></div><div><div className="hud-label">audio</div><div className="hud-mono mt-1 text-sm text-[#ff8fca]" data-testid="status-audio">{muted ? 'muted' : 'live'}</div></div></div></div></section>

      <section className="pointer-events-none absolute bottom-5 right-4 z-30 sm:bottom-7 sm:right-7"><div className="hud-panel max-w-[275px] rounded-sm px-4 py-3 text-right sm:px-5"><div className="hud-label text-[#ff9dcf]">active route / lookout</div><div className="mt-1 text-sm font-medium text-white/90" data-testid="text-mission">{missionDone ? 'Signal found. Keep exploring.' : 'Find the pink beacon above the tideway.'}</div><div className="mt-2 flex items-center justify-end gap-2 text-[10px] uppercase tracking-[.12em] text-cyan-100/45"><span className={`h-1.5 w-1.5 rounded-full ${missionDone ? 'bg-[#55f5dc]' : 'bg-[#ff6cbd] animate-pulse'}`} />{missionDone ? 'objective complete' : 'optional objective'}</div></div></section>
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-5 text-[10px] uppercase tracking-[.16em] text-cyan-100/50 sm:flex"><span><kbd className="mr-1 border border-cyan-100/20 px-1.5 py-0.5 text-cyan-100/80">W</kbd> drive</span><span><kbd className="mr-1 border border-cyan-100/20 px-1.5 py-0.5 text-cyan-100/80">A</kbd><kbd className="mx-0.5 border border-cyan-100/20 px-1.5 py-0.5 text-cyan-100/80">D</kbd> steer</span><span><kbd className="mr-1 border border-cyan-100/20 px-1.5 py-0.5 text-cyan-100/80">SPACE</kbd> drift</span><span><kbd className="mr-1 border border-[#ffd166]/30 px-1.5 py-0.5 text-[#ffd166]">SHIFT</kbd> boost</span><span><kbd className="mr-1 border border-[#ff6cbd]/30 px-1.5 py-0.5 text-[#ff9dcf]">E</kbd> enter / exit</span></div>
      <TouchControls setControl={setControl} toggleVehicle={toggleVehicle} />

      <div className="pointer-events-none absolute right-4 top-[336px] z-30 hidden items-center gap-2 text-[9px] uppercase tracking-[.13em] text-cyan-100/55 sm:flex"><Wind size={12} className="text-[#55f5dc]" />wind / engine procedural</div>
      {(paused || helpOpen) && <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-[#050b14]/58 px-4 backdrop-blur-[5px]"><div className="hud-panel relative w-full max-w-[560px] rounded-sm px-6 py-7 sm:px-9 sm:py-8"><button type="button" onClick={() => { setPausedState(false); setHelpOpen(false); }} className="hud-button absolute right-4 top-4 h-8 w-8 rounded-sm" data-testid="button-close-overlay" aria-label="Close help"><X size={15} /></button><div className="hud-label text-[#55f5dc]">neon open world / field guide</div><h2 className="hud-title mt-3 text-3xl tracking-[.12em] text-white sm:text-4xl">{helpOpen ? 'Drive your own line.' : 'World paused.'}</h2><p className="mt-3 max-w-md text-sm leading-6 text-cyan-50/60">{helpOpen ? 'Leave the pink gate, cross the city grid, and take the long way to the lookout. Weather, audio, and vehicle class can change while you drive.' : 'Your vehicle is parked in place. The world is waiting.'}</p><div className="mt-7 grid gap-3 sm:grid-cols-2">{[['W / ↑', 'Accelerate forward', 'تسارع إلى الأمام'], ['S / ↓', 'Brake or reverse', 'فرامل أو رجوع'], ['A D / ← →', 'Steer through the landscape', 'توجيه السيارة'], ['SPACE', 'Handbrake drift', 'انجراف بفرامل اليد'], ['T', 'Cycle Summer / Autumn / Snow', 'تبديل الفصول والطقس'], ['V', 'Mute or unmute engine, wind, ambience', 'كتم أو تشغيل الصوت'], ['R', 'Reset vehicle', 'إعادة ضبط السيارة'], ['M', 'Toggle the live map', 'إظهار الخريطة']].map(([key, text, arabic]) => <div key={key} className="flex items-center gap-3 border border-cyan-100/10 bg-cyan-100/[.035] px-3 py-3"><kbd className="min-w-[66px] border border-[#55f5dc]/35 px-2 py-1 text-center font-mono text-[11px] text-[#55f5dc]">{key}</kbd><div><div className="text-xs text-white/85">{text}</div><div dir="rtl" className="mt-0.5 text-[11px] text-cyan-100/40">{arabic}</div></div></div>)}</div><div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-cyan-100/48"><Thermometer size={13} className="text-[#ffd166]" />{activeSeason.label} atmosphere / {profile.name} / {muted ? 'audio muted' : 'audio ready'}</div><button type="button" onClick={() => { setPausedState(false); setHelpOpen(false); }} className="mt-6 w-full border border-[#55f5dc]/50 bg-[#55f5dc]/10 py-3 text-xs font-semibold uppercase tracking-[.2em] text-[#55f5dc] transition-colors hover:bg-[#55f5dc]/20" data-testid="button-resume">{helpOpen ? 'Enter the world' : 'Resume drive'}</button></div></div>}
    </main>
  );
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><GameScreen /></TooltipProvider></QueryClientProvider>;
}

export default App;