import type { FeedItem, HudPlayer } from '../game/store'

export function Scoreboard({ standings, you }: { standings: HudPlayer[]; you?: string | null }) {
  return (
    <ol className="scoreboard">
      {standings.map((p, i) => (
        <li key={p.id} className={p.id === you ? 'scoreboard__row scoreboard__row--you' : 'scoreboard__row'}>
          <span className="scoreboard__place">{i + 1}</span>
          <span className="scoreboard__name" style={{ color: p.color }}>
            {p.name}
            {!p.connected && ' (left)'}
          </span>
          <span className="scoreboard__score">{p.score}</span>
          <span className="scoreboard__kd">
            {p.kills}/{p.deaths}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function KillFeed({ items }: { items: FeedItem[] }) {
  return (
    <ul className="killfeed" aria-live="polite">
      {items.map((f) => (
        <li key={f.id}>
          {f.killer ? (
            <span style={{ color: f.killer.color }}>{f.killer.name}</span>
          ) : (
            <span className="killfeed__sentinel">Sentinel</span>
          )}
          <span className="killfeed__icon" aria-label="eliminated">
            ✕
          </span>
          <span style={{ color: f.victim.color }}>{f.victim.name}</span>
        </li>
      ))}
    </ul>
  )
}
