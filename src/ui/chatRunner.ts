// The chat's runner, set by the chat dock: a line run as if typed there (a
// quick slot's macro, such as /roll 4d6k3, or the dice kept on a slot).
export const chatRunner: { run: ((line: string) => void) | null } = { run: null };
