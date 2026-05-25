import { Platform } from "react-native";

const STYLE_ID = "hermes-scrollbar-styles";

const SCROLLBAR_CSS = `
html,
body,
#root {
  min-height: 100%;
  margin: 0;
  background: #05070a;
}

* {
  scrollbar-width: thin;
  scrollbar-color: #000000 transparent;
}

*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background-color: #000000;
  border-radius: 999px;
}

*::-webkit-scrollbar-thumb:hover {
  background-color: #000000;
}

*::-webkit-scrollbar-corner {
  background: transparent;
}
`.trim();

export function injectWebScrollbarStyles() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;

  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SCROLLBAR_CSS;
  document.head.appendChild(style);
}
