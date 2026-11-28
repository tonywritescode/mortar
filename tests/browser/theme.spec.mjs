import { test, expect } from "@playwright/test";
for (const brand of ["neutral", "green"])
  for (const density of ["compact", "comfortable", "spacious"]) {
    test(`provider ${brand}/${density} observes system appearance`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(
        "/?" +
          new URLSearchParams({
            component: "ThemeProvider",
            theme: "system",
            brand,
            density,
          }),
      );
      const html = page.locator("html");
      await expect(html).toHaveAttribute("data-mortar-brand", brand);
      await expect(html).toHaveAttribute("data-mortar-density", density);
      await expect(html).toHaveAttribute("data-mortar-appearance", "light");
      const token = (name) =>
        html.evaluate(
          (el, name) =>
            getComputedStyle(el)
              .getPropertyValue(name)
              .trim()
              .replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3"),
          name,
        );
      expect(await token("--m-primary")).toBe(
        brand === "green" ? "#047857" : "#000000",
      );
      expect(await token("--m-control")).toBe(
        { compact: "30px", comfortable: "36px", spacious: "44px" }[density],
      );
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(html).toHaveAttribute("data-mortar-appearance", "dark");
      // Each brand has one dark-side primary; green's is mint.
      expect(await token("--m-primary")).toBe(
        brand === "green" ? "#6ee7b7" : "#ffffff",
      );
      await expect(html).toHaveAttribute("data-mortar-brand", brand);
      const root = page.locator("[data-mortar-preview]");
      await root.getByRole("button", { name: "Light", exact: true }).click();
      await expect(html).toHaveAttribute("data-mortar-appearance", "light");
    });
  }

for (const name of ["Button", "Input", "Tabs", "AppShell"])
  for (const theme of ["light", "dark"]) {
    test(`green ${name} ${theme}`, async ({ page }) => {
      const { readFile } = await import("node:fs/promises");
      const { mount, accessibility } = await import("../support/preview.mjs");
      const { components } = JSON.parse(
        await readFile(new URL("../../catalog.json", import.meta.url), "utf8"),
      );
      const component = components.find((c) => c.export === name);
      const { errors } = await mount(page, component, {
        brand: "green",
        theme,
      });
      await expect(page.locator("html")).toHaveAttribute(
        "data-mortar-brand",
        "green",
      );
      await accessibility(page, `[data-mortar-preview="${name}"]`);
      expect(errors).toEqual([]);
    });
  }

// Component styles read the scale tokens: overriding one on a container
// restyles the components inside it.
test("scale token overrides restyle components", async ({ page }) => {
  const read = (selector, prop) =>
    page
      .locator(selector)
      .first()
      .evaluate(
        (el, prop) => getComputedStyle(el).getPropertyValue(prop),
        prop,
      );
  const override = `[data-mortar-preview] {
    --m-weight-semibold: 800;
    --m-radius-lg: 20px;
    --m-tracking-display: -0.05em;
  }`;

  await page.goto("/?component=Button&theme=light");
  const button = '[data-mortar-preview="Button"] .m-button';
  expect(await read(button, "font-weight")).toBe("600");
  await page.addStyleTag({ content: override });
  expect(await read(button, "font-weight")).toBe("800");

  await page.goto("/?component=Card&theme=light");
  const card = '[data-mortar-preview="Card"] .m-card';
  expect(await read(card, "border-top-left-radius")).toBe("12px");
  await page.addStyleTag({ content: override });
  expect(await read(card, "border-top-left-radius")).toBe("20px");

  // Pricing values were literals before the scale tokens drove them.
  await page.goto("/?component=Pricing&theme=light");
  const pricing = '[data-mortar-preview="Pricing"] .m-pricing-grid';
  const plan = `${pricing} article`;
  const heading = `${pricing} :is(h2, h3, h4, h5, h6)`;
  const price = `${pricing} .m-price strong`;
  expect(await read(plan, "border-top-left-radius")).toBe("12px");
  expect(await read(heading, "font-weight")).toBe("600");
  expect(await read(price, "font-weight")).toBe("600");
  const size = parseFloat(await read(price, "font-size"));
  expect(parseFloat(await read(price, "letter-spacing"))).toBeCloseTo(
    -0.04 * size,
    1,
  );
  await page.addStyleTag({ content: override });
  expect(await read(plan, "border-top-left-radius")).toBe("20px");
  expect(await read(heading, "font-weight")).toBe("800");
  expect(await read(price, "font-weight")).toBe("800");
  expect(parseFloat(await read(price, "letter-spacing"))).toBeCloseTo(
    -0.05 * size,
    1,
  );
});

// Shape and surface presets: every corner and content card follows them, and
// the nearest provider wins.
const style = (page, selector, prop) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), prop);

test("shape presets reshape surfaces and controls", async ({ page }) => {
  const expected = {
    soft: { control: "8px", card: "12px" },
    square: { control: "0px", card: "0px" },
    round: { control: "12px", card: "20px" },
    pill: { control: "999px", card: "20px" },
  };
  for (const [shape, radius] of Object.entries(expected)) {
    await page.goto(`/?component=Button&theme=light&shape=${shape}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-mortar-shape",
      shape,
    );
    const button = '[data-mortar-preview="Button"] .m-button';
    expect(await style(page, button, "border-top-left-radius"), shape).toBe(
      radius.control,
    );
    await page.goto(`/?component=Card&theme=light&shape=${shape}`);
    const card = '[data-mortar-preview="Card"] .m-card';
    expect(await style(page, card, "border-top-left-radius"), shape).toBe(
      radius.card,
    );
  }
  // Textareas keep the surface radius under pill; the segmented control's
  // inner buttons stay inside its outline.
  await page.goto("/?component=TextArea&theme=light&shape=pill");
  expect(
    await style(
      page,
      '[data-mortar-preview="TextArea"] textarea',
      "border-top-left-radius",
    ),
  ).toBe("12px");
  await page.goto("/?component=SegmentedControl&theme=light&shape=square");
  expect(
    await style(
      page,
      '[data-mortar-preview="SegmentedControl"] .m-segmented button',
      "border-top-left-radius",
    ),
  ).toBe("0px");
});

test("surface presets restyle content cards, not floating surfaces", async ({
  page,
}) => {
  const card = '[data-mortar-preview="Card"] .m-card';
  const read = async () => ({
    border: await style(page, card, "border-top-color"),
    shadow: await style(page, card, "box-shadow"),
    background: await style(page, card, "background-color"),
  });
  const token = (name) =>
    page.locator('[data-mortar-preview="Card"]').evaluate((el, name) => {
      const probe = document.createElement("i");
      probe.style.color = `var(${name})`;
      el.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }, name);
  for (const theme of ["light", "dark"]) {
    await page.goto(`/?component=Card&theme=${theme}`);
    const bordered = await read();
    expect(bordered.border).toBe(await token("--m-line"));
    expect(bordered.shadow).toBe("none");
    expect(bordered.background).toBe(await token("--m-surface"));

    await page.goto(`/?component=Card&theme=${theme}&surface=raised`);
    const raised = await read();
    expect(raised.border).toBe(bordered.border);
    expect(raised.shadow).not.toBe("none");

    await page.goto(`/?component=Card&theme=${theme}&surface=flat`);
    const flat = await read();
    expect(flat.border).toBe("rgba(0, 0, 0, 0)");
    expect(flat.shadow).toBe("none");
    expect(flat.background).toBe(await token("--m-sunken"));
    // Same box: the line stays, transparent, so nothing shifts.
    expect(await style(page, card, "border-top-width")).toBe("1px");

    // In an inverse band a flat card takes the band's recessed colour, and a
    // nested provider's surface wins over the page's.
    const [inverse, inverseSunken, nested] = await page
      .locator('[data-mortar-preview="Card"]')
      .evaluate((root) => {
        root.insertAdjacentHTML(
          "beforeend",
          `<section data-tone="inverse" class="probe-inverse"><div class="m-card">A</div><i style="color: var(--m-sunken)"></i></section>
           <div data-mortar-surface="bordered" class="probe-nested"><div class="m-card">B</div></div>`,
        );
        const bg = (s) =>
          getComputedStyle(root.querySelector(s)).backgroundColor;
        return [
          bg(".probe-inverse .m-card"),
          getComputedStyle(root.querySelector(".probe-inverse i")).color,
          getComputedStyle(root.querySelector(".probe-nested .m-card"))
            .borderTopColor,
        ];
      });
    expect(inverse).toBe(inverseSunken);
    expect(nested).not.toBe("rgba(0, 0, 0, 0)");
  }
  // Menus keep their floating style under every surface.
  await page.goto("/?component=Dropdown&theme=light&surface=flat");
  const trigger = page
    .locator('[data-mortar-preview="Dropdown"]')
    .getByRole("button")
    .first();
  await trigger.click();
  const menu = page.locator(".m-menu").first();
  await expect(menu).toBeVisible();
  expect(
    await menu.evaluate((el) => getComputedStyle(el).borderTopColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
});

// Every preset keeps the kit accessible, in both appearances.
for (const [shape, surface] of [
  ["pill", "raised"],
  ["square", "flat"],
])
  for (const name of ["Pricing", "MetricGroup", "TestimonialGrid", "Input"])
    for (const theme of ["light", "dark"])
      test(`${name} ${shape}/${surface} ${theme} passes axe`, async ({
        page,
      }) => {
        const { readFile } = await import("node:fs/promises");
        const { mount, accessibility } = await import("../support/preview.mjs");
        const { components } = JSON.parse(
          await readFile(
            new URL("../../catalog.json", import.meta.url),
            "utf8",
          ),
        );
        const component = components.find((c) => c.export === name);
        const { errors } = await mount(page, component, {
          theme,
          shape,
          surface,
        });
        await expect(page.locator("html")).toHaveAttribute(
          "data-mortar-surface",
          surface,
        );
        await accessibility(page, `[data-mortar-preview="${name}"]`);
        expect(errors).toEqual([]);
      });
