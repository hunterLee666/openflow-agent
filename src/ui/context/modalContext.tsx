import { createContext, useContext, type ReactNode, type RefObject } from 'react'

export interface ScrollBoxHandle {
  scrollTo: (options: { top?: number; behavior?: 'smooth' | 'auto' }) => void
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export interface ModalContextValue {
  rows: number
  columns: number
  scrollRef: RefObject<ScrollBoxHandle | null> | null
}

export const ModalContext = createContext<ModalContextValue | null>(null)

export function useIsInsideModal(): boolean {
  return useContext(ModalContext) !== null
}

export function useModalOrTerminalSize(fallback: { rows: number; columns: number }): { rows: number; columns: number } {
  const ctx = useContext(ModalContext)
  if (ctx) {
    return { rows: ctx.rows, columns: ctx.columns }
  }
  return fallback
}

export function useModalScrollRef(): RefObject<ScrollBoxHandle | null> | null {
  return useContext(ModalContext)?.scrollRef ?? null
}

export interface ModalContextProviderProps {
  value: ModalContextValue
  children: ReactNode
}

export function ModalContextProvider({ value, children }: ModalContextProviderProps) {
  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  )
}

export default ModalContext