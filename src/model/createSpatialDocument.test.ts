import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from './createSpatialDocument';

describe('createSpatialDocument namespaced spatial declarations', () => {
  it('carries imported model settings into a renderable spatial node', () => {
    const document = createSpatialDocument(
      '"Chair/+1+4/+2+4/+2+4" : "model: modern_chair.glb; model-align: floor; rotation: 5,10,5"',
    );
    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes[0].model).toMatchObject({ source: 'modern_chair.glb', fit: 'contain', align: 'floor' });
  });

  it('keeps imported models out of CSG expressions as bases and inherited tools', () => {
    const document = createSpatialDocument(`"ModelTool/" : "operation: subtraction"
"Chair/+0+1/+0+1/+0+1" : "model: chair.glb"
"ModelTool/+0+1/+0+1/+0+1" : "model: cutout.glb"`);
    expect(document.csgExpressions).toEqual([]);
    expect(document.renderNodes.filter((node) => node.model)).toHaveLength(2);
    expect(document.diagnostics.map(({ message }) => message)).toContain(
      'CSG operations are not supported for imported models.',
    );
  });

  it('resolves namespace inheritance and renders composed children in parent-local space', () => {
    const document =
      createSpatialDocument(`"Table/+3d+8d/+0d+5d/+0d+8d" : "color: 0x333333; metalness: 0.8; roughness: 0.2"
"Table/Top/+1d+6d/+0d+5d/+0d+6d" : ""
"Table/Leg/" : "geometry: cylinder"
"Table/Leg/+1d+2d/+0d+7d/+0d+1d" : ""`);

    expect(document.diagnostics).toEqual([]);
    expect(document.nodes).toHaveLength(1);
    expect(document.nodes[0].renderable).toBe(false);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.renderNodes[0].material.color).toBe(0x333333);
    expect(document.renderNodes[0].transform.position).toEqual([0.7, 0.25, 0.3]);
    expect(document.renderNodes[1].geometry.kind).toBe('cylinder');
    expect(document.renderNodes[1].transform.position).toEqual([0.5, 0.35, 0.05]);
  });

  it('rotates composed descendants as a single parent group without double-applying parent rotation', () => {
    const document =
      createSpatialDocument(`"Table/+3d+8d/+0d+5d/+4d+8d" : "rotation: 0,90,0; color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""
"Table/Leg/" : "geometry: cylinder"
"Table/LegA/+0d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegB/+7d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(3);
    expect(document.renderNodes[0].transform.position[0]).toBeCloseTo(0.7);
    expect(document.renderNodes[0].transform.position[1]).toBeCloseTo(0.45);
    expect(document.renderNodes[0].transform.position[2]).toBeCloseTo(0);
    expect(document.renderNodes[0].transform.rotation[1]).toBeCloseTo(
      Math.PI / 2,
    );
    expect(document.renderNodes[1].transform.position[0]).toBeCloseTo(0.35);
    expect(document.renderNodes[1].transform.position[2]).toBeCloseTo(0.35);
    expect(document.renderNodes[2].transform.position[0]).toBeCloseTo(1.05);
    expect(document.renderNodes[2].transform.position[2]).toBeCloseTo(-0.35);
  });

  it('uses only the newest concrete entry in a namespace', () => {
    const document =
      createSpatialDocument(`"Table/+0d+4d/+0d+4d/+0d+4d" : "color: grey"
"Table/Leg/" : "geometry: cylinder"
"Table/Leg/+0d+1d/+0d+1d/+0d+1d" : "color: red"
"Table/Leg/+2d+1d/+0d+1d/+0d+1d" : ""`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].material.color).toBe('grey');
    expect(document.renderNodes[0].box.source).toBe('+2d+1d/+0d+1d/+0d+1d');
  });

  it('resolves refs against prior named objects and applies the local instance box', () => {
    const document =
      createSpatialDocument(`"Sofa/+7d+4d/+0d+3d/+0d+2d" : "color: brown; metalness: 0.2; roughness: 0.8"
"Seat/+3d+5d/+0d+3d/+0d+15d" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.renderNodes[1].material.color).toBe('brown');
    expect(document.renderNodes[1].material.metalness).toBe(0.2);
    expect(document.renderNodes[1].transform.position).toEqual([0.55, 0.15, 0.75]);
  });

  it('inherits content through namespace declarations and refs', () => {
    const document =
      createSpatialDocument(`"Poster/" : "content-kind: text; content-text-uri: Sale"
"Poster/+0d+4d/+0d+2d/+0d+1d" : ""
"Copy/+6d+4d/+0d+2d/+0d+1d" : "ref: Poster/"`);

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
"Poster/+0d+4d/+0d+2d/+0d+1d" : "content-kind: text; content-text-uri: Sold"`);

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
      createSpatialDocument(`"Cabinet/" : "box-radius: 0.02; color: orange"
"Cabinet/+0d+4d/+0d+2d/+0d+3d" : ""
"Copy/+6d+4d/+0d+2d/+0d+3d" : "ref: Cabinet/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.renderNodes[0].geometry.kind).toBe('box');
    expect(document.renderNodes[0].geometry['box-radius']).toBe(0.02);
    expect(document.renderNodes[1].geometry.kind).toBe('box');
    expect(document.renderNodes[1].geometry['box-radius']).toBe(0.02);
  });

  it('allows child boxes to override inherited box-radius with zero', () => {
    const document =
      createSpatialDocument(`"Cabinet/" : "box-radius: 0.02; color: orange"
"Cabinet/+0d+4d/+0d+2d/+0d+3d" : "box-radius: 0"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].geometry['box-radius']).toBe(0);
  });

  it('keeps unanchored nested coordinates definition-only while refs inherit scalar materials', () => {
    const document = createSpatialDocument(`"Sofa/Cushion/" : "color: 0xf5f3ef; metalness: 0; puff: 5"
"Sofa/Cushion/+0d+4d/+0d+1d/+0d+3d" : "roughness: 0.92"
"Copy/+6d+4d/+0d+1d/+0d+3d" : "ref: Sofa/Cushion/; roughness: 0.8"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);

    const definition = document.nodes.find((node) => node.namespacePath === 'Sofa/Cushion/');
    const copy = document.renderNodes.find((node) => node.namespacePath === 'Copy/');

    expect(definition?.renderable).toBe(false);
    expect(copy?.material.color).toBe(0xf5f3ef);
    expect(copy?.material.metalness).toBe(0);
    expect(copy?.material.roughness).toBe(0.8);
    expect(copy?.geometry.puff).toBe(5);
  });

  it('does not render nested local definitions without a concrete namespace anchor', () => {
    const document =
      createSpatialDocument(`"Sofa/" : "color: 0x2d3f4f; roughness: 0.92; box-radius: 0.016"
"Sofa/Base/+0d+6d/+0d+40m/+0d+3d" : "box-radius: 0.01"
"Sofa/Back/+0d+6d/+44m+180m/+0d+50m" : "box-radius: 0.018; rotation: -3.4,0,0"`);

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
      createSpatialDocument(`"Sofa/" : "color: 0x2d3f4f; roughness: 0.92; box-radius: 0.016"
"Sofa/+10d+6d/+0d+2d/+0d+3d" : ""
"Sofa/Base/+0d+6d/+0d+40m/+0d+3d" : "box-radius: 0.01"
"Sofa/Back/+0d+6d/+44m+180m/+0d+50m" : "box-radius: 0.018; rotation: -3.4,0,0"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.nodes).toHaveLength(1);
    expect(document.nodes[0].renderable).toBe(false);
    expect(document.renderNodes[0].transform.position).toEqual([1.3, 0.02, 0.15]);
    expect(document.renderNodes[1].transform.position[0]).toBeCloseTo(1.3);
    expect(document.renderNodes[1].transform.position[1]).toBeCloseTo(0.134);
    expect(document.renderNodes[1].transform.position[2]).toBeCloseTo(0.025);
  });

  it('materializes referenced template descendants at the referring instance anchor', () => {
    const document =
      createSpatialDocument(`"Sofa/" : "color: 0x2d3f4f; roughness: 0.92; box-radius: 0.016"
"Sofa/Base/+0d+6d/+0d+40m/+0d+3d" : "box-radius: 0.01"
"Sofa/Back/+0d+6d/+44m+180m/+0d+50m" : "box-radius: 0.018; rotation: -3.4,0,0"
"Seat/+10d+6d/+0d+2d/+0d+3d" : "ref: Sofa/"`);

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
    expect(base?.geometry['box-radius']).toBe(0.01);
    expect(base?.transform.position).toEqual([1.3, 0.02, 0.15]);
    expect(back?.geometry['box-radius']).toBe(0.018);
    expect(back?.transform.position[0]).toBeCloseTo(1.3);
    expect(back?.transform.position[1]).toBeCloseTo(0.134);
    expect(back?.transform.position[2]).toBeCloseTo(0.025);
  });

  it('scales referenced template descendants when ref-scale is true', () => {
    const document = createSpatialDocument(`"Panel/" : "color: blue"
"Panel/Part/+0d+4d/+0d+2d/+0d+2d" : ""
"Copy/+10d+8d/+0d+4d/+0d+1d" : "ref: Panel/; ref-scale: true"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);

    const copy = document.nodes.find((node) => node.namespacePath === 'Copy/');
    const part = document.renderNodes[0];

    expect(copy?.metadata?.anchorScale).toEqual([2, 2, 0.5]);
    expect(part.namespacePath).toBe('Copy/Part/');
    expect(part.transform.position).toEqual([1.4, 0.2, 0.05]);
    expect(part.transform.scale).toEqual([0.8, 0.4, 0.1]);
  });

  it('anchors anonymous compound refs under a synthetic container without rendering the ref box', () => {
    const document =
      createSpatialDocument(`"Table/" : "color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""
"Table/LegA/+0d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegB/+7d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegC/+0d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"
"Table/LegD/+7d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"
"+19d+4d/+0d+6d/+7d+3d" : "ref: Table/"`);

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
        node.box.source === '+0d+1d/+0d+5d/+0d+1d',
    );

    expect(container?.renderable).toBe(false);
    expect(container?.namespacePath).toBe('Ref6/');
    expect(container?.metadata?.anchorScale).toBeUndefined();
    expect(top?.namespacePath).toBe('Ref6/Top/');
    expect(top?.transform.position).toEqual([2.3, 0.45, 1.1]);
    expect(firstLeg?.namespacePath).toBe('Ref6/LegA/');
    expect(firstLeg?.geometry.kind).toBe('cylinder');
    expect(firstLeg?.transform.position).toEqual([1.95, 0.25, 0.75]);
    expect(document.renderNodes.some((node) => node.box.source === '+19d+4d/+0d+6d/+7d+3d')).toBe(false);
  });

  it('avoids existing namespaces when naming anonymous compound ref containers', () => {
    const document =
      createSpatialDocument(`"Table/" : "color: white; metalness: 0.8; roughness: 0.2"
"Ref7/+0d+1d/+0d+1d/+0d+1d" : "color: red"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""
"Table/LegA/+0d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegB/+7d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegC/+0d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"
"Table/LegD/+7d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"
"+19d+4d/+0d+6d/+7d+3d" : "ref: Table/"`);

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
        node.box.source === '+0d+1d/+0d+5d/+0d+1d',
    );

    expect(userNamespace?.metadata?.reference).toBeUndefined();
    expect(userNamespace?.children).toEqual([]);
    expect(generatedContainer?.namespacePath).toBe('Ref8/');
    expect(top?.transform.position).toEqual([2.3, 0.45, 1.1]);
    expect(firstLeg?.transform.position).toEqual([1.95, 0.25, 0.75]);
  });

  it('scales anonymous compound refs when ref-scale is true', () => {
    const document =
      createSpatialDocument(`"Table/" : "color: white; metalness: 0.8; roughness: 0.2"
"Table/Top/+0d+8d/+4d+1d/+0d+8d" : ""
"Table/LegA/+0d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegB/+7d+1d/+0d+5d/+0d+1d" : "geometry: cylinder"
"Table/LegC/+0d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"
"Table/LegD/+7d+1d/+0d+5d/+7d+1d" : "geometry: cylinder"
"+19d+4d/+0d+6d/+7d+3d" : "ref: Table/; ref-scale: true"`);

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
        node.box.source === '+0d+1d/+0d+5d/+0d+1d',
    );

    const anchorScale = container?.metadata?.anchorScale as number[];
    expect(anchorScale[0]).toBeCloseTo(0.5);
    expect(anchorScale[1]).toBeCloseTo(1.2);
    expect(anchorScale[2]).toBeCloseTo(0.375);
    expect(top?.transform.position[0]).toBeCloseTo(2.1);
    expect(top?.transform.position[1]).toBeCloseTo(0.54);
    expect(top?.transform.position[2]).toBeCloseTo(0.85);
    expect(top?.transform.scale).toEqual([0.4, 0.12, 0.3]);
    expect(firstLeg?.transform.position[0]).toBeCloseTo(1.925);
    expect(firstLeg?.transform.position[1]).toBeCloseTo(0.3);
    expect(firstLeg?.transform.position[2]).toBeCloseTo(0.71875);
    expect(firstLeg?.transform.scale).toEqual([0.05, 0.6, 0.0375]);
  });

  it('keeps repeated template ref materializations distinct', () => {
    const document = createSpatialDocument(`"Sofa/" : "color: brown"
"Sofa/Base/+0d+6d/+0d+40m/+0d+3d" : ""
"SeatA/+0d+6d/+0d+2d/+0d+3d" : "ref: Sofa/"
"SeatB/+10d+6d/+0d+2d/+0d+3d" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(new Set(document.renderNodes.map((node) => node.id)).size).toBe(2);
    expect(document.renderNodes[0].namespacePath).toBe('SeatA/Base/');
    expect(document.renderNodes[1].namespacePath).toBe('SeatB/Base/');
    expect(document.renderNodes[0].transform.position).toEqual([0.3, 0.02, 0.15]);
    expect(document.renderNodes[1].transform.position).toEqual([1.3, 0.02, 0.15]);
  });

  it('uses the newest declaration-only entry for inherited properties', () => {
    const document = createSpatialDocument(`"Sofa/" : "color: brown"
"Sofa/" : "color: blue"
"Sofa/+0d+4d/+0d+2d/+0d+3d" : ""`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].material.color).toBe('blue');
  });

  it('does not merge omitted properties from a replaced declaration into refs', () => {
    const document = createSpatialDocument(`"Sofa/" : "roughness: 0.2; geometry: sphere"
"Sofa/" : "color: blue"
"Seat/+0d+4d/+0d+2d/+0d+3d" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].material.color).toBe('blue');
    expect(document.renderNodes[0].material.roughness).toBeUndefined();
    expect(document.renderNodes[0].geometry.kind).toBe('box');
  });

  it('overwrites entries independently at nested namespace paths', () => {
    const document = createSpatialDocument(`"Room/+0d+1d/+0d+1d/+0d+1d" : ""
"Room/Chair/+0d+2d/+0d+2d/+0d+2d" : "color: red"
"Room/Chair/+4d+2d/+0d+2d/+0d+2d" : "color: green"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].namespacePath).toBe('Room/Chair/');
    expect(document.renderNodes[0].box.source).toBe('+4d+2d/+0d+2d/+0d+2d');
    expect(document.renderNodes[0].material.color).toBe('green');
  });

  it('binds refs to the newest target available at the reference line', () => {
    const document = createSpatialDocument(`"Sofa/" : "color: brown"
"SeatA/+0d+4d/+0d+2d/+0d+3d" : "ref: Sofa/"
"Sofa/" : "color: blue"
"SeatB/+5d+4d/+0d+2d/+0d+3d" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes.find((node) => node.namespacePath === 'SeatA/')?.material.color).toBe('brown');
    expect(document.renderNodes.find((node) => node.namespacePath === 'SeatB/')?.material.color).toBe('blue');
  });

  it('distinguishes historical namespace versions while resolving ref chains', () => {
    const document = createSpatialDocument(`"A/+0d+1d/+0d+1d/+0d+1d" : "roughness: 0.25"
"B/" : "ref: A/; color: green"
"A/" : "ref: B/; metalness: 0.75"
"X/+2d+1d/+0d+1d/+0d+1d" : "ref: A/"`);

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
"Sofa/Cushion/+0d+2d/+0d+1d/+0d+2d" : "color: tan"
"SeatA/+0d+4d/+0d+2d/+0d+3d" : "ref: Sofa/"
"Sofa/Cushion/+3d+2d/+0d+1d/+0d+2d" : "color: blue"
"SeatB/+6d+4d/+0d+2d/+0d+3d" : "ref: Sofa/"`);

    expect(document.diagnostics).toEqual([]);
    const first = document.renderNodes.find((node) => node.namespacePath === 'SeatA/Cushion/');
    const second = document.renderNodes.find((node) => node.namespacePath === 'SeatB/Cushion/');
    expect(first?.box.source).toBe('+0d+2d/+0d+1d/+0d+2d');
    expect(first?.material.color).toBe('tan');
    expect(second?.box.source).toBe('+3d+2d/+0d+1d/+0d+2d');
    expect(second?.material.color).toBe('blue');
  });

  it('keeps anonymous declarations independent', () => {
    const document = createSpatialDocument(`"+0d+1d/+0d+1d/+0d+1d" : "color: red"
"+0d+1d/+0d+1d/+0d+1d" : "color: blue"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(2);
    expect(document.renderNodes.map((node) => node.material.color)).toEqual(['red', 'blue']);
  });

  it('allows puff-only child geometry declarations without dropping inherited box-radius', () => {
    const document =
      createSpatialDocument(`"Cushion/" : "box-radius: 0.01; puff: 2"
"Cushion/+0d+4d/+0d+1d/+0d+3d" : "puff: 5"`);

    expect(document.diagnostics).toEqual([]);
    expect(document.renderNodes).toHaveLength(1);
    expect(document.renderNodes[0].geometry['box-radius']).toBe(0.01);
    expect(document.renderNodes[0].geometry.puff).toBe(5);
  });

  it('reports unresolved references', () => {
    const document = createSpatialDocument(
      '"Seat/+3d+5d/+0d+3d/+0d+15d" : "ref: Sofa/"',
    );

    expect(document.diagnostics[0].message).toBe(
      'Reference target "Sofa/" was not found.',
    );
  });
  it('builds declaration-order boolean subtraction expressions from overlapping world-space tools', () => {
    const document = createSpatialDocument(`"+0d+6d/+0d+6d/+0d+6d" : "geometry: sphere; color: blue"
"+2d+2d/+0d+6d/+2d+2d" : "geometry: cylinder; operation: subtraction"`);

    expect(document.csgExpressions).toHaveLength(1);
    expect(document.csgExpressions[0].base.geometry.kind).toBe('sphere');
    expect(document.csgExpressions[0].operations[0].op).toBe('subtraction');
    expect(document.csgExpressions[0].operations[0].tool.geometry.kind).toBe('cylinder');
    expect(document.renderNodes).toHaveLength(0);
    expect(document.csgExpressions[0].operations[0].tool.csgConsumed).toBe(true);
  });

  it('applies a boolean tool to the nearest earlier overlapping world-space primitive', () => {
    const document = createSpatialDocument(`"+0d+4d/+0d+4d/+0d+4d" : "geometry: box"
"+1d+4d/+0d+4d/+0d+4d" : "geometry: sphere"
"+2d+1d/+0d+4d/+0d+1d" : "geometry: cylinder; operation: subtraction"`);

    expect(document.csgExpressions).toHaveLength(1);
    expect(document.csgExpressions[0].base.geometry.kind).toBe('sphere');
    expect(document.renderNodes.map((node) => node.geometry.kind)).toEqual(['box']);
  });

  it('chains declaration-order boolean operations inside a concrete namespace scope', () => {
    const document = createSpatialDocument(`"Mug/+0d+1d/+0d+1d/+0d+1d" : "color: white"
"Mug/Body/+5d+2d/+1d+2d/+1d+2d" : "geometry: cylinder; color: 0xf5f3ef; roughness: 0.65"
"Mug/Hollow/+530m+140m/+120m+190m/+130m+140m" : "geometry: cylinder; operation: subtraction"
"Mug/Handle/+680m+110m/+155m+110m/+135m+130m" : "box-radius: 0.018; operation: union"
"Mug/HandleHole/+700m+70m/+175m+70m/+155m+90m" : "box-radius: 0.012; operation: subtraction"`);

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
