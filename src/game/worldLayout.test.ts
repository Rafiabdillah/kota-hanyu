import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAllOpenWorldBuildings,
  CAMPUS_FACILITIES,
  CHAPTER_WORLD_COORDS,
  computeFloorSupportY,
  describeWorldLocation,
  findInsideBuilding,
  FLOOR_2_Y,
  FLOOR_3_Y,
  resolveOpenWorldCollision,
  ROAMING_CITIZEN_NPCS,
  WORLD_BOOST_PADS,
  WORLD_BOUNDS,
  WORLD_INTERACTIVE_PROPS,
  WORLD_JUMP_PADS,
} from "./worldLayout.ts";

const SAMPLE_CHAPTERS = [
  { id: "bab1", order: 1, shortTitle: "Sapaan", buildingStyle: "gate" as const, accentHex: "#dc2626", worldPos: CHAPTER_WORLD_COORDS.bab1 },
  { id: "bab2", order: 2, shortTitle: "Kelas", buildingStyle: "classroom" as const, accentHex: "#2563eb", worldPos: CHAPTER_WORLD_COORDS.bab2 },
  { id: "bab3", order: 3, shortTitle: "Pasar", buildingStyle: "market" as const, accentHex: "#059669", worldPos: CHAPTER_WORLD_COORDS.bab3 },
  { id: "bab4", order: 4, shortTitle: "Stasiun", buildingStyle: "station" as const, accentHex: "#7c3aed", worldPos: CHAPTER_WORLD_COORDS.bab4 },
  { id: "bab5", order: 5, shortTitle: "Klinik", buildingStyle: "clinic" as const, accentHex: "#0d9488", worldPos: CHAPTER_WORLD_COORDS.bab5 },
  { id: "bab6", order: 6, shortTitle: "Lab AI", buildingStyle: "lab" as const, accentHex: "#0891b2", worldPos: CHAPTER_WORLD_COORDS.bab6 },
  { id: "bab7", order: 7, shortTitle: "Kedai Teh", buildingStyle: "teahouse" as const, accentHex: "#b45309", worldPos: CHAPTER_WORLD_COORDS.bab7 },
];

test("open world spans expanded playable bounds and creates 24 enterable buildings with living world props", () => {
  const buildings = buildAllOpenWorldBuildings(SAMPLE_CHAPTERS);
  assert.equal(buildings.length, 24);
  assert.equal(CAMPUS_FACILITIES.length, 17);
  assert.ok(WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX >= 150);
  assert.ok(WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ >= 150);
  assert.ok(buildings.every((b) => b.enterable));
  assert.ok(buildings.filter((b) => b.floors >= 2).length >= 8);
  assert.ok(WORLD_JUMP_PADS.length >= 7);
  assert.ok(WORLD_BOOST_PADS.length >= 4);
  assert.ok(WORLD_INTERACTIVE_PROPS.length >= 4);
  assert.ok(ROAMING_CITIZEN_NPCS.length >= 5);

  // Verify no two buildings overlap each other's center footprint
  for (let i = 0; i < buildings.length; i += 1) {
    for (let j = i + 1; j < buildings.length; j += 1) {
      const a = buildings[i];
      const b = buildings[j];
      const dx = Math.abs(a.x - b.x);
      const dz = Math.abs(a.z - b.z);
      assert.ok(dx >= 9 || dz >= 8, `Buildings ${a.id} and ${b.id} too close: dx=${dx}, dz=${dz}`);
    }
  }
});

test("player can walk straight through open south doorway into enclosed building interior without getting blocked", () => {
  const buildings = buildAllOpenWorldBuildings(SAMPLE_CHAPTERS);
  const lib = buildings.find((b) => b.id === "facility-library")!;
  const allWalls = buildings.flatMap((b) => b.wallBoxes);

  for (let z = lib.z + 3.0; z >= lib.z - 0.5; z -= 0.4) {
    const res = resolveOpenWorldCollision(lib.x, z, allWalls, []);
    assert.ok(Math.abs(res.x - lib.x) < 0.05, "Doorway path should not deflect X");
    assert.ok(Math.abs(res.z - z) < 0.05, "Doorway threshold should be unobstructed");
  }

  const detected = findInsideBuilding(lib.x, lib.z, buildings);
  assert.equal(detected?.id, "facility-library");
  assert.match(describeWorldLocation(lib.x, lib.z, buildings), /Perpustakaan Aksara/);
});

test("multi-story tower stairs elevate player cleanly through Floor 2 and Floor 3 rooftop", () => {
  const buildings = buildAllOpenWorldBuildings(SAMPLE_CHAPTERS);
  const tower = buildings.find((b) => b.id === "facility-tower")!;
  assert.equal(tower.floors, 3);

  const zones = buildings.flatMap((b) => b.elevatedZones);
  const ramps = buildings.flatMap((b) => b.stairRamps);

  // Climb East stairs 1 -> 2
  let y = 0;
  for (let z = tower.z + 2.5; z >= tower.z - 1.7; z -= 0.35) {
    y = computeFloorSupportY(tower.x + 4.3, z, y, zones, ramps);
  }
  assert.ok(Math.abs(y - FLOOR_2_Y) < 0.2, `Expected ~${FLOOR_2_Y} on Floor 2, got ${y}`);

  // Step onto Floor 2 interior & verify location label shows Lt.2
  const y2 = computeFloorSupportY(tower.x, tower.z, y, zones, ramps);
  assert.equal(y2, FLOOR_2_Y);
  assert.match(describeWorldLocation(tower.x, tower.z, buildings, y2), /Lt\.2/);

  // Climb West stairs 2 -> 3
  let yTop = y2;
  for (let z = tower.z + 2.5; z >= tower.z - 1.7; z -= 0.35) {
    yTop = computeFloorSupportY(tower.x - 4.3, z, yTop, zones, ramps);
  }
  assert.ok(Math.abs(yTop - FLOOR_3_Y) < 0.2, `Expected ~${FLOOR_3_Y} on Floor 3, got ${yTop}`);
  assert.match(describeWorldLocation(tower.x, tower.z, buildings, FLOOR_3_Y), /Lt\.3/);
});

test("solid side/back walls block entry outside the doorway and clamp world perimeter", () => {
  const buildings = buildAllOpenWorldBuildings(SAMPLE_CHAPTERS);
  const classroom = buildings.find((b) => b.id === "bab2")!;
  const allWalls = buildings.flatMap((b) => b.wallBoxes);

  const pushed = resolveOpenWorldCollision(classroom.x, classroom.z - 2.35, allWalls, []);
  assert.ok(Math.abs(pushed.z - (classroom.z - 2.35)) > 0.2);

  // Ground-floor front wall doesn't block a player standing on Floor 2 balcony above
  const arcade = buildings.find((b) => b.id === "facility-arcade")!;
  const balconyCheck = resolveOpenWorldCollision(arcade.x - 2.0, arcade.z + 1.95, allWalls, [], 0.42, FLOOR_2_Y);
  assert.equal(balconyCheck.z, arcade.z + 1.95);

  const edge = resolveOpenWorldCollision(999, -999, allWalls, []);
  assert.equal(edge.x, WORLD_BOUNDS.maxX);
  assert.equal(edge.z, WORLD_BOUNDS.minZ);
});
