// Imported first by every test and demo that hosts a table: the table listens
// on this computer only (127.0.0.1), so a test run never opens a port to the
// network and Windows Firewall never asks about it. The app itself listens on
// every network, for LAN and internet players.
process.env.KRAKEN_BIND ??= "127.0.0.1";
