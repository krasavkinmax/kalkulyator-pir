import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  build: { target: "esnext" },
  server: { port: 5173 },
}));
