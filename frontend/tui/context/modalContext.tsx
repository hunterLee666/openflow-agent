import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import { z } from 'zod';

export const ScrollBoxHandleSchema = z.object({
  scrollTo: z.function(z.tuple([z.object({
    top: z.number().optional(),
    behavior: z.enum(['smooth', 'auto']).optional(),
  })]), z.void()),
  scrollTop: z.number(),
  scrollHeight: z.number(),
  clientHeight: z.number(),
});
export type ScrollBoxHandle = z.infer<typeof ScrollBoxHandleSchema>;

export const ModalContextValueSchema = z.object({
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  scrollRef: z.custom<RefObject<ScrollBoxHandle | null>>().nullable(),
});
export type ModalContextValue = z.infer<typeof ModalContextValueSchema>;

export const ModalContext = createContext<ModalContextValue | null>(null);

export function useIsInsideModal(): boolean {
  return useContext(ModalContext) !== null;
}

export function useModalOrTerminalSize(fallback: { rows: number; columns: number }): { rows: number; columns: number } {
  const ctx = useContext(ModalContext);
  if (ctx) {
    return { rows: ctx.rows, columns: ctx.columns };
  }
  return fallback;
}

export function useModalScrollRef(): RefObject<ScrollBoxHandle | null> | null {
  return useContext(ModalContext)?.scrollRef ?? null;
}

export interface ModalContextProviderProps {
  value: ModalContextValue;
  children: ReactNode;
}

export function ModalContextProvider({ value, children }: ModalContextProviderProps) {
  const validated = ModalContextValueSchema.safeParse(value);
  if (!validated.success) {
    throw new Error('Invalid ModalContextValue');
  }
  return (
    <ModalContext.Provider value={validated.data}>
      {children}
    </ModalContext.Provider>
  );
}

export default ModalContext;
