import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type DemoMaterial, materialItems, type Quality } from "./demo-data";
import "./styles.css";

const preloadReload = "feelable-preload-reload";
const query = new URLSearchParams(window.location.search);
const requestedMaterial = query.get("material");
const initialMaterial =
  materialItems.find(({ id }) => id === requestedMaterial)?.id ??
  materialItems[0].id;
const MaterialBench = lazy(() =>
  import("./MaterialBench").then((module) => {
    try {
      sessionStorage.removeItem(preloadReload);
    } catch {
      // Storage can be disabled without breaking a successful import.
    }
    return module;
  }),
);
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (sessionStorage.getItem(preloadReload)) return;
    sessionStorage.setItem(preloadReload, "1");
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

function App() {
  const [selected, setSelected] = useState<DemoMaterial>(initialMaterial);
  const [quality, setQuality] = useState<Quality>("standard");
  const [reducedMotion, setReducedMotion] = useState(() =>
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );
  const [benchNearViewport, setBenchNearViewport] = useState(() =>
    query.has("smoke"),
  );
  const [resetKey, setResetKey] = useState(0);
  const [copyStatus, setCopyStatus] = useState("Copy example");
  const benchRef = useRef<HTMLElement>(null);
  const selectedItem =
    materialItems.find((item) => item.id === selected) ?? materialItems[0];
  const install =
    "npm install @uqrealitylabs/feelable-materials three @react-three/fiber";
  const code = useMemo(
    () => `<FeelableSurface material="${selectedItem.material}">
  <planeGeometry args={[2.55, 1.5, 24, 14]} />
  <meshPhysicalMaterial roughness={0.3} />
</FeelableSurface>`,
    [selectedItem.material],
  );

  useEffect(() => {
    const element = benchRef.current;
    if (!element || !("IntersectionObserver" in window)) {
      setBenchNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setBenchNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  async function copyExample() {
    if (!navigator.clipboard) {
      setCopyStatus("Clipboard unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus("Copy example"), 1600);
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  function pressSelected() {
    const canvas = benchRef.current?.querySelector("canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = {
      bubbles: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      pointerId: 41,
    };
    canvas.dispatchEvent(new PointerEvent("pointermove", pointer));
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", { ...pointer, button: 0, buttons: 1 }),
    );
    window.setTimeout(
      () =>
        canvas.dispatchEvent(
          new PointerEvent("pointerup", { ...pointer, button: 0 }),
        ),
      180,
    );
  }

  return (
    <div className="demo-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Feelable Materials home">
          <span className="brand-mark" aria-hidden="true">
            ◈
          </span>
          <span>UQ Reality Labs / Feelable Materials</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#bench">Material bench</a>
          <a href="#model">Interaction model</a>
          <a
            href="https://github.com/uqrealitylabs/feelable-materials"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero section-grid">
          <div className="hero-copy">
            <p className="eyebrow">REACT THREE FIBER / LOCAL CONTACT / WEBGL</p>
            <h1>Feelable Materials</h1>
            <p className="hero-lede">
              Surfaces that depress locally, smudge, and return after contact.
            </p>
            <p className="hero-body">
              A compact R3F interaction layer with bounded pointer response.
              Poke the bench below.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#bench">
                Poke the bench
              </a>
              <a className="button button-quiet" href="#install">
                Install package
              </a>
            </div>
          </div>
          <div className="hero-note">
            <span className="note-line">Hover is light.</span>
            <span className="note-line">Press is stronger.</span>
            <span className="note-line">Release returns.</span>
          </div>
        </section>

        <section
          className="bench section-block"
          id="bench"
          aria-labelledby="bench-title"
          ref={benchRef}
        >
          <div className="section-heading">
            <p className="eyebrow">INTERACTIVE MATERIAL BENCH</p>
            <h2 id="bench-title">Compare the response, not just the colour.</h2>
            <p>
              Use a mouse, trackpad, or touch. Select a finish, then press and
              drag the large specimen.
            </p>
          </div>
          <div className="bench-layout">
            <div className="canvas-panel">
              {!benchNearViewport && (
                <div className="canvas-message">
                  The material bench loads as you approach it.
                </div>
              )}
              {benchNearViewport && (
                <Suspense
                  fallback={
                    <div className="canvas-message">
                      Loading the material bench...
                    </div>
                  }
                >
                  <MaterialBench
                    key={resetKey}
                    item={selectedItem}
                    quality={quality}
                    reducedMotion={reducedMotion}
                  />
                </Suspense>
              )}
            </div>
            <aside className="control-panel">
              <div className="control-panel-heading">
                <div>
                  <p className="eyebrow">SURFACE STATUS</p>
                  <h3>{selectedItem.label}</h3>
                </div>
                <div className="control-actions">
                  <button
                    className="text-button"
                    type="button"
                    disabled={reducedMotion || !benchNearViewport}
                    onClick={pressSelected}
                  >
                    Press
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setResetKey((key) => key + 1)}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <p className="selected-detail">{selectedItem.detail}</p>
              <div className="material-list">
                {materialItems.map((item) => (
                  <button
                    data-material={item.id}
                    aria-pressed={selected === item.id}
                    className={
                      selected === item.id
                        ? "material-choice is-selected"
                        : "material-choice"
                    }
                    type="button"
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <span>{item.label}</span>
                    <small>{item.detail}</small>
                  </button>
                ))}
              </div>
              <label className="control-field">
                <span>Render quality</span>
                <select
                  value={quality}
                  onChange={(event) =>
                    setQuality(event.target.value as Quality)
                  }
                >
                  <option value="low">Low / 180 grass blades</option>
                  <option value="standard">Standard / 420 grass blades</option>
                  <option value="high">High / 720 grass blades</option>
                </select>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(event) => setReducedMotion(event.target.checked)}
                />
                <span>Reduced motion / low power</span>
              </label>
              <p
                className="canvas-status"
                role="status"
              >{`${quality} quality · ${reducedMotion ? "reduced motion" : "motion enabled"}`}</p>
            </aside>
          </div>
        </section>

        <section
          className="feature-section section-block"
          id="model"
          aria-labelledby="model-title"
        >
          <div className="section-heading">
            <p className="eyebrow">ONE CONTACT MODEL / PRESET RESPONSES</p>
            <h2 id="model-title">A shared poke, tuned per material.</h2>
          </div>
          <div className="feature-grid">
            <article className="feature-item">
              <span className="feature-number">01</span>
              <h3>Local coordinates</h3>
              <p>
                Pointer UV, pressure, and velocity stay close to the surface
                instead of depending on page coordinates.
              </p>
            </article>
            <article className="feature-item">
              <span className="feature-number">02</span>
              <h3>Preset tuning</h3>
              <p>
                Each preset changes contact radius, depth, surface response, and
                return. Glass keeps a fading roughness mark; grass adds
                instanced blades.
              </p>
            </article>
            <article className="feature-item">
              <span className="feature-number">03</span>
              <h3>Bounded frame work</h3>
              <p>
                Fast interaction data lives in refs and uniforms. The render
                loop does not schedule React state updates.
              </p>
            </article>
          </div>
        </section>

        <section
          className="code-section section-block"
          aria-labelledby="code-title"
        >
          <div className="section-heading">
            <p className="eyebrow">START SMALL</p>
            <h2 id="code-title">Own the Canvas. Add a surface.</h2>
          </div>
          <div className="code-panel">
            <div className="code-panel-heading">
              <span>surface.tsx</span>
              <button
                className="text-button"
                type="button"
                onClick={copyExample}
              >
                {copyStatus}
              </button>
            </div>
            <pre>
              <code>{code}</code>
            </pre>
          </div>
        </section>
        <section
          className="install-section section-block"
          id="install"
          aria-labelledby="install-title"
        >
          <div>
            <p className="eyebrow">R3F PEERS STAY EXTERNAL</p>
            <h2 id="install-title">Install the tactile layer.</h2>
            <p>
              React, Three, and React Three Fiber remain consumer-owned peer
              dependencies.
            </p>
          </div>
          <code className="install-command">{install}</code>
        </section>
      </main>
      <footer className="site-footer">
        <span>Feelable Materials / interactive library demonstration</span>
        <span>UQ Reality Labs</span>
        <a
          href="https://github.com/uqrealitylabs/feelable-materials"
          rel="noreferrer"
        >
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Demo root is missing");
createRoot(root).render(<App />);
