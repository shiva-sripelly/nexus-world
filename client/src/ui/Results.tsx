import { actions, useGame } from '../game/store'
import { Delta, ordinal } from './common'

export function Results() {
  const results = useGame((s) => s.results)
  const profile = useGame((s) => s.profile)
  const lobby = useGame((s) => s.lobby)
  if (!results) return null
  const mine = results.results.find((r) => r.id === profile?.id)
  const title = mine?.place === 1 ? 'Victory' : mine ? `${ordinal(mine.place)} place` : 'Match over'

  return (
    <main className="center-screen">
      <div className="panel results">
        <p className="eyebrow">{results.mode === 'ranked' ? 'Ranked match' : 'Casual match'}</p>
        <h1 className={mine?.place === 1 ? 'results__title results__title--win' : 'results__title'}>{title}</h1>
        {mine && results.mode === 'ranked' && (
          <p className="results__rating">
            Rating {mine.ratingBefore} → <strong>{mine.ratingAfter}</strong> <Delta value={mine.delta} />
          </p>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Score</th>
              <th>K</th>
              <th>D</th>
              {results.mode === 'ranked' && <th>Rating</th>}
            </tr>
          </thead>
          <tbody>
            {results.results.map((r) => (
              <tr key={r.id} className={r.id === profile?.id ? 'table__you' : undefined}>
                <td>{r.place}</td>
                <td>{r.name}</td>
                <td>{r.score}</td>
                <td>{r.kills}</td>
                <td>{r.deaths}</td>
                {results.mode === 'ranked' && <td>{r.is_bot ? '—' : <Delta value={r.delta} />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar toolbar--center">
          <button className="btn" onClick={() => actions.openReplay(results.replayId)}>
            Watch replay
          </button>
          {!lobby && (
            <button className="btn btn--primary" onClick={actions.quickMatch}>
              Play again
            </button>
          )}
          <button className="btn btn--ghost" onClick={actions.backFromResults}>
            {lobby ? 'Back to lobby' : 'Menu'}
          </button>
        </div>
      </div>
    </main>
  )
}
