import { cx } from "@viokit/ui";
import cytoscape, { type Core } from "cytoscape";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MirrorItem } from "../graph-elements.js";
import { graphElements, mirrorItems } from "../graph-elements.js";
import type { LayoutName } from "../graph-shape.js";
import { LAYOUT_LABELS, LAYOUTS } from "../graph-shape.js";
import { graphStylesheet, tokensFrom } from "../graph-style.js";
import type { GraphPick, GraphView } from "../graph-view.js";

/**
 * The one graph renderer.
 *
 * Cytoscape draws to a canvas, which buys the camera, hit-testing, and the room
 * to show more than a couple of hundred nodes. What a canvas does not have is a
 * DOM, so everything the SVG version got for free — focus, roles, labels, a
 * focus ring — is built here instead:
 *
 *   ┌─ .vk-graph ─────────────────────────────────┐
 *   │  <div aria-hidden>   ← the canvas: a picture │
 *   │  <ul  class=…__mirror>  ← the semantics      │
 *   └──────────────────────────────────────────────┘
 *
 * Both come from one view model, so they cannot disagree. A mirror maintained
 * separately from the drawing is a mirror that goes stale, and a stale
 * accessibility tree is worse than none: it lies, confidently.
 *
 * Selection is the console's, not Cytoscape's. `autounselectify` turns off its
 * internal selection entirely, so there is exactly one answer to "what is
 * selected" rather than two that agree until they don't.
 */

const SETTLE_MS = 220;
const LAYOUT_SPACING = 1.8;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 4;
const FIT_PADDING = 36;

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface GraphSurfaceProps {
  /** Restores a stored camera. Absent means: frame the graph. */
  readonly camera?: Camera | null;
  readonly label?: string;
  /** Which layout draws the graph. `preset` uses the supplied positions. */
  readonly layoutName?: LayoutName;
  /** Called when the investigator settles somewhere, not on every frame. */
  readonly onCamera?: (camera: Camera) => void;
  readonly onLayout?: (name: LayoutName) => void;
  readonly onSelect: (pick: GraphPick | null) => void;
  readonly selectedId: string | null;
  readonly view: GraphView;
}

export const GraphSurface = ({
  camera = null,
  label = "graph",
  layoutName = "preset",
  onCamera,
  onLayout,
  onSelect,
  selectedId,
  view,
}: GraphSurfaceProps) => {
  const holder = useRef<HTMLDivElement | null>(null);
  const cy = useRef<Core | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  // Read through a ref so the Cytoscape event handlers registered on mount do
  // not need re-binding every time the callback identity changes.
  const select = useRef(onSelect);
  select.current = onSelect;
  const settle = useRef(onCamera);
  settle.current = onCamera;

  const items = mirrorItems(view);

  // --- the instance, created once ---
  useEffect(() => {
    const container = holder.current;
    if (container === null) {
      return;
    }
    const instance = cytoscape({
      autounselectify: true,
      container,
      maxZoom: ZOOM_MAX,
      minZoom: ZOOM_MIN,
      style: graphStylesheet(tokensFrom(container)),
      wheelSensitivity: 0.2,
    });
    cy.current = instance;

    instance.on("tap", "node, edge", (event) => {
      const element = event.target;
      if (element.data("selectable") === false) {
        return;
      }
      select.current({
        id: element.id(),
        ...(element.isNode() ? { nodeKind: element.data("nodeKind") } : {}),
        type: element.isNode() ? "node" : "edge",
      });
    });
    // Tapping the background clears, which is how every canvas behaves and
    // therefore what an investigator will try first.
    instance.on("tap", (event) => {
      if (event.target === instance) {
        select.current(null);
      }
    });
    // `viewport` fires on every frame of a pan or a wheel-zoom. Reporting
    // each one would write view state hundreds of times per gesture, so the
    // camera is reported once the investigator stops moving it.
    let idle: ReturnType<typeof setTimeout> | undefined;
    const report = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        const pan = instance.pan();
        settle.current?.({ x: pan.x, y: pan.y, zoom: instance.zoom() });
      }, SETTLE_MS);
    };
    instance.on("viewport", report);

    return () => {
      clearTimeout(idle);
      instance.destroy();
      cy.current = null;
    };
  }, []);

  /*
   * --- the stylesheet follows the theme ---
   *
   * Built once, it would hold the previous theme's colours forever, and the
   * graph would be the one surface that did not follow a dark/light switch.
   * The theme is a `data-theme` attribute on <html>, so it is observed rather
   * than threaded through as a prop: nothing between here and the toggle has
   * any reason to know about it.
   */
  useEffect(() => {
    const container = holder.current;
    if (container === null) {
      return;
    }
    const restyle = () => {
      cy.current?.style(graphStylesheet(tokensFrom(container)));
    };
    const observer = new MutationObserver(restyle);
    observer.observe(document.documentElement, {
      attributeFilter: ["data-theme", "class"],
      attributes: true,
    });
    return () => observer.disconnect();
  }, []);

  // --- elements follow the view model ---
  const stored = useRef(camera);
  stored.current = camera;
  useEffect(() => {
    const instance = cy.current;
    if (instance === null) {
      return;
    }
    instance.batch(() => {
      instance.elements().remove();
      instance.add(graphElements(view));
    });
    // `preset` places what it is told: positions come from `layout()`, so the
    // renderer does not acquire a second opinion about where things go. The
    // other layouts are Cytoscape's own, chosen per graph on top of that.
    instance
      .layout(
        layoutName === "breadthfirst"
          ? {
              avoidOverlap: true,
              directed: true,
              name: "breadthfirst",
              // Labels run to the right of each marker, so a row needs more
              // clearance than the markers alone would ask for.
              nodeDimensionsIncludeLabels: true,
              padding: FIT_PADDING,
              spacingFactor: LAYOUT_SPACING,
            }
          : { name: layoutName }
      )
      .run();
    // Read, not depended on: a stored camera decides whether to frame, and
    // depending on it here would rebuild every element on every pan.
    if (stored.current === null) {
      instance.fit(undefined, FIT_PADDING);
    }
  }, [layoutName, view]);

  // --- a stored camera wins over framing ---
  useEffect(() => {
    const instance = cy.current;
    if (instance === null || camera === null) {
      return;
    }
    instance.zoom(camera.zoom);
    instance.pan({ x: camera.x, y: camera.y });
  }, [camera]);

  // --- selection and focus are classes, so the stylesheet owns the look ---
  useEffect(() => {
    const instance = cy.current;
    if (instance === null) {
      return;
    }
    instance.batch(() => {
      instance.elements(".is-selected").removeClass("is-selected");
      if (selectedId !== null) {
        instance.getElementById(selectedId).addClass("is-selected");
      }
      instance.elements(".is-focused").removeClass("is-focused");
      if (focused !== null) {
        instance.getElementById(focused).addClass("is-focused");
      }
    });
  }, [focused, selectedId, view]);

  const reveal = useCallback((id: string) => {
    const instance = cy.current;
    if (instance === null) {
      return;
    }
    const element = instance.getElementById(id);
    // Keyboard focus that moves to something off-screen has not moved
    // anywhere the investigator can see.
    if (element.nonempty() && element.isNode()) {
      instance.center(element);
    }
  }, []);

  const fit = useCallback(() => {
    cy.current?.fit(undefined, FIT_PADDING);
  }, []);

  const pick = (item: MirrorItem) =>
    select.current(
      selectedId === item.id
        ? null
        : {
            id: item.id,
            ...(item.kind === "node"
              ? {
                  nodeKind: cy.current
                    ?.getElementById(item.id)
                    .data("nodeKind"),
                }
              : {}),
            type: item.kind,
          }
    );

  return (
    <div className="vk-graph">
      {/* The drawing is a picture; the list below carries its meaning. */}
      <div aria-hidden="true" className="vk-graph__canvas" ref={holder} />
      <div className="vk-graph__controls">
        {/* The layout in use is named, and can be overridden. A graph that
            silently rearranges is worse than one laid out predictably. */}
        <label className="vk-graph__control" htmlFor={`${label}-layout`}>
          <span className="vk-dim">layout</span>
          <select
            id={`${label}-layout`}
            onChange={(event) => onLayout?.(event.target.value as LayoutName)}
            value={layoutName}
          >
            {LAYOUTS.map((name) => (
              <option key={name} value={name}>
                {LAYOUT_LABELS[name]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="vk-graph__control"
          onClick={fit}
          title="frame the whole graph"
          type="button"
        >
          fit
        </button>
      </div>
      <ul aria-label={label} className="vk-graph__mirror">
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`}>
            <button
              aria-pressed={selectedId === item.id}
              className={cx(
                "vk-graph__item",
                selectedId === item.id && "is-selected"
              )}
              onBlur={() => setFocused((was) => (was === item.id ? null : was))}
              onClick={() => pick(item)}
              onFocus={() => {
                setFocused(item.id);
                reveal(item.id);
              }}
              type="button"
            >
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
