/**
 * html-anything desktop shell (Electron sidecar, issue #156 community approach).
 *
 * The Next standalone server bundle ships inside the app resources; the
 * Electron binary doubles as the Node runtime via ELECTRON_RUN_AS_NODE, so
 * users need no Node.js installed. On launch: pick a free port, spawn the
 * server, wait for readiness, open the window.
 */
const { app, BrowserWindow, shell } = require("electron");
const { spawn, execSync } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");

let serverProc = null;
let mainWindow = null;

function findFreePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

function serverRoot() {
  // The standalone bundle ships as resources/server-bundle.tar.gz and is
  // extracted on first run to %LOCALAPPDATA%\html-anything\server-<version>.
  // Why not run straight from resources/: electron-builder's NSIS/portable
  // packaging drops files inside extraResources node_modules trees (issue
  // #156 community build hit the same), and the portable flavor runs from a
  // %TEMP% extraction dir where spawning children trips security products.
  // A persistent real directory solves both. Dev: run from the checkout.
  if (!app.isPackaged) return path.join(__dirname, "..", "next", ".next", "standalone", "next");
  // Bundle packs the whole standalone dir; the pnpm-workspace layout keeps
  // server.js under next/ with a sibling root-level node_modules.
  return path.join(app.getPath("userData"), "server", "next");
}

/** Extract the bundled server on first run. No-op when already present. */
function ensureServerExtracted() {
  const dest = path.join(app.getPath("userData"), "server");
  const bundle = path.join(process.resourcesPath, "server-bundle.tar.gz");
  if (!fs.existsSync(bundle)) throw new Error("server bundle missing from resources");

  const stampFile = path.join(dest, ".bundle-mtime");
  let bundleMtime = "";
  try {
    bundleMtime = String(fs.statSync(bundle).mtimeMs);
  } catch {}

  if (fs.existsSync(path.join(dest, "next", "server.js")) && fs.existsSync(stampFile)) {
    try {
      const recorded = fs.readFileSync(stampFile, "utf8").trim();
      if (recorded === bundleMtime) return;
    } catch {}
  }

  fs.mkdirSync(dest, { recursive: true });
  const systemTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  execSync(`"${systemTar}" -xzf "${bundle}" -C "${dest}"`, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 120000,
  });
  if (!fs.existsSync(path.join(dest, "next", "server.js"))) {
    throw new Error("server bundle extracted but server.js missing");
  }
  try {
    fs.writeFileSync(stampFile, bundleMtime, "utf8");
  } catch {}
  console.log(`[server] extracted bundle to ${dest}`);
}

/**
 * Discover the ZCode desktop install root and export
 * ZCODE_WINDOWS_APP_INSTALL_DIR so the server's detector can find
 * zcode.cjs even when the app wasn't launched from a ZCode-hosted
 * terminal (the env var is otherwise only set there). Reads the
 * uninstall registry entry's DisplayIcon, which points inside the
 * install root (e.g. D:\ZCode\uninstallerIcon.ico).
 */
function discoverZcodeInstallDir() {
  if (process.platform !== "win32") return;
  try {
    const { execSync } = require("child_process");
    const out = execSync(
      `reg query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall /s /f "ZCode" /d`,
      { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] },
    );
    const iconLine = out.split(/\r?\n/).find((l) => /DisplayIcon\s+REG_SZ/i.test(l));
    const iconPath = iconLine && iconLine.split("REG_SZ")[1]?.trim();
    if (iconPath) {
      // "<root>\uninstallerIcon.ico" (or "<root>\something.exe") → root
      const root = path.dirname(iconPath);
      if (root && root !== path.parse(root).root) {
        process.env.ZCODE_WINDOWS_APP_INSTALL_DIR =
          process.env.ZCODE_WINDOWS_APP_INSTALL_DIR || root;
      }
    }
  } catch {
    // No ZCode registry entry — fine, the agent just won't be offered.
  }
}

function startServer(port) {
  const root = serverRoot();
  serverProc = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProc.stdout.on("data", (d) => console.log(`[server] ${String(d).trim()}`));
  serverProc.stderr.on("data", (d) => console.error(`[server] ${String(d).trim()}`));
  serverProc.on("exit", (code) => console.error(`[server] exited code=${code}`));
}

function waitReady(port, timeoutMs = 30000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - t0 > timeoutMs) reject(new Error("server did not become ready"));
        else setTimeout(poll, 300);
      });
    };
    poll();
  });
}

function killServer() {
  if (serverProc && !serverProc.killed) {
    try {
      serverProc.kill();
    } catch {}
  }
}

app.whenReady().then(async () => {
  discoverZcodeInstallDir();
  try {
    ensureServerExtracted();
  } catch (err) {
    console.error(`[server] bundle extraction failed: ${err.message}`);
    const { dialog } = require("electron");
    dialog.showErrorBox("html-anything", `服务器组件初始化失败：${err.message}`);
    app.quit();
    return;
  }
  const port = await findFreePort();
  startServer(port);
  await waitReady(port);
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    autoHideMenuBar: true,
    backgroundColor: "#faf8f4",
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  // External links (docs, GitHub) open in the system browser.
  // Internal popups for print/PDF (e.g. window.open("", "_blank") or about:blank)
  // must be allowed in-app so Chromium's print dialog can open, NEVER sent to OS shell!
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === "about:blank" || url.startsWith("about:")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
});

app.on("window-all-closed", () => {
  killServer();
  app.quit();
});
app.on("quit", killServer);
