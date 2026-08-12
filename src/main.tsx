import { StrictMode } from "react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { Theme } from "@astryxdesign/core/theme";
import { rowsterTheme } from "./theme/rowster";
import "./theme/rowster.css";
import "./styles/chrome.css";
import App from "./App";
import { settingsGet } from "./ipc";

document.documentElement.style.height = "100%";
document.body.style.height = "100%";
const rootElement = document.getElementById("root") as HTMLElement;
rootElement.style.height = "100%";

function Root() {
  const [mode, setMode] = useState<"system" | "light" | "dark">("system");

  useEffect(() => {
    let alive = true;
    void settingsGet()
      .then((settings) => {
        if (alive) setMode(settings.theme);
      })
      .catch((error: unknown) => {
        window.dispatchEvent(
          new CustomEvent("rowster:command-error", { detail: String(error) })
        );
      });
    const onSettings = (event: Event) => {
      const settings = (event as CustomEvent<{ theme?: typeof mode }>).detail;
      if (settings?.theme) setMode(settings.theme);
    };
    window.addEventListener("rowster:settings-changed", onSettings);
    return () => {
      alive = false;
      window.removeEventListener("rowster:settings-changed", onSettings);
    };
  }, []);

  return (
    <Theme theme={rowsterTheme} mode={mode}>
      <App />
    </Theme>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
