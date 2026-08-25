import type { CaseSummary } from "../case-table.js";

/**
 * What the case is made of, for the moment nothing is selected — which is
 * exactly when "what am I even looking at" is the question. Composition by
 * kind and by source, and how much of it has actually been reviewed.
 */
export const CaseOverview = ({
  slots,
  summary,
}: {
  readonly slots: ReadonlyMap<string, number>;
  readonly summary: CaseSummary;
}) => (
  <div className="overview">
    <div className="overview-heads">
      <span className="overview-stat">
        <b>{summary.total}</b>
        <span className="vk-micro vk-dim">entities</span>
      </span>
      <span className="overview-stat">
        <b>{summary.relations}</b>
        <span className="vk-micro vk-dim">links</span>
      </span>
      <span className="overview-stat">
        <b className={summary.corroborated > 0 ? "vk-ok" : undefined}>
          {summary.corroborated}
        </b>
        <span className="vk-micro vk-dim">corroborated</span>
      </span>
      <span className="overview-stat">
        <b className={summary.unreviewed > 0 ? "vk-danger" : undefined}>
          {summary.unreviewed}
        </b>
        <span className="vk-micro vk-dim">unreviewed</span>
      </span>
    </div>

    <p className="hint">
      {summary.kept} kept · {summary.deferred} deferred · {summary.discarded}{" "}
      discarded. Discarding hides a row here; the entity stays in the graph and
      in the log, which are append-only.
    </p>

    <h3>by kind</h3>
    <ul className="tally">
      {summary.byKind.map((one) => (
        <li key={one.name}>
          <span
            className={`vk-legend__swatch vk-node--cat-${(slots.get(one.name) ?? 0) + 1}`}
          />
          <span className="vk-mono">{one.name}</span>
          <span className="vk-spacer" />
          <span className="vk-mono vk-dim">{one.count}</span>
        </li>
      ))}
    </ul>

    <h3>by source</h3>
    {summary.bySource.length === 0 ? (
      <p className="hint">Nothing has been acquired into this case yet.</p>
    ) : (
      <ul className="tally">
        {summary.bySource.map((one) => (
          <li key={one.name}>
            <span className="vk-mono">{one.name}</span>
            <span className="vk-spacer" />
            <span className="vk-mono vk-dim">{one.count}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);
