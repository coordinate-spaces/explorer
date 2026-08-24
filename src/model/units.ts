export const METERS_PER_UNIT = 1;
export const DECIMETRES_PER_UNIT = 10;
export const CENTIMETRES_PER_UNIT = 100;
export const MILLIMETRES_PER_UNIT = 1000;

export const UNIT_SCALE_DESCRIPTION = '1 unit = 1 m; 1d = 1 dm; 1c = 1 cm; 1m = 1 mm';

export type SpatialUnit = 'm' | 'dm' | 'cm' | 'mm';

export const SPATIAL_UNITS: Record<SpatialUnit, { label: string; metres: number }> = {
  m: { label: 'metre', metres: 1 },
  dm: { label: 'decimetre', metres: 0.1 },
  cm: { label: 'centimetre', metres: 0.01 },
  mm: { label: 'millimetre', metres: 0.001 },
};
