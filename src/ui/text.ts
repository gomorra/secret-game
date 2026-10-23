import type { BuildingStatus } from '../sim/state';

/** What each building status means, in a few words. */
export const STATUS_TEXT: Record<BuildingStatus, string> = {
  ok: 'Content',
  working: 'Working',
  unconnected: 'No road to a warehouse',
  noInput: 'Waiting for input goods',
  storageFull: 'Warehouse is full',
  noResource: 'Nothing nearby to harvest',
  needsUnmet: 'Needs not met: paying less tax',
  dark: 'In the dark: stopped',
  noFuel: 'Out of fuel: the fog is creeping back',
  abandoned: 'Empty. The door stands open.',
};
