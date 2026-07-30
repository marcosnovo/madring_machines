import { useStore } from './store'

import type { ComponentType, PropsWithChildren } from 'react'
import type { IState } from './store'

type IStateKey = keyof IState

/**
 * Cache of wrappers, keyed by the wrapped component and the state keys.
 *
 * `useToggle` is called in a render body — `const T = useToggle(Debug, 'debug')`
 * — so without this it returns a brand new function component on every render
 * of its caller. React compares element types by identity, so a new type means
 * "different component": the whole subtree is unmounted and remounted. Under
 * `<Physics>` that tears down and rebuilds every cannon body and the raycast
 * vehicle, which silently teleports the car back to the grid mid-lap. Measured
 * in a headless browser before this cache: App re-rendered five times in 40 s,
 * and each one removed and re-added all 59 physics bodies.
 */
const cache = new Map<ComponentType<never>, Map<string, ComponentType<never>>>()

export const useToggle = <P extends {}>(ToggledComponent: ComponentType<P>, toggle: IStateKey | IStateKey[]) => {
  const keys = Array.isArray(toggle) ? toggle : [toggle]
  const id = keys.join('|')
  let byKey = cache.get(ToggledComponent as ComponentType<never>)
  if (!byKey) cache.set(ToggledComponent as ComponentType<never>, (byKey = new Map()))
  let component = byKey.get(id)
  if (!component) {
    const Toggled = (props: PropsWithChildren<P>) => {
      const values = useStore((state) => keys.map((key) => state[key]))
      return values.every((v) => !!v) ? <ToggledComponent {...props} /> : props.children ? <>{props.children}</> : null
    }
    byKey.set(id, (component = Toggled as unknown as ComponentType<never>))
  }
  return component as unknown as ComponentType<PropsWithChildren<P>>
}
