import React, { type ReactNode } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { z } from "zod";

export const KbdPropsSchema = z.object({
  keys: z.array(z.string()),
})
export type KbdProps = z.infer<typeof KbdPropsSchema>

export function Kbd({ keys }: KbdProps): ReactNode {
  return (
    <Box flexDirection="row" gap={0} alignItems="center">
      {keys.map((key, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <Text dimColor={true}>
              +
            </Text>
          )}
          <Box
            flexDirection="row"
            alignItems="center"
            padding={{ top: 0, bottom: 0, left: 1, right: 1 }}
          >
            <Text bold color="brightWhite">
              {key}
            </Text>
          </Box>
        </React.Fragment>
      ))}
    </Box>
  );
}

export default Kbd;
