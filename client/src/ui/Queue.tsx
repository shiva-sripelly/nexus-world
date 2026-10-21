import { actions, useGame } from '../game/store'

export function Queue() {
  const queue = useGame((s) => s.queue)
  return (
    <main className="center-screen">
      <div className="panel queue">
        <div className="radar" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1 className="screen__title">Finding a match</h1>
        <p className="queue__meta">
          {queue ? (
            <>
              {queue.inQueue} in queue · waited {Math.floor(queue.waited)}s
            </>
          ) : (
            'Joining the ranked queue…'
          )}
        </p>
        <p className="hint">
          {queue && queue.botsIn > 0
            ? `AI opponents fill empty slots in ${Math.ceil(queue.botsIn)}s`
            : 'Matching by rating. AI opponents fill any empty slots.'}
        </p>
        <button className="btn" onClick={actions.cancelQueue}>
          Cancel
        </button>
      </div>
    </main>
  )
}
