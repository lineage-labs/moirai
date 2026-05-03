import berriesIcon from "./assets/items/berries.svg";
import dryGrassIcon from "./assets/items/dry-grass.svg";
import rocksIcon from "./assets/items/rocks.svg";
import sticksIcon from "./assets/items/sticks.svg";
import waterIcon from "./assets/items/water.svg";

export const ITEM_LABELS: Record<string, string> = {
  rocks: "Rocks",
  sticks: "Sticks",
  berries: "Berries",
  water: "Water",
  "dry grass": "Dry Grass",
};

const ITEM_ICONS: Record<string, string> = {
  rocks: rocksIcon,
  sticks: sticksIcon,
  berries: berriesIcon,
  water: waterIcon,
  "dry grass": dryGrassIcon,
};

export function getItemIcon(item: string): string {
  return ITEM_ICONS[item] ?? rocksIcon;
}

export function getItemLabel(item: string): string {
  return ITEM_LABELS[item] ?? item;
}
