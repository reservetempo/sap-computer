import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// Self-hosted era fonts (theme.js font stacks), latin subset, only the weights in use.
// Game: Michroma labels, IBM Plex Mono readouts and text.
import "@fontsource/michroma/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-400-italic.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
// Textbook: Source Serif 4 text, Courier Prime numbers.
import "@fontsource/source-serif-4/latin-400.css";
import "@fontsource/source-serif-4/latin-400-italic.css";
import "@fontsource/source-serif-4/latin-700.css";
import "@fontsource/courier-prime/latin-400.css";
import "@fontsource/courier-prime/latin-700.css";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
