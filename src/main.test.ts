import { describe, expect, test } from "bun:test";
import { applyFiltersExpanded } from "./main";

function makeToggle(): HTMLButtonElement {
  const button = {
    tagName: "BUTTON",
    textContent: "",
    _attrs: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      this._attrs[name] = value;
    },
    getAttribute(name: string) {
      return this._attrs[name] ?? null;
    },
  };
  return button as unknown as HTMLButtonElement;
}

function makeSection(): HTMLElement {
  const section = {
    classList: {
      _classes: new Set<string>(),
      toggle(className: string, force?: boolean) {
        if (force === undefined) {
          if (this._classes.has(className)) {
            this._classes.delete(className);
          } else {
            this._classes.add(className);
          }
          return this._classes.has(className);
        }
        if (force) {
          this._classes.add(className);
        } else {
          this._classes.delete(className);
        }
        return this._classes.has(className);
      },
      contains(className: string) {
        return this._classes.has(className);
      },
    },
  };
  return section as unknown as HTMLElement;
}

describe("applyFiltersExpanded", () => {
  test("collapsed state hides filters-body", () => {
    const section = makeSection();
    const toggle = makeToggle();
    applyFiltersExpanded(section, toggle, false);
    expect(section.classList.contains("is-collapsed")).toBe(true);
  });

  test("expanded state shows filters-body", () => {
    const section = makeSection();
    const toggle = makeToggle();
    applyFiltersExpanded(section, toggle, true);
    expect(section.classList.contains("is-collapsed")).toBe(false);
  });

  test("sets aria-expanded to true when expanded", () => {
    const section = makeSection();
    const toggle = makeToggle();
    applyFiltersExpanded(section, toggle, true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  test("sets aria-expanded to false when collapsed", () => {
    const section = makeSection();
    const toggle = makeToggle();
    applyFiltersExpanded(section, toggle, false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  test("button reads 'hide' when expanded", () => {
    const section = makeSection();
    const toggle = makeToggle();
    applyFiltersExpanded(section, toggle, true);
    expect(toggle.textContent).toBe("hide");
  });

  test("button reads 'show' when collapsed", () => {
    const section = makeSection();
    const toggle = makeToggle();
    applyFiltersExpanded(section, toggle, false);
    expect(toggle.textContent).toBe("show");
  });

  test("toggling from collapsed to expanded removes is-collapsed and updates button", () => {
    const section = makeSection();
    const toggle = makeToggle();
    applyFiltersExpanded(section, toggle, false);
    expect(section.classList.contains("is-collapsed")).toBe(true);
    expect(toggle.textContent).toBe("show");

    applyFiltersExpanded(section, toggle, true);
    expect(section.classList.contains("is-collapsed")).toBe(false);
    expect(toggle.textContent).toBe("hide");
  });

  test("toggling from expanded to collapsed adds is-collapsed and updates button", () => {
    const section = makeSection();
    const toggle = makeToggle();
    applyFiltersExpanded(section, toggle, true);
    expect(section.classList.contains("is-collapsed")).toBe(false);
    expect(toggle.textContent).toBe("hide");

    applyFiltersExpanded(section, toggle, false);
    expect(section.classList.contains("is-collapsed")).toBe(true);
    expect(toggle.textContent).toBe("show");
  });
});
