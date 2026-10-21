import { actions, useGame } from './game/store'
import { GameScreen } from './ui/GameScreen'
import { Leaderboard } from './ui/Leaderboard'
import { Lobbies } from './ui/Lobbies'
import { LobbyRoom } from './ui/LobbyRoom'
import { Menu } from './ui/Menu'
import { Queue } from './ui/Queue'
import { Replays } from './ui/Replays'
import { ReplayScreen } from './ui/ReplayScreen'
import { Results } from './ui/Results'

export function App() {
  const screen = useGame((s) => s.screen)
  const error = useGame((s) => s.error)

  return (
    <>
      {screen === 'menu' && <Menu />}
      {screen === 'queue' && <Queue />}
      {screen === 'lobbies' && <Lobbies />}
      {screen === 'lobby' && <LobbyRoom />}
      {screen === 'game' && <GameScreen />}
      {screen === 'results' && <Results />}
      {screen === 'leaderboard' && <Leaderboard />}
      {screen === 'replays' && <Replays />}
      {screen === 'replay' && <ReplayScreen />}
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button className="toast__close" onClick={actions.dismissError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </>
  )
}
