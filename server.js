const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const MAX_MB = Number(process.env.MAX_MB || 50);
const API_KEY = process.env.API_KEY || "";

const upload = multer({
  dest: "/tmp",
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

function runFfmpeg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", inputPath,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-profile:v", "high",
      "-level", "4.1",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      "-movflags", "+faststart",
      outputPath,
    ];

    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(stderr))
    );
  });
}

function safeUnlink(p) { try { fs.unlinkSync(p); } catch {} }

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/convert/facebook", upload.single("file"), async (req, res) => {
  if (API_KEY) {
    if (req.headers["x-api-key"] !== API_KEY)
      return res.status(401).json({ error: "unauthorized" });
  }

  if (!req.file)
    return res.status(400).json({ error: "missing field 'file'" });

  const inputPath = req.file.path;
  const outputPath = path.join("/tmp", `${req.file.filename}_fb.mp4`);

  try {
    await runFfmpeg(inputPath, outputPath);
    res.setHeader("Content-Type", "video/mp4");
    fs.createReadStream(outputPath)
      .on("close", () => { safeUnlink(inputPath); safeUnlink(outputPath); })
      .pipe(res);
  } catch (e) {
    safeUnlink(inputPath);
    safeUnlink(outputPath);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log("running on", PORT));
