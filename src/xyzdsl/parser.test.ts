import { describe, expect, it } from 'vitest';
import { parseBoxSpec, parseCompactNumber, parseXyzDslDocument } from './parser';

const EXAMPLE = `"+2+4/+0+6/+1+3" : "geometry: cylinder; color: 0x333333; metalness: 0.8; roughness: 0.2"
"+2+4/+7+6/+0+1c" : "geometry: cone; color: yellow; metalness: 0.2; roughness: 0.5"
"+7+6/+0+15/+0+5c" : "geometry: sphere; color: blue; metalness: 0.1; roughness: 0.2"`;

describe('parseCompactNumber', () => {
  it('parses unit integers and centimeter- or millimeter-suffixed values', () => {
    expect(parseCompactNumber('0')).toBe(0);
    expect(parseCompactNumber('2')).toBe(2);
    expect(parseCompactNumber('15')).toBe(15);
    expect(parseCompactNumber('1c')).toBe(0.1);
    expect(parseCompactNumber('1m')).toBe(0.01);
    expect(parseCompactNumber('5c')).toBe(0.5);
    expect(parseCompactNumber('10')).toBe(10);
    expect(parseCompactNumber('1')).toBe(parseCompactNumber('10c'));
    expect(parseCompactNumber('10c')).toBe(parseCompactNumber('100m'));
  });

  it('rejects legacy p-decimal, leading-zero, and malformed metric-suffix values', () => {
    expect(() => parseCompactNumber('0p04')).toThrow(
      'p-decimal path numbers are no longer supported; use "4m" instead of "0p04".',
    );
    expect(() => parseCompactNumber('0p001')).toThrow(
      'p-decimal path numbers are no longer supported and "0p001" cannot be represented exactly in centimeters or millimeters.',
    );
    expect(() => parseCompactNumber('004')).toThrow(
      'Leading-zero path numbers are no longer supported; use "4" instead of "004".',
    );
    expect(() => parseCompactNumber('04c')).toThrow(
      'Leading-zero path numbers are no longer supported; use "4c" instead of "04c".',
    );
    expect(() => parseCompactNumber('04m')).toThrow(
      'Leading-zero path numbers are no longer supported; use "4m" instead of "04m".',
    );
    expect(() => parseCompactNumber('p5')).toThrow(
      'Expected a path number using digits with an optional centimeter (c) or millimeter (m) suffix, received "p5".',
    );
    expect(() => parseCompactNumber('5p')).toThrow(
      'Expected a path number using digits with an optional centimeter (c) or millimeter (m) suffix, received "5p".',
    );
    for (const malformed of ['1cc', '1mm', '1cm', '1mc', '1x']) {
      expect(() => parseCompactNumber(malformed)).toThrow(
        `Expected a path number using digits with an optional centimeter (c) or millimeter (m) suffix, received "${malformed}".`,
      );
    }
  });
});

describe('parseBoxSpec', () => {
  it('maps X/Y/Z axis segments to cuboid offsets and sizes', () => {
    expect(parseBoxSpec('+2+4/+0+6/+1+3')).toEqual({
      source: '+2+4/+0+6/+1+3',
      x: 2,
      y: 0,
      z: 1,
      width: 4,
      height: 6,
      depth: 3,
    });
  });

  it('allows mixed unit, centimeter, and millimeter values in the same axis segment', () => {
    expect(parseBoxSpec('+1+3m/+0c+1m/+25m+5c')).toEqual({
      source: '+1+3m/+0c+1m/+25m+5c',
      x: 1,
      y: 0,
      z: 0.25,
      width: 0.03,
      height: 0.01,
      depth: 0.5,
    });
  });

  it('uses the shared axis parser for direct box specs', () => {
    expect(() => parseBoxSpec('+2+4/not-an-axis/+1+3')).toThrow(
      'Axis Y must use +offset+size syntax.',
    );
  });
});

describe('parseXyzDslDocument', () => {
  it('parses composed object declarations with geometry and material properties', () => {
    const result = parseXyzDslDocument(EXAMPLE);

    expect(result.ok).toBe(true);
    expect(result.value).toHaveLength(3);
    expect(result.value?.[0].geometry.kind).toBe('cylinder');
    expect(result.value?.[1].geometry.kind).toBe('cone');
    expect(result.value?.[2].geometry.kind).toBe('sphere');
    expect(result.value?.[1].box?.depth).toBe(0.1);
    expect(result.value?.[2].box?.depth).toBe(0.5);
    expect(result.value?.[0].material.color).toBe(0x333333);
    expect(result.value?.[0].transform.rotation).toEqual([0, 0, 0]);
  });

  it('parses namespaced world-space instances and namespace declarations', () => {
    const result = parseXyzDslDocument(`"Sofa/+7+4/+0+3/+0+2" : "color: brown"
"Table/Leg/" : "geometry: cylinder"
"Table/Leg/+1+2/+0+7/+0+1" : ""`);

    expect(result.ok).toBe(true);
    expect(result.value?.[0].namespace).toEqual(['Sofa']);
    expect(result.value?.[0].declarationOnly).toBe(false);
    expect(result.value?.[0].box?.width).toBe(4);
    expect(result.value?.[1].namespace).toEqual(['Table', 'Leg']);
    expect(result.value?.[1].declarationOnly).toBe(true);
    expect(result.value?.[1].geometry.kind).toBe('cylinder');
    expect(result.value?.[2].namespace).toEqual(['Table', 'Leg']);
    expect(result.value?.[2].box?.height).toBe(7);
  });

  it('allows Base64 namespace segments before X/Y/Z coordinates except slash delimiters', () => {
    const result = parseXyzDslDocument(`"0abc/abc+123/+1+2/+0+7/+0+1" : ""
"abc/AbC123+/" : "geometry: sphere"`);

    expect(result.ok).toBe(true);
    expect(result.value?.[0].namespace).toEqual(['0abc', 'abc+123']);
    expect(result.value?.[0].box?.width).toBe(2);
    expect(result.value?.[1].namespace).toEqual(['abc', 'AbC123+']);
    expect(result.value?.[1].declarationOnly).toBe(true);
  });

  it('rejects namespace characters outside the slash-delimited unpadded Base64 subset', () => {
    const underscoreResult = parseXyzDslDocument('"Room_Name/+0+1/+0+1/+0+1" : ""');
    const paddingResult = parseXyzDslDocument('"Room=/+0+1/+0+1/+0+1" : ""');
    const leadingPlusResult = parseXyzDslDocument('"+Room/+0+1/+0+1/+0+1" : ""');

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
    const result = parseXyzDslDocument('"Ab+Cd/+0+1/+0+1/+0+1" : ""');

    expect(result.ok).toBe(true);
    expect(result.value?.[0].namespace).toEqual(['Ab+Cd']);
    expect(result.value?.[0].box?.width).toBe(1);
  });

  it('parses text content declarations', () => {
    const result = parseXyzDslDocument(
      '"+0+4/+0+2/+0+1" : "content-kind: text; content-text-uri: Hello%20world"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].content.kind).toBe('text');
    expect(result.value?.[0].content.kind === 'text' ? result.value[0].content.text : undefined).toBe('Hello world');
  });

  it('parses and validates URL content declarations', () => {
    const result = parseXyzDslDocument(
      '"+0+4/+0+2/+0+1" : "content-kind: url; content-url-uri: https%3A%2F%2Fexample.com%2Fview%3Fx%3D1"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].content.kind).toBe('url');
    expect(result.value?.[0].content.kind === 'url' ? result.value[0].content.url : undefined).toBe('https://example.com/view?x=1');
  });

  it('reports unsupported URL content schemes', () => {
    const result = parseXyzDslDocument(
      '"+0+4/+0+2/+0+1" : "content-kind: url; content-url: javascript:alert(1)"',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toBe('URL content declarations require an absolute http or https URL.');
  });

  it('parses ref declarations and reports missing reference targets', () => {
    const result = parseXyzDslDocument(
      '"Seat/+3+5/+0+3/+0+15" : "ref: Sofa/; ref-scale: true"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].reference.targetPath).toBe('Sofa/');
    expect(result.value?.[0].reference.scale).toBe(true);
  });

  it('reports invalid ref-scale booleans', () => {
    const result = parseXyzDslDocument(
      '"Seat/+3+5/+0+3/+0+15" : "ref: Sofa/; ref-scale: maybe"',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toBe(
      'Reference scale must be a boolean, received "maybe".',
    );
  });

  it('reports legacy leading-zero path numbers in axis values', () => {
    const result = parseXyzDslDocument('"+0+004/+0+2/+0+3" : ""');

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toBe(
      'Leading-zero path numbers are no longer supported; use "4" instead of "004".',
    );
  });

  it('rejects partial namespaced axis groups', () => {
    const result = parseXyzDslDocument('"Table/+1+2/+0+3" : ""');

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toBe(
      'Namespaced instance paths must end with exactly X/Y/Z axis segments.',
    );
  });

  it('parses rotation declarations as XYZDSL degree triples converted to radians', () => {
    const result = parseXyzDslDocument(
      '\"+0+1/+0+2/+0+3\" : \"geometry: box; rotation: 0, 90, 180\"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].transform.rotation[0]).toBe(0);
    expect(result.value?.[0].transform.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(result.value?.[0].transform.rotation[2]).toBeCloseTo(Math.PI);
  });

  it('reports malformed rotation triples', () => {
    const result = parseXyzDslDocument(
      '\"+0+1/+0+2/+0+3\" : \"geometry: box; rotation: 0, nope, 0\"',
    );

    expect(result.ok).toBe(false);
    expect(result.value?.[0].transform.rotation).toEqual([0, 0, 0]);
    expect(result.diagnostics[0].message).toBe(
      'Rotation component \"nope\" must be numeric.',
    );
  });

  it('parses box-radius as a box geometry modifier', () => {
    const result = parseXyzDslDocument(
      '"+0+4/+0+2/+0+3" : "box-radius: 0.15; color: orange"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].geometry.kind).toBe('box');
    expect(result.value?.[0].geometry['box-radius']).toBe(0.15);
    expect(result.value?.[0].geometry.declared).toBe(true);
  });

  it('reports invalid box-radius values', () => {
    const result = parseXyzDslDocument('"+0+4/+0+2/+0+3" : "box-radius: nope"');

    expect(result.ok).toBe(false);
    expect(result.value?.[0].geometry['box-radius']).toBeUndefined();
    expect(result.diagnostics[0].message).toBe('box-radius must be numeric.');
  });

  it('reports box-radius on non-box geometry', () => {
    const result = parseXyzDslDocument(
      '"+0+4/+0+2/+0+3" : "geometry: sphere; box-radius: 0.15"',
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
      '"Sofa/Cushion/+0+4/+0+1/+0+3" : "color: 0xf5f3ef; metalness: 0; roughness: 0.88; puff: 5"',
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
        '"+0+1/+0+1/+0+1" : "metalness: nope"',
        '"+1+1/+0+1/+0+1" : "roughness: 1.1"',
        '"+2+1/+0+1/+0+1" : "metalness: 1; roughness: 0"',
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
    const result = parseXyzDslDocument('"+0+4/+0+4/+0+4" : "geometry: cylinder; operation: subtraction"');

    expect(result.value?.[0].geometry.operation).toBe('subtraction');
  });

  it('reports unsupported boolean composition operations', () => {
    const result = parseXyzDslDocument('"+0+4/+0+4/+0+4" : "geometry: cylinder; operation: drill"');

    expect(result.value?.[0].geometry.operation).toBeUndefined();
    expect(result.diagnostics[0].message).toContain('Unsupported operation "drill"');
  });

  it('defaults to box geometry when geometry is omitted', () => {
    const result = parseXyzDslDocument('"+0+1/+0+2/+0+3" : "color: red"');

    expect(result.ok).toBe(true);
    expect(result.value?.[0].geometry.kind).toBe('box');
  });

  it('falls back to box geometry and reports unsupported geometry values', () => {
    const result = parseXyzDslDocument(
      '"+0+1/+0+2/+0+3" : "geometry: torus; color: red"',
    );

    expect(result.ok).toBe(false);
    expect(result.value?.[0].geometry.kind).toBe('box');
    expect(result.diagnostics[0].message).toContain(
      'Unsupported geometry "torus"',
    );
  });

  it('reports unsupported non-material and non-geometry properties once', () => {
    const result = parseXyzDslDocument(
      '"+0+1/+0+2/+0+3" : "foo: bar; geometry: box"',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toBe(
      'Ignoring unsupported object property "foo".',
    );
  });
});
