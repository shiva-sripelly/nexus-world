import { useState } from 'react'
import { ACCESSORIES, COLORS } from '../game/constants'
import { actions, useGame } from '../game/store'
import { CharacterPreview } from '../scene/Preview'

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/

export function Menu() {
  const profile = useGame((s) => s.profile)
  const look = useGame((s) => s.look)
  const connecting = useGame((s) => s.connecting)
  const [name, setName] = useState(() => localStorage.getItem('nexus:lastName') ?? '')
  const valid = NAME_RE.test(name)

  const enter = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    localStorage.setItem('nexus:lastName', name)
    actions.login(name)
  }

  return (
    <main className="menu">
      <section className="menu__hero">
        <p className="eyebrow">Real-time multiplayer arena</p>
        <h1 className="logo">
          NEXUS<span>WORLD</span>
        </h1>
        <p className="menu__tagline">Outplay rivals and AI Sentinels in a neon arena. Every shot is resolved on the server.</p>

        {!profile ? (
          <form className="panel login" onSubmit={enter}>
            <label className="field">
              <span>Callsign</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="3–16 letters, digits or _"
                maxLength={16}
                autoFocus
              />
            </label>
            <button className="btn btn--primary" type="submit" disabled={!valid || connecting}>
              {connecting ? 'Connecting…' : 'Enter the Nexus'}
            </button>
            <p className="hint">Your callsign is claimed on first use and saved in this browser.</p>
          </form>
        ) : (
          <div className="panel profile">
            <div>
              <p className="profile__name" style={{ color: look.color }}>
                {profile.name}
              </p>
              <p className="profile__meta">
                Rating <strong>{profile.rating}</strong>
                {profile.rank ? (
                  <>
                    {' '}
                    · Rank <strong>#{profile.rank}</strong>
                  </>
                ) : null}
              </p>
            </div>
            <div className="menu__actions">
              <button className="btn btn--primary btn--big" onClick={actions.quickMatch}>
                Ranked Quick Match
              </button>
              <button className="btn" onClick={actions.createLobby}>
                Create Lobby
              </button>
              <button className="btn" onClick={actions.browseLobbies}>
                Browse Lobbies
              </button>
            </div>
          </div>
        )}

        <nav className="menu__links">
          <button className="btn btn--ghost" onClick={() => actions.goto('leaderboard')}>
            Leaderboard
          </button>
          <button className="btn btn--ghost" onClick={() => actions.goto('replays')}>
            Replays
          </button>
        </nav>
      </section>

      <section className="panel customize">
        <h2 className="panel__title">Character</h2>
        <div className="customize__preview">
          <CharacterPreview color={look.color} accessory={look.accessory} />
        </div>
        <div className="field">
          <span>Jacket colour</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                className={c === look.color ? 'swatch swatch--on' : 'swatch'}
                style={{ background: c }}
                onClick={() => actions.setLook({ color: c })}
                aria-label={`Colour ${c}`}
                aria-pressed={c === look.color}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <span>Accessory</span>
          <div className="chips">
            {ACCESSORIES.map((a) => (
              <button
                key={a}
                className={a === look.accessory ? 'chip chip--on' : 'chip'}
                onClick={() => actions.setLook({ accessory: a })}
                aria-pressed={a === look.accessory}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
