export interface ANSISequence {
  type: "CSI" | "OSC" | "ESC" | "DCS" | "APC" | "PM" | "ST" | "CHAR"
  raw: string
  data?: string
}

export class ANSIParser {
  private buffer = ""
  private state: "normal" | "escape" | "csi" | "osc" | "dcs" = "normal"

  parse(input: string): ANSISequence[] {
    this.buffer += input
    const sequences: ANSISequence[] = []

    let i = 0
    while (i < this.buffer.length) {
      const char = this.buffer[i]

      if (this.state === "normal") {
        if (char === "\x1b") {
          this.state = "escape"
          i++
          continue
        }

        sequences.push({ type: "CHAR", raw: char })
        i++
        continue
      }

      if (this.state === "escape") {
        if (char === "[") {
          this.state = "csi"
          i++
          continue
        }

        if (char === "]") {
          this.state = "osc"
          i++
          continue
        }

        if (char === "P") {
          this.state = "dcs"
          i++
          continue
        }

        sequences.push({ type: "ESC", raw: "\x1b" + char })
        this.state = "normal"
        i++
        continue
      }

      if (this.state === "csi") {
        const start = i - 1
        while (i < this.buffer.length) {
          const c = this.buffer[i]
          if (c >= "@" && c <= "~") {
            const seq = this.buffer.slice(start, i + 1)
            sequences.push({ type: "CSI", raw: seq, data: seq.slice(2, -1) })
            this.state = "normal"
            i++
            break
          }
          i++
        }
        continue
      }

      if (this.state === "osc") {
        const start = i - 1
        const bellIndex = this.buffer.indexOf("\x07", i)
        const stIndex = this.buffer.indexOf("\x1b\\", i)

        let endIndex = -1
        if (bellIndex !== -1 && (stIndex === -1 || bellIndex < stIndex)) {
          endIndex = bellIndex + 1
        } else if (stIndex !== -1) {
          endIndex = stIndex + 2
        }

        if (endIndex !== -1) {
          const seq = this.buffer.slice(start, endIndex)
          sequences.push({ type: "OSC", raw: seq, data: seq.slice(2) })
          this.state = "normal"
          i = endIndex
        } else {
          break
        }
        continue
      }

      i++
    }

    this.buffer = this.buffer.slice(i)
    return sequences
  }

  reset(): void {
    this.buffer = ""
    this.state = "normal"
  }
}
