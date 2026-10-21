import { useEffect, useMemo, useState } from 'react'
import { enableInput, sampleInput } from '../game/input'
import { actions, liveGame, useGame } from '../game/store'
import { stats, type SceneSource } from '../scene/Entities'
import { GameScene } from '../scene/GameScene'
import { formatTime } from './common'
import { KillFeed, Scoreboard } from './hudParts'

export function GameScreen() {
  const matchId = useGame((s) => s.match?.matchId)
  const source = useMemo<SceneSource | null>(() => {
    const game = liveGame
    if (!game) return null
    return { view: game.view, roster: game.roster, live: true, update: (dt) => game.update(dt, sampleInput) }
    // A new match creates a new ClientGame; matchId changes with it.
  }, [matchId])

  useEffect(() => enableInput(), [])

  if (!source) return null
  return (
    <div className="game">
      <GameScene source={source} />
      <Hud />
    </div>
  )
}

function useTicker(ms: number) {
  const [, setN] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setN((n) => n + 1), ms)
    return () => window.clearInterval(id)
  }, [ms])
}

function Hud() {
  const hud = useGame((s) => s.hud)
  const feed = useGame((s) => s.feed)
  const ping = useGame((s) => s.ping)
  const mode = useGame((s) => s.match?.mode)
  const you = useGame((s) => s.match?.you)
  useTicker(250)

  const me = hud?.me
  const respawnIn = hud?.respawnAt ? Math.max(0, Math.ceil((hud.respawnAt - performance.now()) / 1000)) : 0

  return (
    <div className="hud">
      <div className="hud__top">
        <Scoreboard standings={hud?.standings ?? []} you={you} />
        <div className="hud__timer">
          <span className="badge">{mode === 'ranked' ? 'Ranked' : 'Casual'}</span>
          <span className="hud__clock">{formatTime(hud?.timeLeft ?? 0)}</span>
        </div>
        <div className="hud__net">
          <span>{ping ?? '–'} ms</span>
          <span>{stats.fps} fps</span>
          <button className="btn btn--ghost btn--small" onClick={actions.leaveMatch}>
            Leave
          </button>
        </div>
      </div>

      <KillFeed items={feed} />

      {hud?.phase === 'countdown' && (
        <div className="hud__center">
          <p className="hud__countdown">{Math.max(1, Math.ceil(hud.countdown))}</p>
          <p className="hint">WASD to move · mouse to aim · click or Space to fire</p>
        </div>
      )}
      {me && !me.alive && hud?.phase === 'playing' && (
        <div className="hud__center">
          <p className="hud__dead">Eliminated</p>
          <p className="hint">Respawning in {respawnIn}s</p>
        </div>
      )}

      <div className="hud__bottom">
        <div className="hpbar" aria-label={`Health ${me?.hp ?? 0}`}>
          <div className="hpbar__fill" style={{ width: `${me?.hp ?? 0}%` }} />
          <span className="hpbar__label">{me?.hp ?? 0} HP</span>
        </div>
        <p className="hud__score">
          Score <strong>{me?.score ?? 0}</strong> · K/D {me?.kills ?? 0}/{me?.deaths ?? 0}
        </p>
      </div>
      <p className="hud__controls">WASD move · Mouse aim · Click/Space fire</p>
    </div>
  )
}
