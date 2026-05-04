import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { PermissionMode, MODE_CONFIGS } from '@openflow-types/permissionMode';
import { getPermissionModeForConversationKey, setPermissionModeForConversationKey, getNextPermissionMode } from '@utils/permissions/permissionModeState';

interface PermissionContextValue {
  permissionContext: { mode: PermissionMode };
  toolPermissionContext: any;
  currentMode: PermissionMode;
  conversationKey: string;
  cycleMode: () => void;
  setMode: (mode: PermissionMode) => void;
  applyToolPermissionUpdate: (update: any) => void;
  isToolAllowed: (toolName: string) => boolean;
  getModeConfig: () => { requiresApproval: boolean; label?: string; description?: string; allowedTools?: string[]; restrictions?: any };
}

const PermissionContext = createContext<PermissionContextValue | undefined>(undefined);

interface PermissionProviderProps {
  children?: ReactNode;
  conversationKey: string;
  isBypassPermissionsModeAvailable?: boolean;
}

export function PermissionProvider({ children, conversationKey, isBypassPermissionsModeAvailable = true }: PermissionProviderProps) {
  const [currentMode, setCurrentMode] = useState<PermissionMode>(
    getPermissionModeForConversationKey({
      conversationKey,
      isBypassPermissionsModeAvailable,
    })
  );

  const cycleMode = () => {
    const next = getNextPermissionMode(currentMode);
    setCurrentMode(next);
    setPermissionModeForConversationKey({
      conversationKey,
      mode: next,
    });
  };

  const setMode = (mode: PermissionMode) => {
    setCurrentMode(mode);
    setPermissionModeForConversationKey({
      conversationKey,
      mode,
    });
  };

  const toolPermissionContext = MODE_CONFIGS[currentMode] || MODE_CONFIGS.default;

  const applyToolPermissionUpdate = (_update: any) => {
    // 简化实现：暂不修改权限上下文
  };

  const isToolAllowed = (toolName: string): boolean => {
    if (currentMode === 'bypassPermissions' || currentMode === 'auto') {
      return true;
    }
    if (currentMode === 'dontAsk') {
      // dontAsk: 只允许安全工具
      return ['Read', 'Glob', 'Grep', 'LSP', 'ListMcpResources', 'ReadMcpResource', 'Config', 'TodoRead'].includes(toolName);
    }
    if (currentMode === 'acceptEdits') {
      // acceptEdits: 允许文件编辑，但禁止危险系统命令
      const dangerousTools = ['Bash', 'KillShell', 'RemoteTrigger', 'CronCreate', 'CronDelete'];
      return !dangerousTools.includes(toolName);
    }
    // ask, default, plan: 需要批准，但允许工具调用（UI 会弹窗）
    return true;
  };

  const getModeConfig = () => {
    const config = MODE_CONFIGS[currentMode] || MODE_CONFIGS.default;
    return {
      requiresApproval: currentMode === 'ask' || currentMode === 'default' || currentMode === 'plan',
      ...config,
    };
  };

  const value: PermissionContextValue = {
    permissionContext: { mode: currentMode },
    toolPermissionContext,
    currentMode,
    conversationKey,
    cycleMode,
    setMode,
    applyToolPermissionUpdate,
    isToolAllowed,
    getModeConfig,
  };

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissionContext(): PermissionContextValue {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    // Fallback: 默认 bypass 模式
    return {
      permissionContext: { mode: 'bypassPermissions' },
      toolPermissionContext: MODE_CONFIGS.bypassPermissions,
      currentMode: 'bypassPermissions',
      conversationKey: '',
      cycleMode: () => {},
      setMode: () => {},
      applyToolPermissionUpdate: () => {},
      isToolAllowed: () => true,
      getModeConfig: () => ({ requiresApproval: false, ...MODE_CONFIGS.bypassPermissions }),
    };
  }
  return ctx;
}

export { PermissionContext };