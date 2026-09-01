import type { MeshStandardMaterialParameters } from 'three';

export const wallMaterial: MeshStandardMaterialParameters = {
  color: '#d9d3c8',
  roughness: 0.86,
  metalness: 0,
};

export const floorMaterial: MeshStandardMaterialParameters = {
  color: '#8b8175',
  roughness: 0.72,
  metalness: 0,
};

export const defaultBoxMaterial: MeshStandardMaterialParameters = {
  color: '#64748b',
  roughness: 0.7,
  metalness: 0,
};

export const unionHighlightMaterial: MeshStandardMaterialParameters = {
  emissive: '#213f72',
  emissiveIntensity: 0.15,
};
