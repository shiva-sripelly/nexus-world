import { useEffect, useState } from 'react'
import { actions } from '../game/store'
import type { MatchSummary } from '../net/protocol'
import { Screen, formatTime, ordinal } from './common'

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export function Replays() {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/matches?limit=25')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMatches)
      .catch(() => setFailed(true))
  }, [])

  return (
    <Screen title="Replays">
      {failed && <p className="empty">Could not load recent matches.</p>}
      {!failed && matches === null && <p className="empty">Loading…</p>}
      {matches?.length === 0 && <p className="empty">No matches recorded yet.</p>}
      <ul className="list">
        {matches?.map((m) => (
          <li key={m.id} className="list__row">
            <div>
              <p className="list__title">
                <span className="badge">{m.mode}</span> {formatTime(m.duration)} · {timeAgo(m.endedAt)}
              </p>
              <p className="list__meta">
                {m.players.map((p) => `${ordinal(p.place)} ${p.name} (${p.score})`).join(' · ')}
              </p>
            </div>
            <button className="btn" onClick={() => actions.openReplay(m.id)}>
              Watch
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  )
}
