import { describe, expect, it } from 'vitest';
import { parseBoxSpec, parseCompactNumber, parseXyzDslDocument } from './parser';

const EXAMPLE = `"+2+4/+0+6/+1+3" : "geometry: cylinder; color: 0x333333; metalness: 0.8; roughness: 0.2"
"+2+4/+7+6/+0+10c" : "geometry: cone; color: yellow; metalness: 0.2; roughness: 0.5"
"+7+6/+0+15/+0+50c" : "geometry: sphere; color: blue; metalness: 0.1; roughness: 0.2"`;

describe('parseCompactNumber', () => {
  it('parses unit integers and centiunit-suffixed values', () => {
    expect(parseCompactNumber('0')).toBe(0);
    expect(parseCompactNumber('2')).toBe(2);
    expect(parseCompactNumber('15')).toBe(15);
    expect(parseCompactNumber('10c')).toBe(0.1);
    expect(parseCompactNumber('1c')).toBe(0.01);
    expect(parseCompactNumber('50c')).toBe(0.5);
    expect(parseCompactNumber('10')).toBe(10);
  });

  it('rejects legacy p-decimal, leading-zero, and malformed centiunit values', () => {
    expect(() => parseCompactNumber('0p04')).toThrow(
      'p-decimal path numbers are no longer supported; use "4c" instead of "0p04".',
    );
    expect(() => parseCompactNumber('0p001')).toThrow(
      'p-decimal path numbers are no longer supported and "0p001" cannot be represented exactly as centiunits.',
    );
    expect(() => parseCompactNumber('004')).toThrow(
      'Leading-zero path numbers are no longer supported; use "4" instead of "004".',
    );
    expect(() => parseCompactNumber('p5')).toThrow(
      'Expected a path number using digits with an optional centiunit suffix, received "p5".',
    );
    expect(() => parseCompactNumber('5p')).toThrow(
      'Expected a path number using digits with an optional centiunit suffix, received "5p".',
    );
    expect(() => parseCompactNumber('1cc')).toThrow(
      'Expected a path number using digits with an optional centiunit suffix, received "1cc".',
    );
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

  it('allows mixed unit and centiunit values in the same axis segment', () => {
    expect(parseBoxSpec('+1+3c/+0c+1c/+25c+50c')).toEqual({
      source: '+1+3c/+0c+1c/+25c+50c',
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
  it('parses scoped interaction directives and all conditional coordinate modes', () => {
    const result = parseXyzDslDocument(`"Rod/+touch" : "rotation: 90,90,0"
"Machine/+touch/Lever/+4/+5/+9" : ""
"Rod/+breach/+9+1/+0+5/+0+1" : "color: red"
"Ball/+touch/+++" : ""`);

    expect(result.ok).toBe(true);
    expect(result.value?.[0].conditional).toMatchObject({
      targetNamespace: ['Rod'],
      directives: [{ name: 'touch', scopeNamespace: ['Rod'] }],
      spatialOverride: { mode: 'inherit' },
    });
    expect(result.value?.[1].conditional).toMatchObject({
      targetNamespace: ['Machine', 'Lever'],
      directives: [{ name: 'touch', scopeNamespace: ['Machine'] }],
      spatialOverride: { mode: 'translation', magnitude: [4, 5, 9] },
    });
    expect(result.value?.[2].conditional?.spatialOverride).toMatchObject({
      mode: 'absolute-box',
      box: { x: 9, width: 1, y: 0, height: 5, z: 0, depth: 1 },
    });
    expect(result.value?.[3].conditional).toMatchObject({
      targetNamespace: ['Ball'],
      directives: [{ name: 'touch', scopeNamespace: ['Ball'] }],
      spatialOverride: { mode: 'weighted-translation' },
    });
  });

  it('rejects unknown and unscoped interaction directives', () => {
    expect(parseXyzDslDocument('"Rod/+hover" : ""').diagnostics[0].message).toContain('Unknown interaction directive');
    expect(parseXyzDslDocument('"+touch/+1/+2/+3" : ""').diagnostics[0].message).toContain('require a target namespace');
  });
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
      'Unknown interaction directive "+Room". Expected +touch or +breach.',
    );
  });

  it.each(['probe', 'contact'])('rejects the removed +%s interaction directive', (directive) => {
    const result = parseXyzDslDocument(`"Rod/+${directive}" : ""`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toBe(
      `Unknown interaction directive "+${directive}". Expected +touch or +breach.`,
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

  it('parses texture material and puff declarations', () => {
    const result = parseXyzDslDocument(
      '"Sofa/Cushion/+0+4/+0+1/+0+3" : "color: 0xf5f3ef; roughness: 0.88; material-preset: upholstery.fabric; bump-texture-strength: 2; puff: 5"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].material.color).toBe(0xf5f3ef);
    expect(result.value?.[0].material.roughness).toBe(0.88);
    expect(result.value?.[0].material.materialPreset).toBe('upholstery.fabric');
    expect(result.value?.[0].material.textures?.bumpMap?.strength).toBe(2);
    expect(result.value?.[0].geometry.puff).toBe(5);
  });

  it('reports removed compact material properties as unsupported', () => {
    const result = parseXyzDslDocument('"+0+4/+0+1/+0+3" : "fabric: 3; puff: -1"');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ message }) => message)).toEqual([
      'puff must be between 0 and 5.',
      'Ignoring unsupported object property "fabric".',
    ]);
  });

  it('parses material presets and generic texture declarations', () => {
    const result = parseXyzDslDocument(
      '"+0+4/+0+1/+0+3" : "material-preset: upholstery.fabric; texture: wood.oak; texture-repeat: 2, 3; bump-texture: bump.noise; bump-texture-strength: 4; texture-offset: 0.25 0.5; texture-rotation: 1.57"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].material.materialPreset).toBe('upholstery.fabric');
    expect(result.value?.[0].material.roughness).toBe(0.88);
    expect(result.value?.[0].material.textures?.map).toEqual({
      preset: 'wood.oak',
      repeat: [2, 3],
      offset: [0.25, 0.5],
      rotation: 1.57,
    });
    expect(result.value?.[0].material.textures?.bumpMap).toEqual({
      preset: 'bump.noise',
      repeat: [2, 3],
      strength: 4,
      offset: [0.25, 0.5],
      rotation: 1.57,
    });
  });

  it('parses semantic material declarations into renderer defaults', () => {
    const result = parseXyzDslDocument(
      '"+0+4/+0+1/+0+3" : "material: wood; grain: walnut; pattern: linear; finish: glossy; texture-scale: 3 1; bump: 4; reflectivity: 0.6"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].material.semanticMaterial).toBe('wood');
    expect(result.value?.[0].material.materialVariant).toBe('walnut');
    expect(result.value?.[0].material.materialPattern).toBe('linear');
    expect(result.value?.[0].material.materialFinish).toBe('glossy');
    expect(result.value?.[0].material.color).toBe('#5b341f');
    expect(result.value?.[0].material.roughness).toBe(0.18);
    expect(result.value?.[0].material.reflectivity).toBe(0.6);
    expect(result.value?.[0].material.clearcoat).toBe(0.35);
    expect(result.value?.[0].material.textures?.map?.preset).toBe('wood.linear');
    expect(result.value?.[0].material.textures?.map?.repeat).toEqual([3, 1]);
    expect(result.value?.[0].material.textures?.bumpMap?.strength).toBe(4);
  });

  it('preserves generic texture transforms on textureless semantic defaults', () => {
    const result = parseXyzDslDocument(
      '"+0+4/+0+1/+0+3" : "material-preset: plastic.matte; texture-repeat: 3 1; texture: wood.oak"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].material.materialPreset).toBe('plastic.matte');
    expect(result.value?.[0].material.textures?.map).toEqual({
      repeat: [3, 1],
      preset: 'wood.oak',
    });
  });

  it('supports stone, glass, and leather semantic material families', () => {
    const result = parseXyzDslDocument(
      [
        '"+0+4/+0+1/+0+3" : "material: stone; variant: marble; pattern: vein; finish: polished"',
        '"+5+4/+0+1/+0+3" : "material: glass; variant: frosted; pattern: reeded"',
        '"+10+4/+0+1/+0+3" : "material: leather; variant: tan; pattern: pebbled; finish: satin"',
      ].join('\n'),
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].material.semanticMaterial).toBe('stone');
    expect(result.value?.[0].material.color).toBe('#d8d3c8');
    expect(result.value?.[0].material.textures?.map?.preset).toBe('stone.vein');
    expect(result.value?.[0].material.clearcoat).toBe(0.35);

    expect(result.value?.[1].material.semanticMaterial).toBe('glass');
    expect(result.value?.[1].material.opacity).toBe(0.46);
    expect(result.value?.[1].material.transmission).toBe(0.45);
    expect(result.value?.[1].material.textures?.bumpMap?.preset).toBe('glass.reeded');

    expect(result.value?.[2].material.semanticMaterial).toBe('leather');
    expect(result.value?.[2].material.color).toBe('#b77945');
    expect(result.value?.[2].material.textures?.roughnessMap?.preset).toBe('leather.pebbled');
    expect(result.value?.[2].material.roughness).toBe(0.48);
  });

  it('parses custom image texture sources separately from preset textures', () => {
    const result = parseXyzDslDocument(
      '"+0+4/+0+1/+0+3" : "texture-src: /textures/custom.png; normal-texture-src: /textures/custom-normal.png; normal-texture-repeat: 1 2"',
    );

    expect(result.ok).toBe(true);
    expect(result.value?.[0].material.textures?.map).toEqual({ src: '/textures/custom.png' });
    expect(result.value?.[0].material.textures?.normalMap).toEqual({
      src: '/textures/custom-normal.png',
      repeat: [1, 2],
    });
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
