import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'eea6-2405-201-5508-6077-9151-1105-7b51-f0c7.ngrok-free.app'
    ]
  }
})