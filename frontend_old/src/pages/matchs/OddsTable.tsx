import "./styles.css"

export interface OddRow {
  label: string;
  odd: number;
  profit: number;
}

interface OddsTableProps {
  rows: OddRow[];
}

export const OddsTable: React.FC<OddsTableProps> = ({ rows }) => {
  return (
    <div className="odds-table">
      <div className="odds-table__header">
        <span>RESULT</span>
        <span>ODD</span>
        <span>Profit if win</span>
      </div>
      {rows.map((row) => (
        <div className="odds-table__row" key={row.label}>
          <span className="odds-table__result">{row.label}</span>
          <span className="odds-table__odd">{row.odd}</span>
          <span className="odds-table__profit">US${row.profit.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};
