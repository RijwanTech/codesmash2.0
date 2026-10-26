export function Palette({
  count,
  index,
  state,
  onSelect,
  doneLabel = 'Answered',
  markedLabel = 'Marked',
  marked = true,
}: {
  count: number;
  index: number;
  state: (i: number) => '' | 'done' | 'marked';
  onSelect: (i: number) => void;
  doneLabel?: string;
  markedLabel?: string;
  /** Show the amber "marked" state in the legend (not used in Round 1 any more). */
  marked?: boolean;
}) {
  return (
    <div className="palette-wrap">
      <h4>Question palette</h4>
      <div className="palette">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            className={`pal-cell ${state(i)} ${i === index ? 'current' : ''}`}
            onClick={() => onSelect(i)}
            aria-label={`Question ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="legend">
        <span>
          <i className="l-done" />
          {doneLabel}
        </span>
        {marked && (
          <span>
            <i className="l-marked" />
            {markedLabel}
          </span>
        )}
        <span>
          <i />
          Not visited
        </span>
      </div>
    </div>
  );
}

