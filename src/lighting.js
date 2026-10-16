import { PMREMGenerator } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export async function setupEnvironment(scene, renderer) {
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  let hdr;
  try {
    hdr = await new HDRLoader().loadAsync(new URL('../assets/lightroom_14b.hdr', import.meta.url).href);
    const environment = pmrem.fromEquirectangular(hdr);
    scene.environment = environment.texture;
    scene.environmentIntensity = 1;
    // Keep scene.background null: the real camera remains visible in AR.
    return environment;
  } finally {
    hdr?.dispose();
    pmrem.dispose();
  }
}
