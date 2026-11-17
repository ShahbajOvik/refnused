/**
 * Generates public/models/phone.glb: a generic, unbranded smartphone used
 * as a placeholder for the home page hero. Replace the GLB with a real
 * model any time (keep it roughly 0.7 × 1.47 units, centred on the origin,
 * screen facing +Z), then run `npm run hero:poster` to refresh the image.
 *
 *   npm run model:placeholder
 */
import { mkdirSync } from "node:fs";

import { Document, NodeIO, type Material } from "@gltf-transform/core";

type Vec3 = [number, number, number];

/** Rounded-rectangle outline, counter-clockwise, centred on 0,0. */
function roundedRect(w: number, h: number, r: number, segments = 10): [number, number][] {
  const points: [number, number][] = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= segments; i++) {
      const a = start + (i / segments) * (Math.PI / 2);
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return points;
}

/** Extrudes an outline along Z into a closed prism with flat caps. */
function prism(outline: [number, number][], depth: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const n = outline.length;
  const z0 = -depth / 2;
  const z1 = depth / 2;

  const cap = (z: number, nz: number) => {
    const base = positions.length / 3;
    positions.push(0, 0, z);
    normals.push(0, 0, nz);
    for (const [x, y] of outline) {
      positions.push(x, y, z);
      normals.push(0, 0, nz);
    }
    for (let i = 0; i < n; i++) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % n);
      if (nz > 0) indices.push(base, a, b);
      else indices.push(base, b, a);
    }
  };
  cap(z1, 1);
  cap(z0, -1);

  // Sides with smooth outward normals.
  const base = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const prev = outline[(i - 1 + n) % n]!;
    const next = outline[(i + 1) % n]!;
    const [x, y] = outline[i]!;
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const nx = ty / len;
    const ny = -tx / len;
    positions.push(x, y, z0, x, y, z1);
    normals.push(nx, ny, 0, nx, ny, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = base + i * 2;
    const b = base + ((i + 1) % n) * 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { positions, normals, indices };
}

const doc = new Document();
doc.createScene("Scene");
const buffer = doc.createBuffer();

function material(
  name: string,
  color: Vec3,
  metallic: number,
  roughness: number,
  emissive: Vec3 = [0, 0, 0],
) {
  return doc
    .createMaterial(name)
    .setBaseColorFactor([...color, 1])
    .setMetallicFactor(metallic)
    .setRoughnessFactor(roughness)
    .setEmissiveFactor(emissive);
}

function part(name: string, geometry: ReturnType<typeof prism>, mat: Material, translation: Vec3) {
  const primitive = doc
    .createPrimitive()
    .setAttribute(
      "POSITION",
      doc
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array(geometry.positions))
        .setBuffer(buffer),
    )
    .setAttribute(
      "NORMAL",
      doc
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array(geometry.normals))
        .setBuffer(buffer),
    )
    .setIndices(
      doc
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array(geometry.indices))
        .setBuffer(buffer),
    )
    .setMaterial(mat);
  return doc
    .createNode(name)
    .setMesh(doc.createMesh(name).addPrimitive(primitive))
    .setTranslation(translation);
}

const W = 0.715;
const H = 1.47;
const D = 0.078;

const frame = material("Frame", [0.16, 0.17, 0.19], 0.85, 0.32);
const glass = material("ScreenGlass", [0.01, 0.014, 0.018], 0, 0.05, [0.0, 0.028, 0.024]);
const black = material("Black", [0.01, 0.01, 0.012], 0.2, 0.25);
const bumpMat = material("CameraBump", [0.2, 0.21, 0.23], 0.7, 0.4);
const lensMat = material("Lens", [0.02, 0.025, 0.04], 0.1, 0.05);

const phone = doc
  .createNode("Phone")
  .addChild(part("Body", prism(roundedRect(W, H, 0.11), D), frame, [0, 0, 0]))
  .addChild(
    part("Screen", prism(roundedRect(W - 0.035, H - 0.035, 0.095), 0.003), glass, [
      0,
      0,
      D / 2 + 0.0015,
    ]),
  )
  .addChild(
    part("CameraNotch", prism(roundedRect(0.17, 0.05, 0.025), 0.002), black, [
      0,
      H / 2 - 0.075,
      D / 2 + 0.004,
    ]),
  )
  .addChild(
    part("CameraBump", prism(roundedRect(0.3, 0.3, 0.075), 0.022), bumpMat, [
      -0.16,
      H / 2 - 0.23,
      -D / 2 - 0.011,
    ]),
  );

for (const [x, y] of [
  [-0.23, H / 2 - 0.16],
  [-0.23, H / 2 - 0.3],
  [-0.09, H / 2 - 0.23],
] as const) {
  phone.addChild(
    part("Lens", prism(roundedRect(0.095, 0.095, 0.0475, 8), 0.02), lensMat, [x, y, -D / 2 - 0.03]),
  );
}

doc.getRoot().listScenes()[0]!.addChild(phone);

mkdirSync("public/models", { recursive: true });
await new NodeIO().write("public/models/phone.glb", doc);
console.log("Wrote public/models/phone.glb");
