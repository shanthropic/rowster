import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { Theme } from "@astryxdesign/core/theme";
import { rowsterTheme } from "./theme/rowster";
import "./theme/rowster.css";
import App from "./App";

document.documentElement.style.height = "100%";
document.body.style.height = "100%";
const rootElement = document.getElementById("root") as HTMLElement;
rootElement.style.height = "100%";

createRoot(rootElement).render(
  <StrictMode>
    <Theme theme={rowsterTheme} mode="system">
      <App />
    </Theme>
  </StrictMode>
);
