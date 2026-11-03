import { restoreUiScale } from "./ui/chatCommands";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./desktop.css";

// This screen's size (/scaleui), as it was left.
restoreUiScale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
