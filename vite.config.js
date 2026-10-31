import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds are served from https://reservetempo.github.io/sap-computer/;
// the dev server stays at the root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/sap-computer/" : "/",
  plugins: [react()],
}));
