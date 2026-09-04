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
    app.use(
      express.static(distPath, {
        // Vite fingerprints everything under /assets, and cmudict-0.7a.txt is a
        // frozen published corpus — a repeat visit should re-download none of
        // it. index.html carries the fingerprints, so it must never be held.
        maxAge: "1y",
        immutable: true,
        setHeaders(res, filePath) {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
          }
        },
      }),
    );
    // Express 4 routes through path-to-regexp 0.1, where "*all" matches only
    // paths ending in "all" — the SPA fallback has to be a bare "*".
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

startServer();
