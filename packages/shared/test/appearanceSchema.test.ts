// VS Code shows the `tecture.graph.*` settings from the extension's
// package.json, but the webview applies DEFAULT_APPEARANCE and mergeAppearance.
// These tests keep the two in sync, so that the default the Settings UI shows
// is the one rendered, and every value the schema allows is kept.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CSS_COLOR_PATTERN,
  DEFAULT_APPEARANCE,
  EDGE_TYPE_KEYS,
  mergeAppearance,
  NODE_TYPE_KEYS,
} from "../src/index";

interface SchemaNode {
  type?: string | string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  format?: string;
  pattern?: string;
  properties?: Record<string, SchemaNode>;
}

const PREFIX = "tecture.graph.";
const manifest = JSON.parse(
  readFileSync(new URL("../../vscode/package.json", import.meta.url), "utf8"),
) as { contributes: { configuration: { properties: Record<string, SchemaNode> } } };
const settings = Object.entries(manifest.contributes.configuration.properties)
  .filter(([key]) => key.startsWith(PREFIX))
  .map(([key, schema]) => ({ path: key.slice(PREFIX.length).split("."), schema }));
const scalars = settings.filter(({ path }) => path.length === 2);

/** Build the nested override object for one dotted setting. */
function override(path: string[], value: unknown): Record<string, unknown> {
  return path.reduceRight<unknown>((acc, key) => ({ [key]: acc }), value) as Record<
    string,
    unknown
  >;
}

function current(path: string[], appearance: unknown = DEFAULT_APPEARANCE): unknown {
  return path.reduce<unknown>(
    (acc, key) => (acc as Record<string, unknown>)[key],
    appearance,
  );
}

const kept = (path: string[], value: unknown) =>
  current(path, mergeAppearance(override(path, value))) === value;

describe("package.json tecture.graph.* settings", () => {
  it("defaults rebuild DEFAULT_APPEARANCE exactly", () => {
    const fromSchema: Record<string, Record<string, unknown>> = {};
    for (const { path, schema } of scalars) {
      (fromSchema[path[0]!] ??= {})[path[1]!] = schema.default;
    }
    // The per-type maps are overrides on top of the built-in palettes.
    const { nodeTypes: _n, edgeTypes: _e, ...rest } = DEFAULT_APPEARANCE;
    expect(fromSchema).toEqual(rest);
    for (const { path, schema } of settings.filter(({ path }) => path.length === 1)) {
      expect(schema.default, path[0]).toEqual({});
    }
  });

  it.each(scalars.filter(({ schema }) => schema.minimum !== undefined))(
    "$path.1 in $path.0: the schema range matches the validator",
    ({ path, schema }) => {
      const { minimum, maximum } = schema as Required<SchemaNode>;
      expect(kept(path, minimum)).toBe(true);
      expect(kept(path, maximum)).toBe(true);
      const step = schema.type === "integer" ? 1 : 0.01;
      expect(kept(path, minimum - step)).toBe(false);
      expect(kept(path, maximum + step)).toBe(false);
    },
  );

  it.each(scalars.filter(({ schema }) => schema.enum))(
    "$path.1 in $path.0: every enum value is accepted",
    ({ path, schema }) => {
      for (const value of schema.enum!) expect(kept(path, value)).toBe(true);
    },
  );

  it("per-type overrides list exactly the known types", () => {
    const props = manifest.contributes.configuration.properties;
    expect(Object.keys(props[`${PREFIX}nodeTypes`]!.properties!)).toEqual([
      ...NODE_TYPE_KEYS,
    ]);
    expect(Object.keys(props[`${PREFIX}edgeTypes`]!.properties!)).toEqual([
      ...EDGE_TYPE_KEYS,
    ]);
  });

  it("every colour setting uses the shared colour pattern", () => {
    const colours: SchemaNode[] = [];
    const visit = (node: SchemaNode) => {
      if (node.format === "color") colours.push(node);
      for (const child of Object.values(node.properties ?? {})) visit(child);
    };
    for (const { schema } of settings) visit(schema);
    expect(colours.length).toBeGreaterThan(0);
    for (const node of colours) expect(node.pattern).toBe(CSS_COLOR_PATTERN);
  });
});
