// Copy a hit pose once. Never parent the placed object to the camera or reticle.
export function placeObject(object, matrix) {
  matrix.decompose(object.position, object.quaternion, object.scale);
  object.visible = true;
  object.updateMatrixWorld(true);
}
