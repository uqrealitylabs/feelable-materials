import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { materialItems, type DemoMaterial, type Quality } from "./demo-data";
import "./styles.css";

const MaterialBench = lazy(() => import("./MaterialBench"));

function hasWebGl() {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
}

function App() {
  const [selected, setSelected] = useState<DemoMaterial>("cloth");
  const [quality, setQuality] = useState<Quality>("standard");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [benchNearViewport, setBenchNearViewport] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const benchRef = useRef<HTMLElement>(null);
  const selectedItem = materialItems.find((item) => item.id === selected) ?? materialItems[0];
  const install = "npm install @uqrealitylabs/feelable-materials three @react-three/fiber";
  const code = useMemo(() => `<FeelableSurface material="${selected === "regions" ? "enamel" : selected === "mail" ? "grass" : selected}">
  <boxGeometry args={[2.55, 1.5, 0.12]} />
  <meshPhysicalMaterial roughness={0.3} />
</FeelableSurface>`, [selected]);

  useEffect(() => setWebgl(hasWebGl()), []);

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
    if (navigator.clipboard) await navigator.clipboard.writeText(code);
  }

  return (
    <div className="demo-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Feelable Materials home"><span className="brand-mark" aria-hidden="true">◈</span><span>UQ Reality Labs / Feelable Materials</span></a>
        <nav aria-label="Primary navigation"><a href="#bench">Material bench</a><a href="#model">Interaction model</a><a href="https://github.com/uqrealitylabs/feelable-materials" rel="noreferrer">GitHub</a></nav>
      </header>

      <main id="top">
        <section className="hero section-grid">
          <div className="hero-copy"><p className="eyebrow">REACT THREE FIBER / LOCAL CONTACT / WEBGL</p><h1>Feelable Materials</h1><p className="hero-lede">Surfaces that crease, compress, smudge, bend, and hold their shape for a moment.</p><p className="hero-body">A compact R3F interaction layer for material responses that are local, bounded, and different enough to feel. Poke the bench below.</p><div className="hero-actions"><a className="button button-primary" href="#bench">Poke the bench</a><a className="button button-quiet" href="#install">Install package</a></div></div>
          <div className="hero-note" aria-label="Feelable Materials design note"><span className="note-line">Hover is light.</span><span className="note-line">Press is stronger.</span><span className="note-line">Release returns.</span></div>
        </section>

        <section className="bench section-block" id="bench" aria-labelledby="bench-title" ref={benchRef}>
          <div className="section-heading"><p className="eyebrow">INTERACTIVE MATERIAL BENCH</p><h2 id="bench-title">Compare the response, not just the colour.</h2><p>Use a mouse, trackpad, or touch. Select a tile to give it a little more room.</p></div>
          <div className="bench-layout">
            <div className="canvas-panel">
              {webgl === null && <div className="canvas-message">Checking WebGL support...</div>}
              {webgl === false && <div className="fallback-grid" role="img" aria-label="Static list of material demos"><p>WebGL is unavailable in this browser.</p>{materialItems.map((item) => <span key={item.id}>{item.label}</span>)}</div>}
              {!benchNearViewport && <div className="canvas-message">The material bench loads as you approach it.</div>}
              {webgl === true && benchNearViewport && <Suspense fallback={<div className="canvas-message">Loading the material bench...</div>}><MaterialBench key={resetKey} selected={selected} quality={quality} reducedMotion={reducedMotion} onSelect={setSelected} /></Suspense>}
            </div>
            <aside className="control-panel">
              <div className="control-panel-heading"><div><p className="eyebrow">SURFACE STATUS</p><h3>{selectedItem.label}</h3></div><button className="text-button" type="button" onClick={() => setResetKey((key) => key + 1)}>Reset</button></div>
              <p className="selected-detail">{selectedItem.detail}</p>
              <div className="material-list" aria-label="Material selection">{materialItems.map((item) => <button className={selected === item.id ? "material-choice is-selected" : "material-choice"} type="button" key={item.id} onClick={() => setSelected(item.id)}><span>{item.label}</span><small>{item.detail}</small></button>)}</div>
              <label className="control-field"><span>Grass quality</span><select value={quality} onChange={(event) => setQuality(event.target.value as Quality)}><option value="low">Low / 180 blades</option><option value="standard">Standard / 420 blades</option><option value="high">High / 720 blades</option></select></label>
              <label className="check-field"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /><span>Reduced motion / low power</span></label>
              <p className="canvas-status" role="status">{webgl === false ? "Static fallback active; navigation remains available." : `${quality} quality · ${reducedMotion ? "reduced motion" : "motion enabled"}`}</p>
            </aside>
          </div>
        </section>

        <section className="feature-section section-block" id="model" aria-labelledby="model-title"><div className="section-heading"><p className="eyebrow">ONE CONTACT MODEL / DISTINCT RESPONSES</p><h2 id="model-title">A shared poke, different material rules.</h2></div><div className="feature-grid"><article className="feature-item"><span className="feature-number">01</span><h3>Local coordinates</h3><p>Pointer UV, pressure, velocity, phase, and age stay close to the surface instead of depending on page coordinates.</p></article><article className="feature-item"><span className="feature-number">02</span><h3>Material-specific return</h3><p>Cloth settles, rubber rebounds, glass keeps a mark, grass bends, and enamel answers with a tight highlight.</p></article><article className="feature-item"><span className="feature-number">03</span><h3>Bounded frame work</h3><p>Fast interaction data lives in refs and uniforms. The render loop does not schedule React state updates.</p></article><article className="feature-item"><span className="feature-number">04</span><h3>Regions share a poke</h3><p>The LinkedIn-style tile uses the public region manifest: an enamel badge and glass glyph receive the same contact.</p></article></div></section>

        <section className="code-section section-block" aria-labelledby="code-title"><div className="section-heading"><p className="eyebrow">START SMALL</p><h2 id="code-title">Own the Canvas. Add a surface.</h2></div><div className="code-panel"><div className="code-panel-heading"><span>surface.tsx</span><button className="text-button" type="button" onClick={copyExample}>Copy example</button></div><pre><code>{code}</code></pre></div></section>
        <section className="install-section section-block" id="install" aria-labelledby="install-title"><div><p className="eyebrow">R3F PEERS STAY EXTERNAL</p><h2 id="install-title">Install the tactile layer.</h2><p>React, Three, and React Three Fiber remain consumer-owned peer dependencies.</p></div><code className="install-command">{install}</code></section>
      </main>
      <footer className="site-footer"><span>Feelable Materials / interactive library demonstration</span><span>UQ Reality Labs</span><a href="https://github.com/uqrealitylabs/feelable-materials" rel="noreferrer">Source on GitHub</a></footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
