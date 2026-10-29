import { describe, expect, test } from "bun:test";
import {
  applyFiltersExpanded,
  createDefaultFilters,
  readSalaryInput,
  renderChipGroup,
  toggleItem,
} from "./main";

interface FakeElement {
  type: string;
  className: string;
  textContent: string;
  attrs: Record<string, string>;
  listeners: Record<string, () => void>;
  children: FakeElement[];
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  appendChild(child: FakeElement): void;
  addEventListener(type: string, listener: () => void): void;
  click(): void;
}

function makeFakeElement(): FakeElement {
  const element: FakeElement = {
    type: "",
    className: "",
    textContent: "",
    attrs: {},
    listeners: {},
    children: [],
    set innerHTML(value: string) {
      if (value === "") {
        element.children.length = 0;
      }
    },
    setAttribute(name: string, value: string) {
      element.attrs[name] = value;
    },
    getAttribute(name: string) {
      return element.attrs[name] ?? null;
    },
    appendChild(child: FakeElement) {
      element.children.push(child);
    },
    addEventListener(type: string, listener: () => void) {
      element.listeners[type] = listener;
    },
    click() {
      element.listeners.click?.();
    },
  } as FakeElement;
  return element;
}

function withMockedDocument<T>(run: () => T): T {
  const globalRef = globalThis as { document?: unknown };
  const originalDocument = globalRef.document;
  globalRef.document = { createElement: () => makeFakeElement() };
  try {
    return run();
  } finally {
    globalRef.document = originalDocument;
  }
}

describe("toggleItem", () => {
  test("appends a value that is not selected", () => {
    expect(toggleItem(["a"], "b")).toEqual(["a", "b"]);
  });

  test("removes a value that is selected", () => {
    expect(toggleItem(["a", "b"], "a")).toEqual(["b"]);
  });

  test("does not mutate the input array", () => {
    const original = ["a"];
    toggleItem(original, "b");
    expect(original).toEqual(["a"]);
  });
});

describe("createDefaultFilters", () => {
  test("returns the default filter set", () => {
    expect(createDefaultFilters()).toEqual({
      keyword: "",
      sources: [],
      locations: ["Dublin", "Wicklow", "Remote"],
      workMode: "all",
      hidden: "active",
      salaryMin: null,
      salaryMax: null,
    });
  });

  test("applies overrides on top of the defaults", () => {
    const filters = createDefaultFilters({ locations: [], keyword: "nurse" });
    expect(filters.locations).toEqual([]);
    expect(filters.keyword).toBe("nurse");
    expect(filters.workMode).toBe("all");
    expect(filters.salaryMin).toBeNull();
  });

  test("hands out independent location arrays", () => {
    const first = createDefaultFilters();
    first.locations.push("Cork");
    expect(createDefaultFilters().locations).toEqual(["Dublin", "Wicklow", "Remote"]);
  });
});

describe("readSalaryInput", () => {
  test("reads a valid number floored", () => {
    expect(readSalaryInput({ value: "35000.9" } as HTMLInputElement)).toBe(35000);
  });

  test("treats an empty input as no bound", () => {
    expect(readSalaryInput({ value: "" } as HTMLInputElement)).toBeNull();
    expect(readSalaryInput({ value: "   " } as HTMLInputElement)).toBeNull();
  });

  test("rejects negative and non-numeric input", () => {
    expect(readSalaryInput({ value: "-5" } as HTMLInputElement)).toBeNull();
    expect(readSalaryInput({ value: "banana" } as HTMLInputElement)).toBeNull();
  });
});

describe("renderChipGroup", () => {
  test("renders one chip per option with aria-pressed reflecting the selection", () => {
    withMockedDocument(() => {
      const container = makeFakeElement();
      renderChipGroup({
        container: container as unknown as HTMLElement,
        options: ["a", "b"],
        label: (option) => `label-${option}`,
        getSelected: () => ["a"],
        onToggle: () => {},
      });
      expect(container.children).toHaveLength(2);
      expect(container.children[0]?.textContent).toBe("label-a");
      expect(container.children[0]?.getAttribute("aria-pressed")).toBe("true");
      expect(container.children[1]?.getAttribute("aria-pressed")).toBe("false");
      expect(container.children[0]?.type).toBe("button");
      expect(container.children[0]?.className).toBe("chip");
    });
  });

  test("clears the container before rendering", () => {
    withMockedDocument(() => {
      const container = makeFakeElement();
      container.appendChild(makeFakeElement());
      renderChipGroup({
        container: container as unknown as HTMLElement,
        options: ["a"],
        label: (option) => option,
        getSelected: () => [],
        onToggle: () => {},
      });
      expect(container.children).toHaveLength(1);
      expect(container.children[0]?.textContent).toBe("a");
    });
  });

  test("toggles through onToggle with the current selection applied", () => {
    withMockedDocument(() => {
      const container = makeFakeElement();
      let selected = ["a"];
      const toggles: string[][] = [];
      renderChipGroup({
        container: container as unknown as HTMLElement,
        options: ["a", "b"],
        label: (option) => option,
        getSelected: () => selected,
        onToggle: (next) => {
          toggles.push(next);
          selected = next;
        },
      });
      container.children[1]?.click();
      expect(toggles[0]).toEqual(["a", "b"]);
      container.children[0]?.click();
      expect(toggles[1]).toEqual(["b"]);
    });
  });
});

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
