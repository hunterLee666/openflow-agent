export interface Action {
  type: string
  payload?: unknown
  meta?: Record<string, unknown>
  error?: boolean
}

export type Reducer<S> = (state: S | undefined, action: Action) => S

export type Listener = () => void

export type Unsubscribe = () => void

export interface Store<S> {
  getState(): S
  dispatch(action: Action): Action
  subscribe(listener: Listener): Unsubscribe
  replaceReducer(next: Reducer<S>): void
  getLastAction(): Action | null
}

export interface EffectContext<S> {
  action: Action
  prev: S
  next: S
}

export type Effect<S> = (ctx: EffectContext<S>) => Promise<void> | void

export interface Middleware<S> {
  (store: { getState: () => S; dispatch: (action: Action) => Action }): (
    next: (action: Action) => Action
  ) => (action: Action) => Action
}

export type Selector<S, R> = (state: S) => R

export type EqualityFn<T> = (a: T, b: T) => boolean

export const strictEqual: EqualityFn<unknown> = (a, b) => a === b

export function createSelector<S, R1, Result>(
  selector1: Selector<S, R1>,
  combiner: (r1: R1) => Result
): Selector<S, Result>
export function createSelector<S, R1, R2, Result>(
  selector1: Selector<S, R1>,
  selector2: Selector<S, R2>,
  combiner: (r1: R1, r2: R2) => Result
): Selector<S, Result>
export function createSelector<S, R1, R2, R3, Result>(
  selector1: Selector<S, R1>,
  selector2: Selector<S, R2>,
  selector3: Selector<S, R3>,
  combiner: (r1: R1, r2: R2, r3: R3) => Result
): Selector<S, Result>
export function createSelector<S, Result>(
  ...args: [...selectors: Selector<S, unknown>[], combiner: (...results: unknown[]) => Result]
): Selector<S, Result> {
  const combiner = args.pop() as (...results: unknown[]) => Result
  const selectors = args as Selector<S, unknown>[]

  let lastArgs: unknown[] | null = null
  let lastResult: Result | null = null

  return (state: S): Result => {
    const currentArgs = selectors.map((sel) => sel(state))
    if (lastArgs && currentArgs.every((arg, i) => arg === lastArgs![i])) {
      return lastResult!
    }
    lastArgs = currentArgs
    lastResult = combiner(...currentArgs)
    return lastResult
  }
}
