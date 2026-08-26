import { describe, expect, it } from 'vitest';
import { parseBoxSpec, parseCompactNumber, parseXyzDslDocument } from './parser';

const EXAMPLE = `"+2d+4d/+0d+6d/+1d+3d" : "geometry: cylinder; color: 0x333333; metalness: 0.8; roughness: 0.2"
"+2d+4d/+7d+6d/+0d+10m" : "geometry: cone; color: yellow; metalness: 0.2; roughness: 0.5"
"+7d+6d/+0d+15d/+0d+50m" : "geometry: sphere; color: blue; metalness: 0.1; roughness: 0.2"`;

describe('parseCompactNumber', () => {
  it('parses equivalent metric-unit forms', () => {
    expect(parseCompactNumber('1')).toBe(1);
    expect(parseCompactNumber('10d')).toBe(1);
    expect(parseCompactNumber('100c')).toBe(1);
    expect(parseCompactNumber('1000m')).toBe(1);
    expect(parseCompactNumber('1d')).toBe(0.1);
    expect(parseCompactNumber('1c')).toBe(0.01);
    expect(parseCompactNumber('1m')).toBe(0.001);
  });

  it.each(['0p04', '0p001', 'p5', '5p', '1cc', '1dd', '1mm', '1dc', '1x'])(
    'rejects unsupported syntax %s through the generic invalid-number path',
    (raw) => {
      expect(() => parseCompactNumber(raw)).toThrow('Expected a path number using unpadded digits with an optional metric-unit suffix');
      try { parseCompactNumber(raw); } catch (error) { expect(String(error)).not.toContain('use "'); }
    },
  );

  it.each(['004', '004d', '004c', '004m'])('rejects leading zeroes in %s', (raw) => {
    expect(() => parseCompactNumber(raw)).toThrow('Leading-zero path numbers are no longer supported');
  });
});

describe('parseBoxSpec', () => {
  it('maps X/Y/Z axis segments to cuboid offsets and sizes', () => {
    expect(parseBoxSpec('+2d+4d/+0d+6d/+1d+3d')).toEqual({
      source: '+2d+4d/+0d+6d/+1d+3d', x: 0.2, y: 0, z: 0.1, width: 0.4, height: 0.6, depth: 0.3,
    });
  });

  it('allows mixed metre, decimetre, centimetre, and millimetre values', () => {
    expect(parseBoxSpec('+1+3d/+0c+1c/+25m+50c')).toEqual({
      source: '+1+3d/+0c+1c/+25m+50c', x: 1, y: 0, z: 0.025, width: 0.3, height: 0.01, depth: 0.5,
    });
  });

  it.each(['+1dd+1d/+0d+1d/+0d+1d', '+1d+1cm/+0d+1d/+0d+1d', '+1x+1d/+0d+1d/+0d+1d'])(
    'rejects malformed or repeated suffixes in %s',
    (source) => expect(() => parseBoxSpec(source)).toThrow(),
  );

  it('uses the shared axis parser for direct box specs', () => {
    expect(() => parseBoxSpec('+2d+4d/not-an-axis/+1d+3d')).toThrow(
      'Axis Y must use +offset+size syntax.',
    );
  });
});

describe('parseXyzDslDocument', () => {
  it('parses a store-relative GLB model with fitting, alignment, and rotation', () => {
    const result = parseXyzDslDocument(
      '"+1+4/+2+4/+2+4" : "model: modern_chair.glb; model-fit: contain; model-align: floor; rotation: 5,10,5"',
    );
    expect(result.ok).toBe(true);
    expect(result.value?.[0].model).toMatchObject({ source: 'modern_chair.glb', fit: 'contain', align: 'floor' });
    expect(result.value?.[0].transform.declared).toBe(true);
  });

  it('reports unsafe and unsupported model declarations', () => {
    const unsafe = parseXyzDslDocument('"+1+1/+2+1/+2+1" : "model: ../chair.glb"');
    const operation = parseXyzDslDocument('"+1+1/+2+1/+2+1" : "model: chair.glb; operation: union"');
    expect(unsafe.ok).toBe(false);
    expect(unsafe.diagnostics[0].message).toContain('safe MODEL_STORE-relative path');
    expect(operation.ok).toBe(true);
    expect(operation.value?.[0].geometry.operation).toBe('union');
  });
  it('parses composed object declarations with geometry and material properties', () => {
    const result = parseXyzDslDocument(EXAMPLE);

    expect(result.ok).toBe(true);
    expect(result.value).toHaveLength(3);
    expect(result.value?.[0].geometry.kind).toBe('cylinder');
    expect(result.value?.[1].geometry.kind).toBe('cone');
    expect(result.value?.[2].geometry.kind).toBe('sphere');
    expect(result.value?.[1].box?.depth).toBe(0.01);
    expect(result.value?.[2].box?.depth).toBe(0.05);
    expect(result.value?.[0].material.color).toBe(0x333333);
    expect(result.value?.[0].transform.rotation).toEqual([0, 0, 0]);
  });

  it('parses namespaced world-space instances and namespace declarations', () => {
    const result = parseXyzDslDocument(`"Sofa/+7d+4d/+0d+3d/+0d+2d" : "color: brown"
"Table/Leg/" : "geometry: cylinder"
"Table/Leg/+1d+2d/+0d+7d/+0d+1d" : ""`);

    expect(result.ok).toBe(true);
    expect(result.value?.[0].namespace).toEqual(['Sofa']);
    expect(result.value?.[0].declarationOnly).toBe(false);
    expect(result.value?.[0].box?.width).toBe(0.4);
    expect(result.value?.[1].namespace).toEqual(['Table', 'Leg']);
    expect(result.value?.[1].declarationOnly).toBe(true);
    expect(result.value?.[1].geometry.kind).toBe('cylinder');
    expect(result.value?.[2].namespace).toEqual(['Table', 'Leg']);
    expect(result.value?.[2].box?.height).toBe(0.7);
  });

  it('allows Base64 namespace segments before X/Y/Z coordinates except slash delimiters', () => {
    const result = parseXyzDslDocument(`"0abc/abc+123/+1d+2d/+0d+7d/+0d+1d" : ""
"abc/AbC123+/" : "geometry: sphere"`);

    expect(result.ok).toBe(true);
    expect(result.value?.[0].namespace).toEqual(['0abc', 'abc+123']);
    expect(result.value?.[0].box?.width).toBe(0.2);
    expect(result.value?.[1].namespace).toEqual(['abc', 'AbC123+']);
    expect(result.value?.[1].declarationOnly).toBe(true);
  });

  it('rejects namespace characters outside the slash-delimited unpadded Base64 subset', () => {
    const underscoreResult = parseXyzDslDocument('"Room_Name/+0d+1d/+0d+1d/+0d+1d" : ""');
    const paddingResult = parseXyzDslDocument('"Room=/+0d+1d/+0d+1d/+0d+1d" : ""');
    const leadingPlusResult = parseXyzDslDocument('"+Room/+0d+1d/+0d+1d/+0d+1d" : ""');

    expect(underscoreResult.ok).toBe(false);
    expect(underscoreResult.diagnostics[0].message).toBe(
      'Namespace segment "Room_Name" must start with a letter or number and contain only Base64 characters except the / delimiter.',
    );
    expect(paddingResult.ok).toBe(false);
    expect(paddingResult.diagnostics[0].message).toBe(
      'Namespace segment "Room=" must start with a letter or number and contain only Base64 characters except the / delimiter.',
    );
    expect(leadingPlusResult.ok).toBe(false);
    expect(leadingPlusResult.diagnostics[0].message).toBe(
      'Namespace segment "+Room" must start with a letter or number and contain only Base64 characters except the / delimiter.',
    );
  });

  it('does not classify plus-containing non-numeric namespace segments as axes', () => {
    const result = parseXyzDslDocument('"Ab+Cd/+0d+1d/+0d+1d/+0d+1d" : ""');

    expect(result.ok).toBe(true);
    expect(result.value?.[0].namespace).toEqual(['Ab+Cd']);
    expect(result.value?.[0].box?.width).toBe(0.1);
  });

  it('parses text content declarations', () => {
    const result = parseXyzDslDocument(
      '"+0d+4d/+0d+2d/+0d+1d" : "content-kind: text; content-text-uri: Hello%20world"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].content.kind).toBe('text');
    expect(result.value?.[0].content.kind === 'text' ? result.value[0].content.text : undefined).toBe('Hello world');
  });

  it('parses and validates URL content declarations', () => {
    const result = parseXyzDslDocument(
      '"+0d+4d/+0d+2d/+0d+1d" : "content-kind: url; content-url-uri: https%3A%2F%2Fexample.com%2Fview%3Fx%3D1"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].content.kind).toBe('url');
    expect(result.value?.[0].content.kind === 'url' ? result.value[0].content.url : undefined).toBe('https://example.com/view?x=1');
  });

  it('reports unsupported URL content schemes', () => {
    const result = parseXyzDslDocument(
      '"+0d+4d/+0d+2d/+0d+1d" : "content-kind: url; content-url: javascript:alert(1)"',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toBe('URL content declarations require an absolute http or https URL.');
  });

  it('parses ref declarations and reports missing reference targets', () => {
    const result = parseXyzDslDocument(
      '"Seat/+3d+5d/+0d+3d/+0d+15d" : "ref: Sofa/; ref-scale: true"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].reference.targetPath).toBe('Sofa/');
    expect(result.value?.[0].reference.scale).toBe(true);
  });

  it('reports invalid ref-scale booleans', () => {
    const result = parseXyzDslDocument(
      '"Seat/+3d+5d/+0d+3d/+0d+15d" : "ref: Sofa/; ref-scale: maybe"',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toBe(
      'Reference scale must be a boolean, received "maybe".',
    );
  });

  it('reports legacy leading-zero path numbers in axis values', () => {
    const result = parseXyzDslDocument('"+0d+004d/+0d+2d/+0d+3d" : ""');

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toBe(
      'Leading-zero path numbers are no longer supported; use "4d" instead of "004d".',
    );
  });

  it('rejects partial namespaced axis groups', () => {
    const result = parseXyzDslDocument('"Table/+1d+2d/+0d+3d" : ""');

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toBe(
      'Namespaced instance paths must end with exactly X/Y/Z axis segments.',
    );
  });

  it('parses rotation declarations as XYZDSL degree triples converted to radians', () => {
    const result = parseXyzDslDocument(
      '\"+0d+1d/+0d+2d/+0d+3d\" : \"geometry: box; rotation: 0, 90, 180\"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].transform.rotation[0]).toBe(0);
    expect(result.value?.[0].transform.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(result.value?.[0].transform.rotation[2]).toBeCloseTo(Math.PI);
  });

  it('reports malformed rotation triples', () => {
    const result = parseXyzDslDocument(
      '\"+0d+1d/+0d+2d/+0d+3d\" : \"geometry: box; rotation: 0, nope, 0\"',
    );

    expect(result.ok).toBe(false);
    expect(result.value?.[0].transform.rotation).toEqual([0, 0, 0]);
    expect(result.diagnostics[0].message).toBe(
      'Rotation component \"nope\" must be numeric.',
    );
  });

  it('parses box-radius as a box geometry modifier', () => {
    const result = parseXyzDslDocument(
      '"+0d+4d/+0d+2d/+0d+3d" : "box-radius: 0.015; color: orange"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].geometry.kind).toBe('box');
    expect(result.value?.[0].geometry['box-radius']).toBe(0.015);
    expect(result.value?.[0].geometry.declared).toBe(true);
  });

  it('reports invalid box-radius values', () => {
    const result = parseXyzDslDocument('"+0d+4d/+0d+2d/+0d+3d" : "box-radius: nope"');

    expect(result.ok).toBe(false);
    expect(result.value?.[0].geometry['box-radius']).toBeUndefined();
    expect(result.diagnostics[0].message).toBe('box-radius must be numeric.');
  });

  it('reports box-radius on non-box geometry', () => {
    const result = parseXyzDslDocument(
      '"+0d+4d/+0d+2d/+0d+3d" : "geometry: sphere; box-radius: 0.015"',
    );

    expect(result.ok).toBe(false);
    expect(result.value?.[0].geometry.kind).toBe('sphere');
    expect(result.value?.[0].geometry['box-radius']).toBeUndefined();
    expect(result.diagnostics[0].message).toBe(
      'box-radius only applies to box geometry.',
    );
  });

  it('parses the minimal scalar material properties and puff geometry', () => {
    const result = parseXyzDslDocument(
      '"Sofa/Cushion/+0d+4d/+0d+1d/+0d+3d" : "color: 0xf5f3ef; metalness: 0; roughness: 0.88; puff: 5"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].material).toEqual({
      color: 0xf5f3ef,
      metalness: 0,
      roughness: 0.88,
      diagnostics: [],
    });
    expect(result.value?.[0].geometry.puff).toBe(5);
  });

  it('rejects nonnumeric and out-of-range scalar material values', () => {
    const result = parseXyzDslDocument(
      [
        '"+0d+1d/+0d+1d/+0d+1d" : "metalness: nope"',
        '"+1d+1d/+0d+1d/+0d+1d" : "roughness: 1.1"',
        '"+2d+1d/+0d+1d/+0d+1d" : "metalness: 1; roughness: 0"',
      ].join('\n'),
    );

    expect(result.ok).toBe(false);
    expect(result.value?.[2].material).toMatchObject({ metalness: 1, roughness: 0 });
    expect(result.diagnostics.map(({ message }) => message)).toEqual([
      'Material property "metalness" must be numeric.',
      'Material property "roughness" must be between 0 and 1.',
    ]);
  });

  it('parses boolean composition geometry operations', () => {
    const result = parseXyzDslDocument('"+0d+4d/+0d+4d/+0d+4d" : "geometry: cylinder; operation: subtraction"');

    expect(result.value?.[0].geometry.operation).toBe('subtraction');
  });

  it('reports unsupported boolean composition operations', () => {
    const result = parseXyzDslDocument('"+0d+4d/+0d+4d/+0d+4d" : "geometry: cylinder; operation: drill"');

    expect(result.value?.[0].geometry.operation).toBeUndefined();
    expect(result.diagnostics[0].message).toContain('Unsupported operation "drill"');
  });

  it('defaults to box geometry when geometry is omitted', () => {
    const result = parseXyzDslDocument('"+0d+1d/+0d+2d/+0d+3d" : "color: red"');

    expect(result.ok).toBe(true);
    expect(result.value?.[0].geometry.kind).toBe('box');
  });

  it('falls back to box geometry and reports unsupported geometry values', () => {
    const result = parseXyzDslDocument(
      '"+0d+1d/+0d+2d/+0d+3d" : "geometry: torus; color: red"',
    );

    expect(result.ok).toBe(false);
    expect(result.value?.[0].geometry.kind).toBe('box');
    expect(result.diagnostics[0].message).toContain(
      'Unsupported geometry "torus"',
    );
  });

  it('reports unsupported non-material and non-geometry properties once', () => {
    const result = parseXyzDslDocument(
      '"+0d+1d/+0d+2d/+0d+3d" : "foo: bar; geometry: box"',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toBe(
      'Ignoring unsupported object property "foo".',
    );
  });
});
