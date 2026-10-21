import { C } from '../game/constants'
import { actions, useGame } from '../game/store'

export function LobbyRoom() {
  const lobby = useGame((s) => s.lobby)
  const profile = useGame((s) => s.profile)
  if (!lobby || !profile) return null
  const isHost = lobby.hostId === profile.id
  const me = lobby.members.find((m) => m.id === profile.id)
  const slots = C.maxPlayersPerMatch - lobby.members.length

  return (
    <main className="screen">
      <header className="screen__head">
        <button className="btn btn--ghost" onClick={actions.leaveLobby}>
          ← Leave lobby
        </button>
        <h1 className="screen__title">{lobby.name}</h1>
        <span className="badge">
          Code <code>{lobby.id}</code>
        </span>
      </header>

      <div className="roster">
        {lobby.members.map((m) => (
          <div key={m.id} className="roster__card" style={{ borderColor: m.color }}>
            <span className="roster__dot" style={{ background: m.color }} />
            <p className="roster__name">{m.name}</p>
            <p className="roster__meta">
              {m.is_bot ? 'AI opponent' : `Rating ${m.rating}`}
              {m.id === lobby.hostId && ' · Host'}
            </p>
            <p className={m.ready ? 'roster__ready roster__ready--on' : 'roster__ready'}>{m.ready ? 'Ready' : 'Not ready'}</p>
            {isHost && m.is_bot && (
              <button className="btn btn--ghost btn--small" onClick={() => actions.removeBot(m.id)}>
                Remove
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: Math.max(0, slots) }, (_, i) => (
          <div key={`empty-${i}`} className="roster__card roster__card--empty">
            <p className="roster__meta">Open slot</p>
            {isHost && (
              <button className="btn btn--small" onClick={actions.addBot}>
                + Add AI opponent
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="toolbar toolbar--end">
        <p className="hint">Casual match · {lobby.members.length} of {C.maxPlayersPerMatch} slots filled · rating not affected</p>
        {isHost ? (
          <button className="btn btn--primary btn--big" onClick={actions.startMatch}>
            Start match
          </button>
        ) : (
          <button className={me?.ready ? 'btn' : 'btn btn--primary btn--big'} onClick={actions.toggleReady}>
            {me?.ready ? 'Not ready' : "I'm ready"}
          </button>
        )}
      </div>
    </main>
  )
}
