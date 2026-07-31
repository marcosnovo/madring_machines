import { useState } from 'react'

import { isTouchCapable } from '../controls/touchCapable'
import { useStore } from '../store'

import { Keys } from './Keys'

export function Help(): JSX.Element {
  const [set, help, sound] = useStore((state) => [state.set, state.help, state.sound])
  // The popup is a keybinding legend; a touch player has no keys to rebind
  // and the button sits in the same top-right corner as the position board,
  // so on a phone it is pure clutter rather than a help affordance.
  const [touch] = useState(isTouchCapable)

  return (
    <>
      <div className={`${sound ? 'sound' : 'nosound'}`}></div>
      {!touch && (
        <div className="help">
          {!help && <button onClick={() => set({ help: true })}>i</button>}
          <div className={`popup ${help ? 'open' : ''}`}>
            <button className="popup-close" onClick={() => set({ help: false })}>
              i
            </button>
            <div className="popup-content">
              <Keys />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
