import {
  Box3,
  DirectionalLight,
  PMREMGenerator,
  Vector3,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Target phone height in scene units (camera framing assumes this). */
export const PHONE_HEIGHT = 1.47;

/**
 * Centres the model on the origin and scales it to PHONE_HEIGHT, so any
 * replacement GLB frames the same way regardless of its units.
 */
export function normaliseModel(object: Object3D) {
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const scale = size.y > 0 ? PHONE_HEIGHT / size.y : 1;
  object.scale.setScalar(scale);
  object.position.copy(centre.multiplyScalar(-scale));
  return object;
}

/**
 * Studio-style lighting built in code (no HDR download). Shared by the live
 * scene and the poster renderer.
 */
export function applyHeroLighting(renderer: WebGLRenderer, scene: Scene) {
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  pmrem.dispose();

  const key = new DirectionalLight("#ffffff", 1.2);
  key.position.set(2, 3, 4);
  scene.add(key);

  return () => {
    scene.remove(key);
    scene.environment = null;
    environment.dispose();
  };
}
