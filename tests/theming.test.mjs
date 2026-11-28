import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { html, h } from "./support/render.mjs";
import { ThemeProvider } from "../dist/index.js";
import {
  brandToCss,
  brandToStyle,
  isBrandColour,
  isBrandFont,
  isBrandGradient,
  registerBrand,
} from "../dist/brand.js";
import { customProperties, readSource, selectorBody } from "./support/css.mjs";

const acme = {
  light: { primary: "#1d4ed8", onPrimary: "#ffffff" },
  dark: { primary: "#93c5fd", primaryHover: "rgb(180 210 255)" },
};

test("a brand definition becomes the --m-brand-* contract", () => {
  assert.deepEqual(brandToStyle(acme), {
    "--m-brand-l-primary": "#1d4ed8",
    "--m-brand-l-on-primary": "#ffffff",
    "--m-brand-d-primary": "#93c5fd",
    "--m-brand-d-primary-hover": "rgb(180 210 255)",
  });
  assert.equal(
    brandToCss("acme", acme),
    '[data-mortar-brand="acme"] {\n  --m-brand-l-primary: #1d4ed8;\n  --m-brand-l-on-primary: #ffffff;\n  --m-brand-d-primary: #93c5fd;\n  --m-brand-d-primary-hover: rgb(180 210 255);\n}',
  );
});

test("brand names and colours from data cannot inject CSS", () => {
  for (const name of ['acme"] body', "a b", "", "-x"])
    assert.throws(() => brandToCss(name, acme), /brand names/);
  for (const value of [
    "red; } body { display: none",
    "red /* x */",
    'url(x)"',
    "<style>",
  ])
    assert.throws(
      () => brandToStyle({ light: { primary: value } }),
      /Invalid Mortar brand colour/,
    );
  // Ordinary colour syntax is accepted.
  for (const value of [
    "#fff",
    "rebeccapurple",
    "oklch(60% 0.15 250)",
    "color-mix(in oklab, #1d4ed8 80%, white)",
    "var(--tenant-primary)",
  ])
    assert.doesNotThrow(() => brandToStyle({ light: { primary: value } }));
});

test("a brand colour is colour syntax only", () => {
  for (const value of [
    "#fff",
    "#ffffff80",
    "RebeccaPurple",
    "transparent",
    "currentColor",
    "rgb(180 210 255)",
    "rgba(0, 0, 0, 0.5)",
    "hsl(200deg 50% 40% / 0.5)",
    "hwb(200 10% 20%)",
    "lab(50% 40 59.5)",
    "lch(52% 72 56)",
    "oklab(59% 0.1 0.1)",
    "oklch(60% 0.15 250)",
    "color(display-p3 1 0.5 0)",
    "color-mix(in oklab, var(--x) 80%, white)",
    "light-dark(#ffffff, #000000)",
    "var(--tenant-primary, #1d4ed8)",
    "oklch(from var(--x) calc(l - 0.1) c h)",
  ])
    assert.ok(isBrandColour(value), value);
  for (const value of [
    "linear-gradient(90deg, #ff6a00, #ffb300)",
    "url(https://example.com/x.png)",
    "calc(1px + 2px)",
    "attr(data-colour)",
    "image-set(url(x) 1x)",
    "rgb(url(x) 0 0)",
    "color-mix(in oklab, attr(x) 50%, white)",
    "var(tenant)",
    "var(--x) red",
    "red blue",
    "notacolour",
    "#ggg",
    "#12345",
    "rgb(1 2 3",
    "red)",
    "(red)",
    "red; color: blue",
    "red /* x */",
    "'red'",
    '"red"',
    "red}",
    "<red>",
    "expression(alert(1))",
  ])
    assert.ok(!isBrandColour(value), value);
  // A value of the wrong kind throws, naming the key.
  assert.throws(
    () =>
      brandToStyle({
        dark: { accent: "linear-gradient(90deg, #ff6a00, #ffb300)" },
      }),
    /Invalid Mortar brand colour for dark\.accent: "linear-gradient/,
  );
  assert.throws(
    () => brandToStyle({ light: { paper: "url(x)" } }),
    /Invalid Mortar brand colour for light\.paper/,
  );
});

test("an accent gradient is a CSS gradient whose stops are colours", () => {
  for (const value of [
    "linear-gradient(90deg, #ff6a00, #ffb300)",
    "linear-gradient(to right, red 0%, rgb(255 179 0) 100%)",
    "linear-gradient(in oklab 135deg, #ff6a00, oklch(80% 0.17 80))",
    "radial-gradient(circle at center, var(--brand-a), #ffb300 80%)",
    "conic-gradient(from 90deg at 50% 50%, red, blue, red)",
    "repeating-linear-gradient(45deg, #111 0 10px, #222 10px 20px)",
    "repeating-radial-gradient(#111, #222 20%)",
  ])
    assert.ok(isBrandGradient(value), value);
  for (const value of [
    "#ff6a00",
    "linear-gradient(#ff6a00)",
    "linear-gradient(90deg, url(x), #ffb300)",
    "linear-gradient(90deg, #ff6a00, #ffb300), url(x)",
    "image-set(url(x) 1x)",
    "url(x)",
    "element(#x)",
    "cross-fade(red, blue)",
    "linear-gradient(90deg, attr(x), red)",
    "linear-gradient(90deg, #ff6a00, #ffb300); color: red",
    'linear-gradient(90deg, "#ff6a00", #ffb300)',
  ])
    assert.ok(!isBrandGradient(value), value);
  assert.deepEqual(
    brandToStyle({
      light: { accentGradient: "linear-gradient(90deg, #ff6a00, #ffb300)" },
    }),
    {
      "--m-brand-l-accent-gradient": "linear-gradient(90deg, #ff6a00, #ffb300)",
    },
  );
  assert.throws(
    () => brandToStyle({ light: { accentGradient: "#ff6a00" } }),
    /Invalid Mortar brand gradient for light\.accentGradient/,
  );
});

test("brand fonts are font-family lists only", () => {
  for (const value of [
    "Inter",
    '"Inter Display", sans-serif',
    "'Fira Sans', Georgia, serif",
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
    "system-ui",
    // Framework font loaders hand out a custom property, e.g. next/font.
    "var(--font-inter)",
    "var(--font-geist), system-ui, sans-serif",
  ])
    assert.ok(isBrandFont(value), value);
  for (const value of [
    "",
    "Inter,",
    "Inter; color: red",
    "url(x)",
    "var(--font, Inter)",
    "var(--font) var(--other)",
    "var(font)",
    "var(--a;b)",
    "local(Inter)",
    '"Inter',
    "a { b }",
    "<b>",
    "Inter /* x */",
    "1Password",
  ])
    assert.ok(!isBrandFont(value), value);
  assert.throws(
    () => brandToStyle({ fonts: { heading: "url(x)" } }),
    /Invalid Mortar brand font for fonts\.heading/,
  );
});

test("surfaces, the accent gradient and fonts join the contract", () => {
  const brand = {
    light: { paper: "#f8fafc", surface: "#ffffff", sunken: "#eef2f7" },
    dark: {
      paper: "#0b1f3a",
      surface: "#102a4c",
      sunken: "#081629",
      accentGradient: "linear-gradient(90deg, #ff6a00, #ffb300)",
    },
    fonts: { body: '"Inter", sans-serif', heading: '"Fraunces", serif' },
  };
  assert.equal(
    brandToCss("navy", brand),
    [
      '[data-mortar-brand="navy"] {',
      "  --m-brand-l-paper: #f8fafc;",
      "  --m-brand-l-surface: #ffffff;",
      "  --m-brand-l-sunken: #eef2f7;",
      "  --m-brand-d-paper: #0b1f3a;",
      "  --m-brand-d-surface: #102a4c;",
      "  --m-brand-d-sunken: #081629;",
      "  --m-brand-d-accent-gradient: linear-gradient(90deg, #ff6a00, #ffb300);",
      '  --m-brand-font: "Inter", sans-serif;',
      '  --m-brand-font-heading: "Fraunces", serif;',
      "}",
    ].join("\n"),
  );
});

test("every brand token the appearance reads starts empty in each brand", async () => {
  const css = await readSource("src/tokens.css");
  const reset = Object.keys(
    customProperties(selectorBody(css, ":where([data-mortar-brand])")),
  );
  // Fonts are read by the document-scope rules in foundation.css.
  const read = new Set([
    ...[...css.matchAll(/var\(\s*--(m-brand-[a-z0-9-]+)/g)].map((m) => m[1]),
    "m-brand-font",
    "m-brand-font-heading",
  ]);
  assert.deepEqual([...read].sort(), reset.sort());
});

test("registerBrand is a no-op without a document", () => {
  const dispose = registerBrand("acme", acme);
  assert.equal(typeof dispose, "function");
  dispose();
});

test("ThemeProvider renders a runtime brand as a stylesheet beside its content", () => {
  const markup = html(
    ThemeProvider,
    { brand: "acme", brandTokens: acme, scope: "container" },
    h("p", null, "Hi"),
  );
  // An ordinary, server-rendered element that React updates and removes.
  assert.match(markup, /<style data-mortar-brand-style="acme">/);
  assert.match(markup, /--m-brand-l-primary: #1d4ed8;/);
  assert.match(markup, /data-mortar-brand="acme"/);
  // Without brandTokens nothing extra renders.
  assert.doesNotMatch(
    html(ThemeProvider, { scope: "container" }, h("p", null, "Hi")),
    /<style/,
  );
});

// #82: under style-src 'self' the brand ships as a stylesheet (brandToCss)
// and ThemeProvider gets the name only, which must render no inline styles.
test("ThemeProvider with a brand name only renders no inline style", () => {
  const markup = html(
    ThemeProvider,
    { brand: "acme", scope: "container" },
    h("p", null, "Hi"),
  );
  assert.match(markup, /data-mortar-brand="acme"/);
  assert.doesNotMatch(markup, /<style|style="/);
  // The stylesheet is the rule brandTokens would inject.
  const injected = html(
    ThemeProvider,
    { brand: "acme", brandTokens: acme, scope: "container" },
    h("p", null, "Hi"),
  );
  const rule = brandToCss("acme", acme);
  assert.ok(
    injected.includes(rule.replaceAll('"', "&quot;")) ||
      injected.includes(rule),
  );
});

test("the no-JavaScript dark fallback matches the dark appearance exactly", async () => {
  const css = await readSource("src/tokens.css");
  // Compare values, not indentation: the fallback sits inside @media.
  const values = (body) =>
    Object.fromEntries(
      Object.entries(customProperties(body)).map(([name, value]) => [
        name,
        value.replace(/\s+/g, " "),
      ]),
    );
  const dark = values(selectorBody(css, '[data-mortar-appearance="dark"]'));
  const media = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
  const fallback = values(media.slice(0, media.indexOf("\n}\n")));
  assert.equal(Object.keys(dark).length, 59); // 51 + eight --m-chart-* series
  assert.deepEqual(fallback, dark);
});

test("the brand helpers ship as their own package entry point", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(pkg.exports["./brand"], {
    types: "./dist/brand.d.ts",
    import: "./dist/brand.js",
  });
});

// Shape and surface: presets on the brand or ThemeProvider, written as
// attributes, so every product built from the kit need not share one silhouette.
test("ThemeProvider writes the shape and surface, from its props or the brand", () => {
  const attrs = (props) =>
    html(ThemeProvider, { scope: "container", ...props }, "Hi")
      .match(/data-mortar-shape="([a-z]+)" data-mortar-surface="([a-z]+)"/)
      ?.slice(1);
  assert.deepEqual(attrs({}), ["soft", "bordered"]);
  assert.deepEqual(
    attrs({
      brand: "acme",
      brandTokens: { ...acme, shape: "pill", surface: "raised" },
    }),
    ["pill", "raised"],
  );
  // The props win over the brand.
  assert.deepEqual(
    attrs({
      brand: "acme",
      brandTokens: { shape: "pill", surface: "raised" },
      shape: "square",
      surface: "flat",
    }),
    ["square", "flat"],
  );
  // Brand CSS carries colours and fonts only.
  assert.doesNotMatch(brandToCss("acme", { shape: "pill" }), /pill|radius/);
});

test("a shape or surface that is not a preset throws", () => {
  for (const props of [
    { shape: "rounded" },
    { surface: "shadow" },
    { brandTokens: { shape: "</style>" } },
    { brandTokens: { surface: 1 } },
  ])
    assert.throws(
      () => html(ThemeProvider, { scope: "container", ...props }, "Hi"),
      /Invalid Mortar (shape|surface): .* Use "/,
      JSON.stringify(props),
    );
});

test("every shape preset declares the whole radius scale; soft matches the defaults", async () => {
  const css = await readSource("src/tokens.css");
  const scale = [
    "m-radius-xs",
    "m-radius-sm",
    "m-radius",
    "m-radius-lg",
    "m-radius-xl",
  ];
  const root = customProperties(selectorBody(css, ":root"));
  const preset = (shape) => {
    // round and pill share a rule; pill then adds the control radius.
    const own = customProperties(
      selectorBody(css, `[data-mortar-shape="${shape}"]`),
    );
    return shape === "pill"
      ? {
          ...customProperties(selectorBody(css, '[data-mortar-shape="round"]')),
          ...own,
        }
      : own;
  };
  for (const shape of ["soft", "square", "round", "pill"])
    for (const token of [...scale, "m-radius-control"])
      assert.ok(preset(shape)[token], `${shape} sets --${token}`);
  for (const token of scale)
    assert.equal(preset("soft")[token], root[token], token);
  for (const token of scale)
    assert.equal(preset("square")[token], "0px", token);
  assert.equal(preset("pill")["m-radius-control"], "var(--m-radius-full)");
  for (const shape of ["soft", "square", "round"])
    assert.equal(preset(shape)["m-radius-control"], "initial", shape);
});

test("every surface preset declares each card token, and inverse bands switch the fill", async () => {
  const css = await readSource("src/tokens.css");
  const tokens = [
    "m-card-border",
    "m-card-fill",
    "m-inv-card-fill",
    "m-card-shadow",
  ];
  for (const surface of ["bordered", "raised", "flat"]) {
    const body = customProperties(
      selectorBody(css, `[data-mortar-surface="${surface}"]`),
    );
    assert.deepEqual(Object.keys(body).sort(), [...tokens].sort(), surface);
  }
  const bordered = customProperties(
    selectorBody(css, '[data-mortar-surface="bordered"]'),
  );
  for (const token of tokens) assert.equal(bordered[token], "initial", token);
  assert.equal(
    customProperties(selectorBody(css, '[data-tone="inverse"]'))["m-card-fill"],
    "var(--m-inv-card-fill)",
  );
});

test("content cards read the surface tokens with today's look as the fallback", async () => {
  const sheets = await Promise.all(
    ["foundation", "application", "data", "marketing", "docs"].map((f) =>
      readSource(`src/${f}.css`),
    ),
  );
  const all = sheets.join("\n");
  // Every card border that follows the surface falls back to the plain line.
  const reads = all.match(/var\(--m-card-border, 1px solid var\(--m-line\)\)/g);
  assert.ok(reads.length >= 8, `${reads.length} cards read --m-card-border`);
  assert.doesNotMatch(all, /var\(--m-card-border\)/);
  assert.doesNotMatch(all, /var\(--m-card-shadow\)(?!,)/);
  // Floating surfaces keep their own style.
  const floating = sheets[0].match(
    /\/\* Floating surfaces[^*]*\*\/\s*:where\([^)]*\)\s*\{([^}]*)\}/,
  )?.[1];
  assert.match(floating, /border: 1px solid var\(--m-line\)/);
  assert.doesNotMatch(floating, /--m-card/);
});
