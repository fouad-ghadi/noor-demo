import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Permet d'écrire `import { Button } from "@/components/ui/button"`
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // Application de démo : un seul fichier JS (~1 Mo) est acceptable, on masque l'avertissement
  build: { chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    host: true, // accessible depuis un téléphone sur le même Wi-Fi (http://<ip-du-pc>:5173)
    // Partage temporaire par lien public (voir docs/DEPLOIEMENT.md, option B)
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app"],
    // Les appels à /api sont redirigés vers le backend FastAPI : pas de souci de CORS
    proxy: { "/api": "http://localhost:8000" },
  },
});
