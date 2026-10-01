import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Le serveur du jeu (node server.js) écoute sur le port 3001 : Vite lui
// relaie l'API, les images envoyées et le temps réel, pour que le
// navigateur n'ait qu'une seule adresse à connaître.
const SERVER = process.env.PUZZLE_SERVER || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': SERVER,
      '/uploads': SERVER,
      '/socket.io': { target: SERVER, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
