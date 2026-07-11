import compression from "compression";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Gzip responses — matters most for the 3.7MB CMU dictionary file.
  app.use(compression());

  // Middleware for parsing JSON requests
  app.use(express.json());

  // --- API Routes ---

  // Simple Health Check Route
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // --- Serve Frontend Application ---

  const isDevelopment = process.env.npm_lifecycle_event === "dev";

  if (isDevelopment) {
    // Development mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

startServer();
