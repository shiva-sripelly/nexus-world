import { useEffect, useState } from 'react'
import { actions, useGame } from '../game/store'
import { Screen } from './common'

export function Lobbies() {
  const lobbies = useGame((s) => s.lobbies)
  const profile = useGame((s) => s.profile)
  const [code, setCode] = useState('')

  useEffect(() => {
    const id = window.setInterval(actions.refreshLobbies, 2000)
    return () => window.clearInterval(id)
  }, [])

  if (!profile) {
    return (
      <Screen title="Lobbies">
        <p className="empty">Enter a callsign on the menu first.</p>
      </Screen>
    )
  }

  return (
    <Screen title="Lobbies">
      <div className="toolbar">
        <button className="btn btn--primary" onClick={actions.createLobby}>
          Create lobby
        </button>
        <form
          className="join-code"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) actions.joinLobby(code.trim())
          }}
        >
          <label className="sr-only" htmlFor="lobby-code">
            Lobby code
          </label>
          <input id="lobby-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Lobby code" maxLength={6} />
          <button className="btn" type="submit">
            Join
          </button>
        </form>
      </div>
      {lobbies.length === 0 ? (
        <p className="empty">No open lobbies yet. Create one and invite a friend with its code.</p>
      ) : (
        <ul className="list">
          {lobbies.map((l) => (
            <li key={l.id} className="list__row">
              <div>
                <p className="list__title">{l.name}</p>
                <p className="list__meta">
                  Host {l.host} · code <code>{l.id}</code>
                </p>
              </div>
              <span className="badge">
                {l.players}/{l.max}
              </span>
              <button className="btn" disabled={l.state !== 'waiting' || l.players >= l.max} onClick={() => actions.joinLobby(l.id)}>
                {l.state === 'waiting' ? 'Join' : 'In match'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
