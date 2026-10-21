import { useEffect, useState } from 'react'
import { useGame } from '../game/store'
import type { LeaderboardRow } from '../net/protocol'
import { Screen } from './common'

export function Leaderboard() {
  const profile = useGame((s) => s.profile)
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/leaderboard?limit=50')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setRows)
      .catch(() => setFailed(true))
  }, [])

  return (
    <Screen title="Leaderboard">
      {failed && <p className="empty">Could not load the leaderboard.</p>}
      {!failed && rows === null && <p className="empty">Loading…</p>}
      {rows?.length === 0 && <p className="empty">No ranked matches played yet. Be the first.</p>}
      {rows && rows.length > 0 && (
        <table className="table table--wide">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === profile?.id ? 'table__you' : undefined}>
                <td>#{r.rank}</td>
                <td>{r.name}</td>
                <td>{r.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Screen>
  )
}
