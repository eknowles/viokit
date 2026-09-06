import { applyStoredTheme } from "@viokit/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

// An investigation console is read for hours, often beside a terminal, so dark
// is the default here even though the design system's own default is light.
// Runs before render: a remembered "light" is applied without a flash of dark.
applyStoredTheme({ fallback: "dark" });

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
