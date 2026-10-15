import Matter from 'matter-js';
import { CENTER_X, COLLISION, DIVIDER, PLAYFIELD, TABLE_HEIGHT, TABLE_WIDTH } from './constants';
import { box } from './geometry';

export interface DividerDefinition {
  /** The centre wall, with an arch over its top and a gap at mid height (FR-C2). */
  sections: Matter.Body[];
  /** The ceiling and the floor under the drains, shared by both halves. */
  frame: Matter.Body[];
}

function pillar(top: number, bottom: number, label: string): Matter.Body {
  return Matter.Bodies.rectangle(CENTER_X, (top + bottom) / 2, DIVIDER.thickness, bottom - top, {
    isStatic: true,
    label,
    restitution: 0.3,
    friction: 0.02,
    chamfer: { radius: DIVIDER.thickness / 2 - 1 },
    collisionFilter: { category: COLLISION.wall, mask: COLLISION.ball },
  });
}

export function buildDivider(): DividerDefinition {
  return {
    sections: [
      pillar(DIVIDER.archBottom, DIVIDER.midGapTop, 'divider'),
      pillar(DIVIDER.midGapBottom, TABLE_HEIGHT + 40, 'divider'),
    ],
    frame: [
      box(CENTER_X, PLAYFIELD.top - 40, TABLE_WIDTH + 200, 80, 'ceiling'),
      box(CENTER_X, TABLE_HEIGHT + 60, TABLE_WIDTH + 200, 80, 'floor'),
    ],
  };
}
