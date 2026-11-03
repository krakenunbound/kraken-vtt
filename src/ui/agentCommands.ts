import type { KrakenAgentCommand } from "../kraken";

// Agent commands answered by the part of the interface that owns them (the
// desktop answers for its windows). App.tsx passes on what it does not answer.

type Handler = (command: KrakenAgentCommand) => unknown;
const handlers = new Map<string, Handler>();

export const agentCommands = {
  register(kind: KrakenAgentCommand["kind"], handler: Handler) {
    handlers.set(kind, handler);
    return () => {
      if (handlers.get(kind) === handler) handlers.delete(kind);
    };
  },
  async run(command: KrakenAgentCommand) {
    const handler = handlers.get(command.kind);
    if (!handler) throw new Error(command.kind === "windows" ? "The table is not open yet." : "Unknown command.");
    return handler(command);
  },
};
