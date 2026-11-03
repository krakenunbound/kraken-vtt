// The weather a scene can have (drawn by Weather.tsx with three.js).
export type WeatherType = "none" | "rain" | "storm" | "snow" | "blizzard" | "fog" | "clouds" | "sandstorm" | "embers" | "ash" | "leaves" | "water";

export const WEATHER_TYPES: { id: WeatherType; label: string }[] = [
  { id: "none", label: "None" },
  { id: "rain", label: "Rain" },
  { id: "storm", label: "Thunderstorm" },
  { id: "snow", label: "Snow" },
  { id: "blizzard", label: "Blizzard" },
  { id: "fog", label: "Fog" },
  { id: "clouds", label: "Cloud shadows" },
  { id: "sandstorm", label: "Sand storm" },
  { id: "embers", label: "Embers" },
  { id: "ash", label: "Falling ash" },
  { id: "leaves", label: "Falling leaves" },
  { id: "water", label: "Water shimmer" },
];

