import { InterestItem } from "./types";

const FAVORITES_KEY = "meta-interest-favorites";

export function getFavorites(): InterestItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = localStorage.getItem(FAVORITES_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as InterestItem[];
  } catch {
    return [];
  }
}

export function isFavorite(id: string): boolean {
  return getFavorites().some((item) => item.id === id);
}

export function toggleFavorite(interest: InterestItem): boolean {
  const all = getFavorites();
  const exists = all.some((item) => item.id === interest.id);

  const updated = exists ? all.filter((item) => item.id !== interest.id) : [interest, ...all];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  return !exists;
}
