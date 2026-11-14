# Notes for coding agents

Kraken's own agent tools (the MCP server in the app) are described in
[AGENT.md](AGENT.md); the plan and the log of the work are in
[PLAN.md](PLAN.md).

## Browser support

Kraken's interface runs in two places: the GM's app (Electron, a current
Chromium) and each player's own browser. When building web UI, consult the
`modern-web-guidance` skill first (Google Chrome's
[Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance)).

**Browser Support:** Baseline Widely available features with no fallback.
Newly available features are allowed when feature-detected with graceful
degradation, and only with a custom fallback of 20 lines or fewer and no new
dependency. Screens only the GM sees (they run in Electron) may use any
feature the bundled Chromium has.

Text inputs that act on Enter check `event.nativeEvent.isComposing`, so
Chinese, Japanese and Korean input methods are not cut short.
