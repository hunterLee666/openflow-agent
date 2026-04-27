import React, { createContext, useContext, useState, useCallback } from "react"
import type { ReactNode } from "react"

export type ModalType = "dialog" | "commandPalette" | "help" | "settings" | "taskPanel" | null

export interface ModalState {
  type: ModalType
  isOpen: boolean
  props?: Record<string, unknown>
}

interface ModalContextType {
  modal: ModalState
  openModal: (type: ModalType, props?: Record<string, unknown>) => void
  closeModal: () => void
  toggleModal: (type: ModalType) => void
}

const ModalContext = createContext<ModalContextType>({
  modal: { type: null, isOpen: false },
  openModal: () => {},
  closeModal: () => {},
  toggleModal: () => {},
})

export const useModalContext = () => useContext(ModalContext)

interface ModalProviderProps {
  children: ReactNode
}

export const ModalProvider = ({ children }: ModalProviderProps) => {
  const [modal, setModal] = useState<ModalState>({
    type: null,
    isOpen: false,
  })

  const openModal = useCallback((type: ModalType, props?: Record<string, unknown>) => {
    setModal({ type, isOpen: true, props })
  }, [])

  const closeModal = useCallback(() => {
    setModal({ type: null, isOpen: false, props: undefined })
  }, [])

  const toggleModal = useCallback((type: ModalType) => {
    setModal((prev) => {
      if (prev.type === type && prev.isOpen) {
        return { type: null, isOpen: false, props: undefined }
      }
      return { type, isOpen: true, props: prev.props }
    })
  }, [])

  return (
    <ModalContext.Provider value={{ modal, openModal, closeModal, toggleModal }}>
      {children}
    </ModalContext.Provider>
  )
}
