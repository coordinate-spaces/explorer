import type { MeshStandardMaterialParameters } from 'three';

export const defaultBoxMaterial: MeshStandardMaterialParameters = {
  color: '#64748b',
  roughness: 0.7,
  metalness: 0,
};

export const unionHighlightMaterial: MeshStandardMaterialParameters = {
  emissive: '#213f72',
  emissiveIntensity: 0.15,
};
