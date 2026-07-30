import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolutionPresets } from "../../../examples/demo/src/render-quality.ts";

const chrome = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((path) => path && existsSync(path));

if (!chrome) {
  if (process.env.CI)
    throw new Error("Chrome is required for the WebGL smoke test");
  console.log("Chrome is unavailable; WebGL smoke test skipped locally.");
  process.exit(0);
}

const rawBase = process.env.DEMO_BASE_PATH ?? "/";
const base = rawBase === "/" ? "/" : `/${rawBase.replace(/^\/+|\/+$/g, "")}/`;
const url = `http://127.0.0.1:4175${base}`;
const qualityOrder: string[] = resolutionPresets.map(({ id }) => id);
const minimumColors = 2;
const framebufferExpression = `new Promise((resolve) => requestAnimationFrame(() => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return resolve(null);
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return resolve(null);
  const width = gl.drawingBufferWidth;
  const height = Math.min(2, gl.drawingBufferHeight);
  const pixels = new Uint8Array(width * height * 4);
  const priorError = gl.getError();
  gl.readPixels(0, Math.floor((gl.drawingBufferHeight - height) / 2), width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const colors = new Set();
  let hash = 2166136261;
  for (let index = 0; index < pixels.length; index += 4) {
    const color = (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2];
    colors.add(color);
    hash = Math.imul(hash ^ color, 16777619);
  }
  resolve({
    url: location.href,
    material: canvas.dataset.feelableMaterial ?? "",
    pressure: Number(canvas.dataset.feelablePressure ?? 0),
    calls: Number(canvas.dataset.feelableDraws ?? 0),
    requested: canvas.dataset.feelableRequested ?? "",
    resolution: canvas.dataset.feelableResolution ?? "",
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    declaredWidth: Number(canvas.dataset.feelableWidth ?? 0),
    declaredHeight: Number(canvas.dataset.feelableHeight ?? 0),
    error: priorError || gl.getError(),
    colors: colors.size,
    hash,
  });
}))`;
const profile = mkdtempSync(join(tmpdir(), "feelable-chrome-"));
async function stop(child?: ChildProcess) {
  if (!child || child.exitCode !== null) return;
  const exited = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 2000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
    child.kill();
  });
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 2000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}
const preview = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--config",
    "tools/config/demo-vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    "4175",
    "--strictPort",
  ],
  { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
);
let browser: ChildProcess | undefined;
let output = "";
preview.stdout.on("data", (chunk) => {
  output += chunk;
});
preview.stderr.on("data", (chunk) => {
  output += chunk;
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (preview.exitCode !== null)
      throw new Error(`demo preview failed\n${output}`);
    try {
      ready =
        /Local:\s+http:\/\/127\.0\.0\.1:4175\//.test(output) &&
        (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`demo preview did not start\n${output}`);

  browser = spawn(
    chrome,
    [
      "--headless=new",
      "--enable-logging=stderr",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--window-size=1280,1800",
      `${url}?smoke#bench`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  browser.stdout?.on("data", (chunk) => {
    output += chunk;
  });
  browser.stderr?.on("data", (chunk) => {
    output += chunk;
  });
  browser.on("error", (error) => {
    output += error.stack ?? error.message;
  });

  let port = "";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    port =
      output.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1] ??
      "";
    if (port) break;
    if (browser.exitCode !== null) throw new Error(`Chrome failed\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!port) throw new Error(`Chrome DevTools did not start\n${output}`);

  let target: { webSocketDebuggerUrl: string } | undefined;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = (await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(2000),
      }).then((response) => response.json())) as Array<{
        type: string;
        url: string;
        webSocketDebuggerUrl: string;
      }>;
      target = targets.find(
        (item) => item.type === "page" && item.url.startsWith(url),
      );
    } catch {}
    if (target) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!target) throw new Error(`demo tab did not open\n${output}`);

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("DevTools connection timed out")),
      10_000,
    );
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("DevTools connection failed"));
      },
      {
        once: true,
      },
    );
  });
  let id = 0;
  const pending = new Map<number, (result: Record<string, unknown>) => void>();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data)) as {
      id?: number;
      method?: string;
      params?: {
        type?: string;
        args?: Array<{ value?: unknown; description?: string }>;
      };
      result?: Record<string, unknown>;
    };
    if (message.id) {
      pending.get(message.id)?.(message.result ?? {});
      pending.delete(message.id);
    } else if (
      message.method === "Runtime.exceptionThrown" ||
      (message.method === "Runtime.consoleAPICalled" &&
        message.params?.type === "error")
    ) {
      output += `\n${JSON.stringify(message.params)}`;
    }
  });
  const call = (method: string, params: Record<string, unknown> = {}) => {
    const callId = ++id;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(callId);
        reject(new Error(`DevTools ${method} timed out`));
      }, 10_000);
      pending.set(callId, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });
      try {
        socket.send(JSON.stringify({ id: callId, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        pending.delete(callId);
        reject(error);
      }
    });
  };
  await call("Runtime.enable");
  await call("Page.enable");
  type FrameSample = {
    url: string;
    material: string;
    pressure: number;
    calls: number;
    requested: string;
    resolution: string;
    width: number;
    height: number;
    declaredWidth: number;
    declaredHeight: number;
    error: number;
    colors: number;
    hash: number;
  };
  const fromPage = (
    sample: FrameSample | null,
    expectedUrl: string,
  ): sample is FrameSample => sample?.url === expectedUrl;
  const sampleFramebuffer = async () => {
    const evaluation = (await call("Runtime.evaluate", {
      expression: framebufferExpression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: FrameSample | null } };
    return evaluation.result?.value ?? null;
  };
  const dispatchPointer = (
    type: "pointercancel" | "pointerdown" | "pointerup",
  ) =>
    call("Runtime.evaluate", {
      expression: `(() => {
        const canvas = document.querySelector("canvas");
        const rect = canvas.getBoundingClientRect();
        const pointer = { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerId: 1 };
        if ("${type}" === "pointerdown") canvas.dispatchEvent(new PointerEvent("pointermove", pointer));
        canvas.dispatchEvent(new PointerEvent("${type}", { ...pointer, button: 0, buttons: "${type}" === "pointerdown" ? 1 : 0 }));
      })()`,
    });
  const wakeDemandFrame = () =>
    call("Runtime.evaluate", {
      expression: 'document.querySelector(".control-actions button")?.click()',
    });

  let materialIds: string[] = [];
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const evaluation = (await call("Runtime.evaluate", {
      expression:
        'Array.from(document.querySelectorAll("[data-material]"), element => element.getAttribute("data-material")).filter(Boolean)',
      returnByValue: true,
    })) as { result?: { value?: string[] } };
    materialIds = evaluation.result?.value ?? [];
    if (materialIds.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (materialIds.length === 0)
    throw new Error(`demo catalogue did not render\n${output}`);
  if (new Set(materialIds).size !== materialIds.length)
    throw new Error("demo catalogue IDs must be unique");
  const qualityOptions = (await call("Runtime.evaluate", {
    expression:
      'Array.from(document.querySelectorAll(".control-field select option"), option => option.value)',
    returnByValue: true,
  })) as { result?: { value?: string[] } };
  if (
    qualityOptions.result?.value?.join(",") !==
    ["dynamic", ...[...qualityOrder].reverse()].join(",")
  )
    throw new Error("render quality options are incomplete or unordered");

  const primaryMaterial = materialIds[0] as string;
  const cases = [
    ...materialIds.map((material) => ({ id: material, material, shader: "" })),
    ...[
      "basic",
      "bump",
      "lambert",
      "mapped",
      "matcap",
      "normal",
      "phong",
      "toon",
    ].map((shader) => ({
      id: `shader-${shader}`,
      material: primaryMaterial,
      shader,
    })),
  ];
  const results: string[] = [];
  for (const testCase of cases) {
    const { id: caseId, material: materialId, shader } = testCase;
    console.log(`Testing WebGL ${caseId}…`);
    const caseUrl = `${url}?smoke&material=${encodeURIComponent(materialId)}${shader ? `&shader=${shader}` : ""}#bench`;
    await call("Page.navigate", {
      url: caseUrl,
    });
    let baseline: FrameSample | null = null;
    let lastSample: FrameSample | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const sample = await sampleFramebuffer();
      lastSample = sample;
      if (
        fromPage(sample, caseUrl) &&
        sample.material === materialId &&
        sample.error === 0 &&
        sample.requested === "1080p" &&
        sample.width === sample.declaredWidth &&
        sample.height === sample.declaredHeight &&
        sample.colors >= minimumColors &&
        sample.calls > 0 &&
        sample.calls <= 3
      ) {
        baseline = sample;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!baseline)
      throw new Error(
        `${caseId} framebuffer baseline failed (${JSON.stringify(lastSample)})\n${output}`,
      );
    if (caseId === primaryMaterial) {
      await call("Emulation.setCPUThrottlingRate", { rate: 6 });
      const buttonPress = (await call("Runtime.evaluate", {
        expression:
          '(() => { const button = document.querySelector(".control-actions button:not(:disabled)"); button?.click(); return Boolean(button); })()',
        returnByValue: true,
      })) as { result?: { value?: boolean } };
      if (buttonPress.result?.value !== true)
        throw new Error("Press control is missing or disabled");
    } else await dispatchPointer("pointerdown");
    let touched: FrameSample | null = null;
    let lastTouched: FrameSample | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const sample = await sampleFramebuffer();
      lastTouched = sample;
      if (
        fromPage(sample, caseUrl) &&
        sample.material === materialId &&
        sample.pressure >= 0.5 &&
        sample.hash !== baseline.hash
      ) {
        touched = sample;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (
      touched?.error !== 0 ||
      touched.colors < minimumColors ||
      touched.calls < 1 ||
      touched.calls > 3
    )
      throw new Error(
        `${caseId} framebuffer or interaction failed (${JSON.stringify(lastTouched)})\n${output}`,
      );
    if (process.env.WEBGL_SMOKE_SCREENSHOT && caseId === primaryMaterial) {
      const screenshot = (await call("Page.captureScreenshot", {
        format: "png",
      })) as { data?: string };
      if (!screenshot.data) throw new Error("Chrome returned no screenshot");
      writeFileSync(
        process.env.WEBGL_SMOKE_SCREENSHOT,
        Buffer.from(screenshot.data, "base64"),
      );
    }
    if (caseId !== primaryMaterial)
      await dispatchPointer(
        caseId === "shader-bump" ? "pointercancel" : "pointerup",
      );
    let released = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const sample = await sampleFramebuffer();
      if (
        fromPage(sample, caseUrl) &&
        sample.material === materialId &&
        sample.pressure < 0.05
      ) {
        released = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!released) throw new Error(`${caseId} did not return after release`);
    if (caseId === primaryMaterial)
      await call("Emulation.setCPUThrottlingRate", { rate: 1 });
    const status = `pass:${caseId}:${touched.calls}:${touched.colors}:${touched.pressure.toFixed(2)}`;
    results.push(status);
  }
  const adaptiveUrl = `${url}?smoke&material=${primaryMaterial}#bench`;
  await call("Page.navigate", { url: adaptiveUrl });
  const selectQuality = async (quality: string) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const selected = (await call("Runtime.evaluate", {
        expression: `(() => {
          if (location.href !== ${JSON.stringify(adaptiveUrl)}) return false;
          const select = document.querySelector(".control-field select");
          if (!select) return false;
          select.value = ${JSON.stringify(quality)};
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        })()`,
        returnByValue: true,
      })) as { result?: { value?: boolean } };
      if (selected.result?.value) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("render quality control did not render");
  };
  for (const preset of resolutionPresets) {
    await selectQuality(preset.id);
    let applied: FrameSample | null = null;
    let lastSample: FrameSample | null = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const sample = await sampleFramebuffer();
      lastSample = sample;
      if (
        fromPage(sample, adaptiveUrl) &&
        sample.requested === preset.id &&
        qualityOrder.includes(sample.resolution) &&
        qualityOrder.indexOf(sample.resolution) <=
          qualityOrder.indexOf(preset.id) &&
        sample.width === sample.declaredWidth &&
        sample.height === sample.declaredHeight &&
        sample.width <= preset.width &&
        sample.height <= preset.height &&
        sample.error === 0 &&
        sample.colors >= minimumColors
      ) {
        applied = sample;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!applied)
      throw new Error(
        `${preset.id} framebuffer ceiling was not applied (${JSON.stringify(lastSample)})`,
      );
    results.push(
      `pass:quality:${preset.id}:${applied.resolution}:${applied.width}x${applied.height}`,
    );
  }
  await selectQuality("dynamic");
  let adaptiveStart = "";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const sample = await sampleFramebuffer();
    if (
      fromPage(sample, adaptiveUrl) &&
      sample.requested === "dynamic" &&
      qualityOrder.includes(sample.resolution)
    ) {
      adaptiveStart = sample.resolution;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!adaptiveStart) throw new Error("dynamic quality did not initialize");
  await call("Runtime.evaluate", {
    expression: `new Promise((resolve) => {
      let frames = 5;
      const burn = () => {
        if (frames-- <= 0) return requestAnimationFrame(() => resolve());
        const end = performance.now() + 275;
        while (performance.now() < end) {}
        requestAnimationFrame(burn);
      };
      requestAnimationFrame(burn);
    })`,
    awaitPromise: true,
  });
  const adaptiveSample = await sampleFramebuffer();
  const adaptiveEnd = adaptiveSample?.resolution ?? adaptiveStart;
  const adaptivePreset = resolutionPresets.find(({ id }) => id === adaptiveEnd);
  if (
    !fromPage(adaptiveSample, adaptiveUrl) ||
    adaptiveSample.requested !== "dynamic" ||
    !adaptivePreset ||
    adaptiveSample.width !== adaptiveSample.declaredWidth ||
    adaptiveSample.height !== adaptiveSample.declaredHeight ||
    adaptiveSample.width > adaptivePreset.width ||
    adaptiveSample.height > adaptivePreset.height ||
    adaptiveSample.error !== 0 ||
    adaptiveSample.colors < minimumColors ||
    (adaptiveStart !== "144p" &&
      qualityOrder.indexOf(adaptiveEnd) >= qualityOrder.indexOf(adaptiveStart))
  )
    throw new Error(
      `dynamic quality did not settle below ${adaptiveStart} (${JSON.stringify(adaptiveSample)})`,
    );
  results.push(`pass:quality:dynamic:${adaptiveStart}->${adaptiveEnd}`);
  const productionUrl = `${url}?material=${primaryMaterial}#bench`;
  await call("Page.navigate", { url: productionUrl });
  let productionBaseline: FrameSample | null = null;
  let productionSample: FrameSample | null = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await wakeDemandFrame();
    const sample = await sampleFramebuffer();
    productionSample = sample;
    if (
      fromPage(sample, productionUrl) &&
      sample.error === 0 &&
      sample.requested === "1080p" &&
      sample.width === sample.declaredWidth &&
      sample.height === sample.declaredHeight &&
      sample.colors >= minimumColors
    ) {
      productionBaseline = sample;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!productionBaseline)
    throw new Error(
      `production demand canvas did not render (${JSON.stringify(productionSample)})`,
    );
  const restoration = (await call("Runtime.evaluate", {
    expression: `new Promise((resolve) => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
      const extension = gl?.getExtension("WEBGL_lose_context");
      if (!extension) return resolve(false);
      const timeout = setTimeout(() => resolve(false), 5000);
      canvas.addEventListener("webglcontextrestored", () => {
        clearTimeout(timeout);
        resolve(true);
      }, { once: true });
      extension.loseContext();
      setTimeout(() => extension.restoreContext(), 100);
    })`,
    awaitPromise: true,
    returnByValue: true,
  })) as { result?: { value?: boolean } };
  if (!restoration.result?.value)
    throw new Error("WEBGL_lose_context did not restore the production canvas");
  let contextRestored = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await wakeDemandFrame();
    const sample = await sampleFramebuffer();
    if (
      fromPage(sample, productionUrl) &&
      sample.error === 0 &&
      sample.requested === productionBaseline.requested &&
      sample.resolution === productionBaseline.resolution &&
      sample.width === productionBaseline.width &&
      sample.height === productionBaseline.height &&
      sample.width === sample.declaredWidth &&
      sample.height === sample.declaredHeight &&
      sample.colors >= minimumColors
    ) {
      contextRestored = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!contextRestored)
    throw new Error(
      "production demand canvas stayed blank after context restore",
    );
  results.push(`pass:context-restore:${productionBaseline.colors}`);
  if (
    /THREE\.WebGLProgram|WebGL[^\n]*(?:error|failed)|shader[^\n]*(?:error|failed)|GL_INVALID|GL_OUT_OF_MEMORY|Uncaught|(?:Type|Reference|Syntax)Error/i.test(
      output,
    )
  )
    throw new Error(`WebGL reported an error\n${output}`);
  socket.close();
  console.log(
    `Production demo passed ${results.length} parameterized WebGL checks (${results.join(", ")}).`,
  );
} finally {
  await Promise.all([stop(browser), stop(preview)]);
  try {
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown error";
    console.warn(`Temporary Chrome profile cleanup failed (${code}).`);
  }
}
