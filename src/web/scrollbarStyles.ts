import { Platform } from "react-native";

const STYLE_ID = "hermes-scrollbar-styles";

const SCROLLBAR_CSS = `
html,
body,
#root {
  min-height: 100%;
  margin: 0;
  background: var(--hermes-page-background, #05070a);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--hermes-scrollbar-thumb, #000000) transparent;
}

*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background-color: var(--hermes-scrollbar-thumb, #000000);
  border-radius: 999px;
}

*::-webkit-scrollbar-thumb:hover {
  background-color: var(--hermes-scrollbar-thumb-hover, #000000);
}

*::-webkit-scrollbar-corner {
  background: transparent;
}
`.trim();

export function injectWebScrollbarStyles(background?: string, scrollbarThumb?: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;

  if (background) {
    document.documentElement.style.setProperty("--hermes-page-background", background);
  }
  if (scrollbarThumb) {
    document.documentElement.style.setProperty("--hermes-scrollbar-thumb", scrollbarThumb);
    document.documentElement.style.setProperty("--hermes-scrollbar-thumb-hover", scrollbarThumb);
  }

  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SCROLLBAR_CSS;
  document.head.appendChild(style);
}
