# Installing and updates

Maelstrom runs on the GM's Windows or Linux PC; players install nothing. This page covers installing the GM's app, where it keeps its files, and how updates arrive. Maelstrom is not code-signed, and there is no Mac build yet.

## Windows

1. Download `Kraken.VTT.Setup.exe` from [Releases](https://github.com/krakenunbound/maelstrom-vtt/releases).
2. Run it. Maelstrom is not code-signed, so Windows SmartScreen may stop it: choose **More info**, then **Run anyway**.
3. The installer adds the Windows firewall rule for the table's port for you.

## Linux (x64)

- **AppImage:** download the `.AppImage`, make it executable and run it:

  ```
  chmod +x Maelstrom-VTT-*.AppImage
  ./Maelstrom-VTT-*.AppImage
  ```

- **Debian and Ubuntu:** install the `.deb`:

  ```
  sudo apt install ./kraken-vtt_*_amd64.deb
  ```

- **Firewall:** if a firewall is on (such as `ufw`), allow the port your table uses yourself, for example `sudo ufw allow 47300/tcp`.

## Running from source

You need Windows or Linux, Node.js 22 or newer, and Git.

```
git clone https://github.com/krakenunbound/maelstrom-vtt.git
cd kraken-vtt
npm install
npm run build
npm start
```

On Windows you can double-click **`Kraken VTT.bat`** instead: it installs packages the first time, rebuilds when the code has changed, and opens the app. Running from source, Windows asks about the firewall once, the first time you host.

## Updates

When Maelstrom starts, it looks once for a newer release. If there is one, the **start screen** says so, and only the start screen, before you open a campaign:

1. Press **Download**.
2. Press **Restart and install**. Windows asks you to allow the installer.

Nothing about updates appears during a game, and Maelstrom never downloads or installs while a campaign is hosted. What changed in each release is in the [Release notes](release-notes.md).

## Where Maelstrom keeps things

| What | Windows | Linux |
|---|---|---|
| Campaigns, settings, logs | `%APPDATA%\kraken-vtt` | `~/.config/kraken-vtt` |
| Your sounds | `%APPDATA%\kraken-vtt\assets\sounds` | `~/.config/kraken-vtt/assets/sounds` |
| Your ruleset pictures | `%APPDATA%\kraken-vtt\assets\rulesets` | `~/.config/kraken-vtt/assets/rulesets` |
| Your packs, dice, towers, icons, decals, wallpapers | `Documents\Kraken VTT` | `~/Documents/Kraken VTT` |

The `Documents/Kraken VTT` folder is described in [Settings](settings.md#your-maelstrom-vtt-folder). Back it up, and your campaigns, to keep what you made.

## Moving to a new computer

1. Install Maelstrom on the new computer.
2. Copy your `Documents/Kraken VTT` folder across, including `Packs` with your `.kpack` books. Your books then open with no Fantasy Grounds installed.
3. Take your campaigns with you: a campaign card's **Export .zip** makes one file of the whole campaign, and **Open folder** shows where it is kept (see [Campaigns and backups](campaigns-and-backups.md)).
