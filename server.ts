import express from "express";
import { createServer } from "http";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";
import { WebSocketTransport } from "@colyseus/ws-transport";
import path from "path";
import { createServer as createViteServer } from "vite";
import { BattleRoom } from "./src/rooms/BattleRoom";

async function startServer() {
  const app = express();
  const PORT = 3000;

  const server = createServer(app);
  
  const gameServer = new Server({
    transport: new WebSocketTransport({
      server: server
    })
  });

  // Register rooms
  gameServer.define("battle", BattleRoom);

  // Colyseus Monitor
  app.use("/colyseus", monitor());

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  try {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`[SERVER] Running on http://localhost:${PORT}`);
      console.log(`[SERVER] Colyseus Monitor: http://localhost:${PORT}/colyseus`);
    });
  } catch (error) {
    console.error("[SERVER] Failed to start:", error);
  }
}

startServer().catch(err => {
    console.error("[SERVER] Global error:", err);
});
