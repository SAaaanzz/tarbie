/* ─── Константы расписания колледжа ─── */
// Сетка пар и 30-минутных слотов — используется при планировании занятий
// (выбор времени/кабинета) на фронтенде и для проверки занятости.

export interface CollegePair {
  number: number;
  start: string;   // "08:00"
  end: string;      // "09:30"
  slots: string[];  // 30-min slot start times within this pair
}

export const COLLEGE_PAIRS: CollegePair[] = [
  { number: 1, start: '08:00', end: '09:30', slots: ['08:00', '08:30', '09:00'] },
  { number: 2, start: '09:40', end: '11:10', slots: ['09:40', '10:10', '10:40'] },
  { number: 3, start: '11:25', end: '12:55', slots: ['11:25', '11:55', '12:25'] },
  { number: 4, start: '13:25', end: '14:55', slots: ['13:25', '13:55', '14:25'] },
  { number: 5, start: '15:05', end: '16:35', slots: ['15:05', '15:35', '16:05'] },
  { number: 6, start: '16:50', end: '18:20', slots: ['16:50', '17:20', '17:50'] },
  { number: 7, start: '18:30', end: '20:00', slots: ['18:30', '19:00', '19:30'] },
];

/** All valid 30-min slot start times */
export const ALL_VALID_SLOTS: string[] = [
  ...COLLEGE_PAIRS.flatMap(p => p.slots),
  // Range-format slots used by auto-assign (shift 1 + shift 2)
  '08:00-08:30', '09:40-10:10', '11:25-11:55', '13:25-13:55',
  '15:05-15:35', '16:50-17:20', '18:30-19:00',
];

/* ─── Buildings & Rooms ─── */

export type BuildingCode = 'ГК' | 'МК' | 'IT' | 'спорт зал';

export interface RoomInfo {
  code: string;        // e.g. "409", "300а", "120б"
  building: BuildingCode;
  floor: number;
  displayName: string; // e.g. "ГК 409"
}

const GK_ROOMS: Record<number, string[]> = {
  1: ['100', '101', '102', '103', '104', '105', '106', '107', '108'],
  2: ['202', '203', '204', '205', '206', '207', '208', '209', '210', '211'],
  3: ['300а', '300б', '301', '302', '303', '304', '305', '306', '307а', '307б'],
  4: ['400', '401', '402', '403', '404', '405', '406', '407', '408', '409'],
};

const MK_ROOMS: Record<number, string[]> = {
  1: ['131', '132', '133', '135', '136', '137', '138'],
};

const IT_ROOMS: Record<number, string[]> = {
  1: ['119', '120б', '124', '126', '127', '128', '129'],
};

function buildRooms(building: BuildingCode, floors: Record<number, string[]>): RoomInfo[] {
  const result: RoomInfo[] = [];
  for (const [floor, rooms] of Object.entries(floors)) {
    for (const code of rooms) {
      result.push({
        code,
        building,
        floor: Number(floor),
        displayName: `${building} ${code}`,
      });
    }
  }
  return result;
}

export const ALL_ROOMS: RoomInfo[] = [
  ...buildRooms('ГК', GK_ROOMS),
  ...buildRooms('МК', MK_ROOMS),
  ...buildRooms('IT', IT_ROOMS),
  { code: 'спорт зал', building: 'спорт зал', floor: 1, displayName: 'спорт зал' },
];

/** All valid room display names for backend validation */
export const ALL_ROOM_NAMES: string[] = ALL_ROOMS.map(r => r.displayName);

/** Get buildings list */
export const BUILDINGS: BuildingCode[] = ['ГК', 'МК', 'IT', 'спорт зал'];

/** Get floors for a building */
export function getFloorsForBuilding(building: BuildingCode): number[] {
  const floors = new Set(ALL_ROOMS.filter(r => r.building === building).map(r => r.floor));
  return Array.from(floors).sort((a, b) => a - b);
}

/** Get rooms for a building + floor */
export function getRoomsForFloor(building: BuildingCode, floor: number): RoomInfo[] {
  return ALL_ROOMS.filter(r => r.building === building && r.floor === floor);
}

/** Validate a room name exists */
export function isValidRoom(displayName: string): boolean {
  return ALL_ROOM_NAMES.includes(displayName);
}

/** Validate a time slot is a valid 30-min slot */
export function isValidTimeSlot(slot: string): boolean {
  return ALL_VALID_SLOTS.includes(slot);
}

/** Find which pair a slot belongs to */
export function getPairForSlot(slot: string): CollegePair | undefined {
  return COLLEGE_PAIRS.find(p => p.slots.includes(slot));
}
