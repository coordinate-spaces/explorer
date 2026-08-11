import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from './createSpatialDocument';

describe('createSpatialDocument namespaced spatial declarations', () => {
  it('resolves namespace inheritance and renders composed children in parent-local space', () => {
    const document =
      createSpatialDocument(`"Table/+3+8/+0+5/+0+8" : "color: 0x333333; metalness: 0.8; roughness: 0.2"
"Table/Top/+1+6/+0+5/+0+6" : ""
"Table/Leg/" : "geometry: cylinder"
"Table/Leg/+1+2/+0+7/+0+1" : ""`);

    expect(document.diagnostics).toEqual([]);
    expect(document.nodes).toHaveLength(1);
    expect(document.nodes[0].renderable).toBe(false);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.renderNodes[0].material.color).toBe(0x333333);
    expect(document.renderNodes[0].transform.position).toEqual([7, 2.5, 3]);
    expect(document.renderNodes[1].geometry.kind).toBe('cylinder');
    expect(document.renderNodes[1].transform.position).toEqual([5, 3.5, 0.5]);
  });

  it('rotates composed descendants as a single parent group without double-applying parent rotation', () => {
    const document =
      createSpatialDocument(`"Table/+3+8/+0+5/+4+8" : "rotation: 0,90,0; color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0+8/+4+1/+0+8" : ""
"Table/Leg/" : "geometry: cylinder"
"Table/LegA/+0+1/+0+5/+0+1" : "geometry: cylinder"
"Table/LegB/+7+1/+0+5/+7+1" : "geometry: cylinder"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(3);
    expect(document.renderNodes[0].transform.position[0]).toBeCloseTo(7);
    expect(document.renderNodes[0].transform.position[1]).toBeCloseTo(4.5);
    expect(document.renderNodes[0].transform.position[2]).toBeCloseTo(0);
    expect(document.renderNodes[0].transform.rotation[1]).toBeCloseTo(
      Math.PI / 2,
    );
    expect(document.renderNodes[1].transform.position[0]).toBeCloseTo(3.5);
    expect(document.renderNodes[1].transform.position[2]).toBeCloseTo(3.5);
    expect(document.renderNodes[2].transform.position[0]).toBeCloseTo(10.5);
    expect(document.renderNodes[2].transform.position[2]).toBeCloseTo(-3.5);
  });

  it('uses only the newest concrete entry in a namespace', () => {
    const document =
      createSpatialDocument(`"Table/+0+4/+0+4/+0+4" : "color: grey"
"Table/Leg/" : "geometry: cylinder"
"Table/Leg/+0+1/+0+1/+0+1" : "color: red"
"Table/Leg/+2+1/+0+1/+0+1" : ""`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].material.color).toBe('grey');
    expect(document.renderNodes[0].box.source).toBe('+2+1/+0+1/+0+1');
  });

  it('resolves refs against prior named objects and applies the local instance box', () => {
    const document =
      createSpatialDocument(`"Sofa/+7+4/+0+3/+0+2" : "color: brown; metalness: 0.2; roughness: 0.8"
"Seat/+3+5/+0+3/+0+15" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.renderNodes[1].material.color).toBe('brown');
    expect(document.renderNodes[1].material.metalness).toBe(0.2);
    expect(document.renderNodes[1].transform.position).toEqual([5.5, 1.5, 7.5]);
  });

  it('packs materialized descendants using the reference declaration order', () => {
    const document = createSpatialDocument(`"Template/" : "color: red"
"Template/Part/+0+4/+0+2/+0+2" : ""
"+10+4/+0+2/+0+2" : "color: blue"
"Copy/+10+4/+0+2/+0+2" : "ref: Template/"`);

    const prior = document.renderNodes.find((node) => node.material.color === 'blue');
    const materialized = document.renderNodes.find(
      (node) => node.namespacePath === 'Copy/Part/',
    );

    expect(prior?.transform.position).toEqual([12, 1, 1]);
    expect(materialized?.transform.position).toEqual([12, 1, 1]);
    expect(materialized?.metadata?.lineNumber).toBe(4);
  });

  it('inherits content through namespace declarations and refs', () => {
    const document =
      createSpatialDocument(`"Poster/" : "content-kind: text; content-text-uri: Sale"
"Poster/+0+4/+0+2/+0+1" : ""
"Copy/+6+4/+0+2/+0+1" : "ref: Poster/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.renderNodes[0].content?.kind).toBe('text');
    expect(
      document.renderNodes[0].content?.kind === 'text'
        ? document.renderNodes[0].content.text
        : undefined,
    ).toBe('Sale');
    expect(document.renderNodes[1].content?.kind).toBe('text');
    expect(
      document.renderNodes[1].content?.kind === 'text'
        ? document.renderNodes[1].content.text
        : undefined,
    ).toBe('Sale');
  });

  it('allows local content declarations to override inherited content', () => {
    const document =
      createSpatialDocument(`"Poster/" : "content-kind: text; content-text-uri: Sale"
"Poster/+0+4/+0+2/+0+1" : "content-kind: text; content-text-uri: Sold"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].content?.kind).toBe('text');
    expect(
      document.renderNodes[0].content?.kind === 'text'
        ? document.renderNodes[0].content.text
        : undefined,
    ).toBe('Sold');
  });

  it('inherits box-radius through namespaces and refs', () => {
    const document =
      createSpatialDocument(`"Cabinet/" : "box-radius: 0.2; color: orange"
"Cabinet/+0+4/+0+2/+0+3" : ""
"Copy/+6+4/+0+2/+0+3" : "ref: Cabinet/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.renderNodes[0].geometry.kind).toBe('box');
    expect(document.renderNodes[0].geometry['box-radius']).toBe(0.2);
    expect(document.renderNodes[1].geometry.kind).toBe('box');
    expect(document.renderNodes[1].geometry['box-radius']).toBe(0.2);
  });

  it('allows child boxes to override inherited box-radius with zero', () => {
    const document =
      createSpatialDocument(`"Cabinet/" : "box-radius: 0.2; color: orange"
"Cabinet/+0+4/+0+2/+0+3" : "box-radius: 0"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].geometry['box-radius']).toBe(0);
  });

  it('keeps unanchored nested coordinates definition-only while refs inherit texture properties', () => {
    const document =
      createSpatialDocument(`"Sofa/Cushion/" : "color: 0xf5f3ef; material-preset: upholstery.fabric; bump-texture-strength: 2; puff: 5"
"Sofa/Cushion/+0+4/+0+1/+0+3" : "roughness: 0.92"
"Copy/+6+4/+0+1/+0+3" : "ref: Sofa/Cushion/; bump-texture-strength: 1"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);

    const definition = document.nodes.find(
      (node) => node.namespacePath === 'Sofa/Cushion/',
    );
    const copy = document.renderNodes.find(
      (node) => node.namespacePath === 'Copy/',
    );

    expect(definition?.renderable).toBe(false);
    expect(copy?.material.color).toBe(0xf5f3ef);
    expect(copy?.material.materialPreset).toBe('upholstery.fabric');
    expect(copy?.material.textures?.roughnessMap?.preset).toBe('fabric.weave');
    expect(copy?.material.textures?.bumpMap?.strength).toBe(1);
    expect(copy?.geometry.puff).toBe(5);
  });

  it('inherits generic texture descriptors through namespaces and refs with local overrides', () => {
    const document = createSpatialDocument(`"FabricThing/" : "material-preset: upholstery.fabric; texture: fabric.weave; texture-repeat: 4 5; bump-texture-strength: 4"
"FabricThing/+0+4/+0+1/+0+3" : ""
"Copy/+6+4/+0+1/+0+3" : "ref: FabricThing/; texture-src: /textures/custom.png; texture-repeat: 1 1"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);

    const base = document.renderNodes.find((node) => node.namespacePath === 'FabricThing/');
    const copy = document.renderNodes.find((node) => node.namespacePath === 'Copy/');

    expect(base?.material.materialPreset).toBe('upholstery.fabric');
    expect(base?.material.textures?.map).toEqual({
      preset: 'fabric.weave',
      repeat: [4, 5],
    });
    expect(base?.material.textures?.bumpMap?.strength).toBe(4);
    expect(copy?.material.materialPreset).toBe('upholstery.fabric');
    expect(copy?.material.textures?.map).toEqual({
      preset: 'fabric.weave',
      src: '/textures/custom.png',
      repeat: [1, 1],
    });
    expect(copy?.material.textures?.bumpMap?.strength).toBe(4);
  });

  it('does not render nested local definitions without a concrete namespace anchor', () => {
    const document =
      createSpatialDocument(`"Sofa/" : "color: 0x2d3f4f; roughness: 0.92; box-radius: 0.16"
"Sofa/Base/+0+6/+0+40c/+0+3" : "box-radius: 0.1"
"Sofa/Back/+0+6/+44c+180c/+0+50c" : "box-radius: 0.18; rotation: -3.4,0,0"`);

    expect(document.diagnostics).toHaveLength(2);
    expect(document.diagnostics[0].message).toContain('has no concrete ancestor namespace anchor');
    expect(document.renderNodes).toHaveLength(0);
    expect(document.nodes).toHaveLength(2);
    expect(document.nodes.every((node) => node.renderable === false)).toBe(
      true,
    );
  });

  it('renders nested local definitions when their namespace has a concrete world-space anchor', () => {
    const document =
      createSpatialDocument(`"Sofa/" : "color: 0x2d3f4f; roughness: 0.92; box-radius: 0.16"
"Sofa/+10+6/+0+2/+0+3" : ""
"Sofa/Base/+0+6/+0+40c/+0+3" : "box-radius: 0.1"
"Sofa/Back/+0+6/+44c+180c/+0+50c" : "box-radius: 0.18; rotation: -3.4,0,0"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.nodes).toHaveLength(1);
    expect(document.nodes[0].renderable).toBe(false);
    expect(document.renderNodes[0].transform.position).toEqual([13, 0.2, 1.5]);
    expect(document.renderNodes[1].transform.position[0]).toBeCloseTo(13);
    expect(document.renderNodes[1].transform.position[1]).toBeCloseTo(1.34);
    expect(document.renderNodes[1].transform.position[2]).toBeCloseTo(0.25);
  });

  it('materializes referenced template descendants at the referring instance anchor', () => {
    const document =
      createSpatialDocument(`"Sofa/" : "color: 0x2d3f4f; roughness: 0.92; box-radius: 0.16"
"Sofa/Base/+0+6/+0+40c/+0+3" : "box-radius: 0.1"
"Sofa/Back/+0+6/+44c+180c/+0+50c" : "box-radius: 0.18; rotation: -3.4,0,0"
"Seat/+10+6/+0+2/+0+3" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.nodes).toHaveLength(3);

    const seat = document.nodes.find((node) => node.namespacePath === 'Seat/');
    const base = document.renderNodes.find(
      (node) => node.namespacePath === 'Seat/Base/',
    );
    const back = document.renderNodes.find(
      (node) => node.namespacePath === 'Seat/Back/',
    );

    expect(seat?.renderable).toBe(false);
    expect(base?.material.color).toBe(0x2d3f4f);
    expect(base?.geometry['box-radius']).toBe(0.1);
    expect(base?.transform.position).toEqual([13, 0.2, 1.5]);
    expect(back?.geometry['box-radius']).toBe(0.18);
    expect(back?.transform.position[0]).toBeCloseTo(13);
    expect(back?.transform.position[1]).toBeCloseTo(1.34);
    expect(back?.transform.position[2]).toBeCloseTo(0.25);
  });

  it('scales referenced template descendants when ref-scale is true', () => {
    const document = createSpatialDocument(`"Panel/" : "color: blue"
"Panel/Part/+0+4/+0+2/+0+2" : ""
"Copy/+10+8/+0+4/+0+1" : "ref: Panel/; ref-scale: true"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);

    const copy = document.nodes.find((node) => node.namespacePath === 'Copy/');
    const part = document.renderNodes[0];

    expect(copy?.metadata?.anchorScale).toEqual([2, 2, 0.5]);
    expect(part.namespacePath).toBe('Copy/Part/');
    expect(part.transform.position).toEqual([14, 2, 0.5]);
    expect(part.transform.scale).toEqual([8, 4, 1]);
  });

  it('anchors anonymous compound refs under a synthetic container without rendering the ref box', () => {
    const document =
      createSpatialDocument(`"Table/" : "color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0+8/+4+1/+0+8" : ""
"Table/LegA/+0+1/+0+5/+0+1" : "geometry: cylinder"
"Table/LegB/+7+1/+0+5/+0+1" : "geometry: cylinder"
"Table/LegC/+0+1/+0+5/+7+1" : "geometry: cylinder"
"Table/LegD/+7+1/+0+5/+7+1" : "geometry: cylinder"
"+19+4/+0+6/+7+3" : "ref: Table/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(5);

    const container = document.nodes.find(
      (node) => node.metadata?.reference === 'Table/',
    );
    const top = document.renderNodes.find((node) =>
      node.namespacePath?.endsWith('/Top/'),
    );
    const firstLeg = document.renderNodes.find(
      (node) =>
        node.namespacePath?.endsWith('/LegA/') &&
        node.box.source === '+0+1/+0+5/+0+1',
    );

    expect(container?.renderable).toBe(false);
    expect(container?.namespacePath).toBe('Ref6/');
    expect(container?.metadata?.anchorScale).toBeUndefined();
    expect(top?.namespacePath).toBe('Ref6/Top/');
    expect(top?.transform.position).toEqual([23, 4.5, 11]);
    expect(firstLeg?.namespacePath).toBe('Ref6/LegA/');
    expect(firstLeg?.geometry.kind).toBe('cylinder');
    expect(firstLeg?.transform.position).toEqual([19.5, 2.5, 7.5]);
    expect(document.renderNodes.some((node) => node.box.source === '+19+4/+0+6/+7+3')).toBe(false);
  });

  it('avoids existing namespaces when naming anonymous compound ref containers', () => {
    const document =
      createSpatialDocument(`"Table/" : "color: white; metalness: 0.8; roughness: 0.2"
"Ref7/+0+1/+0+1/+0+1" : "color: red"
"Table/Top/+0+8/+4+1/+0+8" : ""
"Table/LegA/+0+1/+0+5/+0+1" : "geometry: cylinder"
"Table/LegB/+7+1/+0+5/+0+1" : "geometry: cylinder"
"Table/LegC/+0+1/+0+5/+7+1" : "geometry: cylinder"
"Table/LegD/+7+1/+0+5/+7+1" : "geometry: cylinder"
"+19+4/+0+6/+7+3" : "ref: Table/"`);

    expect(document.diagnostics).toEqual([]);

    const userNamespace = document.nodes.find(
      (node) => node.namespacePath === 'Ref7/',
    );
    const generatedContainer = document.nodes.find(
      (node) => node.metadata?.reference === 'Table/',
    );
    const top = document.renderNodes.find(
      (node) => node.namespacePath === 'Ref8/Top/',
    );
    const firstLeg = document.renderNodes.find(
      (node) =>
        node.namespacePath === 'Ref8/LegA/' &&
        node.box.source === '+0+1/+0+5/+0+1',
    );

    expect(userNamespace?.metadata?.reference).toBeUndefined();
    expect(userNamespace?.children).toEqual([]);
    expect(generatedContainer?.namespacePath).toBe('Ref8/');
    expect(top?.transform.position).toEqual([23, 4.5, 11]);
    expect(firstLeg?.transform.position).toEqual([19.5, 2.5, 7.5]);
  });

  it('scales anonymous compound refs when ref-scale is true', () => {
    const document =
      createSpatialDocument(`"Table/" : "color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0+8/+4+1/+0+8" : ""
"Table/LegA/+0+1/+0+5/+0+1" : "geometry: cylinder"
"Table/LegB/+7+1/+0+5/+0+1" : "geometry: cylinder"
"Table/LegC/+0+1/+0+5/+7+1" : "geometry: cylinder"
"Table/LegD/+7+1/+0+5/+7+1" : "geometry: cylinder"
"+19+4/+0+6/+7+3" : "ref: Table/; ref-scale: true"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(5);

    const container = document.nodes.find(
      (node) => node.metadata?.reference === 'Table/',
    );
    const top = document.renderNodes.find((node) =>
      node.namespacePath?.endsWith('/Top/'),
    );
    const firstLeg = document.renderNodes.find(
      (node) =>
        node.namespacePath?.endsWith('/LegA/') &&
        node.box.source === '+0+1/+0+5/+0+1',
    );

    expect(container?.metadata?.anchorScale).toEqual([0.5, 1.2, 0.375]);
    expect(top?.transform.position[0]).toBeCloseTo(21);
    expect(top?.transform.position[1]).toBeCloseTo(5.4);
    expect(top?.transform.position[2]).toBeCloseTo(8.5);
    expect(top?.transform.scale).toEqual([4, 1.2, 3]);
    expect(firstLeg?.transform.position).toEqual([19.25, 3, 7.1875]);
    expect(firstLeg?.transform.scale).toEqual([0.5, 6, 0.375]);
  });

  it('keeps repeated template ref materializations distinct', () => {
    const document = createSpatialDocument(`"Sofa/" : "color: brown"
"Sofa/Base/+0+6/+0+40c/+0+3" : ""
"SeatA/+0+6/+0+2/+0+3" : "ref: Sofa/"
"SeatB/+10+6/+0+2/+0+3" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(new Set(document.renderNodes.map((node) => node.id)).size).toBe(2);
    expect(document.renderNodes[0].namespacePath).toBe('SeatA/Base/');
    expect(document.renderNodes[1].namespacePath).toBe('SeatB/Base/');
    expect(document.renderNodes[0].transform.position).toEqual([3, 0.2, 1.5]);
    expect(document.renderNodes[1].transform.position).toEqual([13, 0.2, 1.5]);
  });

  it('uses the newest declaration-only entry for inherited properties', () => {
    const document = createSpatialDocument(`"Sofa/" : "color: brown"
"Sofa/" : "color: blue"
"Sofa/+0+4/+0+2/+0+3" : ""`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].material.color).toBe('blue');
  });

  it('does not merge omitted properties from a replaced declaration into refs', () => {
    const document = createSpatialDocument(`"Sofa/" : "roughness: 0.2; geometry: sphere"
"Sofa/" : "color: blue"
"Seat/+0+4/+0+2/+0+3" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].material.color).toBe('blue');
    expect(document.renderNodes[0].material.roughness).toBeUndefined();
    expect(document.renderNodes[0].geometry.kind).toBe('box');
  });

  it('overwrites entries independently at nested namespace paths', () => {
    const document = createSpatialDocument(`"Room/+0+1/+0+1/+0+1" : ""
"Room/Chair/+0+2/+0+2/+0+2" : "color: red"
"Room/Chair/+4+2/+0+2/+0+2" : "color: green"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].namespacePath).toBe('Room/Chair/');
    expect(document.renderNodes[0].box.source).toBe('+4+2/+0+2/+0+2');
    expect(document.renderNodes[0].material.color).toBe('green');
  });

  it('binds refs to the newest target available at the reference line', () => {
    const document = createSpatialDocument(`"Sofa/" : "color: brown"
"SeatA/+0+4/+0+2/+0+3" : "ref: Sofa/"
"Sofa/" : "color: blue"
"SeatB/+5+4/+0+2/+0+3" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes.find((node) => node.namespacePath === 'SeatA/')?.material.color).toBe('brown');
    expect(document.renderNodes.find((node) => node.namespacePath === 'SeatB/')?.material.color).toBe('blue');
  });

  it('distinguishes historical namespace versions while resolving ref chains', () => {
    const document = createSpatialDocument(`"A/+0+1/+0+1/+0+1" : "roughness: 0.25"
"B/" : "ref: A/; color: green"
"A/" : "ref: B/; metalness: 0.75"
"X/+2+1/+0+1/+0+1" : "ref: A/"`);

    expect(document.diagnostics).toEqual([]);
    const instance = document.renderNodes.find(
      (node) => node.namespacePath === 'X/',
    );
    expect(instance?.material.color).toBe('green');
    expect(instance?.material.roughness).toBe(0.25);
    expect(instance?.material.metalness).toBe(0.75);
  });

  it('snapshots overwritten compound descendants for existing refs', () => {
    const document = createSpatialDocument(`"Sofa/" : "color: brown"
"Sofa/Cushion/+0+2/+0+1/+0+2" : "color: tan"
"SeatA/+0+4/+0+2/+0+3" : "ref: Sofa/"
"Sofa/Cushion/+3+2/+0+1/+0+2" : "color: blue"
"SeatB/+6+4/+0+2/+0+3" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    const first = document.renderNodes.find((node) => node.namespacePath === 'SeatA/Cushion/');
    const second = document.renderNodes.find((node) => node.namespacePath === 'SeatB/Cushion/');
    expect(first?.box.source).toBe('+0+2/+0+1/+0+2');
    expect(first?.material.color).toBe('tan');
    expect(second?.box.source).toBe('+3+2/+0+1/+0+2');
    expect(second?.material.color).toBe('blue');
  });

  it('keeps anonymous declarations independent', () => {
    const document = createSpatialDocument(`"+0+1/+0+1/+0+1" : "color: red"
"+0+1/+0+1/+0+1" : "color: blue"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.renderNodes.map((node) => node.material.color)).toEqual(['red', 'blue']);
  });

  it('unions overlapping parts within a component but packs a global collision', () => {
    const document = createSpatialDocument(`"Lamp/+0+1/+0+1/+0+1" : ""
"Lamp/Shade/+0+4/+0+2/+0+4" : ""
"Lamp/Bulb/+1+2/+0+2/+1+2" : "geometry: sphere"
"+0+4/+0+2/+0+4" : "color: blue"`);

    const shade = document.renderNodes.find((node) => node.namespacePath === 'Lamp/Shade/');
    const bulb = document.renderNodes.find((node) => node.namespacePath === 'Lamp/Bulb/');
    const global = document.renderNodes.find((node) => node.material.color === 'blue');
    expect(shade?.unionGroupId).toBe('union-1');
    expect(bulb?.unionGroupId).toBe('union-1');
    expect(global?.unionGroupId).toBeUndefined();
    expect(global?.bounds.minY).toBe(0);
  });

  it('allows puff-only child geometry declarations without dropping inherited box-radius', () => {
    const document =
      createSpatialDocument(`"Cushion/" : "box-radius: 0.1; puff: 2"
"Cushion/+0+4/+0+1/+0+3" : "puff: 5"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].geometry['box-radius']).toBe(0.1);
    expect(document.renderNodes[0].geometry.puff).toBe(5);
  });

  it('reports unresolved references', () => {
    const document = createSpatialDocument(
      '"Seat/+3+5/+0+3/+0+15" : "ref: Sofa/"',
    );

    expect(document.diagnostics[0].message).toBe(
      'Reference target "Sofa/" was not found.',
    );
  });
  it('builds declaration-order boolean subtraction expressions from overlapping world-space tools', () => {
    const document = createSpatialDocument(`"+0+6/+0+6/+0+6" : "geometry: sphere; color: blue"
"+2+2/+0+6/+2+2" : "geometry: cylinder; operation: subtraction"`);

    expect(document.csgExpressions).toHaveLength(1);
    expect(document.csgExpressions[0].base.geometry.kind).toBe('sphere');
    expect(document.csgExpressions[0].operations[0].op).toBe('subtraction');
    expect(document.csgExpressions[0].operations[0].tool.geometry.kind).toBe('cylinder');
    expect(document.renderNodes).toHaveLength(0);
    expect(document.csgExpressions[0].operations[0].tool.csgConsumed).toBe(true);
  });

  it('applies a boolean tool to the nearest earlier overlapping world-space primitive', () => {
    const document = createSpatialDocument(`"+0+4/+0+4/+0+4" : "geometry: box"
"+1+4/+0+4/+0+4" : "geometry: sphere"
"+2+1/+0+4/+0+1" : "geometry: cylinder; operation: subtraction"`);

    expect(document.csgExpressions).toHaveLength(1);
    expect(document.csgExpressions[0].base.geometry.kind).toBe('sphere');
    expect(document.renderNodes.map((node) => node.geometry.kind)).toEqual(['box']);
    expect(document.renderNodes[0].bounds.maxX).toBe(4);
    expect(document.csgExpressions[0].operations[0].tool.transform.position[0]).toBe(2.5);
  });

  it('chains declaration-order boolean operations inside a concrete namespace scope', () => {
    const document = createSpatialDocument(`"Mug/+0+1/+0+1/+0+1" : "color: white"
"Mug/Body/+5+2/+1+2/+1+2" : "geometry: cylinder; color: 0xf5f3ef; roughness: 0.65"
"Mug/Hollow/+530c+140c/+120c+190c/+130c+140c" : "geometry: cylinder; operation: subtraction"
"Mug/Handle/+680c+110c/+155c+110c/+135c+130c" : "box-radius: 0.18; operation: union"
"Mug/HandleHole/+700c+70c/+175c+70c/+155c+90c" : "box-radius: 0.12; operation: subtraction"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.csgExpressions).toHaveLength(1);
    expect(document.csgExpressions[0].scopePath).toBe('Mug/');
    expect(document.csgExpressions[0].base.namespacePath).toBe('Mug/Body/');
    expect(document.csgExpressions[0].operations.map((operation) => operation.op)).toEqual([
      'subtraction',
      'union',
      'subtraction',
    ]);
    expect(document.renderNodes).toHaveLength(0);
  });

});
