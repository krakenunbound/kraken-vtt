// Calendars (FG's Calendar): each game's own, the GM's to choose. A calendar
// is its months in order (a festival is a month of a few days, as FG lists
// Needfest beside Fireseek), its days of the week, its era, and its leap
// years. A date is a year and a day of that year (0 is its first day), plus
// an hour and a minute. Shared by the table server (which keeps the date and
// the notes) and the Calendar window (which draws the year).

const GREYHAWK_WEEK = ["Starday", "Sunday", "Moonday", "Godsday", "Waterday", "Earthday", "Freeday"];
const month = (name, days, extra = {}) => ({ name, days, ...extra });

export const CALENDARS = [
  {
    id: "gregorian",
    name: "Gregorian",
    era: "AD",
    year: 1250,
    week: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    months: [month("January", 31), month("February", 28, { leap: 1 }), month("March", 31), month("April", 30), month("May", 31), month("June", 30), month("July", 31), month("August", 31), month("September", 30), month("October", 31), month("November", 30), month("December", 31)],
    leap: (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0,
  },
  {
    id: "greyhawk",
    name: "Greyhawk (Common Year)",
    era: "CY",
    year: 576,
    week: GREYHAWK_WEEK,
    // Each month and festival begins on Starday (28- and 7-day blocks).
    weekRestarts: true,
    months: [
      month("Needfest", 7, { festival: true }),
      month("Fireseek", 28),
      month("Readying", 28),
      month("Coldeven", 28),
      month("Growfest", 7, { festival: true }),
      month("Planting", 28),
      month("Flocktime", 28),
      month("Wealsun", 28),
      month("Richfest", 7, { festival: true }),
      month("Reaping", 28),
      month("Goodmonth", 28),
      month("Harvester", 28),
      month("Brewfest", 7, { festival: true }),
      month("Patchwall", 28),
      month("Ready'reat", 28),
      month("Sunsebb", 28),
    ],
  },
  {
    id: "harptos",
    name: "Harptos (Forgotten Realms)",
    era: "DR",
    year: 1492,
    // Tendays: the days are named by their place in the tenday.
    week: ["First-day", "Second-day", "Third-day", "Fourth-day", "Fifth-day", "Sixth-day", "Seventh-day", "Eighth-day", "Ninth-day", "Tenth-day"],
    weekRestarts: true,
    months: [
      month("Hammer", 30),
      month("Midwinter", 1, { festival: true }),
      month("Alturiak", 30),
      month("Ches", 30),
      month("Tarsakh", 30),
      month("Greengrass", 1, { festival: true }),
      month("Mirtul", 30),
      month("Kythorn", 30),
      month("Flamerule", 30),
      month("Midsummer", 1, { festival: true }),
      month("Shieldmeet", 0, { festival: true, leap: 1 }),
      month("Eleasis", 30),
      month("Eleint", 30),
      month("Highharvestide", 1, { festival: true }),
      month("Marpenoth", 30),
      month("Uktar", 30),
      month("Feast of the Moon", 1, { festival: true }),
      month("Nightal", 30),
    ],
    leap: (year) => year % 4 === 0,
  },
  {
    id: "golarion",
    name: "Golarion (Absalom Reckoning)",
    era: "AR",
    year: 4710,
    week: ["Moonday", "Toilday", "Wealday", "Oathday", "Fireday", "Starday", "Sunday"],
    months: [month("Abadius", 31), month("Calistril", 28, { leap: 1 }), month("Pharast", 31), month("Gozran", 30), month("Desnus", 31), month("Sarenith", 30), month("Erastus", 31), month("Arodus", 31), month("Rova", 30), month("Lamashan", 31), month("Neth", 30), month("Kuthona", 31)],
    leap: (year) => year % 8 === 0,
  },
  {
    id: "imperial",
    name: "Imperial (Traveller)",
    era: "",
    year: 1105,
    // Day 001 is Holiday; the rest are 52 weeks of seven days (written 045-1105).
    week: ["Wonday", "Tuday", "Thirday", "Forday", "Fiday", "Sixday", "Senday"],
    weekRestarts: true,
    imperial: true,
    months: [month("Holiday", 1, { festival: true }), ...Array.from({ length: 13 }, (_, index) => month(`Month ${index + 1}`, 28))],
  },
  {
    id: "waning",
    name: "The Waning Count (Descending Darkness)",
    era: "WC",
    year: 313,
    week: ["Ashday", "Lampday", "Graveday", "Wardday", "Hollowday", "Restday"],
    months: [
      month("Deepdark", 30),
      month("Frostmourn", 30),
      month("Thaw", 30),
      month("Lanternfast", 3, { festival: true }),
      month("Seedwake", 30),
      month("Bloomtide", 30),
      month("Highsun", 30),
      month("Emberwane", 30),
      month("Harvest", 30),
      month("Duskmoot", 30),
      month("Leaffall", 30),
      month("Gloaming", 30),
      month("Longest Night", 2, { festival: true }),
    ],
  },
  {
    id: "astra",
    name: "Standard Cycle (Apeira Astra)",
    era: "SC",
    year: 3127,
    // Ten-day spans, numbered; five null days between the years.
    week: ["Span 1", "Span 2", "Span 3", "Span 4", "Span 5", "Span 6", "Span 7", "Span 8", "Span 9", "Span 10"],
    weekRestarts: true,
    months: [...Array.from({ length: 12 }, (_, index) => month(`Cycle-month ${String(index + 1).padStart(2, "0")}`, 30)), month("Null days", 5, { festival: true })],
  },
];

// Each game's own calendar (the GM may choose any).
const BY_RULESET = { "D&D 5E": "harptos", "D&D 3.5E": "greyhawk", "AD&D 2E": "greyhawk", "Castles & Crusades": "greyhawk", "Pathfinder 1E": "golarion", "Pathfinder 2E": "golarion", Traveller: "imperial", "Descending Darkness": "waning", "Apeira Astra": "astra", "Basic Fantasy": "gregorian" };
export const calendarFor = (ruleset = "") => BY_RULESET[ruleset] ?? "gregorian";
export const calendarOf = (id) => CALENDARS.find((item) => item.id === id) ?? CALENDARS[0];

// The months of a year (a leap year's extra days added).
export function monthsOf(calendar, year) {
  const leap = calendar.leap ? calendar.leap(year) : false;
  return calendar.months.map((item) => ({ ...item, days: item.days + (leap && item.leap ? item.leap : 0) })).filter((item) => item.days > 0);
}
export const daysIn = (calendar, year) => monthsOf(calendar, year).reduce((sum, item) => sum + item.days, 0);

// A day of the year as a month and its day (1-based), and back.
export function monthDay(calendar, year, dayOfYear) {
  let left = dayOfYear;
  const months = monthsOf(calendar, year);
  for (let index = 0; index < months.length; index++) {
    if (left < months[index].days) return { month: index, day: left + 1, name: months[index].name, festival: Boolean(months[index].festival) };
    left -= months[index].days;
  }
  const last = months.length - 1;
  return { month: last, day: months[last].days, name: months[last].name, festival: Boolean(months[last].festival) };
}
export function dayOfYear(calendar, year, monthIndex, day) {
  const months = monthsOf(calendar, year);
  const index = Math.max(0, Math.min(months.length - 1, monthIndex));
  return months.slice(0, index).reduce((sum, item) => sum + item.days, 0) + Math.max(1, Math.min(months[index].days, day)) - 1;
}

// The day of the week a day falls on (an index into calendar.week).
export function weekday(calendar, year, day) {
  if (calendar.imperial) return day === 0 ? -1 : (day - 1) % 7;
  if (calendar.weekRestarts) return (monthDay(calendar, year, day).day - 1) % calendar.week.length;
  // Days counted from year 0, so the week runs on across the years.
  let total = day;
  for (let y = 0; y < year; y++) total += daysIn(calendar, y);
  return total % calendar.week.length;
}

// Moving a date on (or back) by days, keeping it a real day of a real year.
export function addDays(calendar, year, day, by) {
  let y = year;
  let d = day + by;
  while (d < 0) {
    y -= 1;
    d += daysIn(calendar, y);
  }
  while (d >= daysIn(calendar, y)) {
    d -= daysIn(calendar, y);
    y += 1;
  }
  return { year: y, day: d };
}

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
// A date as words: "Waterday, 12th Fireseek, 576 CY"; Traveller's "045-1105".
export function dateWords(calendar, year, day, { weekdayName = true } = {}) {
  if (calendar.imperial) return `${String(day + 1).padStart(3, "0")}-${year}${day === 0 ? " (Holiday)" : ""}`;
  const at = monthDay(calendar, year, day);
  const named = at.festival && monthsOf(calendar, year)[at.month].days === 1 ? at.name : `${ordinal(at.day)} ${at.name}`;
  const week = weekday(calendar, year, day);
  return `${weekdayName && week >= 0 ? `${calendar.week[week]}, ` : ""}${named}, ${year}${calendar.era ? ` ${calendar.era}` : ""}`;
}
export const timeWords = (hour, minute) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
