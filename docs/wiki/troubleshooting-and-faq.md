# Troubleshooting and FAQ

Answers to the questions GMs and players ask most, and what to do when something goes wrong. Maelstrom is in alpha, so if your problem is not here, please report it (see the end of this page).

## Players can't connect

- **Same network?** Choose **LAN** and give them the LAN address from *Addresses to give your players*.
- **Over the internet?** Choose **Internet** and leave *Open the port on my router by itself (UPnP)* ticked. The Players window says whether the router opened the port. If it didn't, forward the port (47300 by default, TCP) to your PC in the router's settings.
- **Firewall:** the Windows installer adds the rule. Running from source, Windows asks once, the first time you host. On Linux, allow the port yourself: `sudo ufw allow 47300/tcp`.
- **Address:** it is written as `http://address:port`. Make sure the player typed the port.
- **Password:** an invite link carries the table password. With a plain address, the player types it.

## A player's connection dropped

They see *Reconnecting…* and sit back down in the same seat by themselves. If they closed the tab, they open the address again and come back to the same seat.

## A player forgot their password

In the Players window, set a new password for their account, or remove the account so they can choose again.

## Which browsers work?

Chrome, Edge, Brave or Firefox on a desktop or laptop computer (Safari is untested), or the Maelstrom app. Phones are not supported yet.

## Windows says the installer is unsafe

Maelstrom is not code-signed. When Windows SmartScreen stops it, choose **More info**, then **Run anyway**.

## Where is my update?

Maelstrom looks for updates once at startup, and offers them only on the start screen, never during a game. Leave the table and restart Maelstrom to see one. See [Installing and updates](installing-and-updates.md).

## A book, picture or map won't open

A book that is not active is off limits: its pages, pictures, maps and records open only once it is. Make it active in **Modules**.

## My Fantasy Grounds modules don't show

- Maelstrom reads them from your Fantasy Grounds data folder's `modules` folder. To read another folder, set `KRAKEN_BOOKS`.
- A campaign's game decides which modules fit it. A 5E module shows in a D&D 5E campaign, not in a Cairn one.
- To use your books on a computer without Fantasy Grounds, make them into Maelstrom packs (see [Records, books and packs](records-books-and-packs.md#maelstrom-packs)).

## I changed a module and Maelstrom shows the old one

Maelstrom reads the pack in place of the module unless the module is newer. Choose **Make again** on the Packs tab.

## A player sees too much, or too little

- Use the **eye** (player vision preview) or **View as** to see what they see.
- Use **Play test** to look for gaps in the walls.
- Health and names follow **Settings > Tokens and measuring**.
- Records follow their share setting (the eye on the record: Everyone, a player, or GM only).

## I deleted a campaign by mistake

**Delete** sends it to the recycle bin, where you can get it back.

## I want an earlier version of my campaign

The campaign card's **Backups and restore** lists the last ten backups. **Restore** puts one back, and what was there is kept as a backup too.

## Can I play without a GM?

Yes, in *Ironsworn* and *Starforged*: the host can play a character too.

## Can I play a game Maelstrom has no rules for?

Yes. Choose **Worldbuilding**: maps, tokens, chat and dice for any game. It also reads those games' books.

## Is there a Mac version?

Not yet. Maelstrom runs on Windows and Linux (x64).

## Reporting problems

Open an issue on [GitHub](https://github.com/krakenunbound/maelstrom-vtt/issues) with:

- what you did, what you expected, and what happened;
- a screenshot if you can;
- for a problem a player sees, which browser they used;
- Maelstrom's logs (**Settings > Open logs**).
