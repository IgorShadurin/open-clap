interface ProjectAvatarPalette {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

export interface ProjectAvatar {
  backgroundColor: string;
  borderColor: string;
  initials: string;
  textColor: string;
}

function hashText(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function getProjectInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length >= 2) {
    return `${words[0]?.[0] ?? "N"}${words[1]?.[0] ?? "A"}`.toUpperCase();
  }

  if (words.length === 1) {
    const word = (words[0] ?? "NA").toUpperCase();
    if (word.length === 1) {
      return `${word}${word}`;
    }
    return word.slice(0, 2);
  }

  return "NA";
}

export function getProjectAvatarPalette(initials: string): ProjectAvatarPalette {
  const normalized = initials.trim().toUpperCase() || "NA";
  const hash = hashText(normalized);
  const hue = hash % 360;
  const saturation = 62 + (hash % 14);
  const lightness = 44 + (hash % 8);

  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
    borderColor: `hsl(${hue} ${Math.max(40, saturation - 18)}% ${Math.max(28, lightness - 16)}%)`,
    textColor: "#ffffff",
  };
}

export function buildProjectAvatar(name: string): ProjectAvatar {
  const initials = getProjectInitials(name);
  const palette = getProjectAvatarPalette(initials);
  return {
    initials,
    ...palette,
  };
}
