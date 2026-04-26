import React, { type ReactElement, type ReactNode, useState } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { Dialog } from "./Dialog.js";
import { Tabs } from "./Tabs.js";
import { useInput } from "../hooks/useInput.js";
import { z } from "zod";

export const DiffFileSchema = z.object({
  path: z.string(),
  linesAdded: z.number(),
  linesRemoved: z.number(),
  isNewFile: z.boolean().optional(),
  isBinary: z.boolean().optional(),
})
export type DiffFile = z.infer<typeof DiffFileSchema>

export const DiffHunkSchema = z.object({
  lines: z.array(z.string()),
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
})
export type DiffHunk = z.infer<typeof DiffHunkSchema>

export const DiffStatsSchema = z.object({
  filesChanged: z.number(),
  linesAdded: z.number(),
  linesRemoved: z.number(),
})
export type DiffStats = z.infer<typeof DiffStatsSchema>

export const DiffDataSchema = z.object({
  files: z.array(DiffFileSchema),
  hunks: z.custom<Map<string, DiffHunk[]>>(),
  stats: DiffStatsSchema.optional(),
})
export type DiffData = z.infer<typeof DiffDataSchema>

export const DiffDialogPropsSchema = z.object({
  isOpen: z.boolean(),
  onClose: z.function().returns(z.void()),
  diffData: DiffDataSchema,
  title: z.string().optional(),
})
export type DiffDialogProps = z.infer<typeof DiffDialogPropsSchema>

function DiffStats({ diffData }: { diffData: DiffData }): ReactElement {
  const stats = diffData.stats || {
    filesChanged: diffData.files.length,
    linesAdded: diffData.files.reduce((sum, f) => sum + f.linesAdded, 0),
    linesRemoved: diffData.files.reduce((sum, f) => sum + f.linesRemoved, 0),
  };

  return (
    <Box flexDirection="row" gap={2} padding={1}>
      <Text>
        <Text color="white">{stats.filesChanged}</Text>
        <Text dimColor={true}> files changed</Text>
      </Text>
      <Text>
        <Text color="green">+{stats.linesAdded}</Text>
      </Text>
      <Text>
        <Text color="red">-{stats.linesRemoved}</Text>
      </Text>
    </Box>
  );
}

function FileList({
  files,
  selectedIndex,
  onSelect,
}: {
  files: DiffFile[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}): ReactElement {
  useInput({
    onArrowUp: () => {
      onSelect(Math.max(0, selectedIndex - 1));
    },
    onArrowDown: () => {
      onSelect(Math.min(files.length - 1, selectedIndex + 1));
    },
    onEnter: () => {
      onSelect(selectedIndex);
    },
  });

  return (
    <Box flexDirection="column" flex={1}>
      {files.map((file, index) => (
        <Box
          key={file.path}
          flexDirection="row"
          alignItems="center"
          gap={2}
          padding={1}
          style={{
            backgroundColor:
              index === selectedIndex ? "#3a3a5e" : "transparent",
            cursor: "pointer",
          }}
          onClick={() => onSelect(index)}
        >
          <Box flex={1}>
            <Text
              color={index === selectedIndex ? "brightWhite" : "white"}
              bold={index === selectedIndex}
            >
              {file.path}
            </Text>
          </Box>
          <Text color="green">+{file.linesAdded}</Text>
          <Text color="red">-{file.linesRemoved}</Text>
          {file.isNewFile && (
            <Text color="cyan" style={{ fontSize: 10 }}>
              NEW
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}

function DiffDetail({
  file,
  hunks,
}: {
  file: DiffFile;
  hunks: DiffHunk[];
}): ReactElement {
  return (
    <Box flexDirection="column" flex={1} overflow="auto">
      <Box
        flexDirection="row"
        gap={2}
        padding={1}
        style={{ borderBottom: "1px solid #333" }}
      >
        <Text bold color="brightWhite">
          {file.path}
        </Text>
        <Text dimColor={true}>
          +{file.linesAdded} -{file.linesRemoved}
        </Text>
      </Box>

      <Box flexDirection="column" overflow="auto" padding={1}>
        {hunks.length === 0 ? (
          <Text dimColor={true}>No hunks available</Text>
        ) : (
          hunks.map((hunk, hunkIndex) => (
            <Box
              key={hunkIndex}
              flexDirection="column"
              marginBottom={1}
            >
              <Text dimColor={true} style={{ fontSize: 10 }}>
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},
                {hunk.newLines} @@
              </Text>
              {hunk.lines.map((line, lineIndex) => {
                const isAddition = line.startsWith("+");
                const isDeletion = line.startsWith("-");
                const isContext = line.startsWith(" ");

                return (
                  <Text
                    key={lineIndex}
                    color={
                      isAddition
                        ? "green"
                        : isDeletion
                          ? "red"
                          : isContext
                            ? "white"
                            : "yellow"
                    }
                  >
                    {line}
                  </Text>
                );
              })}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

export function DiffDialog({
  isOpen,
  onClose,
  diffData,
  title = "Changes",
}: DiffDialogProps): ReactElement | null {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");

  if (!isOpen) {
    return null;
  }

  const selectedFile = diffData.files[selectedIndex];
  const hunks = selectedFile
    ? diffData.hunks.get(selectedFile.path) || []
    : [];

  const tabs = [
    {
      id: "list",
      label: "Files",
      content: (
        <FileList
          files={diffData.files}
          selectedIndex={selectedIndex}
          onSelect={(index) => {
            setSelectedIndex(index);
            setViewMode("detail");
          }}
        />
      ),
    },
    {
      id: "detail",
      label: "Detail",
      content: selectedFile ? (
        <DiffDetail file={selectedFile} hunks={hunks} />
      ) : (
        <Box padding={1}>
          <Text dimColor={true}>Select a file to view changes</Text>
        </Box>
      ),
    },
  ];

  return (
    <Dialog isOpen={isOpen} title={title} width={80} onClose={onClose}>
      <Box flexDirection="column">
        <DiffStats diffData={diffData} />
        <Tabs tabs={tabs} variant="line" />
      </Box>
    </Dialog>
  );
}

export default DiffDialog;
