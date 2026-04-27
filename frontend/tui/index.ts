#!/usr/bin/env node
import React from "react"
import { render } from "ink"
import { App } from "./app"
import { ThemeProvider } from "./contexts/theme-context"
import { AppProvider } from "./contexts/app-context"
import { ModalProvider } from "./contexts/modal-context"
import { NotificationProvider } from "./contexts/notification-context"

const app = React.createElement(
  NotificationProvider,
  null,
  React.createElement(
    ModalProvider,
    null,
    React.createElement(
      AppProvider,
      null,
      React.createElement(
        ThemeProvider,
        { initialTheme: "default" },
        React.createElement(App)
      )
    )
  )
)

const { waitUntilExit } = render(app, {
  exitOnCtrlC: true,
  debug: false,
  patchConsole: true,
})

waitUntilExit()
