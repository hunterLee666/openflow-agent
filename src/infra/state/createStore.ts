import type { Action, Reducer, Listener, Store, Unsubscribe } from './types'

export function createStore<S>(
  reducer: Reducer<S>,
  preloadedState?: S
): Store<S> {
  let state = preloadedState as S
  let currentReducer = reducer
  const listeners = new Set<Listener>()
  let isDispatching = false
  let lastAction: Action | null = null

  function getState(): S {
    if (isDispatching) {
      throw new Error('Reducers may not dispatch.')
    }
    return state
  }

  function subscribe(listener: Listener): Unsubscribe {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function.')
    }
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function dispatch(action: Action): Action {
    if (isDispatching) {
      throw new Error('Reducers may not dispatch.')
    }
    if (typeof action.type === 'undefined') {
      throw new Error('Actions must have a type property.')
    }
    try {
      isDispatching = true
      lastAction = action
      state = currentReducer(state, action)
    } finally {
      isDispatching = false
    }
    listeners.forEach((l) => {
      try {
        l()
      } catch (e) {
        console.error('[store listener error]', e)
      }
    })
    return action
  }

  function replaceReducer(next: Reducer<S>): void {
    currentReducer = next
    dispatch({ type: '@@/REPLACE' })
  }

  function getLastAction(): Action | null {
    return lastAction
  }

  dispatch({ type: '@@/INIT' })

  return { getState, dispatch, subscribe, replaceReducer, getLastAction }
}

export function combineReducers<S extends Record<string, unknown>>(
  reducers: { [K in keyof S]: Reducer<S[K]> }
): Reducer<S> {
  return (state: S | undefined, action: Action): S => {
    const nextState = {} as S
    let hasChanged = false

    for (const key in reducers) {
      const reducer = reducers[key]
      const previousStateForKey = state?.[key]
      const nextStateForKey = reducer(previousStateForKey as S[Extract<keyof S, string>], action)
      nextState[key] = nextStateForKey
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey
    }

    return hasChanged || !state ? nextState : state
  }
}

export function compose<S>(...funcs: Array<(arg: S) => S>): (arg: S) => S {
  if (funcs.length === 0) {
    return (arg: S) => arg
  }
  if (funcs.length === 1) {
    return funcs[0]
  }
  return funcs.reduce((a, b) => (arg: S) => a(b(arg)))
}

export function applyMiddleware<S>(
  ...middlewares: Array<(store: { getState: () => S; dispatch: (action: Action) => Action }) => (next: (action: Action) => Action) => (action: Action) => Action>
): (createStore: (reducer: Reducer<S>, preloadedState?: S) => Store<S>) => (reducer: Reducer<S>, preloadedState?: S) => Store<S> {
  return (createStoreFn) => (reducer, preloadedState) => {
    const store = createStoreFn(reducer, preloadedState)
    const middlewareAPI: { getState: () => S; dispatch: (action: Action) => Action } = {
      getState: store.getState,
      dispatch: (action: Action) => store.dispatch(action),
    }

    const chain = middlewares.map((middleware) => middleware(middlewareAPI))
    const composedDispatch = compose(...chain)(store.dispatch)

    return {
      ...store,
      dispatch: composedDispatch,
    }
  }
}
